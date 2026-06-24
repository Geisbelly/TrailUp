import logging
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import DBAPIError
from asyncpg.exceptions import QueryCanceledError

from app.api.deps import get_session, require_aluno
from app.repositories.evento import EventoRepository
from app.repositories.telemetria import TelemetriaRepository
from app.schemas.common import Evento
from app.schemas.telemetria import (
    TelemetriaAnalysisResponse,
    TelemetriaLotePayload,
    TelemetriaLoteResponse,
    TelemetriaSignalPayload,
)
from app.services.analysis_runner import run_analysis
from app.services.auth import UserContext


router = APIRouter(prefix="/telemetria", tags=["telemetria"])
logger = logging.getLogger(__name__)

SIGNAL_TO_LEGACY_EVENT = {
    "topic_open": "topico_aberto",
    "content_open": "conteudo_aberto",
    "content_complete": "conteudo_concluido",
    "activity_start": "atividade_iniciada",
    "activity_correct": "atividade_acertada",
    "activity_wrong": "atividade_errada",
    "wrong_streak": "erro_recorrente",
    "activity_complete": "atividade_concluida",
}

TERMINAL_FLUSH_REASONS = {"screen_blur", "app_background", "session_end"}

_ANALYSIS_INTERNAL_ACTION_PREFIXES = (
    "analise_emocao:",
    "analise_leitura:",
    "analise_interacao:",
    "analise_desempenho:",
    "analise_atencao:",
    "decisao_adaptativa:",
)


def _sanitize_lote_payload(payload: TelemetriaLotePayload) -> dict[str, Any]:
    sanitized = payload.model_dump(mode="json")
    camera = dict(sanitized.get("camera") or {})
    frames = list(camera.get("frames") or [])
    sanitized_frames: list[dict[str, Any]] = []
    for frame in frames:
        frame_copy = dict(frame)
        frame_copy.pop("frame_b64", None)
        sanitized_frames.append(frame_copy)
    camera.pop("frame_b64", None)
    camera["frames"] = sanitized_frames
    camera["frames_count"] = len(frames)
    sanitized["camera"] = camera
    return sanitized


def _sanitize_reference(reference: str | None) -> str | None:
    if reference is None:
        return None
    normalized = reference.strip()
    if not normalized:
        return None

    numeric_match = normalized.rsplit(":", 1)
    if len(numeric_match) == 2 and numeric_match[1].isdigit():
        return numeric_match[1]
    if normalized.isdigit():
        return normalized
    return None


def _prefixed_reference(prefix: str, value: str | int | None) -> str | None:
    normalized = _sanitize_reference(str(value) if value is not None else None)
    if not normalized:
        return None
    return f"{prefix}:{normalized}"


def _reference_from_signal(signal: TelemetriaSignalPayload) -> str | None:
    if signal.atividade_id is not None:
        return _prefixed_reference("atividade", signal.atividade_id)
    if signal.conteudo_id is not None:
        return _prefixed_reference("conteudo", signal.conteudo_id)
    if signal.topico_id is not None:
        return _prefixed_reference("topico", signal.topico_id)
    if signal.item_key:
        normalized = signal.item_key.strip()
        if ":" in normalized:
            return normalized
        return _sanitize_reference(normalized)
    return None


def _is_activity_signal(signal: TelemetriaSignalPayload) -> bool:
    return bool(signal.item_key and signal.item_key.startswith("activity:")) or signal.atividade_id is not None


def _normalize_eventos_legados(payload: TelemetriaLotePayload) -> list[Evento]:
    eventos: list[Evento] = []
    ordered_signals = sorted(payload.signals, key=lambda signal: signal.timestamp)

    for signal in ordered_signals:
        mapped = SIGNAL_TO_LEGACY_EVENT.get(signal.type)
        if mapped is None:
            continue
        eventos.append(
            Evento(
                tipo=mapped,
                referencia=_reference_from_signal(signal),
            )
        )

    if any(signal.type == "idle_detected" for signal in ordered_signals) or payload.idle_sec >= 60:
        eventos.append(
            Evento(
                tipo="inatividade",
                referencia=(
                    str(payload.topico_id)
                    if payload.topico_id is not None
                    else _sanitize_reference(payload.item_key)
                ),
                valor=float(payload.idle_sec),
            )
        )

    for index, signal in enumerate(ordered_signals):
        if signal.type != "timer_timeout" or not _is_activity_signal(signal):
            continue
        completed_after_timeout = any(
            candidate.type == "activity_complete"
            and (
                (candidate.item_key and signal.item_key and candidate.item_key == signal.item_key)
                or (
                    candidate.atividade_id is not None
                    and signal.atividade_id is not None
                    and candidate.atividade_id == signal.atividade_id
                )
            )
            for candidate in ordered_signals[index + 1 :]
        )
        if not completed_after_timeout:
            eventos.append(
                Evento(
                    tipo="abandono_atividade",
                    referencia=_reference_from_signal(signal),
                )
            )
            break

    return eventos


def _analysis_from_result(result: Any) -> TelemetriaAnalysisResponse:
    if result is None:
        return TelemetriaAnalysisResponse()

    emocao_atual = getattr(result, "emocao_atual", None)
    if hasattr(emocao_atual, "model_dump"):
        emocao_atual = emocao_atual.model_dump(mode="json")
    if isinstance(emocao_atual, dict):
        emocao_atual = {
            key: value
            for key, value in emocao_atual.items()
            if key not in {"origem", "modelo", "provider", "engine", "llm"}
        }

    ui_config = getattr(result, "ui_config", None)
    if hasattr(ui_config, "model_dump"):
        ui_config = ui_config.model_dump(mode="json")
    if isinstance(ui_config, dict):
        ui_config = {
            key: value
            for key, value in ui_config.items()
            if key not in {"origem", "modelo", "provider", "engine", "llm"}
        }

    filtered_actions = [
        action
        for action in list(getattr(result, "acoes_aplicadas", []) or [])
        if not any(str(action).startswith(prefix) for prefix in _ANALYSIS_INTERNAL_ACTION_PREFIXES)
    ]

    return TelemetriaAnalysisResponse(
        ciclo_id=getattr(result, "ciclo_id", None),
        emocao_atual=emocao_atual,
        ui_config=ui_config,
        acoes_aplicadas=filtered_actions,
        erros=list(getattr(result, "erros", []) or []),
    )


def _summarize_telemetria_payload(payload: TelemetriaLotePayload, normalized_events: list[Evento]) -> dict[str, Any]:
    return {
        "sessao_id": payload.sessao_id,
        "classe_id": payload.classe_id,
        "topico_id": payload.topico_id,
        "atividade_id": payload.atividade_id,
        "conteudo_id": payload.conteudo_id,
        "item_key": payload.item_key,
        "flush_reason": payload.flush_reason,
        "study_elapsed_sec": payload.study_elapsed_sec,
        "active_sec": payload.active_sec,
        "idle_sec": payload.idle_sec,
        "touch_count": payload.touch_count,
        "signals_count": len(payload.signals),
        "eventos_app_count": len(payload.eventos_app),
        "frames_count": len(payload.camera.frames),
        "normalized_events": [evento.tipo for evento in normalized_events],
    }


@router.post("/lotes", response_model=TelemetriaLoteResponse)
async def registrar_lote_telemetria(
    payload: TelemetriaLotePayload,
    request: Request,
    user: UserContext = Depends(require_aluno),
    session: AsyncSession = Depends(get_session),
) -> TelemetriaLoteResponse:
    aluno_id = user.aluno_id or user.user_id
    repo = TelemetriaRepository(session)
    normalized_events = _normalize_eventos_legados(payload)
    logger.info(
        "telemetria.input=%s",
        _summarize_telemetria_payload(payload, normalized_events),
    )
    persisted_payload = _sanitize_lote_payload(payload)
    frames_b64 = [
        frame.frame_b64
        for frame in payload.camera.frames
        if frame.frame_b64
    ]
    if not frames_b64 and payload.camera.frame_b64:
        frames_b64 = [payload.camera.frame_b64]

    try:
        await repo.upsert_sessao(
            sessao_id=payload.sessao_id,
            aluno_id=aluno_id,
            classe_id=payload.classe_id,
            topico_inicial_id=payload.topico_id,
            camera_opt_in=bool(payload.camera.enabled),
            started_at=payload.session_started_at,
            ended_at=payload.captured_at if payload.flush_reason in TERMINAL_FLUSH_REASONS else None,
        )
    except DBAPIError as exc:
        if isinstance(getattr(exc, "orig", None), QueryCanceledError):
            logger.warning(
                "telemetria.upsert_sessao timeout: sessao_id=%s aluno_id=%s",
                payload.sessao_id,
                aluno_id,
            )
        else:
            raise

    lote, created = await repo.insert_or_get_lote(
        sessao_id=payload.sessao_id,
        aluno_id=aluno_id,
        classe_id=payload.classe_id,
        topico_id=payload.topico_id,
        atividade_id=payload.atividade_id,
        conteudo_id=payload.conteudo_id,
        screen_name=payload.screen_name,
        route_name=payload.route_name,
        flush_reason=payload.flush_reason,
        captured_at=payload.captured_at,
        study_elapsed_sec=payload.study_elapsed_sec,
        screen_dwell_sec=payload.screen_dwell_sec,
        active_sec=payload.active_sec,
        idle_sec=payload.idle_sec,
        touch_count=payload.touch_count,
        scroll_distance_px=payload.scroll_distance_px,
        max_depth_px=payload.max_depth_px,
        frame_sent=bool(payload.camera.enabled and frames_b64),
        payload=persisted_payload,
    )

    if not created:
        await session.commit()
        return TelemetriaLoteResponse(
            batch_id=str(lote["id"]),
            sessao_id=payload.sessao_id,
            persisted=True,
            normalized_events=[evento.tipo for evento in normalized_events],
            analysis=TelemetriaAnalysisResponse(ciclo_id=lote.get("analysis_ciclo_id")),
        )

    await repo.insert_eventos_app(
        sessao_id=payload.sessao_id,
        aluno_id=aluno_id,
        classe_id=payload.classe_id,
        screen_name=payload.screen_name,
        route_name=payload.route_name,
        eventos=[evento.model_dump(mode="json") for evento in payload.eventos_app],
    )
    await repo.insert_time_metric_entries(
        lote_id=str(lote["id"]),
        sessao_id=payload.sessao_id,
        aluno_id=aluno_id,
        classe_id=payload.classe_id,
        captured_at=payload.captured_at,
        topico_id=payload.topico_id,
        conteudo_id=payload.conteudo_id,
        atividade_id=payload.atividade_id,
        time_metrics=payload.time_metrics.model_dump(mode="json"),
    )
    await session.commit()

    evento_repo = EventoRepository(session)
    for evento in normalized_events:
        try:
            await evento_repo.log(
                aluno_id=aluno_id,
                tipo=evento.tipo,
                referencia=str(evento.referencia) if evento.referencia is not None else None,
                valor=evento.valor,
            )
            await session.commit()
        except Exception:
            await session.rollback()
            logger.warning(
                "Falha ao persistir evento legado de telemetria: aluno_id=%s tipo=%s referencia=%s",
                aluno_id,
                evento.tipo,
                EventoRepository._sanitize_reference(evento.tipo, evento.referencia),
            )

    analysis = TelemetriaAnalysisResponse()
    try:
        analysis_result = await run_analysis(
            request=request,
            session=session,
            aluno_id=aluno_id,
            classe_id=payload.classe_id,
            topico_id=payload.topico_id,
            atividade_id=payload.atividade_id,
            frame_b64=frames_b64[0] if payload.camera.enabled and frames_b64 else None,
            frames_b64=frames_b64,
            eventos_novos=normalized_events,
            modo="telemetria",
            telemetry_payload=payload.model_dump(mode="json"),
            batch_id=str(lote["id"]),
            sessao_id=payload.sessao_id,
        )
        analysis = _analysis_from_result(analysis_result)
    except Exception as exc:  # pragma: no cover
        await session.rollback()
        analysis = TelemetriaAnalysisResponse(erros=[str(exc)])

    await repo.update_lote_analysis(
        batch_id=lote["id"],
        analysis_ciclo_id=analysis.ciclo_id,
    )
    await session.commit()

    logger.info(
        "telemetria.output=%s",
        {
            "batch_id": str(lote["id"]),
            "sessao_id": payload.sessao_id,
            "persisted": True,
            "normalized_events": [evento.tipo for evento in normalized_events],
            "analysis_ciclo_id": analysis.ciclo_id,
            "analysis_actions_count": len(analysis.acoes_aplicadas or []),
            "analysis_errors_count": len(analysis.erros or []),
        },
    )

    return TelemetriaLoteResponse(
        batch_id=str(lote["id"]),
        sessao_id=payload.sessao_id,
        persisted=True,
        normalized_events=[evento.tipo for evento in normalized_events],
        analysis=analysis,
    )
