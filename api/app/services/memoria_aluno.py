from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.aluno_topico_dominio import AlunoTopicoDominioRepository
from app.repositories.mental_state import MentalStateHistoryRepository
from app.schemas.memoria_aluno import DominioTopico, MemoriaAluno, MentalStateRecorrente

logger = logging.getLogger(__name__)

_KINDS_NEGATIVOS = {"frustrated", "anxious", "overwhelmed", "tired"}
_JANELA_RECORRENCIA = 5
_LIMIAR_RECORRENCIA = 3


def _detectar_recorrencia(registros: list[dict[str, Any]]) -> MentalStateRecorrente:
    """Pura, sem I/O. `registros` ja vem ordenado do mais recente pro mais
    antigo (MentalStateHistoryRepository.listar_por_aluno). 3 dos ultimos 5
    registros com o MESMO kind negativo marca recorrencia."""
    janela = registros[:_JANELA_RECORRENCIA]
    contagem: dict[str, int] = {}
    for registro in janela:
        kind = str(registro.get("kind") or "")
        if kind in _KINDS_NEGATIVOS:
            contagem[kind] = contagem.get(kind, 0) + 1

    for kind, ocorrencias in contagem.items():
        if ocorrencias >= _LIMIAR_RECORRENCIA:
            return MentalStateRecorrente(recorrente=True, kind=kind, ocorrencias=ocorrencias)

    return MentalStateRecorrente(recorrente=False, kind=None, ocorrencias=0)
