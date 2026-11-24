"""O Guia e a Lumi de quem avalia o TrailUp sabem o roteiro, o progresso e as anotações dele.

Só nas contas de avaliador (`pesquisa_avaliador`): para qualquer outra conta, o payload não muda.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import personalizacao as rota
from app.schemas.escriba import EscribaSaida, PerguntaEscriba
from app.services import avaliacao_trailup as av
from app.services import escriba
from app.services.escriba import EscribaService
from app.services.llm import load_prompt
from tests.test_chat_guia_registros_rota import _pedido, _preparar

PROFESSOR = "9b1c2d3e-0000-4000-8000-0000000000aa"


class _Resultado:
    def __init__(self, linhas: list[dict]) -> None:
        self.linhas = linhas

    def mappings(self):
        return self

    def first(self):
        return self.linhas[0] if self.linhas else None

    def __iter__(self):
        return iter(self.linhas)


class _Sessao:
    """Devolve as linhas pela tabela que a consulta lê."""

    def __init__(self, avaliador=None, marcas=(), anotacoes=(), falha=None) -> None:
        self.respostas = {
            "pesquisa_avaliador": [avaliador] if avaliador else [],
            "pesquisa_roteiro_marca": list(marcas),
            "pesquisa_anotacao": list(anotacoes),
        }
        self.falha = falha
        self.consultas: list[str] = []

    @asynccontextmanager
    async def begin_nested(self):
        yield

    async def execute(self, sql, params=None):
        texto = str(sql)
        self.consultas.append(texto)
        if self.falha:
            raise self.falha
        for tabela, linhas in self.respostas.items():
            if f"public.{tabela}" in texto:
                return _Resultado(linhas)
        return _Resultado([])


AVALIADOR = {"id": 3, "papel": "aluno", "classe_id": 40}
ANOTACAO = {
    "etapa": "t7",
    "plataforma": "app",
    "texto": "O cronômetro sumiu depois da pausa. Falar com joao@exemplo.com",
    "criada_em": datetime(2026, 11, 24, 10, tzinfo=UTC),
}


# ---------------------------------------------------------------- o bloco


def test_roteiro_tem_as_onze_etapas_na_ordem_do_video() -> None:
    etapas = av.etapas_do_roteiro()
    assert [e["id"] for e in etapas] == [
        "video", "t1", "t2", "t3", "t4", "t5", "t6", "aluno-acesso", "t7", "t8", "blocos",
    ]
    assert all(e["passos"] for e in etapas)


def test_bloco_marca_o_feito_e_aponta_a_proxima() -> None:
    bloco = av.montar_avaliacao("professor", [{"etapa": "video"}, {"etapa": "t1"}], [])
    assert (bloco["feitas"], bloco["total"]) == (2, 11)
    assert bloco["proxima_etapa"] == {"id": "t2", "titulo": "Explorar a trilha"}
    assert bloco["papel_desta_conta"] == "professor"
    assert next(e for e in bloco["etapas"] if e["id"] == "t1")["onde"] == "no console do professor"


def test_tudo_feito_nao_tem_proxima() -> None:
    marcas = [{"etapa": e["id"]} for e in av.etapas_do_roteiro()]
    assert av.montar_avaliacao("aluno", marcas, [])["proxima_etapa"] is None


def test_anotacao_vai_mascarada_e_cortada() -> None:
    longa = {**ANOTACAO, "texto": "x" * 2000}
    bloco = av.montar_avaliacao("aluno", [], [ANOTACAO, longa, {**ANOTACAO, "texto": "   "}])
    assert len(bloco["anotacoes"]) == 2
    assert "joao@exemplo.com" not in bloco["anotacoes"][0]["texto"]
    assert "[email]" in bloco["anotacoes"][0]["texto"]
    assert len(bloco["anotacoes"][1]["texto"]) == av.MAX_CARACTERES_DA_ANOTACAO
    assert bloco["anotacoes"][0]["quando"].startswith("2026-11-24")


# ---------------------------------------------------------------- a leitura


@pytest.mark.asyncio
async def test_quem_nao_e_avaliador_recebe_none() -> None:
    sessao = _Sessao()
    assert await av.contexto_da_avaliacao(sessao, PROFESSOR) is None
    assert len(sessao.consultas) == 1  # nem lê marcas nem anotações


@pytest.mark.asyncio
async def test_avaliador_recebe_roteiro_marcas_e_anotacoes() -> None:
    sessao = _Sessao(AVALIADOR, [{"etapa": "video"}], [ANOTACAO])
    bloco = await av.contexto_da_avaliacao(sessao, PROFESSOR)
    assert bloco["papel_desta_conta"] == "aluno"
    assert bloco["feitas"] == 1
    assert bloco["anotacoes"][0]["etapa"] == "t7"


@pytest.mark.asyncio
async def test_falha_de_leitura_nao_derruba_o_chat() -> None:
    assert await av.contexto_da_avaliacao(_Sessao(falha=RuntimeError("relation does not exist")), PROFESSOR) is None
    assert await av.contexto_da_avaliacao(None, PROFESSOR) is None
    assert await av.contexto_da_avaliacao(_Sessao(AVALIADOR), "") is None


# ---------------------------------------------------------------- o Guia


def test_guia_do_avaliador_recebe_o_bloco(app, monkeypatch) -> None:
    pedidos, _ = _preparar(app, monkeypatch)
    bloco = av.montar_avaliacao("aluno", [{"etapa": "video"}], [])
    monkeypatch.setattr(rota, "contexto_da_avaliacao", AsyncMock(return_value=bloco))

    with TestClient(app) as client:
        resposta = client.post("/api/v1/personalizar/chat", json=_pedido("qual é a próxima tarefa?"))

    assert resposta.status_code == 200, resposta.text
    assert pedidos[-1]["avaliacao_trailup"] == bloco
    # Antes da memória e da mensagem: o que muda a cada pergunta fica no fim (cache).
    chaves = list(pedidos[-1])
    assert chaves.index("avaliacao_trailup") < chaves.index("memoria_do_guia") < chaves.index("mensagem")


def test_guia_de_quem_nao_avalia_fica_como_era(app, monkeypatch) -> None:
    pedidos, _ = _preparar(app, monkeypatch)
    monkeypatch.setattr(rota, "contexto_da_avaliacao", AsyncMock(return_value=None))

    with TestClient(app) as client:
        client.post("/api/v1/personalizar/chat", json=_pedido())

    assert "avaliacao_trailup" not in pedidos[-1]


# ---------------------------------------------------------------- a Lumi

TURMAS = [{"id": 54, "descricao": "Turma de demonstração"}]


def _lumi(monkeypatch, bloco):
    llm = AsyncMock()
    llm.ainvoke_structured.return_value = EscribaSaida(resposta="ok")
    service = EscribaService(_Sessao(), llm)
    monkeypatch.setattr(service, "turmas_do_professor", AsyncMock(return_value=TURMAS))
    monkeypatch.setattr(service, "contexto_da_turma", AsyncMock(return_value={"turma": "x", "alunos": []}))
    monkeypatch.setattr(escriba, "contexto_da_avaliacao", AsyncMock(return_value=bloco))
    return service, llm


@pytest.mark.asyncio
@pytest.mark.parametrize("pergunta", ["Quem precisa de atenção?", "como usar a aba de economia?"])
async def test_lumi_do_avaliador_recebe_o_bloco_nos_dois_caminhos(monkeypatch, pergunta) -> None:
    bloco = av.montar_avaliacao("professor", [], [])
    service, llm = _lumi(monkeypatch, bloco)

    await service.perguntar(PROFESSOR, PerguntaEscriba(pergunta=pergunta, classe_id=54))

    assert llm.ainvoke_structured.await_args.kwargs["payload"]["avaliacao_trailup"] == bloco


@pytest.mark.asyncio
async def test_lumi_de_quem_nao_avalia_fica_como_era(monkeypatch) -> None:
    service, llm = _lumi(monkeypatch, None)

    await service.perguntar(PROFESSOR, PerguntaEscriba(pergunta="Quem precisa de atenção?", classe_id=54))

    assert "avaliacao_trailup" not in llm.ainvoke_structured.await_args.kwargs["payload"]


# ---------------------------------------------------------------- os prompts


@pytest.mark.parametrize("prompt", ["mentor_personalizacao_chat.txt", "escriba.txt", "mentor_grounding_check.txt"])
def test_prompts_proibem_sugerir_nota_ou_opiniao(prompt) -> None:
    texto = load_prompt(prompt)
    assert "avaliacao_trailup" in texto
    assert "opiniao" in texto and "nota" in texto
