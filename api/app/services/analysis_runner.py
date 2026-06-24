import json
import logging

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.evento import EventoRepository
from app.repositories.ia_decision_logs import IADecisionLogRepository
from app.schemas.api import AnalisarPayload, AnalisarResponse
from app.schemas.common import Evento
from app.services.linear_analysis_pipeline import build_linear_analysis_orchestrator
from app.services.state_builder import build_initial_state

logger = logging.getLogger(__name__)


def build_analysis_graph_config(
    request: Request,
    *,
    aluno_id: str,
    checkpoint_ns: str,
    cycle_id: str,
    classe_id: int,
) -> dict:
    return {
        "configurable": {
            "thread_id": aluno_id,
            "checkpoint_ns": checkpoint_ns,
        },
        "tags": ["trailup", checkpoint_ns],
        "metadata": {
            "aluno_id": aluno_id,
            "classe_id": classe_id,
            "ciclo_id": cycle_id,
        },
    }


def build_analysis_response(result: dict) -> AnalisarResponse:
    return AnalisarResponse(
        ciclo_id=result.get("ciclo_id", ""),
        ui_config=result.get("ui_config"),
        conteudo_adaptado=result.get("conteudo_adaptado"),
        materiais_gerados=result.get("materiais_gerados"),
        textos_gerados=result.get("textos_gerados", []),
        notificacao_payload=result.get("notificacao_payload"),
        trilha_config=result.get("trilha_config"),
        emocao_atual=result.get("emocao_atual"),
        acoes_aplicadas=result.get("acoes_aplicadas", []),
        erros=result.get("erros", []),
    )


async def run_analysis(
    *,
    request: Request,
    session: AsyncSession,
    aluno_id: str,
    classe_id: int,
    topico_id: int | None,
    atividade_id: int | None,
    frame_b64: str | None,
    frames_b64: list[str] | None = None,
    eventos_novos: list[Evento],
    modo: str | None,
    telemetry_payload: dict | None = None,
    batch_id: str | None = None,
    sessao_id: str | None = None,
) -> AnalisarResponse:
    resolved_frames = [frame for frame in (frames_b64 or []) if frame]
    resolved_frame = frame_b64 or (resolved_frames[0] if resolved_frames else None)
    logger.info(
        "analysis_runner.input=%s",
        json.dumps(
            {
                "aluno_id": aluno_id,
                "classe_id": classe_id,
                "topico_id": topico_id,
                "atividade_id": atividade_id,
                "modo": modo,
                "frames_count": len(resolved_frames),
                "eventos_count": len(eventos_novos),
                "telemetry_keys": sorted((telemetry_payload or {}).keys())[:20],
            },
            ensure_ascii=False,
            default=str,
        ),
    )
    payload = AnalisarPayload(
        classe_id=classe_id,
        modo=modo,
        frame_b64=resolved_frame,
        eventos_novos=eventos_novos,
        topico_id=topico_id,
        atividade_id=atividade_id,
    )
    state = await build_initial_state(session, aluno_id, payload)

    await EventoRepository(session).log(
        aluno_id=aluno_id,
        tipo="ciclo_iniciado",
        referencia=state["ciclo_id"],
        valor=float(classe_id),
    )
    await session.commit()

    orchestrator = build_linear_analysis_orchestrator(request.app.state.settings)
    result = await orchestrator.run(
        request=request,
        state=state,
        config=build_analysis_graph_config(
            request,
            aluno_id=aluno_id,
            checkpoint_ns=request.app.state.settings.default_checkpoint_ns,
            cycle_id=state["ciclo_id"],
            classe_id=classe_id,
        ),
        telemetry_payload=telemetry_payload,
        frames_b64=resolved_frames,
        eventos_novos=eventos_novos,
    )
    response = build_analysis_response(result)
    try:
        await IADecisionLogRepository(session).log(
            aluno_id=aluno_id,
            classe_id=classe_id,
            topico_id=topico_id,
            atividade_id=atividade_id,
            ciclo_id=response.ciclo_id,
            batch_id=batch_id,
            sessao_id=sessao_id,
            source="telemetria",
            stage="analise_adaptativa",
            trigger_event=modo,
            input_summary={
                "eventos_novos": [evento.model_dump(mode="json") for evento in eventos_novos],
                "telemetria": telemetry_payload or {},
            },
            raw_response=json.dumps(result, ensure_ascii=False, default=str),
            parsed_response=result if isinstance(result, dict) else {},
            decision_summary="Decisão adaptativa gerada a partir de telemetria do app.",
            actions=list(response.acoes_aplicadas or []),
        )
    except Exception as exc:  # pragma: no cover
        await session.rollback()
        logger.warning("Falha ao persistir ia_decision_logs da telemetria: %s", exc)
    logger.info(
        "analysis_runner.output=%s",
        json.dumps(
            {
                "aluno_id": aluno_id,
                "classe_id": classe_id,
                "ciclo_id": response.ciclo_id,
                "acoes_count": len(response.acoes_aplicadas or []),
                "erros_count": len(response.erros or []),
                "ui_keys": sorted((response.ui_config or {}).keys()) if isinstance(response.ui_config, dict) else [],
                "emocao_keys": sorted((response.emocao_atual or {}).keys()) if isinstance(response.emocao_atual, dict) else [],
            },
            ensure_ascii=False,
            default=str,
        ),
    )
    return response
