"""Insights da turma (aba Insights do console do professor).

So a GERACAO passa pela API — e trabalho de modelo de linguagem. Listar,
aceitar e ignorar sao leitura/escrita em `intervencoes`, que o console faz
direto no Supabase (RLS `intervencoes_professor_*`, `20260929_01`).

A geracao roda em segundo plano: o modelo leva dezenas de segundos e a API do
Render pode estar acordando. O console dispara, acompanha pelo status e le o
lote novo na tabela quando ele aparece.
"""

import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session, require_professor
from app.repositories.access import AccessRepository
from app.schemas.insights import InsightsGeracaoResponse
from app.services.auth import UserContext
from app.services.insights_turma import INTERVALO_MINIMO, InsightsIndisponiveis, InsightsTurmaService
from app.services.llm import JsonLLMService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/insights", tags=["insights"])


def _geracoes(app: FastAPI) -> dict[int, dict[str, Any]]:
    """Estado das geracoes deste processo, por classe. Some quando a API
    reinicia — por isso o console trata `ocioso` lendo a tabela."""
    if not hasattr(app.state, "insights_geracoes"):
        app.state.insights_geracoes = {}
    return app.state.insights_geracoes


async def _checar_dono(user: UserContext, classe_id: int, session: AsyncSession) -> None:
    owns = await AccessRepository(session).professor_owns_classe(user.professor_id or user.user_id, classe_id)
    if not owns:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor sem permissao para esta classe.",
        )


async def _rodar_geracao(app: FastAPI, classe_id: int) -> None:
    estado = _geracoes(app)
    try:
        async with app.state.session_factory() as session:
            service = InsightsTurmaService(session, JsonLLMService(app.state.settings))
            resultado, itens = await service.gerar(classe_id)
        estado[classe_id] = {"status": resultado, "itens": itens}
    except Exception:
        logger.exception("Insights: geracao da classe %s quebrou", classe_id)
        estado[classe_id] = {"status": "falhou", "itens": 0}


@router.post(
    "/turma/{classe_id}/gerar",
    response_model=InsightsGeracaoResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def gerar_insights_da_turma(
    classe_id: int,
    request: Request,
    response: Response,
    background: BackgroundTasks,
    user: UserContext = Depends(require_professor),
    session: AsyncSession = Depends(get_session),
) -> InsightsGeracaoResponse:
    await _checar_dono(user, classe_id, session)
    try:
        ultima = await InsightsTurmaService(session, JsonLLMService(request.app.state.settings)).ultima_geracao_em(
            classe_id
        )
    except InsightsIndisponiveis as exc:
        logger.warning("Insights: esquema de intervencoes ausente: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "insights_indisponiveis",
                "message": "Os insights ainda nao estao disponiveis neste banco (migracao pendente).",
            },
        ) from exc
    # Sem await entre a checagem e a marcacao: dois cliques simultaneos nao
    # disparam duas geracoes.
    estado = _geracoes(request.app)
    if estado.get(classe_id, {}).get("status") == "gerando":
        return InsightsGeracaoResponse(status="gerando", ultima_geracao_em=ultima)
    if ultima is not None and datetime.now(UTC) - ultima < INTERVALO_MINIMO:
        response.status_code = status.HTTP_200_OK
        return InsightsGeracaoResponse(status="recente", ultima_geracao_em=ultima)

    estado[classe_id] = {"status": "gerando", "itens": None}
    background.add_task(_rodar_geracao, request.app, classe_id)
    return InsightsGeracaoResponse(status="gerando", ultima_geracao_em=ultima)


@router.get("/turma/{classe_id}/status", response_model=InsightsGeracaoResponse)
async def status_dos_insights_da_turma(
    classe_id: int,
    request: Request,
    user: UserContext = Depends(require_professor),
    session: AsyncSession = Depends(get_session),
) -> InsightsGeracaoResponse:
    await _checar_dono(user, classe_id, session)
    atual = _geracoes(request.app).get(classe_id)
    if atual is None:
        return InsightsGeracaoResponse(status="ocioso")
    return InsightsGeracaoResponse(status=atual["status"], itens=atual["itens"])
