import json
import logging
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_professor_access, get_current_user, get_session, require_professor
from app.core.settings import get_settings
from app.repositories.access import AccessRepository
from app.repositories.artefatos_personalizados import ArtefatosPersonalizadosRepository
from app.repositories.conteudo_classe import ConteudoClasseRepository
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.context import ContextRepository
from app.repositories.evento import EventoRepository
from app.repositories.fontes_personalizacao import FontesPersonalizacaoRepository
from app.repositories.ia_decision_logs import IADecisionLogRepository
from app.repositories.materiais import MateriaisRepository
from app.repositories.personalizacao_jobs import PersonalizacaoJobsRepository
from app.repositories.personalizacao_progresso import PersonalizacaoProgressoRepository
from app.schemas.personalizacao import (
    DesignTokens,
    DesignTokensCores,
    FontePersonalizacaoResponse,
    FontesPersonalizacaoUploadResponse,
    MentorChatPayload,
    MentorChatResponse,
    PersonalizacaoContextoDocenteResponse,
    PersonalizacaoItemProgressoPayload,
    PersonalizacaoItemProgressoResponse,
    PersonalizacaoJobDetailResponse,
    PersonalizacaoJobListResponse,
    PersonalizacaoJobPayload,
    PersonalizacaoJobResponse,
    PersonalizacaoJobTargetResponse,
    PersonalizacaoListResponse,
    PersonalizacaoMediaItemStatusResponse,
    PersonalizacaoMediaStatusResponse,
    PersonalizacaoPerfilItem,
    PersonalizacaoPorPerfilResponse,
    PersonalizacaoResponse,
    PersonalizarPayload,
)
from app.services.auth import UserContext
from app.services.llm import JsonLLMService, load_prompt
from app.services.media_agents import disparar_brainhex_async
from app.services.personalizacao import (
    _infer_source_type,
    build_personalizacao_steps,
    fetch_personalizacao_context,
    gerar_cards_direto,
)
from app.services.personalizacao_jobs import (
    JOB_KIND_CLASS_DELTA,
    JOB_KIND_CLASS_THEME,
    JOB_KIND_CLEANUP,
    JOB_KIND_ENROLLMENT,
    JOB_KIND_FULL_SYNC,
    enqueue_personalizacao_job,
    get_job_detail,
)
from app.services.storage import BUCKET, SupabaseStorage, build_public_storage_url

router = APIRouter(prefix="/personalizar", tags=["personalizar"])
logger = logging.getLogger(__name__)

_PROFILE_COLOR_MAP = {
    "seeker": "#bb9c04",
    "survivor": "#8B0000",
    "daredevil": "#228B22",
    "mastermind": "#707c88",
    "conqueror": "#01808b",
    "socializer": "#7624c4",
    "socialiser": "#7624c4",
    "achiever": "#da7904",
}
_BRAINHEX_PROFILES = (
    "seeker",
    "survivor",
    "daredevil",
    "mastermind",
    "conqueror",
    "socializer",
    "achiever",
)
_PROFILE_LABEL_MAP = {
    "seeker": "Explorador",
    "survivor": "Sobrevivente",
    "daredevil": "Aventureiro",
    "mastermind": "Estrategista",
    "conqueror": "Conquistador",
    "socializer": "Sociável",
    "achiever": "Realizador",
}
_MEDIA_TIPOS = ("pdf", "audio", "apresentacao", "markdown")
_MEDIA_STATUS_MAP = {
    "completed": "ready",
    "ready": "ready",
    "succeeded": "ready",
    "pending": "pending",
    "processing": "pending",
    "queued": "pending",
    "failed": "failed",
    "failed_quality": "failed",
    "error": "failed",
    "partial": "partial",
}
_SUPABASE_PUBLIC_BASE_URL = (get_settings().supabase_url or "").strip()


def _pick_string(*values: object) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _resolve_public_asset_fields(
    *,
    arquivo_url: object,
    storage_path: object,
    metadata: dict[str, Any] | None,
    fallback_bucket: str | None = BUCKET,
) -> tuple[str | None, str | None, dict[str, Any]]:
    metadata_dict: dict[str, Any] = dict(metadata or {})
    raw_url = _pick_string(arquivo_url)
    raw_storage_path = _pick_string(storage_path)
    is_http_url = bool(raw_url and raw_url.startswith(("http://", "https://")))
    path_candidate = raw_storage_path or (None if is_http_url else raw_url)

    bucket = _pick_string(
        metadata_dict.get("bucket"),
        metadata_dict.get("bucketName"),
        metadata_dict.get("storageBucket"),
        metadata_dict.get("storage_bucket"),
        fallback_bucket,
    )

    resolved_url = raw_url if is_http_url else None
    resolved_storage_path = raw_storage_path or path_candidate
    if path_candidate and bucket:
        public_url = build_public_storage_url(_SUPABASE_PUBLIC_BASE_URL, bucket, path_candidate)
        if public_url:
            resolved_url = public_url
            resolved_storage_path = path_candidate
            metadata_dict.setdefault("bucket", bucket)

    return resolved_url, resolved_storage_path, metadata_dict


def _hydrate_materiais_public_urls(
    materiais: dict[str, Any] | None,
    *,
    fallback_bucket: str | None = BUCKET,
) -> dict[str, Any] | None:
    if not isinstance(materiais, dict):
        return materiais

    hydrated: dict[str, Any] = {}
    for tipo, material in materiais.items():
        if not isinstance(material, dict):
            hydrated[tipo] = material
            continue
        metadata = material.get("metadata") if isinstance(material.get("metadata"), dict) else {}
        arquivo_url, storage_path, metadata = _resolve_public_asset_fields(
            arquivo_url=material.get("arquivo_url"),
            storage_path=material.get("storage_path"),
            metadata=metadata,
            fallback_bucket=fallback_bucket,
        )
        hydrated[tipo] = {
            **material,
            "arquivo_url": arquivo_url,
            "storage_path": storage_path,
            "metadata": metadata,
        }

    return hydrated


def _normalize_media_status(material: dict[str, object]) -> str:
    metadata = material.get("metadata") if isinstance(material.get("metadata"), dict) else {}
    scores = metadata.get("scores_validacao") if isinstance(metadata.get("scores_validacao"), dict) else {}
    if scores.get("aprovado") is False:
        raw_status = str((metadata or {}).get("status") or "").strip().lower()
        if raw_status in {"pending", "processing", "queued"}:
            return "pending"
        return "failed"
    raw_status = str((metadata or {}).get("status") or "").strip().lower()
    mapped = _MEDIA_STATUS_MAP.get(raw_status)
    if mapped:
        return mapped
    if material.get("arquivo_url"):
        return "ready"
    return "pending"


def _aggregate_media_status(statuses: list[str]) -> str:
    normalized = [status for status in statuses if status in {"ready", "pending", "partial", "failed"}]
    if not normalized:
        return "ready"
    if any(status == "pending" for status in normalized):
        return "pending"
    if all(status == "failed" for status in normalized):
        return "failed"
    if any(status in {"failed", "partial"} for status in normalized):
        return "partial"
    return "ready"


def _materials_media_status(materiais: dict[str, object] | None) -> str:
    payload = materiais if isinstance(materiais, dict) else {}
    statuses = [
        _normalize_media_status(material)
        for tipo, material in payload.items()
        if tipo in _MEDIA_TIPOS and isinstance(material, dict)
    ]
    return _aggregate_media_status(statuses)


def _normalize_profile_name(value: str | None) -> str:
    return str(value or "").strip().lower()


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    normalized = color.strip().lstrip("#")
    if len(normalized) == 3:
        normalized = "".join(part * 2 for part in normalized)
    return tuple(int(normalized[index : index + 2], 16) for index in (0, 2, 4))


def _rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*[max(0, min(255, int(channel))) for channel in rgb])


def _blend(color_a: str, color_b: str, ratio: float) -> str:
    ratio = max(0.0, min(1.0, ratio))
    left = _hex_to_rgb(color_a)
    right = _hex_to_rgb(color_b)
    mixed = tuple(round(left[i] * (1.0 - ratio) + right[i] * ratio) for i in range(3))
    return _rgb_to_hex(mixed)


def _darken(color: str, amount: float) -> str:
    base = _hex_to_rgb(color)
    factor = max(0.0, min(1.0, 1.0 - amount))
    return _rgb_to_hex(tuple(round(channel * factor) for channel in base))


def _rgba(color: str, alpha: float) -> str:
    red, green, blue = _hex_to_rgb(color)
    return f"rgba({red}, {green}, {blue}, {max(0.0, min(1.0, alpha)):.2f})"


def _lighten(color: str, amount: float) -> str:
    return _blend(color, "#ffffff", amount)


def _relative_luminance(color: str) -> float:
    """Luminância relativa sRGB (WCAG 2.x)."""
    def _channel(value: int) -> float:
        srgb = value / 255.0
        return srgb / 12.92 if srgb <= 0.03928 else ((srgb + 0.055) / 1.055) ** 2.4

    red, green, blue = _hex_to_rgb(color)
    return 0.2126 * _channel(red) + 0.7152 * _channel(green) + 0.0722 * _channel(blue)


def _contrast_ratio(foreground: str, background: str) -> float:
    """Razão de contraste WCAG entre duas cores hex (1.0–21.0)."""
    lighter = max(_relative_luminance(foreground), _relative_luminance(background))
    darker = min(_relative_luminance(foreground), _relative_luminance(background))
    return (lighter + 0.05) / (darker + 0.05)


def _ensure_min_contrast(
    color: str,
    background: str,
    min_ratio: float,
    *,
    step: float = 0.08,
    max_steps: int = 14,
) -> str:
    """Clareia `color` em direção ao branco até atingir `min_ratio` de contraste
    contra `background`, preservando o matiz da cor-assinatura do perfil."""
    adjusted = color
    for _ in range(max_steps):
        if _contrast_ratio(adjusted, background) >= min_ratio:
            break
        nxt = _lighten(adjusted, step)
        if nxt == adjusted:  # já é branco; não há como clarear mais
            break
        adjusted = nxt
    return adjusted


def _build_design_tokens(profile_name: str | None) -> DesignTokens:
    accent_base = _PROFILE_COLOR_MAP.get(
        _normalize_profile_name(profile_name),
        _PROFILE_COLOR_MAP["mastermind"],
    )
    background = _darken(_blend("#0b1220", accent_base, 0.06), 0.05)
    surface = _blend("#131d31", accent_base, 0.10)
    surface_elevated = _blend("#182338", accent_base, 0.14)

    # WCAG AAA: o accent (texto grande, ícones, bordas) precisa ser legível sobre
    # a superfície MAIS CLARA em que aparece (pior caso = surface_elevated).
    # Clareamos preservando o matiz da cor-assinatura, garantindo >= 4.5:1
    # (AAA para texto grande; excede o 3:1 exigido para componentes de UI).
    accent = _ensure_min_contrast(
        _blend(accent_base, "#ffffff", 0.06), surface_elevated, 4.5
    )

    return DesignTokens(
        cores=DesignTokensCores(
            background=background,
            surface=surface,
            surface_elevated=surface_elevated,
            primary=accent,
            primary_glow=_rgba(accent, 0.30),
            border=_rgba(accent, 0.40),
            text_primary="#f2f7fa",
            text_muted="rgba(242, 247, 250, 0.80)",
            # Cores semânticas fixas (não derivadas do accent): evita Survivor
            # vermelho como "sucesso" e garante contraste AAA consistente.
            success="#34d399",
            warning="#fbbf24",
            info="#60a5fa",
            locked="#5a676b",
        ),
        sombra_primary=_rgba(accent, 0.30),
    )


def _graph_config(request: Request, aluno_id: str, cycle_id: str, classe_id: int) -> dict:
    return {
        "configurable": {
            "thread_id": f"{aluno_id}:{cycle_id}",
            "checkpoint_ns": "personalizacao",
        },
        "tags": ["trailup", "personalizacao"],
        "metadata": {
            "aluno_id": aluno_id,
            "classe_id": classe_id,
            "ciclo_id": cycle_id,
        },
    }


def _summarize_personalizar_payload(payload: PersonalizarPayload) -> dict[str, object]:
    return {
        "classe_id": payload.classe_id,
        "topico_id": payload.topico_id,
        "conteudo_id": payload.conteudo_id,
        "conteudo_foco_id": payload.conteudo_foco_id,
        "perfis_count": len(payload.perfis),
        "snapshot_keys": sorted((payload.topico_snapshot or {}).keys()) if payload.topico_snapshot else [],
        "materiais_origem_count": len(payload.materiais_origem_cliente or []),
    }


def _summarize_personalizacao_record(record: dict | None) -> dict[str, object]:
    material_types = sorted((record or {}).get("materiais", {}).keys()) if isinstance((record or {}).get("materiais"), dict) else []
    steps = build_personalizacao_steps(record or {})
    return {
        "id": (record or {}).get("id"),
        "topico_id": (record or {}).get("topico_id"),
        "conteudo_id": (record or {}).get("conteudo_id"),
        "ciclo_id": (record or {}).get("ciclo_id"),
        "formato_prioritario": (record or {}).get("formato_prioritario"),
        "formatos_gerados": list((record or {}).get("formatos_gerados") or []),
        "material_types": material_types,
        "steps_count": len(steps),
    }


def _format_percent(value: object) -> str:
    try:
        numeric = max(0.0, min(100.0, float(value or 0)))
    except (TypeError, ValueError):
        numeric = 0.0
    return f"{round(numeric)}%"


def _format_minutes(value: object) -> str:
    try:
        numeric = max(0.0, float(value or 0))
    except (TypeError, ValueError):
        numeric = 0.0

    rounded = round(numeric)
    if rounded < 60:
        return f"{rounded} min"

    horas = rounded // 60
    minutos = rounded % 60
    if minutos <= 0:
        return f"{horas}h"
    return f"{horas}h {minutos}min"


def _build_student_metrics_summary(context: dict[str, object]) -> dict[str, object]:
    desempenho = context.get("desempenho_recente") if isinstance(context.get("desempenho_recente"), dict) else {}
    progresso = context.get("progresso_trilha") if isinstance(context.get("progresso_trilha"), dict) else {}
    historico_eventos = context.get("historico_eventos") if isinstance(context.get("historico_eventos"), list) else []
    aluno = context.get("aluno") if isinstance(context.get("aluno"), dict) else {}

    return {
        "apelido": aluno.get("apelido") or aluno.get("nome"),
        "modo_operacao": aluno.get("modo_operacao"),
        "modo_resposta": aluno.get("modo_resposta"),
        "progresso_topicos_count": len(progresso),
        "media_acertos_pct": _format_percent(desempenho.get("media_acertos")),
        "percentual_concluido_pct": _format_percent(desempenho.get("percentual_concluido")),
        "tempo_medio_min": _format_minutes(desempenho.get("tempo_medio_min")),
        "topico_concluido": bool(desempenho.get("topico_concluido")),
        "atividade_recente_id": desempenho.get("atividade_recente_id"),
        "topico_recente_id": desempenho.get("topico_recente_id"),
        "eventos_recentes": [item.get("tipo") for item in historico_eventos[:6] if isinstance(item, dict) and item.get("tipo")],
    }


def _build_student_reading_summary(context: dict[str, object]) -> dict[str, object]:
    desempenho = context.get("desempenho_recente") if isinstance(context.get("desempenho_recente"), dict) else {}
    trilha = context.get("trilha_atual") if isinstance(context.get("trilha_atual"), dict) else {}
    ia_descricao = context.get("ia_descricao_atual") if isinstance(context.get("ia_descricao_atual"), dict) else {}

    return {
        "ritmo_geral": "consistente" if float(desempenho.get("percentual_concluido") or 0) >= 50 else "em_formacao",
        "tempo_medio": _format_minutes(desempenho.get("tempo_medio_min")),
        "topico_concluido": bool(desempenho.get("topico_concluido")),
        "trilha_status": trilha.get("status"),
        "insights": ia_descricao.get("insights"),
        "modo_operacao_sugerido": ia_descricao.get("modooperacao"),
        "recomendacao_trilha": ia_descricao.get("recomendacaotrilha"),
    }


def _looks_like_answer_request(text: str) -> bool:
    normalized = text.lower()
    patterns = [
        "qual a resposta",
        "me passa a resposta",
        "gabarito",
        "alternativa correta",
        "qual alternativa",
        "resolva",
        "faz pra mim",
        "me diga a resposta",
    ]
    return any(pattern in normalized for pattern in patterns)


def _mentor_tone_intro(perfil: str | None) -> str:
    profile = (perfil or "").strip().lower()
    mapping = {
        "achiever": "Vamos focar em metas claras e progresso constante. ",
        "conqueror": "Vamos encarar isso como um desafio direto. ",
        "daredevil": "Vamos em um ritmo dinamico e pratico. ",
        "mastermind": "Vou explicar a logica das escolhas para voce. ",
        "socialiser": "Vamos juntos, passo a passo. ",
        "seeker": "Vamos explorar o tema com curiosidade. ",
        "survivor": "Vamos com calma e seguranca, um passo de cada vez. ",
    }
    return mapping.get(profile, "")


def _fallback_mentor_chat_reply(
    *,
    payload: MentorChatPayload,
    latest_record: dict | None,
    context: dict[str, object],
) -> dict[str, object]:
    justification = ""
    if latest_record:
        justification = str(((latest_record.get("plano") or {}).get("justificativa")) or "").strip()
    metrics_summary = _build_student_metrics_summary(context)
    reading_summary = _build_student_reading_summary(context)
    top_profile = (
        ((context.get("perfil_brainhex") or [{}])[0] or {}).get("perfil")
        if isinstance(context.get("perfil_brainhex"), list)
        else None
    )
    tone_intro = _mentor_tone_intro(str(top_profile or "").strip())

    if _looks_like_answer_request(payload.mensagem):
        return {
            "reply": (
                f"{tone_intro}Nao posso entregar a resposta da atividade. Posso te explicar por que esse modulo foi personalizado "
                "desse jeito e sugerir como revisar o material antes de tentar de novo."
            ),
            "should_close": False,
            "hinted_actions": ["revisar_material", "explicar_personalizacao"],
        }

    profile_label = str(top_profile or "seu perfil").strip()
    message_normalized = payload.mensagem.lower()

    if any(keyword in message_normalized for keyword in ["metrica", "desempenho", "tempo", "progresso", "acerto", "leitura", "dados"]):
        return {
            "reply": (
                f"{tone_intro}Ate aqui, seu progresso registrado nesta classe esta em {metrics_summary['percentual_concluido_pct']}, "
                f"com media recente de {metrics_summary['media_acertos_pct']} e tempo medio de {metrics_summary['tempo_medio_min']} por atividade. "
                f"Na leitura adaptativa, eu observo seu ritmo ({reading_summary['ritmo_geral']}) e o historico recente para sugerir ajustes sem entregar respostas."
            ),
            "should_close": False,
            "hinted_actions": ["resumir_metricas", "explicar_personalizacao"],
        }

    if payload.escopo == "trilha_home":
        reply = (
            f"{tone_intro}Na sua trilha eu considero {profile_label} e seu historico recente para escolher formato, ritmo e apoio. "
            "Posso te explicar o motivo de um modulo personalizado especifico, comentar metricas simples da sua jornada e resumir o que ja foi observado nas leituras adaptativas, sem entrar no gabarito das atividades."
        )
    elif justification:
        reply = (
            f"{tone_intro}Eu personalizei este modulo assim: {justification} "
            "Se quiser, eu tambem posso sugerir a melhor ordem para estudar esse material e resumir como suas metricas mais recentes influenciaram essa decisao."
        )
    else:
        reply = (
            f"{tone_intro}Eu consigo comentar a decisao de personalizacao, o ritmo sugerido e a melhor estrategia para estudar este modulo, "
            "alem de resumir metricas e leituras recentes, mas nao entrego respostas de atividade."
        )

    return {
        "reply": reply,
        "should_close": False,
        "hinted_actions": ["explicar_personalizacao", "sugerir_ordem_estudo"],
    }


def _to_response(record: dict) -> PersonalizacaoResponse:
    design_tokens = record.get("design_tokens")
    if design_tokens is None:
        dominant_profile = str(
            (record.get("plano") or {}).get("perfil_dominante")
            or (record.get("metadata") or {}).get("perfil_dominante")
            or "mastermind"
        ).strip()
        design_tokens = _build_design_tokens(dominant_profile).model_dump(mode="json")

    materiais = _hydrate_materiais_public_urls(
        record.get("materiais") if isinstance(record.get("materiais"), dict) else None,
        fallback_bucket=BUCKET,
    )
    record_for_steps = dict(record)
    record_for_steps["materiais"] = materiais or {}

    try:
        steps = build_personalizacao_steps(record_for_steps)
    except Exception:
        logger.warning(
            "Falha ao reconstruir steps de personalizacao",
            extra={
                "record_id": record.get("id"),
                "topico_id": record.get("topico_id"),
                "conteudo_id": record.get("conteudo_id"),
            },
            exc_info=True,
        )
        steps = []

    media_status = _materials_media_status(materiais)

    return PersonalizacaoResponse(
        id=record["id"],
        aluno_id=str(record["aluno_id"]),
        classe_id=record.get("classe_id"),
        conteudo_id=record.get("conteudo_id"),
        topico_id=record.get("topico_id"),
        ciclo_id=record["ciclo_id"],
        status=str(record.get("status") or "pronto"),
        media_status=media_status,
        media_job_id=None,
        source_hash=record.get("source_hash"),
        formato_prioritario=record.get("formato_prioritario") or "",
        formatos_gerados=list(record.get("formatos_gerados") or []),
        plano=record.get("plano"),
        materiais=materiais,
        ai_patch=record.get("ai_patch"),
        design_tokens=design_tokens,
        steps=steps,
        gerado_em=record["gerado_em"],
        updated_at=record.get("updated_at"),
    )


def _to_progresso_response(record: dict) -> PersonalizacaoItemProgressoResponse:
    return PersonalizacaoItemProgressoResponse(
        id=record["id"],
        personalizacao_id=record["personalizacao_id"],
        aluno_id=str(record["aluno_id"]),
        classe_id=record["classe_id"],
        topico_id=record["topico_id"],
        item_key=record["item_key"],
        item_kind=record["item_kind"],
        item_title=record["item_title"],
        status=record["status"],
        percentual_concluido=float(record.get("percentual_concluido") or 0),
        acertos_percentual=(
            float(record["acertos_percentual"])
            if record.get("acertos_percentual") is not None
            else None
        ),
        tempo_gasto_min=float(record.get("tempo_gasto_min") or 0),
        pontuacao_obtida=(
            float(record["pontuacao_obtida"])
            if record.get("pontuacao_obtida") is not None
            else None
        ),
        pontuacao_maxima=(
            float(record["pontuacao_maxima"])
            if record.get("pontuacao_maxima") is not None
            else None
        ),
        metadata=record.get("metadata") or {},
        completed_at=record.get("completed_at"),
        updated_at=record["updated_at"],
    )


def _to_fonte_response(record: dict) -> FontePersonalizacaoResponse:
    metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
    arquivo_url, storage_path, metadata = _resolve_public_asset_fields(
        arquivo_url=record.get("arquivo_url"),
        storage_path=record.get("storage_path"),
        metadata=metadata,
        fallback_bucket="conteudos",
    )
    return FontePersonalizacaoResponse(
        id=record["id"],
        classe_id=record["classe_id"],
        topico_id=record.get("topico_id"),
        conteudo_id=record.get("conteudo_id"),
        aluno_id=str(record["aluno_id"]) if record.get("aluno_id") is not None else None,
        professor_id=str(record["professor_id"]) if record.get("professor_id") is not None else None,
        visibilidade=record["visibilidade"],
        tipo=record["tipo"],
        titulo=record.get("titulo"),
        descricao=record.get("descricao"),
        arquivo_url=arquivo_url,
        storage_path=storage_path,
        mime_type=record.get("mime_type"),
        nome_arquivo=record.get("nome_arquivo"),
        tamanho_bytes=record.get("tamanho_bytes"),
        origem=record["origem"],
        metadata=metadata or {},
        criado_em=record["criado_em"],
    )


def _to_job_response(record: dict) -> PersonalizacaoJobResponse:
    return PersonalizacaoJobResponse(
        id=str(record["id"]),
        kind=str(record["kind"]),
        status=str(record["status"]),
        classe_id=int(record["classe_id"]),
        aluno_id=str(record["aluno_id"]) if record.get("aluno_id") is not None else None,
        topico_id=record.get("topico_id"),
        conteudo_id=record.get("conteudo_id"),
        trigger_source=str(record["trigger_source"]),
        payload=record.get("payload") or {},
        total_targets=int(record.get("total_targets") or 0),
        processed_targets=int(record.get("processed_targets") or 0),
        error_count=int(record.get("error_count") or 0),
        last_error=record.get("last_error"),
        created_at=record["created_at"],
        updated_at=record["updated_at"],
        started_at=record.get("started_at"),
        finished_at=record.get("finished_at"),
    )


def _to_job_target_response(record: dict) -> PersonalizacaoJobTargetResponse:
    return PersonalizacaoJobTargetResponse(
        id=int(record["id"]),
        job_id=str(record["job_id"]),
        aluno_id=str(record["aluno_id"]),
        topico_id=int(record["topico_id"]),
        conteudo_id=record.get("conteudo_id"),
        status=str(record["status"]),
        attempts=int(record.get("attempts") or 0),
        last_error=record.get("last_error"),
        personalizacao_id=record.get("personalizacao_id"),
        created_at=record["created_at"],
        updated_at=record["updated_at"],
    )


def _parse_links_json(raw_links: str | None) -> list[dict]:
    if not raw_links:
        return []

    try:
        parsed = json.loads(raw_links)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="links_json invalido. Envie um JSON array de URLs ou objetos.",
        ) from exc

    if not isinstance(parsed, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="links_json deve ser um array.",
        )

    normalized: list[dict] = []
    for item in parsed:
        if isinstance(item, str):
            normalized.append({"url": item})
            continue
        if isinstance(item, dict) and isinstance(item.get("url"), str):
            normalized.append(item)
            continue
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cada link deve ser uma URL string ou um objeto com campo url.",
        )

    return normalized


def _sanitize_filename(filename: str | None) -> str:
    name = Path(filename or "arquivo").name.strip()
    return name or "arquivo"


def _resolve_visibility(user: UserContext, requested: str | None) -> str:
    if requested is None:
        return "aluno" if user.is_aluno else "classe"

    normalized = requested.strip().lower()
    if normalized not in {"aluno", "classe"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="visibilidade deve ser 'aluno' ou 'classe'.",
        )
    return normalized


def _build_storage_path(
    *,
    classe_id: int,
    topico_id: int | None,
    conteudo_id: int | None,
    filename: str,
) -> str:
    safe_name = _sanitize_filename(filename)
    return (
        f"fontes/classe-{classe_id}/"
        f"topico-{topico_id or 'geral'}/"
        f"conteudo-{conteudo_id or 'geral'}/"
        f"{uuid4()}-{safe_name}"
    )


@router.post("", response_model=PersonalizacaoResponse, status_code=status.HTTP_201_CREATED)
async def personalizar(
    payload: PersonalizarPayload,
    request: Request,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoResponse:
    if not user.is_aluno:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas alunos podem solicitar personalizacao de conteudo.",
        )

    if payload.topico_id is None and payload.conteudo_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe topico_id ou conteudo_id.",
        )

    aluno_id = user.aluno_id or user.user_id
    settings = request.app.state.settings
    logger.info(
        "personalizacao.input=%s",
        {
            "aluno_id": aluno_id,
            **_summarize_personalizar_payload(payload),
        },
    )

    try:
        ctx = await fetch_personalizacao_context(
            aluno_id=aluno_id,
            classe_id=payload.classe_id,
            topico_id=payload.topico_id,
            conteudo_id=payload.conteudo_id,
            settings=settings,
            session=session,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    cards_payload = await gerar_cards_direto(
        perfil=ctx["perfil_dominante"],
        conteudo_classe=ctx["conteudo_classe"],
        contexto_aluno=ctx["contexto_aluno"],
        perfil_brainhex=ctx["perfil_brainhex"],
        settings=settings,
    )

    resolved_topico_id = ctx.get("topico_id") or payload.topico_id
    resolved_conteudo_id = ctx.get("conteudo_id") or payload.conteudo_id
    brainhex_profile_key = str(ctx.get("perfil_dominante") or "mastermind").strip().lower()
    if brainhex_profile_key == "socialiser":
        brainhex_profile_key = "socializer"

    repo_artefatos = ArtefatosPersonalizadosRepository(session)
    await repo_artefatos.marcar_ciclos_anteriores_obsoletos(
        aluno_id=aluno_id,
        classe_id=payload.classe_id,
        topico_id=int(resolved_topico_id or 0),
        ciclo_id=ctx["ciclo_id"],
        brainhex_profile_key=brainhex_profile_key,
    )
    cards_list = (
        cards_payload if isinstance(cards_payload, list)
        else (cards_payload.get("cards") if isinstance(cards_payload, dict) else [])
    )
    saved_cards = await repo_artefatos.salvar_cards(
        aluno_id=aluno_id,
        classe_id=payload.classe_id,
        topico_id=int(resolved_topico_id or 0),
        conteudo_id=resolved_conteudo_id,
        ciclo_id=ctx["ciclo_id"],
        brainhex_profile_key=brainhex_profile_key,
        source_hash=str(ctx.get("source_hash") or ""),
        cards=cards_list if isinstance(cards_list, list) else [],
    )
    cards_ids = [c["id"] for c in saved_cards if isinstance(c, dict) and c.get("id")]

    repo = ConteudoPersonalizadoRepository(session)
    record_id = await repo.salvar(
        aluno_id=aluno_id,
        classe_id=payload.classe_id,
        topico_id=payload.topico_id,
        conteudo_id=payload.conteudo_id,
        ciclo_id=ctx["ciclo_id"],
        plano={
            "perfil_dominante": ctx.get("perfil_dominante"),
            "brainhex_profile_key": brainhex_profile_key,
            "cards_personalizados_ids": cards_ids,
        },
        materiais={},
        ai_patch=None,
        status="processando_midias",
        source_hash=ctx["source_hash"],
        formato_prioritario="cards",
        formatos_gerados=["cards"],
    )

    record = await repo.buscar_por_ciclo_id(aluno_id=aluno_id, ciclo_id=ctx["ciclo_id"])
    if not record:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Personalizacao nao retornou registro persistido.",
        )

    import asyncio as _asyncio
    _asyncio.create_task(
        disparar_brainhex_async(
            settings=settings,
            perfil=ctx["perfil_dominante"],
            fontes=ctx["fontes"],
            personalizacao_id=int(record_id),
            aluno_id=aluno_id,
            classe_id=payload.classe_id,
            topico_id=payload.topico_id,
            ciclo_id=ctx["ciclo_id"],
        )
    )

    logger.info(
        "personalizacao.output=%s",
        {
            "aluno_id": aluno_id,
            **_summarize_personalizacao_record(record),
        },
    )
    return _to_response(record)


@router.post("/chat", response_model=MentorChatResponse)
async def conversar_com_mentor_personalizacao(
    payload: MentorChatPayload,
    request: Request,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MentorChatResponse:
    if not user.is_aluno:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas alunos podem conversar com o guia.",
        )

    aluno_id = user.aluno_id or user.user_id
    context_repo = ContextRepository(session)
    personalizacao_repo = ConteudoPersonalizadoRepository(session)
    classe_repo = ConteudoClasseRepository(session)

    context = await context_repo.fetch_aluno_context(aluno_id, payload.classe_id)
    records = await personalizacao_repo.buscar_por_aluno(
        aluno_id,
        conteudo_id=payload.conteudo_id,
        topico_id=payload.topico_id,
        limit=3,
    )
    latest_record = records[0] if records else None
    topico = await classe_repo.buscar_topico(payload.topico_id) if payload.topico_id is not None else None

    logger.info(
        "personalizacao.chat.input=%s",
        {
            "aluno_id": aluno_id,
            "classe_id": payload.classe_id,
            "topico_id": payload.topico_id,
            "conteudo_id": payload.conteudo_id,
            "escopo": payload.escopo,
            "mensagem": payload.mensagem,
            "historico_count": len(payload.historico),
            "personalizacao_id": latest_record.get("id") if latest_record else None,
        },
    )

    fallback = _fallback_mentor_chat_reply(
        payload=payload,
        latest_record=latest_record,
        context=context,
    )

    llm = JsonLLMService(request.app.state.settings)
    result = await llm.ainvoke_json(
        prompt_name="mentor_personalizacao_chat.txt",
        payload={
            "escopo": payload.escopo,
            "mensagem": payload.mensagem,
            "historico": [item.model_dump(mode="json") for item in payload.historico[-6:]],
            "aluno": {
                "id": aluno_id,
                "modo_operacao": (context.get("aluno") or {}).get("modo_operacao") if isinstance(context.get("aluno"), dict) else None,
                "modo_resposta": (context.get("aluno") or {}).get("modo_resposta") if isinstance(context.get("aluno"), dict) else None,
            },
            "perfil_brainhex": context.get("perfil_brainhex", [])[:4],
            "metricas_aluno": _build_student_metrics_summary(context),
            "leituras_adaptativas": _build_student_reading_summary(context),
            "topico": {
                "id": payload.topico_id,
                "nome": (topico or {}).get("nome") if isinstance(topico, dict) else None,
                "descricao": (topico or {}).get("descricao") if isinstance(topico, dict) else None,
            },
            "decisao_personalizacao": (
                ((latest_record or {}).get("plano") or {}).get("justificativa")
                if latest_record
                else None
            ),
            "guardrails": {
                "sem_gabarito": True,
                "sem_resposta_direta_atividade": True,
            },
        },
        fallback_factory=lambda: dict(fallback),
        provider="openai",
    )

    response = MentorChatResponse(
        reply=str(result.get("reply") or fallback["reply"]).strip(),
        scope=payload.escopo,
        should_close=bool(result.get("should_close", False)),
        hinted_actions=[str(item).strip() for item in (result.get("hinted_actions") or []) if str(item).strip()],
    )

    try:
        await IADecisionLogRepository(session).log(
            aluno_id=aluno_id,
            classe_id=payload.classe_id,
            topico_id=payload.topico_id,
            conteudo_id=payload.conteudo_id,
            source="chat",
            stage="mentor_personalizacao_chat",
            provider="openai",
            model_name=request.app.state.settings.openai_model_default,
            trigger_event=payload.escopo,
            input_summary={
                "mensagem": payload.mensagem,
                "historico": [item.model_dump(mode="json") for item in payload.historico[-6:]],
                "metricas_aluno": _build_student_metrics_summary(context),
            },
            prompt_text=load_prompt("mentor_personalizacao_chat.txt"),
            raw_response=json.dumps(result, ensure_ascii=False, default=str),
            parsed_response=result,
            decision_summary=response.reply[:500],
            actions=response.hinted_actions,
        )
        await session.commit()
    except Exception as exc:  # pragma: no cover
        await session.rollback()
        logger.warning("Falha ao persistir ia_decision_logs do chat: %s", exc)

    logger.info(
        "personalizacao.chat.output=%s",
        {
            "aluno_id": aluno_id,
            "classe_id": payload.classe_id,
            "topico_id": payload.topico_id,
            "escopo": payload.escopo,
            "reply_preview": response.reply[:180],
            "should_close": response.should_close,
            "hinted_actions": response.hinted_actions,
        },
    )
    return response


@router.post("/fontes", response_model=FontesPersonalizacaoUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_fontes_personalizacao(
    request: Request,
    classe_id: int = Form(...),
    topico_id: int | None = Form(default=None),
    conteudo_id: int | None = Form(default=None),
    visibilidade: str | None = Form(default=None),
    descricao: str | None = Form(default=None),
    links_json: str | None = Form(default=None),
    files: list[UploadFile] | None = File(default=None),
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FontesPersonalizacaoUploadResponse:
    link_items = _parse_links_json(links_json)
    upload_files = [file for file in files or [] if file.filename]
    if not upload_files and not link_items:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Envie ao menos um arquivo ou um link para criar fontes de personalizacao.",
        )

    classe_repo = ConteudoClasseRepository(session)
    access_repo = AccessRepository(session)
    resolved_topico_id = topico_id
    resolved_conteudo_id = conteudo_id

    if resolved_conteudo_id is not None:
        conteudo_topico_id = await classe_repo.buscar_topico_id_por_conteudo(resolved_conteudo_id)
        conteudo_classe_id = await classe_repo.buscar_classe_id_por_conteudo(resolved_conteudo_id)
        if conteudo_topico_id is None or conteudo_classe_id is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conteudo informado nao encontrado.",
            )
        if conteudo_classe_id != classe_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="conteudo_id nao pertence a classe_id informado.",
            )
        if resolved_topico_id is not None and resolved_topico_id != conteudo_topico_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="conteudo_id nao pertence ao topico_id informado.",
            )
        resolved_topico_id = conteudo_topico_id

    if resolved_topico_id is not None:
        topico_classe_id = await classe_repo.buscar_classe_id_por_topico(resolved_topico_id)
        if topico_classe_id is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Topico informado nao encontrado.",
            )
        if topico_classe_id != classe_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="topico_id nao pertence a classe_id informado.",
            )

    resolved_visibility = _resolve_visibility(user, visibilidade)
    actor_aluno_id: str | None = None
    actor_professor_id: str | None = None

    if resolved_visibility == "classe":
        if not user.is_professor:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Apenas professores podem enviar fontes com visibilidade de classe.",
            )
        if not user.professor_liberado:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Professor sem liberacao de acesso.",
            )
        allowed = await access_repo.professor_owns_classe(user.professor_id or user.user_id, classe_id)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Professor sem permissao para enviar fontes nesta classe.",
            )
        actor_professor_id = user.professor_id or user.user_id
    else:
        if not user.is_aluno:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Apenas alunos podem enviar fontes com visibilidade individual.",
            )
        allowed = await access_repo.aluno_belongs_to_classe(user.aluno_id or user.user_id, classe_id)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Aluno sem vinculo com a classe informada.",
            )
        actor_aluno_id = user.aluno_id or user.user_id

    storage = SupabaseStorage(request.app.state.settings)
    repo = FontesPersonalizacaoRepository(session)
    saved_items: list[dict] = []

    for upload in upload_files:
        filename = _sanitize_filename(upload.filename)
        payload = await upload.read()
        storage_path = _build_storage_path(
            classe_id=classe_id,
            topico_id=resolved_topico_id,
            conteudo_id=resolved_conteudo_id,
            filename=filename,
        )
        mime_type = upload.content_type or "application/octet-stream"
        arquivo_url = await storage.upload(
            path=storage_path,
            data=payload,
            content_type=mime_type,
        )
        if not arquivo_url:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Falha ao enviar arquivo '{filename}' para o storage.",
            )

        saved_items.append(
            await repo.salvar(
                classe_id=classe_id,
                topico_id=resolved_topico_id,
                conteudo_id=resolved_conteudo_id,
                aluno_id=actor_aluno_id,
                professor_id=actor_professor_id,
                visibilidade=resolved_visibility,
                tipo=_infer_source_type(
                    declared_type=filename,
                    url=arquivo_url,
                    mime_hint=mime_type,
                ),
                titulo=Path(filename).stem,
                descricao=descricao,
                arquivo_url=arquivo_url,
                storage_path=storage_path,
                mime_type=mime_type,
                nome_arquivo=filename,
                tamanho_bytes=len(payload),
                origem="upload",
                metadata={
                    "filename_original": filename,
                    "source": "api_upload",
                    "bucket": "conteudo_aluno",
                },
            )
        )

    for index, item in enumerate(link_items, start=1):
        url = str(item["url"]).strip()
        if not url:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Todos os links precisam ter URL valida.",
            )
        saved_items.append(
            await repo.salvar(
                classe_id=classe_id,
                topico_id=resolved_topico_id,
                conteudo_id=resolved_conteudo_id,
                aluno_id=actor_aluno_id,
                professor_id=actor_professor_id,
                visibilidade=resolved_visibility,
                tipo=_infer_source_type(
                    declared_type=str(item.get("tipo") or ""),
                    url=url,
                    mime_hint=str(item.get("mime_type") or item.get("mimeType") or ""),
                ),
                titulo=str(item.get("titulo") or f"Link {index}"),
                descricao=str(item.get("descricao") or descricao or ""),
                arquivo_url=url,
                storage_path=None,
                mime_type=str(item.get("mime_type") or item.get("mimeType") or "") or None,
                nome_arquivo=None,
                tamanho_bytes=None,
                origem="link",
                metadata={
                    "source": "api_link",
                    "link_kind": str(item.get("tipo") or "").strip().lower() or None,
                },
            )
        )

    return FontesPersonalizacaoUploadResponse(
        classe_id=classe_id,
        topico_id=resolved_topico_id,
        conteudo_id=resolved_conteudo_id,
        total=len(saved_items),
        itens=[_to_fonte_response(item) for item in saved_items],
    )


@router.post("/progresso", response_model=PersonalizacaoItemProgressoResponse)
async def upsert_progresso_personalizado(
    payload: PersonalizacaoItemProgressoPayload,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoItemProgressoResponse:
    if not user.is_aluno:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas alunos podem registrar progresso personalizado.",
        )

    aluno_id = user.aluno_id or user.user_id
    personalizacao_repo = ConteudoPersonalizadoRepository(session)
    progress_repo = PersonalizacaoProgressoRepository(session)
    personalizacao = await personalizacao_repo.buscar_por_id(payload.personalizacao_id)
    if not personalizacao:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Personalizacao nao encontrada.",
        )
    personalizacao_classe_id = int(personalizacao.get("classe_id") or 0)
    personalizacao_topico_id = int(personalizacao.get("topico_id") or 0)
    if personalizacao_classe_id and personalizacao_classe_id != int(payload.classe_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="classe_id incompativel com a personalizacao informada.",
        )
    if personalizacao_topico_id and personalizacao_topico_id != int(payload.topico_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="topico_id incompativel com a personalizacao informada.",
        )

    access_repo = AccessRepository(session)
    belongs = await access_repo.aluno_belongs_to_classe(
        aluno_id=str(aluno_id),
        classe_id=int(payload.classe_id),
    )
    if not belongs:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Aluno sem acesso a esta classe.",
        )

    previous = await progress_repo.buscar_item(
        aluno_id=aluno_id,
        personalizacao_id=payload.personalizacao_id,
        item_key=payload.item_key,
    )
    saved = await progress_repo.upsert(
        personalizacao_id=payload.personalizacao_id,
        aluno_id=aluno_id,
        classe_id=payload.classe_id,
        topico_id=payload.topico_id,
        item_key=payload.item_key,
        item_kind=payload.item_kind,
        item_title=payload.item_title,
        status=payload.status,
        percentual_concluido=payload.percentual_concluido,
        acertos_percentual=payload.acertos_percentual,
        tempo_gasto_min=payload.tempo_gasto_min,
        pontuacao_obtida=payload.pontuacao_obtida,
        pontuacao_maxima=payload.pontuacao_maxima,
        metadata=payload.metadata,
    )
    await progress_repo.atualizar_classe_aluno_snapshot(
        aluno_id=aluno_id,
        classe_id=payload.classe_id,
    )
    await session.commit()

    should_log_score = (
        payload.status == "concluido"
        and (payload.pontuacao_obtida or 0) > 0
        and (
            previous is None
            or previous.get("status") != "concluido"
            or float(previous.get("pontuacao_obtida") or 0) < float(payload.pontuacao_obtida or 0)
        )
    )
    if should_log_score:
        evento_repo = EventoRepository(session)
        await evento_repo.log(
            aluno_id=aluno_id,
            tipo=f"topico_personalizado_{payload.item_kind}",
            referencia=str(payload.topico_id),
            valor=float(payload.pontuacao_obtida or 0),
        )
        await session.commit()

    return _to_progresso_response(saved)


@router.get(
    "/perfis/{classe_id}/{topico_id}",
    response_model=PersonalizacaoPorPerfilResponse,
)
async def listar_personalizacoes_por_perfil(
    classe_id: int,
    topico_id: int,
    user: UserContext = Depends(require_professor),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoPorPerfilResponse:
    """Visao docente: personalizacao de um (classe x topico) lado a lado pelos 7 perfis BrainHex.

    Para cada perfil retorna o plano (formato_prioritario, formatos, tom/estilo), os
    design_tokens (preview da paleta) e os materiais da personalizacao mais recente daquele
    perfil, alem da contagem de alunos da turma cujo perfil dominante e o perfil em questao.
    """
    access_repo = AccessRepository(session)
    owns_class = await access_repo.professor_owns_classe(
        user.professor_id or user.user_id, classe_id
    )
    if not owns_class:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor sem permissao para esta classe.",
        )

    personalizacao_repo = ConteudoPersonalizadoRepository(session)
    classe_repo = ConteudoClasseRepository(session)

    alunos = await classe_repo.listar_alunos_classe_com_perfil_dominante(classe_id)
    contagem_por_perfil: dict[str, int] = {}
    for aluno in alunos:
        perfil_key = personalizacao_repo._normalize_profile_key(aluno.get("perfil_dominante"))
        contagem_por_perfil[perfil_key] = contagem_por_perfil.get(perfil_key, 0) + 1

    perfis: list[PersonalizacaoPerfilItem] = []
    total_com_material = 0
    for perfil in _BRAINHEX_PROFILES:
        record = await personalizacao_repo.buscar_mais_recente_por_perfil(
            classe_id=classe_id,
            topico_id=topico_id,
            brainhex_profile_key=perfil,
        )
        personalizacao_response = _to_response(record) if record else None
        if personalizacao_response is not None:
            total_com_material += 1

        design_tokens = (
            personalizacao_response.design_tokens
            if personalizacao_response is not None
            else _build_design_tokens(perfil)
        )

        perfis.append(
            PersonalizacaoPerfilItem(
                perfil=perfil,
                perfil_label=_PROFILE_LABEL_MAP.get(perfil, perfil.capitalize()),
                cor=_PROFILE_COLOR_MAP.get(perfil, _PROFILE_COLOR_MAP["mastermind"]),
                design_tokens=design_tokens,
                tem_personalizacao=personalizacao_response is not None,
                personalizacao=personalizacao_response,
                plano=personalizacao_response.plano if personalizacao_response else None,
                formato_prioritario=(
                    personalizacao_response.formato_prioritario if personalizacao_response else None
                ),
                formatos_gerados=(
                    personalizacao_response.formatos_gerados if personalizacao_response else []
                ),
                materiais=personalizacao_response.materiais if personalizacao_response else None,
                total_alunos=contagem_por_perfil.get(perfil, 0),
                gerado_em=personalizacao_response.gerado_em if personalizacao_response else None,
            )
        )

    return PersonalizacaoPorPerfilResponse(
        classe_id=classe_id,
        topico_id=topico_id,
        total_perfis_com_material=total_com_material,
        perfis=perfis,
    )


@router.get("/contexto/{aluno_id}", response_model=PersonalizacaoContextoDocenteResponse)
async def obter_contexto_personalizacao_docente(
    aluno_id: str,
    classe_id: int = Query(...),
    topico_id: int | None = Query(default=None),
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoContextoDocenteResponse:
    if not user.is_professor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas professores podem consultar este contexto.",
        )
    if not user.professor_liberado:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor sem liberacao de acesso.",
        )

    await ensure_professor_access(aluno_id, user, session)

    context_repo = ContextRepository(session)
    personalizacao_repo = ConteudoPersonalizadoRepository(session)
    progress_repo = PersonalizacaoProgressoRepository(session)

    contexto_aluno = await context_repo.fetch_aluno_context(aluno_id, classe_id)
    records = await personalizacao_repo.buscar_por_aluno(
        aluno_id,
        topico_id=topico_id,
        limit=50,
    )
    progresso = await progress_repo.listar_por_aluno(
        aluno_id=aluno_id,
        classe_id=classe_id,
        topico_id=topico_id,
        limit=400,
    )

    return PersonalizacaoContextoDocenteResponse(
        aluno_id=aluno_id,
        classe_id=classe_id,
        topico_id=topico_id,
        contexto_aluno=contexto_aluno,
        personalizacoes=[_to_response(record) for record in records],
        progresso_itens=[_to_progresso_response(item) for item in progresso],
    )


@router.post("/jobs/enrollment", response_model=PersonalizacaoJobDetailResponse, status_code=status.HTTP_201_CREATED)
async def criar_job_enrollment(
    payload: PersonalizacaoJobPayload,
    user: UserContext = Depends(require_professor),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoJobDetailResponse:
    access_repo = AccessRepository(session)
    owns_class = await access_repo.professor_owns_classe(user.professor_id or user.user_id, payload.classe_id)
    if not owns_class:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor sem permissao para esta classe.",
        )
    if not payload.aluno_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="aluno_id e obrigatorio para enrollment.",
        )
    detail = await enqueue_personalizacao_job(
        session=session,
        kind=JOB_KIND_ENROLLMENT,
        classe_id=payload.classe_id,
        aluno_id=payload.aluno_id,
        trigger_source=payload.trigger_source,
        topico_ids=payload.topico_ids,
        conteudo_ids=payload.conteudo_ids,
        reason=payload.reason,
    )
    return PersonalizacaoJobDetailResponse(
        **_to_job_response(detail["job"]).model_dump(),
        targets=[_to_job_target_response(item) for item in detail["targets"]],
    )


@router.post("/jobs/class-delta", response_model=PersonalizacaoJobDetailResponse, status_code=status.HTTP_201_CREATED)
async def criar_job_class_delta(
    payload: PersonalizacaoJobPayload,
    user: UserContext = Depends(require_professor),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoJobDetailResponse:
    access_repo = AccessRepository(session)
    owns_class = await access_repo.professor_owns_classe(user.professor_id or user.user_id, payload.classe_id)
    if not owns_class:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor sem permissao para esta classe.",
        )
    detail = await enqueue_personalizacao_job(
        session=session,
        kind=JOB_KIND_CLASS_DELTA,
        classe_id=payload.classe_id,
        trigger_source=payload.trigger_source,
        topico_ids=payload.topico_ids,
        conteudo_ids=payload.conteudo_ids,
        reason=payload.reason,
    )
    return PersonalizacaoJobDetailResponse(
        **_to_job_response(detail["job"]).model_dump(),
        targets=[_to_job_target_response(item) for item in detail["targets"]],
    )


@router.post("/jobs/class-theme", response_model=PersonalizacaoJobDetailResponse, status_code=status.HTTP_201_CREATED)
async def criar_job_class_theme(
    payload: PersonalizacaoJobPayload,
    user: UserContext = Depends(require_professor),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoJobDetailResponse:
    access_repo = AccessRepository(session)
    owns_class = await access_repo.professor_owns_classe(user.professor_id or user.user_id, payload.classe_id)
    if not owns_class:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor sem permissao para esta classe.",
        )
    detail = await enqueue_personalizacao_job(
        session=session,
        kind=JOB_KIND_CLASS_THEME,
        classe_id=payload.classe_id,
        trigger_source=payload.trigger_source,
        reason=payload.reason or "class_theme_manual_refresh",
        payload={"topico_ids_hint": payload.topico_ids},
    )
    return PersonalizacaoJobDetailResponse(
        **_to_job_response(detail["job"]).model_dump(),
        targets=[_to_job_target_response(item) for item in detail["targets"]],
    )


@router.post("/jobs/student-cleanup", response_model=PersonalizacaoJobDetailResponse, status_code=status.HTTP_201_CREATED)
async def criar_job_student_cleanup(
    payload: PersonalizacaoJobPayload,
    user: UserContext = Depends(require_professor),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoJobDetailResponse:
    access_repo = AccessRepository(session)
    owns_class = await access_repo.professor_owns_classe(user.professor_id or user.user_id, payload.classe_id)
    if not owns_class:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor sem permissao para esta classe.",
        )
    if not payload.aluno_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="aluno_id e obrigatorio para cleanup.",
        )
    detail = await enqueue_personalizacao_job(
        session=session,
        kind=JOB_KIND_CLEANUP,
        classe_id=payload.classe_id,
        aluno_id=payload.aluno_id,
        trigger_source=payload.trigger_source,
        topico_ids=payload.topico_ids,
        conteudo_ids=payload.conteudo_ids,
        reason=payload.reason,
    )
    return PersonalizacaoJobDetailResponse(
        **_to_job_response(detail["job"]).model_dump(),
        targets=[_to_job_target_response(item) for item in detail["targets"]],
    )


@router.post("/jobs/full-sync", response_model=PersonalizacaoJobDetailResponse, status_code=status.HTTP_201_CREATED)
async def criar_job_full_sync(
    payload: PersonalizacaoJobPayload,
    user: UserContext = Depends(require_professor),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoJobDetailResponse:
    access_repo = AccessRepository(session)
    owns_class = await access_repo.professor_owns_classe(user.professor_id or user.user_id, payload.classe_id)
    if not owns_class:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor sem permissao para esta classe.",
        )
    detail = await enqueue_personalizacao_job(
        session=session,
        kind=JOB_KIND_FULL_SYNC,
        classe_id=payload.classe_id,
        trigger_source=payload.trigger_source,
        topico_ids=payload.topico_ids,
        conteudo_ids=payload.conteudo_ids,
        reason=payload.reason,
    )
    return PersonalizacaoJobDetailResponse(
        **_to_job_response(detail["job"]).model_dump(),
        targets=[_to_job_target_response(item) for item in detail["targets"]],
    )


@router.get("/jobs", response_model=PersonalizacaoJobListResponse)
async def listar_jobs_personalizacao(
    classe_id: int | None = Query(default=None),
    aluno_id: str | None = Query(default=None),
    status_filter: list[str] = Query(default=[]),
    limit: int = Query(default=50, ge=1, le=100),
    user: UserContext = Depends(require_professor),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoJobListResponse:
    if classe_id is not None:
        access_repo = AccessRepository(session)
        owns_class = await access_repo.professor_owns_classe(user.professor_id or user.user_id, classe_id)
        if not owns_class:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Professor sem permissao para esta classe.",
            )
    repo = PersonalizacaoJobsRepository(session)
    jobs = await repo.list_jobs(
        classe_id=classe_id,
        aluno_id=aluno_id,
        statuses=status_filter,
        limit=limit,
    )
    return PersonalizacaoJobListResponse(
        total=len(jobs),
        itens=[_to_job_response(item) for item in jobs],
    )


@router.get("/jobs/{job_id}", response_model=PersonalizacaoJobDetailResponse)
async def obter_job_personalizacao(
    job_id: str,
    user: UserContext = Depends(require_professor),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoJobDetailResponse:
    detail = await get_job_detail(session=session, job_id=job_id)
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job nao encontrado.",
        )
    access_repo = AccessRepository(session)
    owns_class = await access_repo.professor_owns_classe(
        user.professor_id or user.user_id,
        int(detail["job"]["classe_id"]),
    )
    if not owns_class:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor sem permissao para esta classe.",
        )
    return PersonalizacaoJobDetailResponse(
        **_to_job_response(detail["job"]).model_dump(),
        targets=[_to_job_target_response(item) for item in detail["targets"]],
    )


@router.get("/{personalizacao_id}/media-status", response_model=PersonalizacaoMediaStatusResponse)
async def obter_personalizacao_media_status(
    personalizacao_id: int,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoMediaStatusResponse:
    personalizacao_repo = ConteudoPersonalizadoRepository(session)
    record = await personalizacao_repo.buscar_por_id(personalizacao_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Personalizacao nao encontrada.",
        )

    aluno_id = str(record.get("aluno_id") or "")
    if user.is_aluno and (user.aluno_id or user.user_id) == aluno_id:
        pass
    elif user.is_professor:
        if not user.professor_liberado:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Professor sem liberacao de acesso.",
            )
        await ensure_professor_access(aluno_id, user, session)
    elif user.is_aluno:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Aluno sem acesso a personalizacoes de outro usuario.",
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Perfil sem acesso a personalizacoes.",
        )

    jobs_repo = PersonalizacaoJobsRepository(session)
    latest_job = await jobs_repo.get_latest_media_render_job(personalizacao_id=personalizacao_id)
    materiais_repo = MateriaisRepository(session)
    materiais_rows = await materiais_repo.listar_por_personalizacao(personalizacao_id=personalizacao_id)
    materiais_status: list[PersonalizacaoMediaItemStatusResponse] = []
    seen_tipos: set[str] = set()
    for row in materiais_rows:
        tipo = str(row.get("tipo") or "").strip()
        if tipo not in _MEDIA_TIPOS or tipo in seen_tipos:
            continue
        seen_tipos.add(tipo)
        metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        arquivo_url, storage_path, metadata = _resolve_public_asset_fields(
            arquivo_url=row.get("arquivo_url"),
            storage_path=row.get("storage_path"),
            metadata=metadata,
            fallback_bucket=BUCKET,
        )
        status_value = _normalize_media_status(
            {
                "arquivo_url": arquivo_url,
                "metadata": metadata,
            }
        )
        materiais_status.append(
            PersonalizacaoMediaItemStatusResponse(
                id=int(row["id"]) if row.get("id") is not None else None,
                tipo=tipo,
                status=status_value,
                arquivo_url=arquivo_url,
                storage_path=storage_path,
                error=str((metadata or {}).get("error") or "").strip() or None,
                metadata=metadata or {},
            )
        )

    if not materiais_status:
        materiais_record = record.get("materiais") if isinstance(record.get("materiais"), dict) else {}
        for tipo in _MEDIA_TIPOS:
            material = materiais_record.get(tipo)
            if not isinstance(material, dict):
                continue
            metadata = material.get("metadata") if isinstance(material.get("metadata"), dict) else {}
            arquivo_url, storage_path, metadata = _resolve_public_asset_fields(
                arquivo_url=material.get("arquivo_url"),
                storage_path=material.get("storage_path"),
                metadata=metadata,
                fallback_bucket=BUCKET,
            )
            status_value = _normalize_media_status(
                {
                    "arquivo_url": arquivo_url,
                    "metadata": metadata,
                }
            )
            materiais_status.append(
                PersonalizacaoMediaItemStatusResponse(
                    id=None,
                    tipo=tipo,
                    status=status_value,
                    arquivo_url=arquivo_url,
                    storage_path=storage_path,
                    error=str((metadata or {}).get("error") or "").strip() or None,
                    metadata=metadata or {},
                )
            )

    order_map = {tipo: idx for idx, tipo in enumerate(_MEDIA_TIPOS)}
    materiais_status.sort(key=lambda item: order_map.get(item.tipo, 99))
    overall_status = _aggregate_media_status([item.status for item in materiais_status])
    if (
        overall_status == "ready"
        and str(record.get("status") or "").strip().lower() == "processando_midias"
        and materiais_status
    ):
        overall_status = "pending"

    return PersonalizacaoMediaStatusResponse(
        personalizacao_id=personalizacao_id,
        status=overall_status,
        job_id=str(latest_job["id"]) if latest_job and latest_job.get("id") is not None else None,
        materiais=materiais_status,
    )


@router.get("/{aluno_id}", response_model=PersonalizacaoListResponse)
async def listar_personalizacoes(
    aluno_id: str,
    conteudo_id: int | None = Query(default=None),
    topico_id: int | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoListResponse:
    if user.is_aluno and (user.aluno_id or user.user_id) == aluno_id:
        pass
    elif user.is_professor:
        if not user.professor_liberado:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Professor sem liberacao de acesso.",
            )
        await ensure_professor_access(aluno_id, user, session)
    elif user.is_aluno:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Aluno sem acesso a personalizacoes de outro usuario.",
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Perfil sem acesso a personalizacoes.",
        )

    repo = ConteudoPersonalizadoRepository(session)
    records = await repo.buscar_por_aluno(
        aluno_id,
        conteudo_id=conteudo_id,
        topico_id=topico_id,
        limit=limit,
    )
    return PersonalizacaoListResponse(
        aluno_id=aluno_id,
        total=len(records),
        itens=[_to_response(r) for r in records],
    )
