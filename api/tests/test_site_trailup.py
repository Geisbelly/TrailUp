"""O Guia e a Lumi conhecem o site: páginas, Diário, vídeos, cartilha da pesquisa e monografia.

O modelo recebe sempre o mapa (estático, no começo do payload) e, quando a pergunta casa, os trechos
das seções que importam, escolhidos por palavra e sem chamada de modelo. Aqui fica o que o código
garante: a cópia do site está completa, a escolha acerta as perguntas de referência e não puxa nada
em pergunta da matéria, o orçamento vale, e os trechos chegam ao Guia, ao juiz e à Lumi.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.agent.graph import guardrails
from app.schemas.mentor_chat import MentorChatLLMResult
from app.services import escriba
from app.services import site_trailup as site
from app.services.llm import PROMPTS_DIR, load_prompt
from tests.test_chat_guia_registros_rota import _pedido, _preparar
from tests.test_guia_pontes_e_postura import _juiz_capturado

# (pergunta, seção que tem de vir primeiro)
REFERENCIA = [
    ("onde vejo o vídeo do primeiro acesso?", "video/guia"),
    ("o que é o perfil seeker?", "diario/seeker"),
    ("tem algum artigo no blog sobre brainhex?", "diario/brainhex"),
    ("como baixar o app no android?", "pagina/download/1"),
    ("posso usar o app sendo menor de idade?", "pagina/privacidade/4"),
    ("o que a monografia concluiu?", "monografia/10"),
]
DA_MATERIA = [
    "não entendi o que é uma função derivada",
    "me explica recursão com exemplo",
    "qual a diferença entre lista e vetor?",
    "o que é fotossíntese",
    "Como estao a Ana Clara Souza e o Bruno?",
]


def _id(titulo: str) -> str:
    _, secoes = site._site()
    return next(s.id for s in secoes if s.titulo == titulo)


# ---------------------------------------------------------------- a cópia


def test_copia_do_site_tem_diario_videos_paginas_e_monografia() -> None:
    dados = json.loads((PROMPTS_DIR / "site_trailup.json").read_text(encoding="utf-8"))
    assert dados["base"] == "https://trailup.vercel.app"
    ids = {s["id"] for s in dados["secoes"]}
    for esperado in ("diario/brainhex", "diario/pesquisa-tcc", "video/passo-a-passo", "pagina/sobre/0"):
        assert esperado in ids
    urls = {s["url"] for s in dados["secoes"]}
    assert {"/", "/sobre", "/download", "/contato", "/pesquisa/professores", "/privacidade", "/termos"} <= urls
    _, secoes = site._site()
    assert sum(1 for s in secoes if s.tipo == "monografia") >= 8


def test_resumo_da_monografia_respeita_o_que_o_trabalho_nao_afirma() -> None:
    texto = load_prompt("monografia_trailup.md")
    assert "Não mede efeito sobre a aprendizagem" in texto
    assert "ainda não foi usado por uma turma" in texto
    assert "não foi usado em sala" in texto
    assert "heurísticas" in texto
    assert "PRISMA" not in texto


def test_indice_tem_endereco_de_cada_pagina_artigo_e_video() -> None:
    indice = site.indice_do_site()
    texto = json.dumps(indice, ensure_ascii=False)
    assert indice["endereco"] == "https://trailup.vercel.app"
    assert "https://trailup.vercel.app/blog/brainhex" in texto
    assert "https://trailup.vercel.app/videos/guia" in texto
    assert "https://trailup.vercel.app/pesquisa/professores" in texto
    # Só títulos e endereços: o índice vai a toda pergunta.
    assert len(texto) < 5000


# ---------------------------------------------------------------- a escolha


@pytest.mark.parametrize(("pergunta", "esperado"), REFERENCIA)
def test_pergunta_sobre_o_site_traz_a_secao_certa_primeiro(pergunta: str, esperado: str) -> None:
    trechos = site.trechos_do_site(pergunta)
    assert trechos, pergunta
    assert _id(trechos[0]["titulo"]) == esperado
    assert trechos[0]["endereco"].startswith("https://trailup.vercel.app/")


@pytest.mark.parametrize("pergunta", DA_MATERIA)
def test_pergunta_da_materia_nao_puxa_o_site(pergunta: str) -> None:
    assert site.trechos_do_site(pergunta) == []


def test_orcamento_dos_trechos() -> None:
    for pergunta, _ in REFERENCIA + [("como funciona a pesquisa com professores e o que vou avaliar?", "")]:
        trechos = site.trechos_do_site(pergunta)
        assert len(trechos) <= site.MAX_TRECHOS
        assert sum(len(t["texto"]) for t in trechos) <= site.MAX_CARACTERES_DOS_TRECHOS
        assert all(len(t["texto"]) <= site.MAX_CARACTERES_POR_TRECHO for t in trechos)


def test_continuacao_usa_a_pergunta_anterior() -> None:
    # Sozinha, a continuação não casa com nada.
    assert site.trechos_do_site("e onde eu leio mais sobre ele?") == []
    trechos = site.trechos_da_conversa("e onde eu leio mais sobre ele?", ["o que é o perfil seeker?"])
    assert trechos and _id(trechos[0]["titulo"]) == "diario/seeker"


def test_radical_junta_plural_e_conjugacao() -> None:
    assert site.palavras("perfis vídeos conclusão concluiu TCC") == ["perfil", "video", "conclu", "conclu", "tcc"]


# ---------------------------------------------------------------- o Guia e o juiz


def test_site_chega_ao_guia_e_ao_juiz(app, monkeypatch) -> None:
    pedidos, _ = _preparar(app, monkeypatch)
    julgados = _juiz_capturado(monkeypatch)

    with TestClient(app) as client:
        resposta = client.post("/api/v1/personalizar/chat", json=_pedido("onde vejo o vídeo do primeiro acesso?"))

    assert resposta.status_code == 200, resposta.text
    pedido = pedidos[-1]
    assert pedido["site_trailup"] == site.indice_do_site()
    assert _id(pedido["trechos_do_site"][0]["titulo"]) == "video/guia"
    chaves = list(pedido)
    # O mapa é estático e fica logo atrás do guia; os trechos mudam e ficam perto da mensagem.
    assert chaves.index("site_trailup") < chaves.index("conteudo_materia")
    assert chaves.index("conteudo_materia") < chaves.index("trechos_do_site") < chaves.index("mensagem")
    assert julgados[-1]["trechos_do_site"] == pedido["trechos_do_site"]
    juiz = list(julgados[-1])
    assert juiz.index("site_trailup") < juiz.index("trechos_do_site") < juiz.index("resposta")


def test_pergunta_da_materia_nao_leva_trecho(app, monkeypatch) -> None:
    pedidos, _ = _preparar(app, monkeypatch)
    julgados = _juiz_capturado(monkeypatch)

    with TestClient(app) as client:
        client.post("/api/v1/personalizar/chat", json=_pedido())

    assert "trechos_do_site" not in pedidos[-1]
    assert "trechos_do_site" not in julgados[-1]
    assert "site_trailup" in pedidos[-1]


@pytest.mark.asyncio
async def test_juiz_sem_site_nao_ganha_as_chaves() -> None:
    llm = AsyncMock()
    llm.ainvoke_structured.return_value = guardrails.GroundingJudgment(viola=False, motivo="")
    await guardrails.checar_grounding_chat(MentorChatLLMResult(reply="oi"), {"llm": llm})
    payload = llm.ainvoke_structured.await_args.kwargs["payload"]
    assert "site_trailup" not in payload and "trechos_do_site" not in payload


# ---------------------------------------------------------------- a Lumi


def test_pergunta_do_site_vai_pelo_caminho_do_produto() -> None:
    for pergunta in (
        "tem algum vídeo sobre o console?",
        "o que diz a monografia?",
        "onde fica a cartilha da pesquisa com professores?",
        "Tem artigo no Diário sobre o BrainHex?",
    ):
        assert escriba.pergunta_de_produto(pergunta), pergunta
    assert not escriba.pergunta_de_produto("quais alunos viram o vídeo?")


def test_trechos_da_lumi_ignoram_pergunta_anterior_que_cita_aluno() -> None:
    falas = [{"papel": "professor", "texto": "Como está a Ana Clara no perfil Seeker?"}]
    assert escriba._trechos("e onde eu leio mais sobre ele?", falas) == {}
    falas = [{"papel": "professor", "texto": "o que é o perfil seeker?"}]
    assert "trechos_do_site" in escriba._trechos("e onde eu leio mais sobre ele?", falas)


# ---------------------------------------------------------------- os prompts


def test_prompts_dizem_como_usar_o_site() -> None:
    guia = load_prompt("mentor_personalizacao_chat.txt")
    assert '"trechos_do_site"' in guia and "https://trailup.vercel.app/blog/brainhex" in guia
    assert "nunca diga que o TrailUp ja provou efeito" in guia
    lumi = load_prompt("escriba.txt")
    assert '"trechos_do_site"' in lumi and "endereco completo" in lumi
    juiz = load_prompt("mentor_grounding_check.txt")
    assert "trechos_do_site" in juiz and "usou o RAG em sala" in juiz
