"""Modo restrito do aluno (#195): o que a API deixa fazer sem consentimento.

A regra mora no banco (`aluno_finalidade_permitida`, migracao `20261024_02`):
sem data de nascimento, ou menor de 18 sem aceite vigente do responsavel, o
aluno fica restrito. Trilha, questoes e progresso seguem; camera, inferencia
emocional, telemetria de comportamento, mentor de IA e pesquisa param.

Aqui so se pergunta ao banco. Falhou a pergunta (banco fora, funcao ainda nao
aplicada), a resposta e **nao** para tudo -- fail-closed: na duvida, nao se
coleta dado de quem pode ser menor.

Os endpoints chamam `modo_restrito.finalidades_permitidas(...)` pelo modulo, de
proposito, para os testes conseguirem trocar a funcao num lugar so.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

FINALIDADES: tuple[str, ...] = ("camera", "telemetria", "emocional", "mentor", "pesquisa")

CODIGO = "modo_restrito"

MENSAGEM_MENTOR = (
    "O mentor de IA está desligado no modo restrito. Para liberar, informe sua data "
    "de nascimento no app (Perfil › Coleta e acessos) e, se você tiver menos de 18 "
    "anos, peça ao seu responsável para autorizar. Trilhas, questões e progresso "
    "continuam funcionando normalmente."
)

MENSAGEM_EMOCOES = (
    "A análise de emoções está desligada no modo restrito: falta a data de nascimento ou a autorização do responsável."
)

_SQL = text(
    "SELECT " + ", ".join(f"public.aluno_finalidade_permitida(CAST(:aluno AS uuid), '{f}') AS {f}" for f in FINALIDADES)
)

NADA_PERMITIDO: dict[str, bool] = {f: False for f in FINALIDADES}


async def finalidades_permitidas(
    session: AsyncSession, aluno_id: Any, *, levantar: bool = False
) -> dict[str, bool]:
    """Uma ida ao banco, as cinco respostas. Qualquer falha -> tudo False.

    `levantar=True` (o worker da fila de análise) propaga a falha em vez de responder "nada permitido":
    sem isso, um banco fora do ar por um instante virava `modo_restrito` definitivo no lote.
    """
    if not aluno_id:
        return dict(NADA_PERMITIDO)
    try:
        result = await session.execute(_SQL, {"aluno": str(aluno_id)})
        row = result.mappings().first() if result is not None else None
    except Exception as exc:  # banco fora, funcao ausente, timeout
        try:
            await session.rollback()
        except Exception:  # pragma: no cover - rollback de sessao ja quebrada
            pass
        logger.warning("modo_restrito.consulta_falhou: aluno_id=%s erro=%s", aluno_id, type(exc).__name__)
        if levantar:
            raise
        return dict(NADA_PERMITIDO)
    if not row:
        return dict(NADA_PERMITIDO)
    return {f: row.get(f) is True for f in FINALIDADES}


def detalhe(mensagem: str) -> dict[str, str]:
    return {"codigo": CODIGO, "mensagem": mensagem}
