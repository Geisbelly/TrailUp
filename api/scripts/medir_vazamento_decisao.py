"""Mede `checar_vazamento_por_decisao` contra os casos de `tests/avaliacao` (gasta cota: uma chamada por caso).

    cd api && .venv/bin/python scripts/medir_vazamento_decisao.py

Os casos são os de `vazamento_exato` em `casos.json`, com o gabarito de `gabarito_vazamento.json`. Imprime a
probabilidade de cada um e o placar ao lado do da comparação exata. Em 24/11: 21 de 21, contra 11.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agent.graph.guardrails import checar_vazamento_por_decisao  # noqa: E402
from app.core.settings import get_settings  # noqa: E402
from app.schemas.mentor_chat import MentorChatLLMResult  # noqa: E402
from app.services.contexto_chat_materia import gabarito_na_resposta  # noqa: E402

PASTA = Path(__file__).resolve().parents[1] / "tests" / "avaliacao"


async def main() -> None:
    casos = json.loads((PASTA / "casos.json").read_text(encoding="utf-8"))["vazamento_exato"]
    gabarito = json.loads((PASTA / "gabarito_vazamento.json").read_text(encoding="utf-8"))
    contexto = {"gabarito_protegido": gabarito, "settings": get_settings()}
    exata = decisao = 0
    for caso in casos:
        fala = MentorChatLLMResult(reply=caso["resposta"], should_close=False, hinted_actions=[])
        barrou = await checar_vazamento_por_decisao(fala, contexto) is not None
        copiou = gabarito_na_resposta(caso["resposta"], gabarito) is not None
        exata += copiou == caso["vaza"]
        decisao += barrou == caso["vaza"]
        marca = "ok " if barrou == caso["vaza"] else "ERRO"
        print(f"{marca} vaza={caso['vaza']!s:5} barrou={barrou!s:5} {caso.get('nota', '')}")
    print(f"\ncomparação exata {exata}/{len(casos)} · decisão {decisao}/{len(casos)}")


if __name__ == "__main__":
    asyncio.run(main())
