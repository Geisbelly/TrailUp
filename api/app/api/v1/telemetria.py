import logging
from typing import Any

from asyncpg.exceptions import QueryCanceledError
from fastapi import APIRouter, Depends, Request
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session, require_aluno
from app.repositories.evento import EventoRepository
from app.repositories.telemetria import TelemetriaRepository
from app.schemas.common import Evento
from app.schemas.telemetria import (
    TelemetriaAnalysisResponse,
    TelemetriaLotePayload,
    TelemetriaLoteResponse,
)
from app.services import modo_restrito
from app.services.analysis_runner import run_analysis
from app.services.auth import UserContext
from app.services.telemetria_eventos_legados import normalizar_eventos_legados

router = APIRouter(prefix="/telemetria", tags=["telemetria"])
logger = logging.getLogger(__name__)

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


FUNCAO_INEXISTENTE = "42883"  # undefined_function


def _fila_ausente(exc: BaseException) -> bool:
    """Só o banco sem a 20261029_09: `fn_telemetria_analise_falhou` não existe (SQLSTATE 42883). O
    adaptador asyncpg do SQLAlchemy copia o `sqlstate` do erro original para `orig.sqlstate`/`pgcode`."""
    if not isinstance(exc, DBAPIError):
        return False
    orig = getattr(exc, "orig", None)
    codigo = getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)
    return codigo == FUNCAO_INEXISTENTE


async def _deixa_para_a_fila(
    repo: TelemetriaRepository,
    session: AsyncSession,
    batch_id: str,
    erro: str,
    analysis: TelemetriaAnalysisResponse,
    trava_seg: int,
) -> None:
    try:
        # respeitar_trava: se um worker ja reivindicou o lote e o analisa, a falha
        # do pedido nao solta a trava dele.
        await repo.registrar_falha_analise(batch_id=batch_id, erro=erro, respeitar_trava=True, trava_seg=trava_seg)
        await session.commit()
    except Exception as exc:
        await session.rollback()
        if not _fila_ausente(exc):
            # Conexao, timeout, qualquer outra coisa: o lote fica pendente, sem
            # `analysis_error` (que o tiraria da fila). O item continua la, com a
            # folga da P2, e o worker o pega.
            logger.warning("telemetria.falha_nao_registrada: batch_id=%s erro=%s", batch_id, type(exc).__name__)
            return
        # Banco sem a fila (migration ainda nao aplicada): grava o erro no lote,
        # como antes dela, em vez de derrubar um pedido cujo lote ja esta salvo.
        logger.warning("telemetria.fila_ausente: batch_id=%s", batch_id)
        await repo.update_lote_analysis(
            batch_id=batch_id,
            analysis_ciclo_id=None,
            analysis_error=analysis.erros[0] if analysis.erros else None,
        )
        await session.commit()


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
    normalized_events = normalizar_eventos_legados(payload)
    logger.info(
        "telemetria.input=%s",
        _summarize_telemetria_payload(payload, normalized_events),
    )
    # Modo restrito (#195): sem data de nascimento, ou menor sem o aceite do
    # responsavel, nada de telemetria de comportamento, frame ou inferencia.
    # Responde 200 e `persisted=False` de proposito: um 4xx faria o mobile cair
    # no `persistTelemetryBatchDirect` (as policies restritivas da 20261024_02
    # barram tambem esse caminho, mas nao ha por que provoca-lo).
    permitidas = await modo_restrito.finalidades_permitidas(session, aluno_id)
    if not permitidas["telemetria"]:
        logger.info("telemetria.modo_restrito: aluno_id=%s lote descartado", aluno_id)
        return TelemetriaLoteResponse(
            batch_id="",
            sessao_id=payload.sessao_id,
            persisted=False,
            normalized_events=[],
            analysis=TelemetriaAnalysisResponse(erros=[modo_restrito.CODIGO]),
        )

    persisted_payload = _sanitize_lote_payload(payload)
    frames_b64 = [
        frame.frame_b64
        for frame in payload.camera.frames
        if frame.frame_b64
    ]
    if not frames_b64 and payload.camera.frame_b64:
        frames_b64 = [payload.camera.frame_b64]
    # Telemetria liberada nao libera camera: o responsavel marca uma a uma.
    camera_permitida = permitidas["camera"] and permitidas["emocional"]
    if not camera_permitida:
        frames_b64 = []

    try:
        await repo.upsert_sessao(
            sessao_id=payload.sessao_id,
            aluno_id=aluno_id,
            classe_id=payload.classe_id,
            topico_inicial_id=payload.topico_id,
            camera_opt_in=bool(payload.camera.enabled) and camera_permitida,
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
        frame_sent=bool(payload.camera.enabled and camera_permitida and frames_b64),
        payload=persisted_payload,
    )

    # O fallback direto pode ter salvo o lote e falhado antes dos seus itens.
    # Repare os filhos idempotentes antes de confirmar um reenvio como salvo.
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

    if not created:
        return TelemetriaLoteResponse(
            batch_id=str(lote["id"]),
            sessao_id=payload.sessao_id,
            persisted=True,
            normalized_events=[evento.tipo for evento in normalized_events],
            analysis=TelemetriaAnalysisResponse(ciclo_id=lote.get("analysis_ciclo_id")),
        )

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
    if not permitidas["emocional"]:
        # Sem a finalidade `emocional`, o lote fica guardado mas o pipeline de
        # inferencia (emocao + personalizacao adaptativa) nao roda.
        analysis = TelemetriaAnalysisResponse(erros=[modo_restrito.CODIGO])
        await repo.update_lote_analysis(
            batch_id=lote["id"],
            analysis_ciclo_id=None,
            analysis_error=modo_restrito.CODIGO,
        )
        await session.commit()
        return TelemetriaLoteResponse(
            batch_id=str(lote["id"]),
            sessao_id=payload.sessao_id,
            persisted=True,
            normalized_events=[evento.tipo for evento in normalized_events],
            analysis=analysis,
        )
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
            # `persisted_payload`, nao `payload.model_dump()`: o sanitizado, sem
            # os `frame_b64`. Este payload e gravado inteiro em
            # `ia_decision_logs.input_summary` (analysis_runner), e com o bruto
            # iam para la ate 30 fotos do rosto do aluno por lote -- exatamente
            # o que `_sanitize_lote_payload` existe para evitar em
            # `telemetria_lotes`, e o que a mudanca para o R2 (c7fd436) buscava
            # aliviar. Os frames continuam chegando ao pipeline por
            # `frames_b64`, que e o parametro feito para isso: nenhum no le a
            # camera pelo telemetry_payload.
            telemetry_payload=persisted_payload,
            batch_id=str(lote["id"]),
            sessao_id=payload.sessao_id,
        )
        analysis = _analysis_from_result(analysis_result)
        erro_para_a_fila = analysis.erros[0] if analysis.erros else "analise sem ciclo"
    except Exception as exc:
        await session.rollback()
        analysis = TelemetriaAnalysisResponse(erros=[str(exc)])
        erro_para_a_fila = f"{type(exc).__name__}: {exc}"
        logger.warning(
            "telemetria.analise_falhou: batch_id=%s aluno_id=%s erro=%s",
            lote["id"],
            aluno_id,
            exc,
        )

    if analysis.ciclo_id:
        # Guardar o erro junto do lote e o que torna a falha investigavel depois
        # do fato (os 290 lotes de 20-27/09 ficaram sem ciclo e sem erro).
        await repo.update_lote_analysis(
            batch_id=lote["id"],
            analysis_ciclo_id=analysis.ciclo_id,
            analysis_error=analysis.erros[0] if analysis.erros else None,
        )
        await session.commit()
    else:
        # Sem ciclo, a falha e transitoria (LLM, rede, grafo): `analysis_error`
        # aqui tiraria o lote da fila (20261029_09) e ele nunca mais seria
        # analisado. A fila guarda o erro em `ultimo_erro` e o worker tenta de
        # novo; na quinta falha ela mesma grava `analysis_error = 'fila: ...'`.
        trava_seg = int(request.app.state.settings.telemetria_analise_fila_trava_seconds)
        await _deixa_para_a_fila(repo, session, lote["id"], erro_para_a_fila, analysis, trava_seg)

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
