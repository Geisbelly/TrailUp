"""Nó de intervenção (#64): padrão de risco → `intervencoes` → `notificacoes_ia`."""

from __future__ import annotations

from importlib import import_module
from unittest.mock import AsyncMock

import pytest
from langgraph.graph import END, START, StateGraph

from app.agent.graph.nodes.agente_intervencao import agente_intervencao, montar_intervencao
from app.agent.graph.nodes.executor import executor
from app.agent.graph.routing import compute_supervisor_next
from app.agent.graph.state import TrailUpState
from app.core.settings import Settings
from app.schemas.intervencao import IntervencaoSugestao
from app.services.llm import StructuredOutputError
from app.services.rag_observabilidade import registrar_busca

# `app.agent.graph.nodes` reexporta as funcoes com o nome dos modulos.
modulo = import_module("app.agent.graph.nodes.agente_intervencao")
modulo_executor = import_module("app.agent.graph.nodes.executor")

RECORRENTE = {"mental_state_recorrente": {"recorrente": True, "kind": "abandono", "ocorrencias": 3}}


class _Sessao:
    async def commit(self):
        return None

    async def rollback(self):
        return None


class _Fabrica:
    def __call__(self):
        sessao = _Sessao()

        class _Ctx:
            async def __aenter__(self_inner):
                return sessao

            async def __aexit__(self_inner, *exc):
                return False

        return _Ctx()


@pytest.mark.asyncio
async def test_memoria_aluno_sobrevive_a_entrada_do_grafo() -> None:
    """Sem `memoria_aluno` em TrailUpState o LangGraph descartava a chave e todo nó lia None:
    a recorrência que o agente_ui usa nunca disparava, e este nó nunca rodaria."""
    visto: dict = {}

    async def no(state):
        visto["memoria"] = state.get("memoria_aluno")
        return {"messages": ["ok"]}

    g = StateGraph(TrailUpState)
    g.add_node("n", no)
    g.add_edge(START, "n")
    g.add_edge("n", END)
    await g.compile().ainvoke({"aluno_id": "a", "memoria_aluno": RECORRENTE})
    assert visto["memoria"] == RECORRENTE


def _estado(**extra):
    return {
        "aluno_id": "a",
        "classe_id": 1,
        "historico_eventos": [{"tipo": "x"}],
        "eventos_novos": [],
        "completed_nodes": ["agente_perfil"],
        "perfil_update": {"x": 1},
        "memoria_aluno": RECORRENTE,
        **extra,
    }


def test_supervisor_chama_a_intervencao_so_com_recorrencia_e_turma() -> None:
    assert "agente_intervencao" in compute_supervisor_next(_estado())
    assert "agente_intervencao" not in compute_supervisor_next(_estado(memoria_aluno={}))
    assert "agente_intervencao" not in compute_supervisor_next(_estado(classe_id=None))
    assert "agente_intervencao" not in compute_supervisor_next(
        _estado(completed_nodes=["agente_perfil", "agente_intervencao"])
    )


def test_supervisor_leva_a_intervencao_ao_executor() -> None:
    estado = _estado(
        completed_nodes=["agente_perfil", "agente_intervencao"],
        perfil_update=None,
        intervencao_payload={"tipo": "engajamento"},
    )
    assert compute_supervisor_next(estado) == ["executor"]


def test_regra_sem_modelo_tem_evidencia_e_texto_sem_diagnostico() -> None:
    i = montar_intervencao("abandono", 3, None)
    assert (i.tipo, i.acao, i.origem) == ("engajamento", "notificacao", "regra")
    assert i.base == "3 dos últimos 5 ciclos de estudo: atividade aberta e deixada sem concluir."
    assert i.notificacao_titulo and i.notificacao_corpo
    # Dificuldade: resposta pedagógica, o professor olha antes de qualquer mensagem automática.
    dificuldade = montar_intervencao("dificuldade", 4, None)
    assert (dificuldade.tipo, dificuldade.acao) == ("pedagogica", "acompanhar")
    assert "dificuldade nas atividades do tópico" in dificuldade.texto


def test_texto_que_atribui_emocao_cai_na_regra() -> None:
    # DAT-45: o sistema não mede emoção; o texto do modelo não pode dizer que mediu.
    emocao = IntervencaoSugestao(texto="O aluno está ansioso com as atividades. Converse com ele.", acao="acompanhar")
    assert montar_intervencao("dificuldade", 3, emocao).origem == "regra"
    for kind in ("dificuldade", "abandono"):
        regra = montar_intervencao(kind, 3, None)
        assert not modulo._TERMOS_DE_EMOCAO.search(regra.texto + (regra.notificacao_corpo or ""))


def test_texto_clinico_do_modelo_cai_na_regra() -> None:
    clinica = IntervencaoSugestao(
        texto="Pode ser um quadro de depressão; sugira terapia.", acao="acompanhar"
    )
    assert montar_intervencao("abandono", 3, clinica).origem == "regra"


def test_notificacao_sem_texto_vira_acompanhar() -> None:
    incompleta = IntervencaoSugestao(texto="Converse com o aluno.", acao="notificacao", notificacao_titulo="Oi")
    i = montar_intervencao("abandono", 3, incompleta)
    assert (i.origem, i.acao, i.notificacao_titulo) == ("modelo", "acompanhar", None)


@pytest.mark.asyncio
async def test_no_usa_o_modelo_e_nao_manda_dado_pessoal(monkeypatch) -> None:
    sugestao = IntervencaoSugestao(
        texto="Atividade deixada sem concluir em 3 dos últimos 5 ciclos. Converse no início da aula.",
        acao="notificacao",
        notificacao_titulo="Seu ritmo",
        notificacao_corpo="O próximo passo está mais curto.",
    )
    chamada = AsyncMock(return_value=sugestao)
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", chamada)
    monkeypatch.setattr(modulo, "_ja_pendente", AsyncMock(return_value=False))

    r = await agente_intervencao(
        {**_estado(), "nome_aluno": "Fulana", "email_aluno": "f@x"}, Settings(openai_api_key=None), _Fabrica()
    )

    assert r["intervencao_payload"]["origem"] == "modelo"
    assert r["intervencao_payload"]["kind"] == "abandono"
    payload = chamada.await_args.kwargs["payload"]
    assert "Fulana" not in str(payload) and "f@x" not in str(payload)
    assert payload["estado"] == "atividade aberta e deixada sem concluir"
    assert "emocao_atual" not in payload




@pytest.mark.asyncio
async def test_no_tenta_rag_antes_do_modelo_sem_rag(monkeypatch) -> None:
    async def gerar(**kwargs):
        if kwargs["use_rag"]:
            registrar_busca({"fontes_citadas": ["nao-validada.pdf"]})
            raise StructuredOutputError("RAG indisponível")
        return IntervencaoSugestao(texto="Converse com o aluno.", acao="acompanhar")

    chamada = AsyncMock(side_effect=gerar)
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", chamada)
    monkeypatch.setattr(modulo.OpenAIRagService, "is_configured", lambda self: True)
    monkeypatch.setattr(modulo, "_ja_pendente", AsyncMock(return_value=False))

    resultado = await agente_intervencao(_estado(), Settings(openai_api_key=None), _Fabrica())

    assert [call.kwargs["use_rag"] for call in chamada.await_args_list] == [True, False]
    assert resultado["intervencao_payload"]["origem"] == "modelo"
    assert resultado["intervencao_payload"]["fontes_rag"] == []


@pytest.mark.asyncio
async def test_no_registra_origem_rag_quando_busca_funciona(monkeypatch) -> None:
    async def gerar(**kwargs):
        registrar_busca({"fontes_citadas": ["Guia.pdf"]})
        return IntervencaoSugestao(texto="Converse com o aluno.", acao="acompanhar")

    chamada = AsyncMock(side_effect=gerar)
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", chamada)
    monkeypatch.setattr(modulo.OpenAIRagService, "is_configured", lambda self: True)
    monkeypatch.setattr(modulo, "_ja_pendente", AsyncMock(return_value=False))

    resultado = await agente_intervencao(_estado(), Settings(openai_api_key=None), _Fabrica())

    chamada.assert_awaited_once()
    assert chamada.await_args.kwargs["use_rag"] is True
    assert resultado["intervencao_payload"]["origem"] == "rag"
    assert resultado["intervencao_payload"]["fontes_rag"] == ["Guia.pdf"]


@pytest.mark.asyncio
async def test_no_cai_na_regra_quando_o_modelo_falha(monkeypatch) -> None:
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", AsyncMock(side_effect=StructuredOutputError("x")))
    monkeypatch.setattr(modulo, "_ja_pendente", AsyncMock(return_value=False))
    r = await agente_intervencao(_estado(), Settings(openai_api_key=None), _Fabrica())
    assert r["intervencao_payload"]["origem"] == "regra"


@pytest.mark.asyncio
async def test_no_nao_chama_o_modelo_com_intervencao_ja_pendente(monkeypatch) -> None:
    chamada = AsyncMock()
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", chamada)
    monkeypatch.setattr(modulo, "_ja_pendente", AsyncMock(return_value=True))
    r = await agente_intervencao(_estado(), Settings(openai_api_key=None), _Fabrica())
    assert "intervencao_payload" not in r
    chamada.assert_not_awaited()


@pytest.mark.asyncio
async def test_no_sem_recorrencia_nao_faz_nada(monkeypatch) -> None:
    chamada = AsyncMock()
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", chamada)
    r = await agente_intervencao(_estado(memoria_aluno={}), Settings(openai_api_key=None), _Fabrica())
    assert r == {"completed_nodes": ["agente_intervencao"], "messages": ["sem padrao de risco"]}
    chamada.assert_not_awaited()


def _mock_executor(monkeypatch, registrar_retorno):
    registrar = AsyncMock(return_value=registrar_retorno)
    enfileirar = AsyncMock(return_value=1)
    monkeypatch.setattr(modulo_executor.IntervencaoRepository, "registrar_do_aluno", registrar)
    monkeypatch.setattr(modulo_executor.NotificacaoRepository, "enfileirar", enfileirar)
    monkeypatch.setattr(modulo_executor.EventoRepository, "log", AsyncMock())
    return registrar, enfileirar


@pytest.mark.asyncio
async def test_executor_grava_a_intervencao_e_notifica(monkeypatch) -> None:
    registrar, enfileirar = _mock_executor(monkeypatch, "uuid-1")
    payload = montar_intervencao("abandono", 3, None).model_dump(mode="json")
    r = await executor({"aluno_id": "a", "classe_id": 7, "ciclo_id": "c", "intervencao_payload": payload}, _Fabrica())

    assert registrar.await_args.kwargs["classe_id"] == 7
    assert "intervencao_registrada" in r["acoes_aplicadas"]
    assert "intervencao_notificada" in r["acoes_aplicadas"]
    notificacao = enfileirar.await_args.args[1]
    assert notificacao.contexto == {
        "motivo": "intervencao",
        "intervencao_id": "uuid-1",
        "kind": "abandono",
        "texto_guarda": modulo_executor.TEXTO_GUARDA_VERSAO,  # sem a marca o banco não entrega (20261102_24)
    }


@pytest.mark.asyncio
async def test_aviso_da_intervencao_com_jargao_vira_o_texto_pronto(monkeypatch) -> None:
    _, enfileirar = _mock_executor(monkeypatch, "uuid-1")
    sugestao = IntervencaoSugestao(
        texto="Converse com o aluno sobre o ritmo das entregas.",
        acao="notificacao",
        notificacao_titulo="Otimize seu modelo de estudo",
        notificacao_corpo="A hipótese atual requer testes.",
    )
    payload = montar_intervencao("abandono", 3, sugestao).model_dump(mode="json")
    await executor({"aluno_id": "a", "classe_id": 7, "ciclo_id": "c", "intervencao_payload": payload}, _Fabrica())

    notificacao = enfileirar.await_args.args[1]
    assert (notificacao.titulo, notificacao.corpo) == (
        modulo._NOTIFICACAO_DA_REGRA["titulo"],
        modulo._NOTIFICACAO_DA_REGRA["corpo"],
    )


@pytest.mark.asyncio
async def test_executor_nao_notifica_duas_vezes_no_mesmo_ciclo(monkeypatch) -> None:
    """Valência negativa agora já faz o agente_notificacao mandar a dele."""
    _, enfileirar = _mock_executor(monkeypatch, "uuid-1")
    payload = montar_intervencao("abandono", 3, None).model_dump(mode="json")
    notificacao_do_ciclo = {
        "tipo": "suporte", "titulo": "t", "corpo": "c", "horario": "2026-10-31T12:00:00+00:00", "prioridade": 2,
    }
    r = await executor(
        {"aluno_id": "a", "classe_id": 7, "ciclo_id": "c", "intervencao_payload": payload,
         "notificacao_payload": notificacao_do_ciclo},
        _Fabrica(),
    )
    assert enfileirar.await_count == 1
    assert "intervencao_notificada" not in r["acoes_aplicadas"]


@pytest.mark.asyncio
async def test_executor_com_intervencao_ja_pendente_nao_notifica(monkeypatch) -> None:
    _, enfileirar = _mock_executor(monkeypatch, None)
    payload = montar_intervencao("abandono", 3, None).model_dump(mode="json")
    r = await executor({"aluno_id": "a", "classe_id": 7, "ciclo_id": "c", "intervencao_payload": payload}, _Fabrica())
    assert "intervencao_ja_pendente" in r["acoes_aplicadas"]
    enfileirar.assert_not_awaited()
