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
    assert contexto == {
        "motivo": "emocao_negativa",
        "perfil": "Survivor",
        "origem": "rag",
        "evidencia": _gerada().evidencia,
        "texto_guarda": modulo.TEXTO_GUARDA_VERSAO,
    }


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


# --- tópico no texto (#66, frente 2) ------------------------------------------

FOCO = {"topico_id": 11, "topico": "Frações", "percentual_concluido": 40, "proximo_conteudo": "Soma de frações"}


@pytest.mark.asyncio
async def test_modelo_recebe_o_topico_e_o_proximo_conteudo(monkeypatch) -> None:
    _rag(monkeypatch, False)
    chamada = AsyncMock(return_value=_gerada(evidencia=None))
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", chamada)

    r = await modulo.agente_notificacao({**ESTADO, "foco_estudo": FOCO}, Settings(openai_api_key=None), agora=AGORA)

    foco = chamada.await_args.kwargs["payload"]["foco"]
    assert foco == {"topico": "Frações", "percentual_concluido": 40, "proximo_conteudo": "Soma de frações"}
    assert r["notificacao_payload"]["contexto"]["topico"] == "Frações"


@pytest.mark.asyncio
async def test_sem_foco_o_modelo_recebe_foco_vazio(monkeypatch) -> None:
    _rag(monkeypatch, False)
    chamada = AsyncMock(return_value=_gerada(evidencia=None))
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", chamada)

    r = await modulo.agente_notificacao(ESTADO, Settings(openai_api_key=None), agora=AGORA)

    assert chamada.await_args.kwargs["payload"]["foco"] == {}
    assert "topico" not in r["notificacao_payload"]["contexto"]


@pytest.mark.asyncio
async def test_regra_cita_o_topico_quando_ha(monkeypatch) -> None:
    _rag(monkeypatch, False)
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", AsyncMock(side_effect=StructuredOutputError("x")))

    r = await modulo.agente_notificacao({**ESTADO, "foco_estudo": FOCO}, Settings(openai_api_key=None), agora=AGORA)

    n = r["notificacao_payload"]
    assert n["contexto"]["origem"] == "regra"
    assert "Frações" in n["corpo"]
    assert n["titulo"] == modulo._TEXTOS_DA_REGRA["Survivor"]["suporte"][0]


def test_texto_com_topico_cabe_com_o_maior_nome_possivel() -> None:
    assert set(modulo._TEXTOS_COM_TOPICO) == set(modulo._TEXTOS_DA_REGRA)
    longo = "x" * 200
    for perfil in modulo._TEXTOS_COM_TOPICO:
        for motivo in ("emocao_negativa", "inatividade"):
            n = modulo.notificacao_da_regra(perfil, motivo, AGORA, modulo._foco({"foco_estudo": {"topico": longo}}))
            assert len(n.corpo) <= 200, (perfil, motivo)
            assert "x" * 60 in n.corpo and "x" * 61 not in n.corpo


def test_perfil_fora_da_lista_cai_no_mastermind_tambem_com_topico() -> None:
    # Era "Socialiser", que NÃO é perfil fora da lista: é a grafia do banco para o Socializer, e
    # cair no Mastermind era o defeito (ver test_notificacao_perfil_da_tela.py).
    n = modulo.notificacao_da_regra("Perfil Inventado", "inatividade", AGORA, {"topico": "Frações"})
    assert n.corpo == modulo._TEXTOS_COM_TOPICO["Mastermind"]["lembrete"].format(topico="Frações")


# --- o texto fala com o aluno, em palavras simples ------------------------------

# Texto que o modelo mandou a alunos Mastermind em produção (notificacoes_ia, 01/11): ele copiava os
# marcadores da assinatura editorial ("hipótese", "evidência", "trade-off", "modelo") para o push.
TEXTOS_DE_PRODUCAO = [
    ("Próxima etapa no modelo de Aceleração",
     "A evidência sugere que consolidar o próximo bloco otimiza o aprendizado. Analise Gráficos do MUV para avançar no tópico."),
    ("Próxima hipótese em [MOCK] Aceleração",
     "A evidência apoia a progressão do modelo. Analise Gráficos do MUV para avançar no aprendizado."),
    ("Conclusão de ciclo: análise de eficiência",
     "O modelo de estudo foi validado com sucesso. A hipótese de domínio do tópico foi confirmada."),
    ("Otimize seu modelo de estudo",
     "A hipótese atual requer testes. Abra o TrailUp e analise o próximo trade-off conceitual com Idris."),
    ("Análise estratégica", "Parabéns pela eficiência, Aluno. Continue focado na sua rota."),
]
FOCO_ACELERACAO = {"topico": "Aceleração", "proximo_conteudo": "Gráficos do MUV"}


@pytest.mark.parametrize(("titulo", "corpo"), TEXTOS_DE_PRODUCAO)
def test_texto_de_sistema_que_chegou_ao_aluno_e_recusado(titulo, corpo) -> None:
    assert modulo.problemas_do_texto(titulo, corpo, FOCO_ACELERACAO)


def test_texto_simples_passa() -> None:
    assert modulo.problemas_do_texto(
        "Bora ver os gráficos?", "Os Gráficos do MUV mostram a Aceleração na prática. Dá uma olhada quando puder.", FOCO_ACELERACAO
    ) == []


def test_nome_do_topico_com_palavra_de_sistema_pode_ser_citado() -> None:
    foco = {"topico": "Ciclo da água", "proximo_conteudo": "Modelo atômico de Bohr"}
    assert modulo.problemas_do_texto("Ciclo da água", "Falta pouco em Ciclo da água. Abra o Modelo atômico de Bohr!", foco) == []
    # Só o nome inteiro é liberado: "ciclo" solto continua sendo jargão.
    assert modulo.problemas_do_texto("Novo ciclo", "Comece um ciclo novo hoje.", foco) != []


def test_frase_longa_e_recusada() -> None:
    corpo = "Que tal abrir agora o próximo conteúdo da trilha e resolver com calma as questões que ficaram para depois de ontem?"
    assert modulo.problemas_do_texto("Volta pra trilha", corpo) == ["tem frase com mais de 18 palavras"]


def test_todo_texto_pronto_da_regra_passa_na_guarda() -> None:
    for perfil, textos in modulo._TEXTOS_DA_REGRA.items():
        for tipo, (titulo, corpo) in textos.items():
            assert modulo.problemas_do_texto(titulo, corpo) == [], (perfil, tipo)
            com_topico = modulo._TEXTOS_COM_TOPICO[perfil][tipo].format(topico="Frações")
            assert modulo.problemas_do_texto(titulo, com_topico, {"topico": "Frações"}) == [], (perfil, tipo)


def test_todo_perfil_tem_jeito_de_falar_na_notificacao_e_o_exemplo_passa_na_guarda() -> None:
    assert set(modulo._JEITO_NA_NOTIFICACAO) == set(modulo._TEXTOS_DA_REGRA)
    for perfil, jeito in modulo._JEITO_NA_NOTIFICACAO.items():
        assert jeito["tom_voz"] and jeito["exemplo"], perfil
        assert modulo.problemas_do_texto("Exemplo", jeito["exemplo"], {"topico": "Frações"}) == [], perfil


@pytest.mark.asyncio
async def test_modelo_nao_recebe_os_marcadores_da_assinatura_editorial(monkeypatch) -> None:
    _rag(monkeypatch, False)
    chamada = AsyncMock(return_value=_gerada(evidencia=None))
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", chamada)

    await modulo.agente_notificacao(
        {**ESTADO, "perfil_brainhex": [{"perfil": "Mastermind", "afinidade": 90}]}, Settings(openai_api_key=None), agora=AGORA
    )

    perfil = chamada.await_args.kwargs["payload"]["perfil"]
    assert perfil["tom_voz"] == modulo._JEITO_NA_NOTIFICACAO["Mastermind"]["tom_voz"]
    assert perfil["guia_nome"] == "Idris"
    texto = str(perfil).lower()
    assert "marcadores" not in texto and "hipótese" not in texto and "evidência" not in texto


def test_marcacao_do_cadastro_sai_do_nome_do_topico() -> None:
    foco = modulo._foco({"foco_estudo": {"topico": "[MOCK] Aceleração", "proximo_conteudo": "[rascunho] Gráficos do MUV"}})
    assert foco["topico"] == "Aceleração" and foco["proximo_conteudo"] == "Gráficos do MUV"


@pytest.mark.asyncio
async def test_texto_recusado_volta_ao_modelo_uma_vez_com_os_problemas(monkeypatch) -> None:
    _rag(monkeypatch, True)
    ruim = _gerada(titulo="Próxima hipótese", corpo="A evidência apoia a progressão do modelo.")
    bom = _gerada(titulo="Um passo de cada vez", corpo="Faça só um item de Frações hoje. Vai no seu ritmo.")
    chamada = AsyncMock(side_effect=[ruim, bom])
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", chamada)

    r = await modulo.agente_notificacao({**ESTADO, "foco_estudo": FOCO}, Settings(openai_api_key=None), agora=AGORA)

    assert [c.kwargs["use_rag"] for c in chamada.await_args_list] == [True, False]
    revisar = chamada.await_args_list[1].kwargs["payload"]["revisar"]
    assert revisar["corpo"] == ruim.corpo and any("evidencia" in p for p in revisar["problemas"])
    n = r["notificacao_payload"]
    assert n["corpo"] == bom.corpo
    assert n["contexto"]["origem"] == "rag" and n["contexto"]["revisado"] is True


@pytest.mark.asyncio
async def test_revisao_ainda_errada_vira_o_texto_pronto_do_perfil(monkeypatch) -> None:
    _rag(monkeypatch, False)
    ruim = _gerada(titulo="Otimize seu modelo", corpo="Consolide o bloco.")
    chamada = AsyncMock(side_effect=[ruim, ruim])
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", chamada)

    r = await modulo.agente_notificacao({**ESTADO, "foco_estudo": FOCO}, Settings(openai_api_key=None), agora=AGORA)

    assert chamada.await_count == 2  # o texto e uma revisão; não insiste além disso
    n = r["notificacao_payload"]
    assert n["contexto"]["origem"] == "regra"
    assert n["contexto"]["texto_do_modelo_recusado"]
    assert modulo.problemas_do_texto(n["titulo"], n["corpo"], {"topico": "Frações"}) == []


# --- a marca da guarda vai junto (20261102_24) ----------------------------------


@pytest.mark.asyncio
async def test_todo_texto_sai_com_a_versao_da_guarda(monkeypatch) -> None:
    _rag(monkeypatch, False)
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", AsyncMock(return_value=_gerada(evidencia=None)))
    do_modelo = (await modulo.agente_notificacao(ESTADO, Settings(openai_api_key=None), agora=AGORA))["notificacao_payload"]
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", AsyncMock(side_effect=StructuredOutputError("x")))
    da_regra = (await modulo.agente_notificacao(ESTADO, Settings(openai_api_key=None), agora=AGORA))["notificacao_payload"]

    assert do_modelo["contexto"]["origem"] == "modelo" and da_regra["contexto"]["origem"] == "regra"
    for n in (do_modelo, da_regra):
        assert n["contexto"]["texto_guarda"] == modulo.TEXTO_GUARDA_VERSAO


def test_guarda_aceita_um_nome_e_recusa_outros_marcadores():
    from app.agent.graph.nodes.agente_notificacao import problemas_do_texto

    assert problemas_do_texto("Bora ver, {nome}?", "Os gráficos estão prontos.") == []
    assert problemas_do_texto("Oi, {nome}", "Vamos, {nome}?")
    assert problemas_do_texto("Oi", "Veja {topico} hoje.")
