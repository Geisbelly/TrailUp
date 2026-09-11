"""Entrada da API: `python -m app`.

Existe porque `python -m uvicorn app.main:app` **não sobe no Windows** quando
`LANGGRAPH_DB_URL` está preenchida. O uvicorn 0.43 escolhe `ProactorEventLoop`
no Windows sempre que não há subprocesso, e o psycopg async recusa esse loop --
o detalhe inteiro está em `app/event_loop.py`.

Aqui o servidor roda dentro de um `asyncio.run` **nosso**, com a fábrica de loop
explícita. `Server.run()` do uvicorn faria o mesmo passando a fábrica dele; a
única diferença é qual fábrica.

Em modo `--reload` a execução é delegada ao `uvicorn.run`: lá quem sobe o
servidor é um supervisor que respawna processos filhos, e esse caminho já
escolhe `SelectorEventLoop` por conta própria. Reimplementá-lo aqui seria uma
segunda cópia de uma máquina que já funciona.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

import uvicorn

from app.event_loop import fabrica_de_loop_compativel, precisa_forcar_loop


def _argumentos(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m app", description="Sobe a API do TrailUp.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true")
    parser.add_argument("--log-level", default="info")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _argumentos(argv)

    if args.reload:
        # O supervisor de reload sobe processos filhos e ja escolhe
        # SelectorEventLoop no Windows. Delegar e' mais seguro que recriar.
        uvicorn.run(
            "app.main:app",
            host=args.host,
            port=args.port,
            reload=True,
            log_level=args.log_level,
        )
        return 0

    config = uvicorn.Config(
        "app.main:app",
        host=args.host,
        port=args.port,
        log_level=args.log_level,
    )
    servidor = uvicorn.Server(config)

    if precisa_forcar_loop():
        # `Server.run()` passaria a fabrica do uvicorn, que aqui devolveria
        # ProactorEventLoop. Rodar `serve()` dentro do nosso `asyncio.run` e' o
        # que troca a fabrica sem tocar no uvicorn.
        asyncio.run(servidor.serve(), loop_factory=fabrica_de_loop_compativel)
        return 0

    servidor.run()
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
