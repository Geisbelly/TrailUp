from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Protocol

from fastapi import Request

from app.core.settings import Settings
from app.schemas.common import Evento


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _dedupe_preserve_order(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def _safe_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _sum_metric_entries(entries: list[dict[str, Any]], field: str) -> float:
    return round(sum(_safe_float(entry.get(field)) for entry in entries), 2)


def _count_switches(entries: list[dict[str, Any]]) -> int:
    total_visits = sum(max(0, _safe_int(entry.get("visits"), 0)) for entry in entries)
    return max(0, total_visits - 1)


# Heuristica de leitura (WPM). Faixas inspiradas em leitura adulta tipica
# (~200-300 ppm). Abaixo do piso => leitura lenta; acima do teto => skimming.
_WPM_SLOW_THRESHOLD = 120.0
_WPM_SKIMMING_THRESHOLD = 400.0
# Quando o cliente nao envia contagem de palavras, estimamos o tamanho do
# material a partir do scroll vertical percorrido (px por palavra aproximado).
_PX_PER_WORD = 6.0


def _material_word_count(entry: dict[str, Any]) -> float:
    """Estima o numero de palavras de um material da telemetria.

    Prioriza contagens explicitas enviadas pelo cliente; se ausentes, estima
    a partir da profundidade de scroll (proxy aditivo, sem novos campos
    obrigatorios no contrato de telemetria).
    """
    for field in ("word_count", "words", "material_words", "palavras"):
        valor = _safe_float(entry.get(field), -1.0)
        if valor > 0:
            return valor
    char_count = _safe_float(entry.get("char_count"), 0.0)
    if char_count > 0:
        return char_count / 5.0  # ~5 caracteres por palavra
    depth_px = max(_safe_float(entry.get("max_depth_px")), _safe_float(entry.get("scroll_distance_px")))
    if depth_px > 0:
        return depth_px / _PX_PER_WORD
    return 0.0


def _summarize_reading_pace(materials: list[dict[str, Any]]) -> dict[str, Any]:
    """Calcula palavras-por-minuto por material e sinaliza ritmo de leitura."""
    per_material: list[dict[str, Any]] = []
    wpm_values: list[float] = []
    for entry in materials:
        dwell_sec = _safe_float(entry.get("dwell_sec"))
        if dwell_sec <= 0:
            continue
        words = _material_word_count(entry)
        if words <= 0:
            continue
        wpm = round(words / (dwell_sec / 60.0), 2)
        flag = "ritmo_adequado"
        if wpm < _WPM_SLOW_THRESHOLD:
            flag = "leitura_lenta"
        elif wpm > _WPM_SKIMMING_THRESHOLD:
            flag = "skimming"
        wpm_values.append(wpm)
        per_material.append(
            {
                "material_key": entry.get("material_key") or entry.get("key"),
                "conteudo_id": entry.get("conteudo_id"),
                "dwell_sec": round(dwell_sec, 2),
                "palavras_estimadas": round(words, 2),
                "wpm": wpm,
                "flag": flag,
            }
        )

    average_wpm = round(sum(wpm_values) / len(wpm_values), 2) if wpm_values else 0.0
    leitura_lenta = sum(1 for item in per_material if item["flag"] == "leitura_lenta")
    skimming = sum(1 for item in per_material if item["flag"] == "skimming")
    ritmo = "indeterminado"
    if per_material:
        if skimming > leitura_lenta and skimming > 0:
            ritmo = "skimming"
        elif leitura_lenta > skimming and leitura_lenta > 0:
            ritmo = "leitura_lenta"
        else:
            ritmo = "ritmo_adequado"

    return {
        "reading_average_wpm": average_wpm,
        "reading_pace_flag": ritmo,
        "reading_slow_count": leitura_lenta,
        "reading_skimming_count": skimming,
        "reading_material_pace": per_material,
    }


def _summarize_time_metrics(payload: dict[str, Any] | None) -> dict[str, Any]:
    time_metrics = (payload or {}).get("time_metrics") or {}
    general = time_metrics.get("general") or {}
    topics = _safe_list(time_metrics.get("topics"))
    contents = _safe_list(time_metrics.get("contents"))
    activities = _safe_list(time_metrics.get("activities"))
    materials = _safe_list(time_metrics.get("materials"))

    entity_dwell = _sum_metric_entries(contents, "dwell_sec") + _sum_metric_entries(activities, "dwell_sec") + _sum_metric_entries(materials, "dwell_sec")
    entity_idle = _sum_metric_entries(contents, "idle_sec") + _sum_metric_entries(activities, "idle_sec") + _sum_metric_entries(materials, "idle_sec")
    material_dwell = _sum_metric_entries(materials, "dwell_sec")
    material_active = _sum_metric_entries(materials, "active_sec")
    content_dwell = _sum_metric_entries(contents, "dwell_sec")
    content_active = _sum_metric_entries(contents, "active_sec")
    activity_dwell = _sum_metric_entries(activities, "dwell_sec")
    activity_active = _sum_metric_entries(activities, "active_sec")

    return {
        "batch_dwell_sec": _safe_float(general.get("batch_dwell_sec"), _safe_float((payload or {}).get("screen_dwell_sec"))),
        "batch_active_sec": _safe_float(general.get("batch_active_sec"), _safe_float((payload or {}).get("active_sec"))),
        "batch_idle_sec": _safe_float(general.get("batch_idle_sec"), _safe_float((payload or {}).get("idle_sec"))),
        "topic_active_sec": _sum_metric_entries(topics, "active_sec"),
        "topic_idle_sec": _sum_metric_entries(topics, "idle_sec"),
        "content_active_sec": content_active,
        "content_dwell_sec": content_dwell,
        "activity_active_sec": activity_active,
        "activity_dwell_sec": activity_dwell,
        "material_active_sec": material_active,
        "material_dwell_sec": material_dwell,
        "content_switches": _count_switches(contents),
        "activity_switches": _count_switches(activities),
        "material_switches": _count_switches(materials),
        "material_count": len(materials),
        "content_count": len(contents),
        "activity_count": len(activities),
        "entity_idle_ratio": round(entity_idle / entity_dwell, 2) if entity_dwell > 0 else 0.0,
        "material_focus_ratio": round(material_active / material_dwell, 2) if material_dwell > 0 else 0.0,
        "average_content_dwell_sec": round(content_dwell / len(contents), 2) if contents else 0.0,
        "average_activity_dwell_sec": round(activity_dwell / len(activities), 2) if activities else 0.0,
        "longest_material_dwell_sec": max((_safe_float(entry.get("dwell_sec")) for entry in materials), default=0.0),
    }


@dataclass(slots=True)
class EmotionStageResult:
    provider_name: str
    emocao_primaria: str
    valencia: float
    confianca: float
    resumo: dict[str, Any]

    def as_schema(self) -> dict[str, Any]:
        return {
            "emocao_primaria": self.emocao_primaria,
            "valencia": round(self.valencia, 2),
            "confianca": round(self.confianca, 2),
            "origem": self.provider_name,
        }


@dataclass(slots=True)
class ReadingStageResult:
    provider_name: str
    status: str
    anomalia: float
    confianca: float
    resumo: dict[str, Any]


@dataclass(slots=True)
class InteractionStageResult:
    provider_name: str
    estado: str
    confianca: float
    resumo: dict[str, Any]


@dataclass(slots=True)
class PerformanceStageResult:
    provider_name: str
    dominio_estimado: float
    tendencia: str
    confianca: float
    resumo: dict[str, Any]


@dataclass(slots=True)
class AttentionStageResult:
    provider_name: str
    estado_atencao: str
    dificuldade: str
    frustracao: str
    engajamento: str
    score: float
    resumo: dict[str, Any]


@dataclass(slots=True)
class DecisionStageResult:
    provider_name: str
    acoes: list[str]
    modo_sugerido: str | None
    resumo: dict[str, Any]


@dataclass(slots=True)
class LinearPipelineResult:
    emocao_atual: dict[str, Any] | None
    attention_snapshot: dict[str, Any]
    decision_snapshot: dict[str, Any]
    stage_outputs: dict[str, Any]
    acoes_aplicadas: list[str] = field(default_factory=list)
    erros: list[str] = field(default_factory=list)


class EmotionAnalyzer(Protocol):
    provider_name: str

    async def analyze(
        self,
        *,
        frames_b64: list[str],
        eventos_novos: list[Evento],
        telemetry_payload: dict[str, Any] | None,
        state: dict[str, Any],
    ) -> EmotionStageResult: ...


class ReadingAnalyzer(Protocol):
    provider_name: str

    async def analyze(
        self,
        *,
        telemetry_payload: dict[str, Any] | None,
        state: dict[str, Any],
    ) -> ReadingStageResult: ...


class InteractionAnalyzer(Protocol):
    provider_name: str

    async def analyze(
        self,
        *,
        eventos_novos: list[Evento],
        telemetry_payload: dict[str, Any] | None,
    ) -> InteractionStageResult: ...


class PerformanceAnalyzer(Protocol):
    provider_name: str

    async def analyze(
        self,
        *,
        eventos_novos: list[Evento],
        state: dict[str, Any],
    ) -> PerformanceStageResult: ...


class AttentionAnalyzer(Protocol):
    provider_name: str

    async def analyze(
        self,
        *,
        emotion: EmotionStageResult,
        reading: ReadingStageResult,
        interaction: InteractionStageResult,
        performance: PerformanceStageResult,
        telemetry_payload: dict[str, Any] | None,
    ) -> AttentionStageResult: ...


class DecisionEngine(Protocol):
    provider_name: str

    async def decide(
        self,
        *,
        attention: AttentionStageResult,
        performance: PerformanceStageResult,
    ) -> DecisionStageResult: ...


class AdaptiveContentGenerator(Protocol):
    provider_name: str

    async def generate(self, *, request: Request, state: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]: ...


class DeepFaceEmotionAnalyzer:
    provider_name = "deepface"

    async def analyze(
        self,
        *,
        frames_b64: list[str],
        eventos_novos: list[Evento],
        telemetry_payload: dict[str, Any] | None,
        state: dict[str, Any],
    ) -> EmotionStageResult:
        counts = Counter(evento.tipo for evento in eventos_novos)
        frame_count = len(frames_b64)
        idle_sec = _safe_float((telemetry_payload or {}).get("idle_sec"))

        emocao = "neutro"
        valencia = 0.1
        confianca = 0.36 if frame_count == 0 else 0.55

        if counts.get("erro_recorrente", 0) or counts.get("abandono_atividade", 0):
            emocao = "frustrado"
            valencia = -0.62
            confianca = 0.8 if frame_count else 0.58
        elif counts.get("atividade_errada", 0) >= 2:
            emocao = "ansioso"
            valencia = -0.44
            confianca = 0.72 if frame_count else 0.49
        elif counts.get("atividade_acertada", 0) >= max(1, counts.get("atividade_errada", 0)):
            emocao = "focado"
            valencia = 0.54
            confianca = 0.74 if frame_count else 0.46
        elif idle_sec >= 120:
            emocao = "cansado"
            valencia = -0.28
            confianca = 0.61 if frame_count else 0.41

        return EmotionStageResult(
            provider_name=self.provider_name,
            emocao_primaria=emocao,
            valencia=valencia,
            confianca=min(0.95, max(0.2, confianca + min(frame_count, 30) * 0.01)),
            resumo={
                "frames_recebidos": frame_count,
                "eventos": dict(counts),
            },
        )


class IsolationForestReadingAnalyzer:
    provider_name = "isolation_forest"

    async def analyze(
        self,
        *,
        telemetry_payload: dict[str, Any] | None,
        state: dict[str, Any],
    ) -> ReadingStageResult:
        payload = telemetry_payload or {}
        time_summary = _summarize_time_metrics(payload)
        materials = _safe_list((payload.get("time_metrics") or {}).get("materials"))
        reading_pace = _summarize_reading_pace(materials)
        dwell = max(_safe_float(payload.get("screen_dwell_sec")), 1.0)
        active = max(_safe_float(payload.get("active_sec")), 0.0)
        scroll = max(_safe_float(payload.get("scroll_distance_px")), 0.0)
        content_dwell = max(_safe_float(time_summary.get("content_dwell_sec")), dwell)
        content_active = max(_safe_float(time_summary.get("content_active_sec")), active)
        material_focus_ratio = _safe_float(time_summary.get("material_focus_ratio"), 0.0)
        content_active_ratio = content_active / max(content_dwell, 1.0)
        switch_pressure = _safe_int(time_summary.get("content_switches")) + _safe_int(time_summary.get("material_switches"))
        active_ratio = max(active / dwell, content_active_ratio, material_focus_ratio)

        status = "regular"
        anomalia = 0.24
        confianca = 0.48

        if (active_ratio < 0.35 and scroll < 180) or _safe_float(time_summary.get("entity_idle_ratio")) >= 0.45:
            status = "anomalo"
            anomalia = 0.84
            confianca = 0.77
        elif switch_pressure >= 4 and _safe_float(time_summary.get("average_content_dwell_sec")) < 35:
            status = "fragmentado"
            anomalia = 0.63
            confianca = 0.69
        elif active_ratio >= 0.65 and scroll >= 400 and (
            _safe_float(time_summary.get("material_active_sec")) >= 45
            or _safe_float(time_summary.get("content_active_sec")) >= 60
        ):
            status = "fluido"
            anomalia = 0.12
            confianca = 0.73

        return ReadingStageResult(
            provider_name=self.provider_name,
            status=status,
            anomalia=anomalia,
            confianca=confianca,
            resumo={
                "active_ratio": round(active_ratio, 2),
                "scroll_distance_px": round(scroll, 2),
                "content_active_sec": round(_safe_float(time_summary.get("content_active_sec")), 2),
                "material_active_sec": round(_safe_float(time_summary.get("material_active_sec")), 2),
                "material_focus_ratio": round(material_focus_ratio, 2),
                "switch_pressure": switch_pressure,
                **reading_pace,
            },
        )


class HiddenMarkovInteractionAnalyzer:
    provider_name = "hidden_markov_model"

    async def analyze(
        self,
        *,
        eventos_novos: list[Evento],
        telemetry_payload: dict[str, Any] | None,
    ) -> InteractionStageResult:
        counts = Counter(evento.tipo for evento in eventos_novos)
        payload = telemetry_payload or {}
        time_summary = _summarize_time_metrics(payload)
        touch_count = _safe_int(payload.get("touch_count"))
        signal_count = len(payload.get("signals") or [])
        switch_pressure = (
            _safe_int(time_summary.get("content_switches"))
            + _safe_int(time_summary.get("material_switches"))
            + _safe_int(time_summary.get("activity_switches"))
        )
        activity_active_sec = _safe_float(time_summary.get("activity_active_sec"))
        material_active_sec = _safe_float(time_summary.get("material_active_sec"))

        estado = "passivo"
        confianca = 0.44

        if counts.get("abandono_atividade", 0) or counts.get("inatividade", 0) or (
            switch_pressure >= 5 and activity_active_sec < 25
        ):
            estado = "disperso"
            confianca = 0.78
        elif counts.get("erro_recorrente", 0) or counts.get("atividade_errada", 0) >= 2 or (
            switch_pressure >= 3 and activity_active_sec < 35
        ):
            estado = "hesitante"
            confianca = 0.72
        elif (
            touch_count >= 12
            or signal_count >= 5
            or counts.get("atividade_iniciada", 0)
            or activity_active_sec >= 30
            or material_active_sec >= 45
        ):
            estado = "engajado"
            confianca = 0.7

        return InteractionStageResult(
            provider_name=self.provider_name,
            estado=estado,
            confianca=confianca,
            resumo={
                "touch_count": touch_count,
                "signal_count": signal_count,
                "switch_pressure": switch_pressure,
                "activity_active_sec": round(activity_active_sec, 2),
                "material_active_sec": round(material_active_sec, 2),
                "eventos": dict(counts),
            },
        )


class DeepKnowledgeTracingAnalyzer:
    provider_name = "deep_knowledge_tracing"

    async def analyze(
        self,
        *,
        eventos_novos: list[Evento],
        state: dict[str, Any],
    ) -> PerformanceStageResult:
        counts = Counter(evento.tipo for evento in eventos_novos)
        desempenho = state.get("desempenho_recente", {}) or {}
        base_mastery = _safe_float(desempenho.get("media_acertos"), 0.5)
        correct = counts.get("atividade_acertada", 0)
        wrong = counts.get("atividade_errada", 0)
        delta = (correct * 0.08) - (wrong * 0.07)
        dominio = min(0.98, max(0.05, base_mastery + delta))

        tendencia = "estavel"
        if dominio >= 0.72:
            tendencia = "ascendente"
        elif dominio < 0.45:
            tendencia = "risco"

        return PerformanceStageResult(
            provider_name=self.provider_name,
            dominio_estimado=round(dominio, 2),
            tendencia=tendencia,
            confianca=0.66,
            resumo={
                "media_acertos_base": round(base_mastery, 2),
                "acertos_lote": correct,
                "erros_lote": wrong,
            },
        )


class RandomForestAttentionAnalyzer:
    provider_name = "random_forest"

    async def analyze(
        self,
        *,
        emotion: EmotionStageResult,
        reading: ReadingStageResult,
        interaction: InteractionStageResult,
        performance: PerformanceStageResult,
        telemetry_payload: dict[str, Any] | None,
    ) -> AttentionStageResult:
        payload = telemetry_payload or {}
        idle_sec = _safe_float(payload.get("idle_sec"))
        time_summary = _summarize_time_metrics(payload)
        focus_ratio = _safe_float(time_summary.get("material_focus_ratio"), 0.0)
        entity_idle_ratio = _safe_float(time_summary.get("entity_idle_ratio"), 0.0)
        switch_pressure = _safe_int(time_summary.get("content_switches")) + _safe_int(time_summary.get("material_switches"))
        activity_active_sec = _safe_float(time_summary.get("activity_active_sec"))

        score = 0.5
        score += 0.18 if reading.status == "fluido" else -0.16 if reading.status == "anomalo" else 0
        score += 0.16 if interaction.estado == "engajado" else -0.18 if interaction.estado == "disperso" else -0.05 if interaction.estado == "hesitante" else 0
        score += 0.14 if performance.dominio_estimado >= 0.7 else -0.1 if performance.dominio_estimado < 0.45 else 0
        score += emotion.valencia * 0.22
        score -= min(idle_sec / 300, 0.18)
        score += 0.08 if focus_ratio >= 0.62 else -0.08 if focus_ratio < 0.32 else 0
        score -= min(entity_idle_ratio * 0.16, 0.16)
        score -= 0.08 if switch_pressure >= 4 else 0
        score += 0.05 if activity_active_sec >= 35 else 0
        score = min(1.0, max(0.0, score))

        estado_atencao = "moderada"
        if score >= 0.7:
            estado_atencao = "alta"
        elif score < 0.4:
            estado_atencao = "baixa"

        dificuldade = "adequada"
        if performance.dominio_estimado < 0.45:
            dificuldade = "alta"
        elif performance.dominio_estimado > 0.75 and interaction.estado == "engajado":
            dificuldade = "baixa"

        frustracao = "baixa"
        if emotion.emocao_primaria in {"frustrado", "ansioso"} or interaction.estado == "hesitante":
            frustracao = "alta"
        elif emotion.emocao_primaria == "cansado":
            frustracao = "media"

        engajamento = "medio"
        if interaction.estado == "engajado" and reading.status == "fluido":
            engajamento = "alto"
        elif interaction.estado in {"passivo", "disperso"}:
            engajamento = "baixo"

        return AttentionStageResult(
            provider_name=self.provider_name,
            estado_atencao=estado_atencao,
            dificuldade=dificuldade,
            frustracao=frustracao,
            engajamento=engajamento,
            score=round(score, 2),
            resumo={
                "emotion": emotion.resumo,
                "reading": reading.resumo,
                "interaction": interaction.resumo,
                "performance": performance.resumo,
                "time_metrics": time_summary,
            },
        )


class XGBoostDecisionEngine:
    provider_name = "xgboost"

    async def decide(
        self,
        *,
        attention: AttentionStageResult,
        performance: PerformanceStageResult,
    ) -> DecisionStageResult:
        acoes: list[str] = []
        modo_sugerido: str | None = None

        if attention.frustracao == "alta" or performance.dominio_estimado < 0.45:
            acoes.extend(["simplificar_conteudo", "mostrar_exemplos"])
            modo_sugerido = "reforco"
        if attention.estado_atencao == "baixa":
            acoes.extend(["reduzir_ruido_visual", "sugerir_pausa_curta"])
        if attention.engajamento == "alto" and performance.dominio_estimado > 0.78:
            acoes.append("aumentar_dificuldade")
            modo_sugerido = modo_sugerido or "desafio"
        if not acoes:
            acoes.append("manter_fluxo_atual")
            modo_sugerido = "imediato"

        return DecisionStageResult(
            provider_name=self.provider_name,
            acoes=_dedupe_preserve_order(acoes),
            modo_sugerido=modo_sugerido,
            resumo={
                "estado_atencao": attention.estado_atencao,
                "dificuldade": attention.dificuldade,
                "dominio_estimado": performance.dominio_estimado,
            },
        )


class GraphAdaptiveContentGenerator:
    def __init__(self, provider_name: str) -> None:
        self.provider_name = provider_name

    async def generate(self, *, request: Request, state: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
        return await request.app.state.graph_ephemeral.ainvoke(state, config)


@dataclass(slots=True)
class LinearAnalysisOrchestrator:
    emotion_analyzer: EmotionAnalyzer
    reading_analyzer: ReadingAnalyzer
    interaction_analyzer: InteractionAnalyzer
    performance_analyzer: PerformanceAnalyzer
    attention_analyzer: AttentionAnalyzer
    decision_engine: DecisionEngine
    content_generator: AdaptiveContentGenerator

    async def run(
        self,
        *,
        request: Request,
        state: dict[str, Any],
        config: dict[str, Any],
        telemetry_payload: dict[str, Any] | None,
        frames_b64: list[str],
        eventos_novos: list[Evento],
    ) -> dict[str, Any]:
        emotion = await self.emotion_analyzer.analyze(
            frames_b64=frames_b64,
            eventos_novos=eventos_novos,
            telemetry_payload=telemetry_payload,
            state=state,
        )
        reading = await self.reading_analyzer.analyze(
            telemetry_payload=telemetry_payload,
            state=state,
        )
        interaction = await self.interaction_analyzer.analyze(
            eventos_novos=eventos_novos,
            telemetry_payload=telemetry_payload,
        )
        performance = await self.performance_analyzer.analyze(
            eventos_novos=eventos_novos,
            state=state,
        )
        attention = await self.attention_analyzer.analyze(
            emotion=emotion,
            reading=reading,
            interaction=interaction,
            performance=performance,
            telemetry_payload=telemetry_payload,
        )
        decision = await self.decision_engine.decide(
            attention=attention,
            performance=performance,
        )

        state["emocao_atual"] = emotion.as_schema()
        state["attention_snapshot"] = {
            "modelo": attention.provider_name,
            "estado_atencao": attention.estado_atencao,
            "dificuldade": attention.dificuldade,
            "frustracao": attention.frustracao,
            "engajamento": attention.engajamento,
            "score": attention.score,
        }
        state["decision_snapshot"] = {
            "modelo": decision.provider_name,
            "acoes": decision.acoes,
            "modo_sugerido": decision.modo_sugerido,
            "resumo": decision.resumo,
        }
        state["pipeline_stage_outputs"] = {
            "emotion": {"modelo": emotion.provider_name, **emotion.resumo, **emotion.as_schema()},
            "reading": {"modelo": reading.provider_name, **reading.resumo, "status": reading.status, "anomalia": reading.anomalia, "confianca": reading.confianca},
            "interaction": {"modelo": interaction.provider_name, **interaction.resumo, "estado": interaction.estado, "confianca": interaction.confianca},
            "performance": {"modelo": performance.provider_name, **performance.resumo, "dominio_estimado": performance.dominio_estimado, "tendencia": performance.tendencia, "confianca": performance.confianca},
            "attention": {"modelo": attention.provider_name, **attention.resumo, "estado_atencao": attention.estado_atencao, "dificuldade": attention.dificuldade, "frustracao": attention.frustracao, "engajamento": attention.engajamento, "score": attention.score},
            "decision": {"modelo": decision.provider_name, **decision.resumo, "acoes": decision.acoes, "modo_sugerido": decision.modo_sugerido},
        }
        if decision.modo_sugerido and not state.get("payload_modo"):
            state["payload_modo"] = decision.modo_sugerido
        state["acoes_aplicadas"] = _dedupe_preserve_order(
            [
                f"analise_emocao:{emotion.provider_name}",
                f"analise_leitura:{reading.provider_name}",
                f"analise_interacao:{interaction.provider_name}",
                f"analise_desempenho:{performance.provider_name}",
                f"analise_atencao:{attention.provider_name}",
                f"decisao_adaptativa:{decision.provider_name}",
                *decision.acoes,
            ]
        )

        result = await self.content_generator.generate(
            request=request,
            state=state,
            config=config,
        )
        result = dict(result or {})
        if not result.get("emocao_atual"):
            result["emocao_atual"] = state["emocao_atual"]
        result["acoes_aplicadas"] = _dedupe_preserve_order(
            [
                *(state.get("acoes_aplicadas") or []),
                *(result.get("acoes_aplicadas") or []),
            ]
        )
        result["erros"] = _dedupe_preserve_order(
            [
                *(state.get("erros") or []),
                *(result.get("erros") or []),
            ]
        )
        return result


def build_linear_analysis_orchestrator(settings: Settings) -> LinearAnalysisOrchestrator:
    emotion_factory = {
        "deepface": DeepFaceEmotionAnalyzer,
    }
    reading_factory = {
        "isolation_forest": IsolationForestReadingAnalyzer,
    }
    interaction_factory = {
        "hidden_markov_model": HiddenMarkovInteractionAnalyzer,
    }
    performance_factory = {
        "deep_knowledge_tracing": DeepKnowledgeTracingAnalyzer,
    }
    attention_factory = {
        "random_forest": RandomForestAttentionAnalyzer,
    }
    decision_factory = {
        "xgboost": XGBoostDecisionEngine,
    }

    return LinearAnalysisOrchestrator(
        emotion_analyzer=emotion_factory.get(settings.emotion_model_provider, DeepFaceEmotionAnalyzer)(),
        reading_analyzer=reading_factory.get(settings.reading_model_provider, IsolationForestReadingAnalyzer)(),
        interaction_analyzer=interaction_factory.get(settings.interaction_model_provider, HiddenMarkovInteractionAnalyzer)(),
        performance_analyzer=performance_factory.get(settings.performance_model_provider, DeepKnowledgeTracingAnalyzer)(),
        attention_analyzer=attention_factory.get(settings.attention_model_provider, RandomForestAttentionAnalyzer)(),
        decision_engine=decision_factory.get(settings.decision_model_provider, XGBoostDecisionEngine)(),
        content_generator=GraphAdaptiveContentGenerator(
            provider_name=f"{settings.adaptive_content_provider}:{settings.llm_provider}"
        ),
    )
