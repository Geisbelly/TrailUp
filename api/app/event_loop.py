"""Compatibilidade de event loop entre psycopg e o Windows.

`psycopg` v3 em modo assincrono **recusa** o `ProactorEventLoop`, que e o padrao
do Python no Windows desde a 3.8. Quem toca esse caminho e o checkpointer do
LangGraph (`AsyncConnection.connect`), e so quando `LANGGRAPH_DB_URL` esta
preenchida -- entao quem roda local sem a variavel nunca ve o problema, e quem a
tem nao sobe a API de jeito nenhum.

## Por que a politica de event loop nao resolvia

`app/main.py` chamava `asyncio.set_event_loop_policy(WindowsSelectorEventLoopPolicy())`
no import, desde o commit inicial. **Nao adiantava nada**, e a razao e especifica
do uvicorn 0.43:

    def run(self, sockets=None):
        return asyncio_run(self.serve(sockets=sockets),
                           loop_factory=self.config.get_loop_factory())

Passar `loop_factory` para `asyncio.run` **ignora a politica** -- ela so decide
qual loop e criado quando ninguem diz explicitamente. A funcao era codigo morto
com cara de solucao, que e pior que ausencia: quem lesse `main.py` concluiria
que o caso do Windows ja estava tratado.

## O que o uvicorn escolhe

    def asyncio_loop_factory(use_subprocess: bool = False):
        if sys.platform == "win32" and not use_subprocess:
            return asyncio.ProactorEventLoop
        return asyncio.SelectorEventLoop

Ou seja, no Windows:

- **com** `--reload` (ou `--workers`): `use_subprocess=True` -> Selector -> funciona
- **sem** `--reload`: Proactor -> psycopg estoura no startup

Conferido nesta maquina, nas duas formas. O `scripts/dev.ps1` usa `--reload`, o
que explica por que o launcher documentado funciona enquanto o comando cru da
documentacao (`python -m uvicorn app.main:app`) falha.

No Linux nao existe Proactor, entao producao nunca viu isto.
"""

from __future__ import annotations

import asyncio
import sys


def nome_do_loop_em_uso() -> str:
    """Nome da classe do loop corrente, ou string vazia fora de um loop."""
    try:
        return type(asyncio.get_running_loop()).__name__
    except RuntimeError:
        return ""


def loop_incompativel_com_psycopg(nome: str | None = None) -> bool:
    """`True` quando o loop corrente e um que o psycopg async recusa.

    Compara pelo NOME da classe, e nao por `isinstance`: `ProactorEventLoop` so
    existe no Windows, entao importa-lo para comparar quebraria no Linux -- e e
    justamente no Linux que a maior parte dos testes roda.
    """
    alvo = nome_do_loop_em_uso() if nome is None else nome
    return "Proactor" in alvo


def explicar_incompatibilidade(nome: str | None = None) -> str:
    """Mensagem acionavel para trocar o erro cru do psycopg.

    O erro original diz o que esta errado e nao diz o que fazer com isso; quem
    o encontra no startup nao tem por que saber que `--reload` muda o loop.
    """
    atual = nome_do_loop_em_uso() if nome is None else nome
    return (
        f"O checkpointer do LangGraph precisa de SelectorEventLoop, e o loop em "
        f"uso e {atual or 'desconhecido'}. psycopg async recusa o "
        f"ProactorEventLoop, que e o padrao do Python no Windows.\n"
        f"Saidas, em ordem de preferencia:\n"
        f"  1. suba com `python -m app` -- a entrada do pacote forca o loop certo;\n"
        f"  2. ou acrescente `--reload` ao uvicorn: com subprocesso ele escolhe "
        f"SelectorEventLoop;\n"
        f"  3. ou deixe `LANGGRAPH_DB_URL` vazia para cair no MemorySaver, que "
        f"nao persiste o estado do grafo entre reinicios."
    )


def fabrica_de_loop_compativel():
    """Fábrica para passar a `asyncio.run(..., loop_factory=...)`.

    Devolve `SelectorEventLoop` em toda plataforma. No Linux ele ja e o padrao,
    entao pedir explicitamente nao muda nada; no Windows e a diferenca entre
    subir e nao subir.
    """
    return asyncio.SelectorEventLoop()


def precisa_forcar_loop() -> bool:
    return sys.platform == "win32"
