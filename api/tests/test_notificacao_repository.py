"""A API grava o horário que o modelo sugeriu (#66): antes ele só entrava no hash."""

from datetime import UTC, datetime

import pytest

from app.repositories.notificacao import NotificacaoRepository
from app.schemas.notificacao import NotificacaoPayload


class _Resultado:
    def scalar(self):
        return 7


class _Sessao:
    def __init__(self) -> None:
        self.chamadas: list[tuple[str, dict]] = []

    async def execute(self, sql, params):
        self.chamadas.append((str(sql), params))
        return _Resultado()


@pytest.mark.asyncio
async def test_enfileirar_grava_o_horario_sugerido():
    sessao = _Sessao()
    horario = datetime(2026, 11, 2, 22, 30, tzinfo=UTC)

    novo = await NotificacaoRepository(sessao).enfileirar(
        "aluno-1",
        NotificacaoPayload(tipo="lembrete", titulo="t", corpo="c", horario=horario, prioridade=1),
    )

    sql, params = sessao.chamadas[0]
    assert novo == 7
    assert "horario_sugerido" in sql and ":horario_sugerido" in sql
    assert params["horario_sugerido"] == horario
    assert params["resposta_hash"] == f"aluno-1:lembrete:{horario.isoformat()}"
