"""Regras que valem para toda migracao, aprendidas quebrando.

O render offline do Alembic confere que o SQL e' *gerado*, nao que ele e'
*valido*: um erro de sintaxe em PL/pgSQL passa por todos os testes de texto e so'
aparece no `alembic upgrade`, ou seja, no deploy.

Cada regra aqui existe porque o erro correspondente foi escrito de verdade.
"""

from __future__ import annotations

import re
from pathlib import Path

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"

# `RAISE EXCEPTION 'texto' || expr` -- o `||` logo depois do literal.
RAISE_CONCATENADO = re.compile(r"RAISE\s+(EXCEPTION|WARNING|NOTICE)\s+'[^']*'\s*\|\|")


def _migracoes() -> list[Path]:
    return sorted(p for p in VERSOES.glob("*.py") if p.name != "__init__.py")


def test_ha_migracoes_para_conferir() -> None:
    assert len(_migracoes()) > 10


def test_raise_nao_concatena_o_formato() -> None:
    """Em PL/pgSQL o formato do RAISE tem que ser literal.

    `RAISE EXCEPTION 'x: ' || v` e' erro de sintaxe -- verificado no Postgres:
    `syntax error at or near "||"`. Quem precisa de expressao usa
    `RAISE EXCEPTION USING MESSAGE = <expressao>`.

    A forma com `%` funciona, mas o render do Alembic duplica `%` para `%%`, e
    a mensagem sai errada. `USING MESSAGE` resolve os dois de uma vez.
    """
    culpadas = []
    for caminho in _migracoes():
        texto = caminho.read_text(encoding="utf-8")
        for achado in RAISE_CONCATENADO.finditer(texto):
            linha = texto[: achado.start()].count("\n") + 1
            culpadas.append(f"{caminho.name}:{linha}")

    assert not culpadas, (
        "RAISE com formato concatenado (erro de sintaxe em PL/pgSQL): "
        + ", ".join(culpadas)
    )
