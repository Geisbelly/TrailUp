"""Os Guardiões conhecem o app do aluno e levam às telas certas, sem inventar tela."""

import re
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.agent.graph.guardrails import checar_grounding_chat
from app.schemas.mentor_chat import GroundingJudgment, MentorChatLLMResult, SecaoDoGuia
from app.services.escriba import guia_do_produto
from app.services.guia_do_app import (
    DESTINOS_DO_APP,
    MAX_DESTINOS,
    TUTORIAIS_DO_APP,
    destinos_do_app_validos,
    guia_do_app,
    montar_resposta_do_guia,
)

RAIZ = Path(__file__).resolve().parents[2]
PROMPT = RAIZ / "api" / "app" / "agent" / "prompts" / "mentor_personalizacao_chat.txt"
DESTINOS_TS = RAIZ / "mobile" / "src" / "utils" / "destinosDoGuia.ts"


def _rotas_do_mobile() -> dict[str, str]:
    texto = DESTINOS_TS.read_text(encoding="utf-8")
    pares = re.findall(r'^\s*"?([a-z_.]+)"?: \{ rotulo: "[^"]+", rota: "([^"]+)" \},$', texto, re.M)
    return dict(pares)


def test_destinos_tem_paridade_com_o_mobile() -> None:
    assert set(_rotas_do_mobile()) == DESTINOS_DO_APP


@pytest.mark.parametrize("destino", sorted(DESTINOS_DO_APP))
def test_cada_destino_aponta_para_uma_tela_que_existe(destino: str) -> None:
    rota = _rotas_do_mobile()[destino].removeprefix("/(tabs)").strip("/")
    base = RAIZ / "mobile" / "src" / "app" / "(tabs)"
    assert (base / f"{rota or 'index'}.tsx").exists() or (base / rota / "index.tsx").exists()


def test_prompt_lista_exatamente_os_destinos_validos() -> None:
    linha = next(x for x in PROMPT.read_text(encoding="utf-8").splitlines() if "codigos desta lista" in x)
    trecho = linha.split("e so eles:")[1].split(". O app")[0]
    assert {c.strip() for c in trecho.split(",")} == DESTINOS_DO_APP


def test_destinos_descarta_invencao_repete_nada_e_limita() -> None:
    assert destinos_do_app_validos(None) == []
    assert destinos_do_app_validos(["perfil.loja", "PERFIL.LOJA", "tela.falsa"]) == ["perfil.loja"]
    assert len(destinos_do_app_validos(sorted(DESTINOS_DO_APP))) == MAX_DESTINOS


@pytest.mark.parametrize(
    "tela", ["Trilha", "Notificações", "Social", "Ranking", "Loja", "Coleta e acessos", "Modo foco", "Bag"]
)
def test_guia_cobre_as_telas_do_aluno(tela: str) -> None:
    assert tela in guia_do_app()


def test_guia_diz_que_a_web_e_o_mesmo_app() -> None:
    assert "trailup.vercel.app/aluno/" in guia_do_app()
    # `entradaDoAppAluno` é quem garante essa rota; se ela mudar, o guia mente.
    fonte = RAIZ / "frontend" / "src" / "features" / "signup" / "trilhaIntrodutoria.ts"
    assert "'/aluno/'" in fonte.read_text(encoding="utf-8")


def test_chat_vale_para_todo_perfil() -> None:
    fonte = RAIZ / "mobile" / "src" / "utils" / "brainHexCapabilities.ts"
    assert "hasChat: true," in fonte.read_text(encoding="utf-8")
    assert "tem um Guardião, e o aluno conversa" in " ".join(guia_do_app().split())


def test_a_lumi_recebe_a_mesma_base_do_aluno() -> None:
    assert guia_do_app() in guia_do_produto()


async def test_juiz_recebe_o_guia_para_nao_reprovar_explicacao_do_app() -> None:
    llm = SimpleNamespace(
        ainvoke_structured=AsyncMock(return_value=GroundingJudgment(viola=False))
    )
    await checar_grounding_chat(
        MentorChatLLMResult(reply="A Loja fica no Perfil."),
        {"llm": llm, "conteudo_materia": {}, "guia_do_app": guia_do_app()},
    )
    assert llm.ainvoke_structured.await_args.kwargs["payload"]["guia_do_app"] == guia_do_app()


TUTORIAIS_TS = RAIZ / "mobile" / "src" / "utils" / "tutoriaisDoGuia.ts"


def test_tutoriais_tem_paridade_com_o_mobile_e_com_o_prompt() -> None:
    fonte = TUTORIAIS_TS.read_text(encoding="utf-8")
    assert set(re.findall(r'^\s*id: "([a-z_]+)",$', fonte, re.M)) == TUTORIAIS_DO_APP
    prompt = PROMPT.read_text(encoding="utf-8")
    trecho = prompt.split("Codigos: ")[1].split("\n")[0]
    assert set(re.findall(r"\b[a-z]+_[a-z]+\b", trecho)) == TUTORIAIS_DO_APP


def test_passos_do_tutorial_apontam_para_tela_e_alvo_que_existem() -> None:
    fonte = TUTORIAIS_TS.read_text(encoding="utf-8")
    base = RAIZ / "mobile" / "src" / "app" / "(tabs)"
    for rota in set(re.findall(r'route: "/\(tabs\)/?([^"]*)"', fonte)):
        assert (base / f"{rota or 'index'}.tsx").exists() or (base / rota / "index.tsx").exists(), rota
    codigo = "\n".join(
        p.read_text(encoding="utf-8")
        for p in (RAIZ / "mobile" / "src").rglob("*.tsx")
        if ".test." not in p.name
    )
    for alvo in set(re.findall(r'target: "([a-z_]+)"', fonte)):
        assert f'registrarAlvoTour("{alvo}"' in codigo or f'useAlvoTour("{alvo}"' in codigo, alvo


def _saida(reply: str = "Veja:", secoes=(), destinos=(), tutorial: str = "") -> MentorChatLLMResult:
    return MentorChatLLMResult(reply=reply, secoes=list(secoes), destinos=list(destinos), tutorial=tutorial)


def test_secoes_viram_texto_corrido_para_historico_e_app_antigo() -> None:
    r = montar_resposta_do_guia(
        _saida(secoes=[SecaoDoGuia(titulo="Loja", texto="Compre itens.", destino="perfil.loja")]), lambda t: t
    )
    assert r["reply"] == "Veja:\n\nLoja: Compre itens."
    assert r["introducao"] == "Veja:"
    assert r["secoes"] == [{"titulo": "Loja", "texto": "Compre itens.", "destino": "perfil.loja"}]
    assert r["destinos"] == ["perfil.loja"]


def test_sem_secoes_a_introducao_fica_vazia_e_vale_o_reply() -> None:
    r = montar_resposta_do_guia(_saida(reply="Tudo certo."), lambda t: t)
    assert (r["reply"], r["introducao"], r["secoes"]) == ("Tudo certo.", "", [])


def test_secao_sem_destino_acha_pelo_titulo_e_pelo_texto() -> None:
    r = montar_resposta_do_guia(
        _saida(
            secoes=[
                SecaoDoGuia(titulo="Ranking", texto="Sua posição."),
                SecaoDoGuia(titulo="Câmera", texto="Desligue em Perfil > Coleta e acessos."),
                SecaoDoGuia(titulo="Inventada", texto="Nada de tela aqui.", destino="tela.falsa"),
            ]
        ),
        lambda t: t,
    )
    assert [s["destino"] for s in r["secoes"]] == ["ranking", "perfil.coleta", None]


def test_destino_vem_do_texto_sem_confundir_palavra_comum() -> None:
    citado = montar_resposta_do_guia(_saida(reply="Abra Perfil > Modo foco."), lambda t: t)
    assert citado["destinos"] == ["perfil.modo_foco"]
    comum = montar_resposta_do_guia(_saida(reply="Siga a trilha e melhore seu ranking social."), lambda t: t)
    assert comum["destinos"] == []


def test_placeholder_do_nome_nao_sobra_em_secao() -> None:
    r = montar_resposta_do_guia(
        _saida(reply="Oi, {{nome}}!", secoes=[SecaoDoGuia(titulo="Loja", texto="Boa, {{nome}}.")]),
        lambda t: t.replace("{{nome}}", "Ana"),
    )
    assert "{{nome}}" not in str(r)


def test_tutorial_fora_do_catalogo_e_descartado() -> None:
    assert montar_resposta_do_guia(_saida(tutorial="gastar_moedas"), lambda t: t)["tutorial"] == "gastar_moedas"
    assert montar_resposta_do_guia(_saida(tutorial="inventado"), lambda t: t)["tutorial"] is None


async def test_juiz_le_as_secoes_para_gabarito_nao_passar_por_ali() -> None:
    llm = SimpleNamespace(ainvoke_structured=AsyncMock(return_value=GroundingJudgment(viola=False)))
    await checar_grounding_chat(
        _saida(secoes=[SecaoDoGuia(titulo="Questão 1", texto="A resposta é B.")]),
        {"llm": llm, "conteudo_materia": {}, "guia_do_app": ""},
    )
    assert "A resposta é B." in llm.ainvoke_structured.await_args.kwargs["payload"]["resposta"]
