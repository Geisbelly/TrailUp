"""O Guia faz ponte com outras matérias, muda de postura e põe a turma antes do aluno.

O comportamento é do modelo; aqui fica o que o código garante: o contexto da turma chega ao
Guia e ao juiz, a pergunta chega ao juiz, a leitura que falha não derruba o chat e os prompts
carregam as regras (ponte média que volta, contraponto sem mentir, censura com a exceção do
próprio material).
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.agent.graph import guardrails
from app.api.v1 import personalizacao as rota
from app.schemas.mentor_chat import MentorChatLLMResult
from app.services import turma_do_chat as turma
from app.services.llm import load_prompt
from tests.test_chat_guia_registros_rota import _pedido, _preparar

LINHA = {
    "materia": "Lógica de Programação",
    "mundo": "Arquipélago dos Algoritmos",
    "subtitulo": "Ilhas que se ligam por pontes de código",
    "descricao_do_mundo": "  Cada ilha   é um tópico.  ",
    "arco": "A turma reconstrói o farol apagado.",
}


class _Sessao:
    def __init__(self, linha=None, falha=None) -> None:
        self.linha, self.falha = linha, falha

    @asynccontextmanager
    async def begin_nested(self):
        yield

    async def execute(self, sql, params=None):
        if self.falha:
            raise self.falha
        linha = self.linha

        class _R:
            def mappings(self):
                return self

            def first(self):
                return linha

        return _R()


# ---------------------------------------------------------------- a leitura


def test_bloco_da_turma_limpa_espacos_e_tira_o_vazio() -> None:
    bloco = turma.montar_turma(LINHA)
    assert bloco["materia"] == "Lógica de Programação"
    assert bloco["tema_do_mapa"]["descricao"] == "Cada ilha é um tópico."
    assert bloco["arco_narrativo"] == "A turma reconstrói o farol apagado."
    sem_tema = turma.montar_turma({"materia": "Física"})
    assert sem_tema == {"materia": "Física"}
    assert turma.montar_turma({}) is None


@pytest.mark.asyncio
async def test_leitura_que_falha_volta_none() -> None:
    assert await turma.contexto_da_turma(_Sessao(LINHA), 40) == turma.montar_turma(LINHA)
    assert await turma.contexto_da_turma(_Sessao(falha=RuntimeError("relation does not exist")), 40) is None
    assert await turma.contexto_da_turma(_Sessao(None), 40) is None
    assert await turma.contexto_da_turma(None, 40) is None


# ---------------------------------------------------------------- o Guia e o juiz


def _juiz_capturado(monkeypatch) -> list[dict]:
    """Guarda o payload do juiz além do pedido do Guia que `_preparar` já guarda."""
    julgados: list[dict] = []
    original = rota.JsonLLMService.ainvoke_structured

    async def capturar(self, *, prompt_name, payload, schema, **kwargs):
        if prompt_name == "mentor_grounding_check.txt":
            julgados.append(payload)
        return await original(self, prompt_name=prompt_name, payload=payload, schema=schema, **kwargs)

    monkeypatch.setattr(rota.JsonLLMService, "ainvoke_structured", capturar)
    return julgados


def test_turma_chega_ao_guia_no_comeco_e_ao_juiz(app, monkeypatch) -> None:
    pedidos, _ = _preparar(app, monkeypatch)
    julgados = _juiz_capturado(monkeypatch)
    bloco = turma.montar_turma(LINHA)
    monkeypatch.setattr(rota, "contexto_da_turma", AsyncMock(return_value=bloco))

    with TestClient(app) as client:
        resposta = client.post("/api/v1/personalizar/chat", json=_pedido("isso tem a ver com física?"))

    assert resposta.status_code == 200, resposta.text
    assert pedidos[-1]["turma"] == bloco
    chaves = list(pedidos[-1])
    # Muda pouco: vem antes do conteúdo do tópico e bem antes da mensagem (cache).
    assert chaves.index("turma") < chaves.index("conteudo_materia") < chaves.index("mensagem")
    assert julgados[-1]["turma"] == bloco
    # O juiz vê a pergunta, antes da resposta, e sem o nome do aluno.
    assert julgados[-1]["mensagem"] == "isso tem a ver com física?"
    juiz = list(julgados[-1])
    assert juiz.index("mensagem") < juiz.index("resposta")


def test_sem_turma_o_payload_fica_como_era(app, monkeypatch) -> None:
    pedidos, _ = _preparar(app, monkeypatch)
    julgados = _juiz_capturado(monkeypatch)
    monkeypatch.setattr(rota, "contexto_da_turma", AsyncMock(return_value=None))

    with TestClient(app) as client:
        client.post("/api/v1/personalizar/chat", json=_pedido())

    assert "turma" not in pedidos[-1]
    assert "turma" not in julgados[-1]


@pytest.mark.asyncio
async def test_juiz_sem_turma_nem_mensagem_nao_ganha_as_chaves() -> None:
    llm = AsyncMock()
    llm.ainvoke_structured.return_value = guardrails.GroundingJudgment(viola=False, motivo="")
    await guardrails.checar_grounding_chat(MentorChatLLMResult(reply="oi"), {"llm": llm})
    payload = llm.ainvoke_structured.await_args.kwargs["payload"]
    assert "turma" not in payload and "mensagem" not in payload


# ---------------------------------------------------------------- os prompts


def test_prompt_do_guia_tem_ponte_postura_hierarquia_e_censura() -> None:
    texto = load_prompt("mentor_personalizacao_chat.txt")
    for trecho in ("PONTES COM OUTRAS MATERIAS", "ela volta", "HIERARQUIA DAS ANALOGIAS", "POSTURA", "CENSURA"):
        assert trecho in texto
    # Contraponto sem mentir, e nunca julgando palpite de questão.
    assert "o contraponto nunca mente" in texto
    assert "sem dizer se o palpite esta certo ou errado" in texto
    # A exceção do próprio material, para não barrar biologia ou história.
    assert "se o proprio material do topico trata do assunto" in texto
    # A regra antiga, que proibia qualquer ponte, saiu.
    assert "nao traga assunto que o material nao cobre" not in texto


def test_prompt_do_juiz_aceita_a_ponte_e_reprova_fuga_mentira_e_improprio() -> None:
    texto = load_prompt("mentor_grounding_check.txt")
    assert "vira aula de outro assunto" in texto
    assert "concorda com uma afirmacao errada do aluno" in texto
    assert "conteudo improprio" in texto
    assert "uma ponte curta com" in texto
    assert "So nao viola quando o proprio" in texto
