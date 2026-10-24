import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session, require_aluno
from app.repositories.evento import EventoRepository
from app.schemas.api import AnalisarPayload, AnalisarResponse
from app.services import modo_restrito
from app.services.analysis_runner import build_analysis_graph_config, run_analysis
from app.services.auth import UserContext
from app.services.roteamento_ia import decidir_rota, usar_rota
from app.services.state_builder import build_initial_state


async def _exigir_inferencia_permitida(session: AsyncSession, aluno_id) -> dict[str, bool]:
    # Modo restrito (#195): sem `emocional`, nada de inferencia; frame so com `camera`.
    permitidas = await modo_restrito.finalidades_permitidas(session, aluno_id)
    if not permitidas["emocional"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=modo_restrito.detalhe(modo_restrito.MENSAGEM_EMOCOES),
        )
    return permitidas

router = APIRouter(prefix="/emocoes", tags=["emocoes"])


@router.post("/analisar", response_model=AnalisarResponse)
async def analisar(
    payload: AnalisarPayload,
    request: Request,
    user: UserContext = Depends(require_aluno),
    session: AsyncSession = Depends(get_session),
) -> AnalisarResponse:
    permitidas = await _exigir_inferencia_permitida(session, user.aluno_id or user.user_id)
    try:
        return await run_analysis(
            request=request,
            session=session,
            aluno_id=user.aluno_id or user.user_id,
            classe_id=payload.classe_id,
            topico_id=payload.topico_id,
            atividade_id=payload.atividade_id,
            frame_b64=payload.frame_b64 if permitidas["camera"] else None,
            eventos_novos=payload.eventos_novos,
            modo=payload.modo,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/analisar-stream")
async def analisar_stream(
    payload: AnalisarPayload,
    request: Request,
    user: UserContext = Depends(require_aluno),
    session: AsyncSession = Depends(get_session),
):
    permitidas = await _exigir_inferencia_permitida(session, user.aluno_id or user.user_id)
    if not permitidas["camera"]:
        payload = payload.model_copy(update={"frame_b64": None})
    try:
        state = await build_initial_state(session, user.aluno_id or user.user_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    await EventoRepository(session).log(
        aluno_id=user.aluno_id or user.user_id,
        tipo="ciclo_iniciado",
        referencia=state["ciclo_id"],
        valor=float(payload.classe_id),
    )
    await session.commit()

    config = build_analysis_graph_config(
        request,
        aluno_id=user.aluno_id or user.user_id,
        checkpoint_ns=request.app.state.settings.default_checkpoint_ns,
        cycle_id=state["ciclo_id"],
        classe_id=payload.classe_id,
    )

    # #195: rota de IA pela idade do aluno (menor/desconhecido -> so OpenAI).
    rota = await decidir_rota(session, [user.aluno_id or user.user_id])

    async def event_stream():
        with usar_rota(rota):
            async for event in request.app.state.graph_ephemeral.astream(state, config, stream_mode="updates"):
                yield f"data: {json.dumps({'node': list(event.keys())[0], 'cycle_id': state['ciclo_id'], 'data': event}, default=str)}\n\n"
        yield f"data: {json.dumps({'node': 'DONE', 'cycle_id': state['ciclo_id']})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
