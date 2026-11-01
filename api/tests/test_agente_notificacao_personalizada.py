"""Notificação por aluno e perfil BrainHex com RAG e LLM (#66): ordem RAG → LLM → regra."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from importlib import import_module
from unittest.mock import AsyncMock

import pytest

from app.core.settings import Settings
from app.services.llm import StructuredOutputError

# `app.agent.graph.nodes` reexporta a função com o nome do módulo.
modulo = import_module("app.agent.graph.nodes.agente_notificacao")
AGORA = datetime(2026, 11, 1, 15, 0, tzinfo=UTC)  # 12h em Brasília

ESTADO = {
    "aluno_id": "a",
    "nome_aluno": "Fulana",
    "email_aluno": "f@x",
    "perfil_brainhex": [{"perfil": "Survivor", "afinidade": 70}, {"perfil": "Seeker", "afinidade": 40}],
    "emocao_atual": {"emocao_primaria": "frustrado", "valencia": -0.6},
    "desempenho_recente": {"media_acertos": 40},
    "eventos_novos": [{"tipo": "atividade_concluida"}],
}


def _gerada(**campos):
    base = {
        "tipo": "suporte",
        "titulo": "Passo a passo",
        "corpo": "Faça um item agora.",
        "horario": AGORA + timedelta(minutes=10),
        "prioridade": 2,
        "evidencia": "Nacke et al.: Survivor responde a redução de risco.",
    }
    return modulo.NotificacaoGerada(**{**base, **campos})


def _rag(monkeypatch, ligado: bool) -> None:
    monkeypatch.setattr(modulo.OpenAIRagService, "is_configured", lambda self: ligado)


@pytest.mark.asyncio
async def test_com_rag_usa_a_evidencia_e_o_perfil_sem_dado_pessoal(monkeypatch) -> None:
    _rag(monkeypatch, True)
    chamada = AsyncMock(return_value=_gerada())
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", chamada)

    r = await modulo.agente_notificacao(ESTADO, Settings(openai_api_key=None), agora=AGORA)

    kwargs = chamada.await_args.kwargs
    assert kwargs["use_rag"] is True and kwargs["prompt_name"] == "notificacao_personalizada.txt"
    assert kwargs["payload"]["perfil"]["perfil_dominante"] == "Survivor"
    assert kwargs["payload"]["perfil"]["tom_voz"]  # assinatura editorial do perfil vai junto
    assert kwargs["payload"]["motivo"] == "emocao_negativa"
    assert "Fulana" not in str(kwargs["payload"]) and "f@x" not in str(kwargs["payload"])
    contexto = r["notificacao_payload"]["contexto"]
    assert contexto == {"motivo": "emocao_negativa", "perfil": "Survivor", "origem": "rag", "evidencia": _gerada().evidencia}


@pytest.mark.asyncio
async def test_rag_falhando_cai_no_llm_sem_rag(monkeypatch) -> None:
    _rag(monkeypatch, True)
    chamada = AsyncMock(side_effect=[StructuredOutputError("rag"), _gerada(evidencia=None)])
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", chamada)

    r = await modulo.agente_notificacao(ESTADO, Settings(openai_api_key=None), agora=AGORA)

    assert [c.kwargs["use_rag"] for c in chamada.await_args_list] == [True, False]
    assert r["notificacao_payload"]["contexto"]["origem"] == "modelo"
    assert "evidencia" not in r["notificacao_payload"]["contexto"]


@pytest.mark.asyncio
async def test_sem_rag_configurado_nem_tenta_o_rag(monkeypatch) -> None:
    _rag(monkeypatch, False)
    chamada = AsyncMock(return_value=_gerada(evidencia=None))
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", chamada)
    await modulo.agente_notificacao(ESTADO, Settings(openai_api_key=None), agora=AGORA)
    assert [c.kwargs["use_rag"] for c in chamada.await_args_list] == [False]


@pytest.mark.asyncio
async def test_sem_modelo_a_regra_escreve_no_tom_do_perfil(monkeypatch) -> None:
    _rag(monkeypatch, True)
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", AsyncMock(side_effect=StructuredOutputError("x")))

    survivor = (await modulo.agente_notificacao(ESTADO, Settings(openai_api_key=None), agora=AGORA))["notificacao_payload"]
    daredevil = (
        await modulo.agente_notificacao(
            {**ESTADO, "perfil_brainhex": [{"perfil": "Daredevil", "afinidade": 90}]}, Settings(openai_api_key=None), agora=AGORA
        )
    )["notificacao_payload"]

    assert survivor["contexto"]["origem"] == "regra" and survivor["tipo"] == "suporte"
    assert survivor["titulo"] != daredevil["titulo"]  # cada perfil tem o seu tom
    assert survivor["titulo"] == modulo._TEXTOS_DA_REGRA["Survivor"]["suporte"][0]


def test_regra_para_inatividade_e_lembrete() -> None:
    n = modulo.notificacao_da_regra("Achiever", "inatividade", AGORA)
    assert (n.tipo, n.prioridade) == ("lembrete", 1)
    assert n.titulo == modulo._TEXTOS_DA_REGRA["Achiever"]["lembrete"][0]


def test_todo_perfil_tem_texto_de_regra_para_os_dois_motivos() -> None:
    perfis = {"Seeker", "Survivor", "Daredevil", "Mastermind", "Conqueror", "Socializer", "Achiever"}
    assert set(modulo._TEXTOS_DA_REGRA) == perfis
    for textos in modulo._TEXTOS_DA_REGRA.values():
        for titulo, corpo in textos.values():
            assert len(titulo) <= 60 and len(corpo) <= 200


@pytest.mark.parametrize(
    ("proposto", "esperado_brasilia"),
    [
        (AGORA - timedelta(hours=2), "12:05"),  # no passado: daqui a 5 min
        (AGORA + timedelta(hours=40), "12:00"),  # além de 24 h: corta em 24 h (12h de amanhã)
        (datetime(2026, 11, 2, 2, 0, tzinfo=UTC), "07:00"),  # 23h em Brasília: vai para 7h
        (datetime(2026, 11, 1, 22, 0, tzinfo=UTC), "19:00"),  # 19h em Brasília: fica
    ],
)
def test_guarda_de_horario(proposto, esperado_brasilia) -> None:
    ajustado = modulo.ajustar_horario(proposto, AGORA)
    assert AGORA + timedelta(minutes=5) <= ajustado
    local = ajustado.astimezone(modulo.BRASILIA)
    assert not (local.hour >= 22 or local.hour < 7)
    assert local.strftime("%H:%M") == esperado_brasilia


def test_horario_sem_fuso_vira_daqui_a_5_minutos() -> None:
    assert modulo.ajustar_horario(None, AGORA) == AGORA + timedelta(minutes=5)
