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


async def ler_memoria(session: AsyncSession, *, aluno_id: str, classe_id: int) -> MemoriaAluno:
    """Nunca levanta - falha de leitura (tabela indisponivel, erro de
    conexao pontual) devolve memoria vazia, igual ao principio de 'permitir
    fallback' ja documentado nos guardrails de pipeline."""
    try:
        dominio_rows = await AlunoTopicoDominioRepository(session).buscar_por_classe(
            aluno_id=aluno_id, classe_id=classe_id
        )
        registros_mentais = await MentalStateHistoryRepository(session).listar_por_aluno(
            aluno_id=aluno_id, limit=_JANELA_RECORRENCIA
        )
    except Exception as exc:
        logger.warning("Falha ao ler memoria do aluno %s: %s", aluno_id, exc)
        return MemoriaAluno()

    dominio_por_topico = {
        topico_id: DominioTopico.model_validate(registro)
        for topico_id, registro in dominio_rows.items()
    }
    return MemoriaAluno(
        dominio_por_topico=dominio_por_topico,
        mental_state_recorrente=_detectar_recorrencia(registros_mentais),
    )


async def atualizar_memoria(
    session: AsyncSession,
    *,
    aluno_id: str,
    topico_id: int | None,
    performance_resumo: dict[str, Any] | None,
) -> None:
    """So cuida do dominio por topico (novo). O estado mental ja e gravado
    por MentalStateHistoryRepository.registrar() em analysis_runner.py - nao
    duplica essa escrita. Nunca levanta - mesmo padrao do bloco de
    mental-state ja existente em analysis_runner.py (log + segue)."""
    if topico_id is None or not performance_resumo:
        return
    try:
        await AlunoTopicoDominioRepository(session).upsert(
            aluno_id=aluno_id,
            topico_id=topico_id,
            dominio_estimado=float(performance_resumo.get("dominio_estimado", 0)),
            tendencia=str(performance_resumo.get("tendencia") or "estavel"),
            confianca=float(performance_resumo.get("confianca", 0)),
        )
    except Exception as exc:
        logger.warning(
            "Falha ao persistir aluno_topico_dominio (aluno=%s, topico=%s): %s",
            aluno_id,
            topico_id,
            exc,
        )
