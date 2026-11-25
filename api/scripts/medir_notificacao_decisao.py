"""Mede a guarda das notificações com e sem o gemini-decision-1 nos casos de `tests/avaliacao` (gasta cota).

    cd api && .venv/bin/python scripts/medir_notificacao_decisao.py

Uma chamada ao Decision por caso que a guarda exata aprova. Em 24/11: 28 de 34 só com a guarda exata,
34 de 34 com as duas (as perguntas foram reescritas uma vez olhando estes casos).
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agent.graph.nodes.agente_notificacao import _recusa, problemas_do_texto  # noqa: E402
from app.core.settings import get_settings  # noqa: E402

PASTA = Path(__file__).resolve().parents[1] / "tests" / "avaliacao"


async def main() -> None:
    casos = json.loads((PASTA / "casos.json").read_text(encoding="utf-8"))["notificacao"]
    settings = get_settings()
    exata = junto = 0
    for caso in casos:
        so_exata = not problemas_do_texto(caso["titulo"], caso["corpo"])
        com_decisao = not await _recusa(caso["titulo"], caso["corpo"], None, settings)
        exata += so_exata == caso["aprova"]
        junto += com_decisao == caso["aprova"]
        marca = "ok " if com_decisao == caso["aprova"] else "ERRO"
        print(f"{marca} aprova={caso['aprova']!s:5} exata={so_exata!s:5} com_decisao={com_decisao!s:5} {caso['corpo']}")
    print(f"\nsó a guarda exata {exata}/{len(casos)} · com o Decision {junto}/{len(casos)}")


if __name__ == "__main__":
    asyncio.run(main())
