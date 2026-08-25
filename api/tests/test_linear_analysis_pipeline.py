import asyncio

import pytest

from app.core.settings import Settings
from app.schemas.common import Evento
from app.services.linear_analysis_pipeline import (
    DeepKnowledgeTracingAnalyzer,
    _summarize_reading_pace,
    build_linear_analysis_orchestrator,
)


def test_summarize_reading_pace_flags_slow_and_skimming() -> None:
    materials = [
        # 100 palavras em 120s => 50 wpm => leitura_lenta
        {"material_key": "m1", "conteudo_id": 1, "dwell_sec": 120, "word_count": 100},
        # 1000 palavras em 60s => 1000 wpm => skimming
        {"material_key": "m2", "conteudo_id": 2, "dwell_sec": 60, "word_count": 1000},
    ]

    pace = _summarize_reading_pace(materials)

    flags = {item["material_key"]: item["flag"] for item in pace["reading_material_pace"]}
    assert flags["m1"] == "leitura_lenta"
    assert flags["m2"] == "skimming"
    assert pace["reading_slow_count"] == 1
    assert pace["reading_skimming_count"] == 1
    assert pace["reading_average_wpm"] > 0


def test_summarize_reading_pace_uses_active_sec_not_dwell_when_idle_present() -> None:
    # 400 palavras em 120s ativos => 200 wpm => ritmo_adequado.
    # dwell_sec = 600s (8min de idle no meio) faria dar 40 wpm => leitura_lenta,
    # o que seria falso: o aluno leu no ritmo certo, so pausou no meio.
    materials = [
        {
            "material_key": "m1",
            "conteudo_id": 1,
            "dwell_sec": 600,
            "active_sec": 120,
            "word_count": 400,
        }
    ]

    pace = _summarize_reading_pace(materials)

    item = pace["reading_material_pace"][0]
    assert item["flag"] == "ritmo_adequado"
    assert item["wpm"] == pytest.approx(200.0)


def test_summarize_reading_pace_estimates_from_scroll_when_no_word_count() -> None:
    # Sem word_count: estima palavras pelo max_depth_px (px/palavra).
    materials = [{"material_key": "m1", "dwell_sec": 60, "max_depth_px": 1200}]
    pace = _summarize_reading_pace(materials)
    assert pace["reading_material_pace"]
    assert pace["reading_material_pace"][0]["palavras_estimadas"] > 0


def test_summarize_reading_pace_empty() -> None:
    pace = _summarize_reading_pace([])
    assert pace["reading_pace_flag"] == "indeterminado"
    assert pace["reading_material_pace"] == []


@pytest.mark.asyncio
async def test_deep_knowledge_tracing_normalizes_media_acertos_percentage_to_fraction() -> None:
    analyzer = DeepKnowledgeTracingAnalyzer()

    result = await analyzer.analyze(
        eventos_novos=[],
        state={"desempenho_recente": {"media_acertos": 72}},
    )

    assert result.dominio_estimado == pytest.approx(0.72)


class DummyGraph:
    def __init__(self) -> None:
        self.calls = []

    async def ainvoke(self, state, config):
        self.calls.append((state, config))
        return {
            "ciclo_id": state["ciclo_id"],
            "acoes_aplicadas": ["conteudo_adaptado"],
            "erros": [],
        }


class DummyState:
    def __init__(self) -> None:
        self.graph_ephemeral = DummyGraph()


class DummyApp:
    def __init__(self) -> None:
        self.state = DummyState()


class DummyRequest:
    def __init__(self) -> None:
        self.app = DummyApp()


@pytest.mark.asyncio
async def test_linear_analysis_orchestrator_runs_all_stages_and_enriches_state() -> None:
    orchestrator = build_linear_analysis_orchestrator(Settings())
    request = DummyRequest()
    state = {
        "ciclo_id": "ciclo-linear",
        "desempenho_recente": {"media_acertos": 35},
        "acoes_aplicadas": [],
        "erros": [],
    }

    result = await orchestrator.run(
        request=request,
        state=state,
        config={"metadata": {"classe_id": 1}},
        telemetry_payload={
            "idle_sec": 90,
            "active_sec": 50,
            "screen_dwell_sec": 180,
            "scroll_distance_px": 120,
            "touch_count": 6,
            "signals": [{"type": "activity_wrong"}],
            "time_metrics": {
                "general": {
                    "session_elapsed_sec": 600,
                    "batch_dwell_sec": 180,
                    "batch_active_sec": 50,
                    "batch_idle_sec": 90,
                    "touch_count": 6,
                    "scroll_distance_px": 120,
                    "max_depth_px": 640,
                },
                "topics": [
                    {
                        "key": "topic:10",
                        "topico_id": 10,
                        "visits": 1,
                        "dwell_sec": 180,
                        "active_sec": 50,
                        "idle_sec": 90,
                        "touch_count": 6,
                        "scroll_distance_px": 120,
                        "max_depth_px": 640,
                    }
                ],
                "contents": [
                    {
                        "key": "content:33",
                        "topico_id": 10,
                        "conteudo_id": 33,
                        "item_key": "content:33",
                        "visits": 1,
                        "dwell_sec": 60,
                        "active_sec": 18,
                        "idle_sec": 42,
                        "touch_count": 2,
                        "scroll_distance_px": 20,
                        "max_depth_px": 200,
                    }
                ],
                "activities": [
                    {
                        "key": "activity:20",
                        "topico_id": 10,
                        "atividade_id": 20,
                        "item_key": "activity:20",
                        "visits": 2,
                        "dwell_sec": 120,
                        "active_sec": 32,
                        "idle_sec": 48,
                        "touch_count": 4,
                        "scroll_distance_px": 100,
                        "max_depth_px": 640,
                    }
                ],
                "materials": [
                    {
                        "key": "material:content:33:pdf:m-33",
                        "topico_id": 10,
                        "conteudo_id": 33,
                        "item_key": "content:33",
                        "material_key": "material:content:33:pdf:m-33",
                        "material_tipo": "pdf",
                        "visits": 2,
                        "dwell_sec": 60,
                        "active_sec": 18,
                        "idle_sec": 42,
                        "touch_count": 2,
                        "scroll_distance_px": 20,
                        "max_depth_px": 200,
                    }
                ],
            },
        },
        frames_b64=["frame-1", "frame-2"],
        eventos_novos=[
            Evento(tipo="atividade_errada", referencia="activity:20"),
            Evento(tipo="erro_recorrente", referencia="activity:20"),
        ],
    )

    assert state["emocao_atual"]["origem"] == "deepface"
    assert state["attention_snapshot"]["estado_atencao"] in {"baixa", "moderada", "alta"}
    assert "decision" in state["pipeline_stage_outputs"]
    assert state["pipeline_stage_outputs"]["reading"]["material_focus_ratio"] >= 0
    assert "time_metrics" in state["pipeline_stage_outputs"]["attention"]
    assert "simplificar_conteudo" in result["acoes_aplicadas"]
    assert request.app.state.graph_ephemeral.calls


def test_deep_knowledge_tracing_usa_dominio_persistido_como_semente() -> None:
    analyzer = DeepKnowledgeTracingAnalyzer()
    state = {
        "payload_topico_id": 10,
        "desempenho_recente": {"media_acertos": 20},  # seria base_mastery baixo se usado
        "memoria_aluno": {
            "dominio_por_topico": {
                "10": {"dominio_estimado": 0.9, "tendencia": "ascendente", "confianca": 0.7}
            }
        },
    }

    resultado = asyncio.run(analyzer.analyze(eventos_novos=[], state=state))

    # com semente 0.9 (persistida) em vez de 0.2 (flat), o dominio final
    # fica bem mais alto mesmo sem eventos no lote.
    assert resultado.dominio_estimado > 0.8


def test_deep_knowledge_tracing_cai_no_flat_quando_sem_dominio_persistido() -> None:
    analyzer = DeepKnowledgeTracingAnalyzer()
    state = {
        "payload_topico_id": 10,
        "desempenho_recente": {"media_acertos": 80},
        "memoria_aluno": {"dominio_por_topico": {}},
    }

    resultado = asyncio.run(analyzer.analyze(eventos_novos=[], state=state))

    assert resultado.dominio_estimado == 0.8
