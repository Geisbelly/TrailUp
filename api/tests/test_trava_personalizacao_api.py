"""Trava do estudo na API (#13, 20261102_05).

A RLS esconde o material do aluno; a API segura só o que ela mesma entrega na hora: o grafo de
análise (mede, não age), `POST /personalizar`, a sugestão de ordem e a listagem do aluno, que ela
lê por cima da RLS.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import DBAPIError

from app.agent.graph.nodes.agente_intervencao import montar_intervencao
from app.agent.graph.nodes.executor import executor
from app.agent.graph.routing import RETIDA_SPECIALIST_NODES, compute_supervisor_next
from app.api.deps import get_current_user, get_session
from app.api.v1 import personalizacao as personalizacao_module
from app.core.settings import Settings
from app.repositories.access import AccessRepository
from app.repositories.conteudo_classe import ConteudoClasseRepository
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.estudo import EstudoRepository
from app.schemas.api import AnalisarPayload
from app.services import analysis_runner, state_builder
from app.services.linear_analysis_pipeline import build_linear_analysis_orchestrator
from app.services.state_builder import build_initial_state
from tests.conftest import FakeSession
from tests.test_agente_intervencao import RECORRENTE, _Fabrica, _mock_executor
from tests.test_linear_analysis_pipeline import DummyRequest
from tests.test_state_builder import _FakeContextRepo

# ------------------------------------------------------------------------------- repositório


class _Orig:
    def __init__(self, sqlstate: str) -> None:
        self.sqlstate = sqlstate


class _Sessao:
    def __init__(self, *, valor=None, erro: BaseException | None = None) -> None:
        self.valor, self.erro, self.consultas = valor, erro, []

    async def execute(self, consulta, params):
        self.consultas.append(params)
        if self.erro:
            raise self.erro
        return SimpleNamespace(scalar=lambda: self.valor)


@pytest.mark.asyncio
async def test_repositorio_pergunta_ao_banco() -> None:
    sessao = _Sessao(valor=True)
    assert await EstudoRepository(sessao).personalizacao_retida(7) is True
    assert sessao.consultas == [{"classe_id": 7}]
    assert await EstudoRepository(_Sessao(valor=False)).personalizacao_retida(7) is False
    # Sem turma não há estudo, e nem pergunta.
    sem_turma = _Sessao(valor=True)
    assert await EstudoRepository(sem_turma).personalizacao_retida(None) is False
    assert sem_turma.consultas == []
    # A FakeSession dos testes devolve None.
    assert await EstudoRepository(FakeSession()).personalizacao_retida(7) is False


@pytest.mark.asyncio
async def test_banco_sem_a_migration_nao_retem_e_outro_erro_sobe() -> None:
    ausente = DBAPIError("SELECT", {}, _Orig("42883"))
    assert await EstudoRepository(_Sessao(erro=ausente)).personalizacao_retida(7) is False
    # Qualquer outro erro sobe: "não retida" por falha de leitura entregaria adequação ao
    # grupo de comparação sem ninguém ver.
    with pytest.raises(DBAPIError):
        await EstudoRepository(_Sessao(erro=DBAPIError("SELECT", {}, _Orig("57014")))).personalizacao_retida(7)


# ----------------------------------------------------------------------------------- estado


@pytest.mark.asyncio
async def test_estado_inicial_leva_a_trava(monkeypatch) -> None:
    async def sem_memoria(_session, *, aluno_id, classe_id):
        from app.schemas.memoria_aluno import MemoriaAluno

        return MemoriaAluno(dominio_por_topico={})

    class _Retida(_FakeContextRepo):
        async def fetch_personalizacao_retida(self, *, classe_id):
            return classe_id == 32

    monkeypatch.setattr(state_builder, "ler_memoria", sem_memoria)
    payload = AnalisarPayload(classe_id=32, modo="estudo", eventos_novos=[])
    assert (await build_initial_state(object(), "a", payload, context_repository_factory=_Retida))[
        "personalizacao_retida"
    ] is True
    # Repositório sem o método: não retida.
    assert (await build_initial_state(object(), "a", payload, context_repository_factory=_FakeContextRepo))[
        "personalizacao_retida"
    ] is False


# ------------------------------------------------------------------------------------- grafo


def _estado_que_age(**extra):
    """Valência negativa (tema de suporte e notificação) e recorrência (intervenção)."""
    return {
        "aluno_id": "a",
        "classe_id": 1,
        "historico_eventos": [{"tipo": "x"}],
        "eventos_novos": [],
        "completed_nodes": ["agente_perfil", "agente_emocao"],
        "emocao_atual": {"emocao_primaria": "frustrado", "valencia": -0.8},
        "memoria_aluno": RECORRENTE,
        **extra,
    }


def test_turma_retida_so_mede_e_avisa_o_professor() -> None:
    livre = compute_supervisor_next(_estado_que_age())
    assert {"agente_ui", "agente_notificacao", "agente_intervencao"} <= set(livre)
    retida = compute_supervisor_next(_estado_que_age(personalizacao_retida=True))
    assert retida == ["agente_intervencao"]
    assert set(retida) <= RETIDA_SPECIALIST_NODES


@pytest.mark.asyncio
async def test_executor_da_turma_retida_grava_o_insight_e_nao_notifica_o_aluno(monkeypatch) -> None:
    registrar, enfileirar = _mock_executor(monkeypatch, "uuid-1")
    payload = montar_intervencao("abandono", 3, None).model_dump(mode="json")
    r = await executor(
        {"aluno_id": "a", "classe_id": 7, "ciclo_id": "c", "intervencao_payload": payload, "personalizacao_retida": True},
        _Fabrica(),
    )
    registrar.assert_awaited_once()
    enfileirar.assert_not_awaited()
    assert "intervencao_registrada" in r["acoes_aplicadas"]
    assert "intervencao_notificada" not in r["acoes_aplicadas"]


@pytest.mark.asyncio
async def test_orquestrador_registra_a_decisao_e_nao_a_manda_ao_app() -> None:
    telemetria = {"idle_sec": 90, "active_sec": 50, "screen_dwell_sec": 180, "signals": [{"type": "activity_wrong"}]}

    async def rodar(**extra):
        state = {"ciclo_id": "c", "desempenho_recente": {"media_acertos": 35}, "acoes_aplicadas": [], "erros": [], **extra}
        result = await build_linear_analysis_orchestrator(Settings()).run(
            request=DummyRequest(), state=state, config={}, telemetry_payload=telemetria, frames_b64=[], eventos_novos=[]
        )
        return state, result

    livre_state, livre = await rodar()
    acoes = livre_state["decision_snapshot"]["acoes"]
    assert acoes and set(acoes) <= set(livre["acoes_aplicadas"])

    retida_state, retida = await rodar(personalizacao_retida=True)
    assert retida_state["decision_snapshot"]["acoes"] == acoes  # a decisão fica registrada
    assert not set(acoes) & set(retida["acoes_aplicadas"])
    assert not retida_state.get("payload_modo")


@pytest.mark.asyncio
async def test_ciclo_da_turma_retida_nao_revisa_a_sugestao(monkeypatch) -> None:
    revisar = AsyncMock(return_value={"acao": "revisada"})
    monkeypatch.setattr(analysis_runner, "revisar_sugestoes_do_ciclo", revisar)
    assert await analysis_runner._revisar_sugestao({"personalizacao_retida": True}, object(), aluno_id="a") is None
    revisar.assert_not_awaited()
    assert await analysis_runner._revisar_sugestao({}, object(), aluno_id="a") == {"acao": "revisada"}


# ------------------------------------------------------------------------------------ rotas


def _como_aluno(app, aluno_user, monkeypatch, retidas: set[int]) -> None:
    async def sessao():
        yield FakeSession()

    async def retida(self, classe_id):
        return classe_id in retidas

    app.dependency_overrides[get_session] = sessao
    app.dependency_overrides[get_current_user] = lambda: aluno_user
    monkeypatch.setattr(EstudoRepository, "personalizacao_retida", retida)


def test_personalizar_na_turma_retida_responde_409_sem_rodar_o_grafo(app, aluno_user, monkeypatch) -> None:
    _como_aluno(app, aluno_user, monkeypatch, {1})
    contexto = AsyncMock()
    monkeypatch.setattr(personalizacao_module, "fetch_personalizacao_context", contexto)
    monkeypatch.setattr(AccessRepository, "aluno_belongs_to_classe", AsyncMock(return_value=True))
    monkeypatch.setattr(ConteudoClasseRepository, "buscar_classe_id_por_topico", AsyncMock(return_value=1))

    with TestClient(app) as client:
        response = client.post("/api/v1/personalizar", json={"classe_id": 1, "topico_id": 5})

    assert response.status_code == 409
    assert response.json()["detail"] == "personalizacao_retida_pelo_estudo"
    contexto.assert_not_awaited()


def _registro(rid: int, classe_id: int) -> dict:
    return {
        "id": rid, "aluno_id": "aluno-1", "classe_id": classe_id, "topico_id": 5, "ciclo_id": f"c{rid}",
        "status": "pronto", "materiais": {}, "plano": {}, "formato_prioritario": "texto", "formatos_gerados": ["texto"],
        "gerado_em": "2026-11-01T12:00:00Z",
    }


def test_listagem_do_aluno_tira_a_turma_retida(app, aluno_user, monkeypatch) -> None:
    _como_aluno(app, aluno_user, monkeypatch, {1})
    monkeypatch.setattr(
        ConteudoPersonalizadoRepository, "buscar_por_aluno", AsyncMock(return_value=[_registro(1, 1), _registro(2, 2)])
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/personalizar/aluno-1")

    assert response.status_code == 200
    assert [item["classe_id"] for item in response.json()["itens"]] == [2]


@pytest.mark.asyncio
async def test_sugestao_da_turma_retida_nem_e_criada(monkeypatch) -> None:
    garantir = AsyncMock(return_value={"ordem": [], "versao": 1})
    monkeypatch.setattr(personalizacao_module, "garantir_sugestao_do_aluno", garantir)
    monkeypatch.setattr(EstudoRepository, "personalizacao_retida", AsyncMock(return_value=True))
    itens = [personalizacao_module._to_response(_registro(1, 1))]

    assert await personalizacao_module._resolver_sugestao_do_aluno(
        FakeSession(), aluno_id="aluno-1", topico_id=5, itens=itens
    ) is None
    garantir.assert_not_awaited()
