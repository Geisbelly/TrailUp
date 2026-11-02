"""Supervisor do ciclo de análise: o modelo ordena os candidatos da regra e nada além.

Em produção (27 ciclos, 01/11) o modelo pedia `agente_ui` a cada volta (232 execuções,
139 seguidas num ciclo), respondia `finish` sem passar pelo `executor` em 16 ciclos, e
`agente_intervencao`/`agente_cronometro` ficavam fora de `VALID_NEXT`.
"""

from __future__ import annotations

from collections import Counter
from importlib import import_module
from typing import Any

import pytest
from langgraph.checkpoint.memory import MemorySaver

from app.agent.graph import nodes
from app.agent.graph.builder import build_graph
from app.agent.graph.routing import SPECIALIST_NODES, compute_supervisor_next
from app.schemas.supervisor_decision import SupervisorDecision
from app.services.llm import StructuredOutputError

modulo_supervisor = import_module("app.agent.graph.nodes.supervisor")

# Saída que cada nó stub deixa no estado, o bastante para a regra não pedi-lo de novo.
SAIDAS: dict[str, dict[str, Any]] = {
    "agente_emocao": {"emocao_atual": {"emocao_primaria": "frustrado", "valencia": -0.6}},
    "agente_perfil": {"perfil_update": {"x": 1}},
    "agente_trilha": {"trilha_config": {"x": 1}},
    "agente_conteudo": {"conteudo_adaptado": {"x": 1}},
    "agente_geracao_midia": {"materiais_gerados": {"x": 1}},
    "agente_notificacao": {"notificacao_payload": {"x": 1}},
    "agente_intervencao": {"intervencao_payload": {"x": 1}},
    "agente_cronometro": {"cronometro_payload": {"x": 1}},
    "agente_ui": {"ui_config": {"tema": "focus", "precisa_texto": True}},
    "agente_texto": {"textos_gerados": [{"x": 1}]},
    "agente_plano_personalizacao": {},
    "agente_ai_patch": {},
    "agente_midias_personalizadas": {},
}

FORA_DO_TEMPO = [False, False, True, False, True]


def _stub(nome: str):
    async def no(state, **_kwargs):
        return {**SAIDAS[nome], "completed_nodes": [nome], "messages": [nome]}

    return no


async def _executor(state, **_kwargs):
    return {"completed_nodes": ["executor"], "messages": ["executor"]}


class _ModeloFixo:
    """Responde sempre a mesma lista, como o modelo de produção respondia `agente_ui`."""

    chamadas = 0
    resposta: list[str] = []

    def __init__(self, _settings) -> None:
        pass

    async def ainvoke_structured(self, **kwargs):
        type(self).chamadas += 1
        return SupervisorDecision(next=list(type(self).resposta), justificativa="consolidar a interface")


@pytest.fixture
def modelo(monkeypatch):
    class Modelo(_ModeloFixo):
        chamadas = 0
        resposta = ["agente_ui"]

    monkeypatch.setattr(modulo_supervisor, "JsonLLMService", Modelo)
    return Modelo


@pytest.fixture
def grafo(settings, monkeypatch):
    for nome in SPECIALIST_NODES:
        monkeypatch.setattr(nodes, nome, _stub(nome))
    monkeypatch.setattr(nodes, "executor", _executor)
    return build_graph(settings, session_factory=None, checkpointer=MemorySaver())


def _estado_do_ciclo(**extra) -> dict[str, Any]:
    """O ciclo de telemetria como chega ao grafo: emoção já preenchida pelo pipeline."""
    return {
        "aluno_id": "a",
        "classe_id": 7,
        "ciclo_id": "c",
        "historico_eventos": [{"tipo": "x"}],
        "eventos_novos": [{"tipo": "inatividade"}],
        "emocao_atual": {"emocao_primaria": "frustrado", "valencia": -0.6},
        "desempenho_recente": {
            "media_acertos": 0,
            "tentativas": {
                "cronometro": {"ligado": True, "origem": "perfil"},
                "ultimas_cronometradas_no_tempo": FORA_DO_TEMPO,
            },
        },
        "payload_topico_id": 203,
        "gerar_materiais": True,
        "memoria_aluno": {"mental_state_recorrente": {"recorrente": True, "kind": "dificuldade"}},
        "completed_nodes": [],
        **extra,
    }


async def _rodar(grafo, estado) -> Counter:
    resultado = await grafo.ainvoke(
        estado, {"configurable": {"thread_id": "t"}, "recursion_limit": 60}
    )
    return Counter(resultado["completed_nodes"])


@pytest.mark.asyncio
async def test_modelo_pedindo_agente_ui_sempre_nao_faz_laco(grafo, modelo) -> None:
    contagem = await _rodar(grafo, _estado_do_ciclo())

    assert contagem["agente_ui"] == 1
    assert max(contagem.values()) == 1
    assert contagem["executor"] == 1


@pytest.mark.asyncio
async def test_intervencao_e_cronometro_rodam_com_o_modelo_respondendo(grafo, modelo) -> None:
    contagem = await _rodar(grafo, _estado_do_ciclo())

    assert contagem["agente_intervencao"] == 1
    assert contagem["agente_cronometro"] == 1


@pytest.mark.asyncio
async def test_modelo_pedindo_finish_nao_pula_o_executor(grafo, modelo) -> None:
    modelo.resposta = ["finish"]

    contagem = await _rodar(grafo, _estado_do_ciclo())

    assert contagem["executor"] == 1
    assert contagem["agente_notificacao"] == 1


@pytest.mark.asyncio
async def test_modelo_nao_age_no_aluno_da_turma_retida(grafo, modelo) -> None:
    modelo.resposta = ["agente_ui", "agente_notificacao", "agente_texto"]

    contagem = await _rodar(grafo, _estado_do_ciclo(personalizacao_retida=True))

    assert contagem["agente_intervencao"] == 1
    for nome in ("agente_ui", "agente_notificacao", "agente_texto", "agente_cronometro", "agente_conteudo"):
        assert contagem[nome] == 0


@pytest.mark.asyncio
async def test_perfil_que_a_regra_pede_roda_uma_vez_e_a_trilha_depois(grafo, modelo) -> None:
    """O modelo nunca escolhia o perfil (0 execuções em produção); agora vale a regra. Com o
    histórico sempre em 20 eventos (LIMIT 20), `_needs_profile_update` pede o perfil todo ciclo."""
    estado = _estado_do_ciclo(historico_eventos=[{"tipo": "x"}] * 20)

    assert "agente_perfil" in compute_supervisor_next(estado)
    contagem = await _rodar(grafo, estado)

    assert contagem["agente_perfil"] == 1
    assert contagem["agente_trilha"] == 1
    assert contagem["executor"] == 1


@pytest.mark.asyncio
async def test_sem_escolha_o_modelo_nao_e_chamado(settings, modelo) -> None:
    so_executor = {
        "completed_nodes": ["agente_perfil", "agente_trilha"],
        "perfil_update": {"x": 1},
        "trilha_config": {"x": 1},
        "historico_eventos": [{"x": 1}],
    }
    um_no = {**so_executor, "emocao_atual": {"emocao_primaria": "frustrado"}}

    assert (await nodes.supervisor(so_executor, settings=settings))["next"] == ["executor"]
    assert (await nodes.supervisor(um_no, settings=settings))["next"] == ["agente_ui"]
    assert modelo.chamadas == 0


@pytest.mark.asyncio
async def test_falha_do_modelo_cai_nos_candidatos(settings, monkeypatch) -> None:
    class Quebrado(_ModeloFixo):
        async def ainvoke_structured(self, **kwargs):
            raise StructuredOutputError("sem json")

    monkeypatch.setattr(modulo_supervisor, "JsonLLMService", Quebrado)
    estado = _estado_do_ciclo()

    resultado = await nodes.supervisor(estado, settings=settings)

    assert set(resultado["next"]) >= {"agente_ui", "agente_intervencao", "agente_cronometro"}


def test_escolha_do_modelo_ordena_e_filtra() -> None:
    candidatos = ["agente_ui", "agente_conteudo", "agente_cronometro"]

    assert modulo_supervisor.escolha_do_modelo(["agente_cronometro", "agente_ui"], candidatos) == [
        "agente_cronometro",
        "agente_ui",
    ]
    assert modulo_supervisor.escolha_do_modelo(["agente_ui", "agente_ui"], candidatos) == ["agente_ui"]
    assert modulo_supervisor.escolha_do_modelo(["executor", "finish", "agente_texto"], candidatos) == candidatos
    assert modulo_supervisor.escolha_do_modelo([], candidatos) == candidatos


def test_valid_next_cobre_todos_os_nos_do_grafo() -> None:
    assert SPECIALIST_NODES <= modulo_supervisor.VALID_NEXT
    assert {"agente_intervencao", "agente_cronometro", "executor", "finish"} <= modulo_supervisor.VALID_NEXT
