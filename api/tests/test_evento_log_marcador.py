"""`EventoRepository.log_marcador`: falha num gatilho de `eventos_aluno` não derruba a análise."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.repositories.evento import EventoRepository


def _sessao(execute: AsyncMock) -> MagicMock:
    sessao = MagicMock()
    sessao.execute = execute
    sessao.commit = AsyncMock()
    sessao.rollback = AsyncMock()
    return sessao


@pytest.mark.asyncio
async def test_grava_e_confirma() -> None:
    sessao = _sessao(AsyncMock())
    assert await EventoRepository(sessao).log_marcador("aluno-1", "ciclo_iniciado", "ciclo-1", 3.0) is True
    sessao.commit.assert_awaited_once()
    sessao.rollback.assert_not_awaited()


@pytest.mark.asyncio
async def test_violacao_no_gatilho_vira_aviso_e_desfaz() -> None:
    """O caso de 20/11: o prêmio de conquista repetido estourava o índice único dentro do gatilho."""
    erro = IntegrityError("INSERT INTO eventos_aluno", {}, Exception("eventos_aluno_creditado_unico"))
    sessao = _sessao(AsyncMock(side_effect=erro))
    assert await EventoRepository(sessao).log_marcador("aluno-1", "ciclo_iniciado", "ciclo-1", 3.0) is False
    sessao.rollback.assert_awaited_once()
    sessao.commit.assert_not_awaited()
