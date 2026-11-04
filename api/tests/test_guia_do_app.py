"""Os Guardiões conhecem o app do aluno e levam às telas certas, sem inventar tela."""

import re
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.agent.graph.guardrails import checar_grounding_chat
from app.schemas.mentor_chat import GroundingJudgment, MentorChatLLMResult
from app.services.escriba import guia_do_produto
from app.services.guia_do_app import DESTINOS_DO_APP, destinos_do_app_validos, guia_do_app

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
    assert len(destinos_do_app_validos(sorted(DESTINOS_DO_APP))) == 3


@pytest.mark.parametrize(
    "tela", ["Trilha", "Notificações", "Social", "Ranking", "Loja", "Coleta e acessos", "Modo foco", "Bag"]
)
def test_guia_cobre_as_telas_do_aluno(tela: str) -> None:
    assert tela in guia_do_app()


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
