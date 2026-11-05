"""Casos fixos contra as guardas determinísticas: sem modelo e sem cota.

Para ver se uma mudança de guarda melhorou, rode com `-s` e leia o placar. O juiz de grounding fica de
fora: ele é um modelo, e medi-lo gasta a cota. Caso em `erros_conhecidos.json` é furo aberto: o teste
exige que continue errando, para que o conserto apareça e o caso saia de lá.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any

import pytest

from app.agent.graph.nodes.agente_notificacao import problemas_do_texto
from app.schemas.escriba import EscribaSaida
from app.services.escriba import checar_refs_existem
from app.services.guia_do_app import montar_resposta_do_guia
from app.services.respostas_do_guia import resposta_sem_modelo

PASTA = Path(__file__).parent / "avaliacao"
CASOS: dict[str, list[dict[str, Any]]] = json.loads((PASTA / "casos.json").read_text(encoding="utf-8"))
CONHECIDOS: list[str] = json.loads((PASTA / "erros_conhecidos.json").read_text(encoding="utf-8"))


def _notificacao(caso: dict[str, Any]) -> bool:
    return (not problemas_do_texto(caso["titulo"], caso["corpo"])) == caso["aprova"]


def _guia(caso: dict[str, Any]) -> bool:
    saida = resposta_sem_modelo(caso["pergunta"])
    destinos = montar_resposta_do_guia(saida, lambda texto: texto)["destinos"] if saida else [None]
    return destinos == [caso["destino"]]


def _lumi(caso: dict[str, Any]) -> bool:
    saida = EscribaSaida.model_validate({"resposta": caso["resposta"]})
    contexto = {"nomes_por_ref": {ref: "x" for ref in caso["refs"]}}
    return (checar_refs_existem(saida, contexto) is None) == caso["aprova"]


GUARDAS = {"notificacao": _notificacao, "guia_sem_modelo": _guia, "lumi_refs": _lumi}


def _id(guarda: str, caso: dict[str, Any]) -> str:
    return f"{guarda}: {caso.get('corpo') or caso.get('pergunta') or caso.get('resposta')}"


TODOS = [(guarda, caso) for guarda, casos in CASOS.items() for caso in casos]


@pytest.mark.parametrize(("guarda", "caso"), TODOS, ids=[_id(*item) for item in TODOS])
def test_caso(guarda: str, caso: dict[str, Any]) -> None:
    acertou = GUARDAS[guarda](caso)

    if _id(guarda, caso) in CONHECIDOS:
        assert not acertou, "a guarda passou a acertar: tire o caso de erros_conhecidos.json"
    else:
        assert acertou, caso.get("nota", "")


def test_erro_conhecido_existe_nos_casos() -> None:
    assert set(CONHECIDOS) <= {_id(*item) for item in TODOS}


def test_placar() -> None:
    placar: Counter[str] = Counter()
    for guarda, caso in TODOS:
        placar[f"{guarda} {'acerto' if GUARDAS[guarda](caso) else 'erro'}"] += 1
    print("\nplacar das guardas:", dict(sorted(placar.items())))

    assert set(CASOS) == set(GUARDAS)
