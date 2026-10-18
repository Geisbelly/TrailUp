"""Escriba: conversa do professor com a IA sobre as turmas dele.

É geração de texto por modelo de linguagem, então mora na API. Não grava
nada: o histórico da conversa fica no navegador e chega aqui a cada pergunta.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session, require_professor
from app.schemas.escriba import PerguntaEscriba, RespostaEscriba
from app.services.auth import UserContext
from app.services.escriba import EscribaIndisponivel, EscribaService, TurmaNaoPermitida
from app.services.llm import JsonLLMService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/escriba", tags=["escriba"])


@router.post("/perguntar", response_model=RespostaEscriba)
async def perguntar_ao_escriba(
    pedido: PerguntaEscriba,
    request: Request,
    user: UserContext = Depends(require_professor),
    session: AsyncSession = Depends(get_session),
) -> RespostaEscriba:
    service = EscribaService(session, JsonLLMService(request.app.state.settings))
    try:
        return await service.perguntar(user.professor_id or user.user_id, pedido)
    except TurmaNaoPermitida as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="O Escriba só lê as turmas do professor autenticado.",
        ) from exc
    except EscribaIndisponivel as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "escriba_indisponivel", "message": "O Escriba não conseguiu responder agora. Tente de novo em instantes."},
        ) from exc
