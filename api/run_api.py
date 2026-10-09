"""Launcher da API. Existe por causa do Windows (#173).

No Windows, `python -m uvicorn app.main:app` falha no startup quando
`LANGGRAPH_DB_URL` esta preenchida:

    psycopg.InterfaceError: Psycopg cannot use the 'ProactorEventLoop' to run
    in async mode.

O `psycopg` (v3) em modo assincrono exige `SelectorEventLoop`, e o Python no
Windows usa `ProactorEventLoop` por padrao desde a 3.8. O caminho so e tocado
quando `LANGGRAPH_DB_URL` existe (sem ela o checkpointer cai para
`MemorySaver`), entao quem roda local sem a variavel nunca ve o erro e quem a
tem nao sobe a API de jeito nenhum.

## Por que isto e um launcher, e nao duas linhas no topo de `app/main.py`

Porque la seria TARDE DEMAIS, e isso foi medido, nao deduzido. O uvicorn cria
o loop em `asyncio.run()` e so DEPOIS importa o modulo do app, ja dentro do
loop. Medicao num modulo ASGI de teste que registra o estado no proprio
import:

    no import do modulo do app: "ja havia loop rodando: _UnixSelectorEventLoop"

(Nesta maquina e Unix; no Windows o nome seria `ProactorEventLoop` -- o ponto
e que o loop JA EXISTE.) `asyncio.set_event_loop_policy` depois disso nao
troca o loop em execucao: a politica so vale para loops criados a partir dali.
Entao a troca tem de acontecer antes de o uvicorn comecar, o que exige um
processo que rode nosso codigo primeiro.

`asyncpg`, que e o driver do resto da aplicacao, funciona nos dois loops. O
`psycopg` entra so pelo checkpointer do LangGraph, e e ele que impoe o
selector.

Uso:

    python run_api.py                       # 0.0.0.0:8000
    python run_api.py --reload              # desenvolvimento
    python run_api.py --port 8001 --host 127.0.0.1

Fora do Windows o launcher nao muda nada: ele apenas repassa para o uvicorn.
"""

from __future__ import annotations

import argparse
import asyncio
import sys


def aplicar_politica_de_loop() -> str | None:
    """Troca a politica para selector no Windows. Devolve o que fez, ou None.

    Separada e pura o suficiente para ser testada em qualquer plataforma: o
    teste monkeypatcha `sys.platform` e a propria `asyncio`.
    """
    if sys.platform != "win32":
        return None
    # `getattr(asyncio, "...", None)` NAO devolve None fora do Windows: o
    # `__getattr__` lazy do asyncio tenta resolver de `asyncio.windows_events`
    # e levanta NameError, que o default do getattr nao captura. Descoberto
    # rodando o teste com `sys.platform` falsificado.
    try:
        politica = getattr(asyncio, "WindowsSelectorEventLoopPolicy", None)
    except (AttributeError, NameError):  # pragma: no cover - so fora do Windows
        politica = None
    if politica is None:  # pragma: no cover - Python sem o atributo
        return None
    asyncio.set_event_loop_policy(politica())
    return "WindowsSelectorEventLoopPolicy"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Sobe a API do TrailUp.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true")
    parser.add_argument("--log-level", default="info")
    args = parser.parse_args(argv)

    trocou = aplicar_politica_de_loop()
    if trocou:
        print(f"[run_api] Windows: politica de event loop -> {trocou}", flush=True)

    # Importado AQUI, nao no topo: a politica tem de estar valendo antes de o
    # uvicorn montar qualquer coisa.
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level=args.log_level,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
