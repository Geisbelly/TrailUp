"""Executor do grafo: não grava perfil, e uma escrita que falha não derruba o ciclo (02/11).

Depois do #805 o executor passou a rodar em produção, e a gravação de perfil (`modoresposta` sem
aspas) derrubou todo ciclo de análise. Gravar o perfil, mesmo com a consulta certa, reescreveria o
quiz do aluno com uma regra que só soma.
"""

from datetime import UTC, datetime
from importlib import import_module
from unittest.mock import AsyncMock

import pytest

from app.agent.graph.nodes.executor import executor
from app.repositories.perfil import PerfilRepository

modulo_executor = import_module("app.agent.graph.nodes.executor")

PERFIL = {
    "perfis": [{"perfil": "Survivor", "afinidade": 75}],
    "modo_operacao_sugerido": "imediato",
    "modo_resposta": "imediato",
    "justificativa": "perfil dominante inferido: Survivor",
}
TRILHA = {"classe_id": 7, "justificativa": "revisar o tópico 3"}
NOTIFICACAO = {"tipo": "suporte", "titulo": "t", "corpo": "c", "horario": datetime(2026, 11, 2, 15, tzinfo=UTC).isoformat()}


class _Sessao:
    """Sessão com savepoint: conta quantos abriram e quantos voltaram por erro."""

    def __init__(self) -> None:
        self.savepoints = 0
        self.desfeitos = 0
        self.commits = 0

    def begin_nested(self):
        sessao = self

        class _Savepoint:
            async def __aenter__(self_inner):
                sessao.savepoints += 1

            async def __aexit__(self_inner, tipo, *exc):
                if tipo is not None:
                    sessao.desfeitos += 1
                return False

        return _Savepoint()

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        return None


class _Fabrica:
    def __init__(self) -> None:
        self.sessao = _Sessao()

    def __call__(self):
        sessao = self.sessao

        class _Ctx:
            async def __aenter__(self_inner):
                return sessao

            async def __aexit__(self_inner, *exc):
                return False

        return _Ctx()


@pytest.fixture
def repos(monkeypatch):
    mocks = {
        "perfil": AsyncMock(),
        "trilha": AsyncMock(),
        "notificacao": AsyncMock(return_value=1),
        "resumo": AsyncMock(),
        "evento": AsyncMock(),
    }
    monkeypatch.setattr(PerfilRepository, "atualizar_afinidades", mocks["perfil"])
    monkeypatch.setattr(modulo_executor.TrilhaRepository, "aplicar_config", mocks["trilha"])
    monkeypatch.setattr(modulo_executor.NotificacaoRepository, "enfileirar", mocks["notificacao"])
    monkeypatch.setattr(modulo_executor.IADescricaoRepository, "upsert_cycle_summary", mocks["resumo"])
    monkeypatch.setattr(modulo_executor.EventoRepository, "log", mocks["evento"])
    return mocks


@pytest.mark.asyncio
async def test_executor_nao_grava_perfil_nem_modo_do_aluno(repos) -> None:
    r = await executor({"aluno_id": "a", "ciclo_id": "c", "perfil_update": PERFIL}, _Fabrica())

    repos["perfil"].assert_not_awaited()
    assert "perfil_atualizado" not in r["acoes_aplicadas"]
    # A inferência continua chegando ao resumo da IA, que só o raciocínio lê.
    assert repos["resumo"].await_args.kwargs["perfil_update"].perfis[0].perfil == "Survivor"


@pytest.mark.asyncio
async def test_escrita_que_falha_volta_sozinha_e_o_ciclo_segue(repos) -> None:
    repos["trilha"].side_effect = RuntimeError("coluna inexistente")
    fabrica = _Fabrica()

    r = await executor(
        {"aluno_id": "a", "ciclo_id": "c", "trilha_config": TRILHA, "notificacao_payload": NOTIFICACAO},
        fabrica,
    )

    assert r["acoes_aplicadas"] == ["falhou:trilha_reconfigurada", "notificacao_enfileirada", "ia_descricao_atualizada"]
    repos["notificacao"].assert_awaited_once()
    # Trilha que não gravou não vira recomendação no resumo.
    assert repos["resumo"].await_args.kwargs["recomendacao_trilha"] is None
    repos["evento"].assert_awaited_once()
    assert fabrica.sessao.commits == 1
    assert (fabrica.sessao.savepoints, fabrica.sessao.desfeitos) == (3, 1)


@pytest.mark.asyncio
async def test_intervencao_que_falha_nao_notifica_o_aluno(repos, monkeypatch) -> None:
    monkeypatch.setattr(
        modulo_executor.IntervencaoRepository, "registrar_do_aluno", AsyncMock(side_effect=RuntimeError("check"))
    )
    payload = {
        "tipo": "engajamento",
        "kind": "abandono",
        "ocorrencias": 3,
        "janela": 5,
        "texto": "t",
        "base": "b",
        "acao": "notificacao",
        "origem": "regra",
        "notificacao_titulo": "Oi",
        "notificacao_corpo": "Volte",
    }

    r = await executor({"aluno_id": "a", "classe_id": 7, "ciclo_id": "c", "intervencao_payload": payload}, _Fabrica())

    assert r["acoes_aplicadas"] == ["falhou:intervencao_registrada"]
    repos["notificacao"].assert_not_awaited()


@pytest.mark.asyncio
async def test_log_da_falha_nao_leva_os_parametros_do_sql(repos, caplog) -> None:
    repos["trilha"].side_effect = RuntimeError(
        'column "modoresposta" does not exist\n[SQL: SELECT ...]\n[parameters: (\'aluno-secreto\',)]'
    )

    await executor({"aluno_id": "a", "ciclo_id": "c", "trilha_config": TRILHA}, _Fabrica())

    assert "modoresposta" in caplog.text
    assert "aluno-secreto" not in caplog.text
