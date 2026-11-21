"""Cache, por processo, de "esta tabela ou coluna existe no schema public?".

Os repositorios perguntam isso ao `information_schema` antes de usar tabela ou coluna que pode
faltar num banco atrasado. Cada um guardava a resposta na propria instancia, mas instancia nasce
a cada sessao: o laco da fila de personalizacao, que abre sessao a cada poucos segundos, refazia
as mesmas perguntas o dia inteiro (~380 mil vezes cada uma, medido em 20/11 no
`pg_stat_statements`).

O que existe fica guardado ate o processo acabar: o schema so muda com migration, e a API roda
as migrations ao subir. O que falta fica guardado por `TTL_AUSENTE_SEC`, para uma migration
aplicada com a API no ar ser vista sem reinicio.
"""

from __future__ import annotations

import time

TTL_AUSENTE_SEC = 300.0

_cache: dict[tuple[str, ...], tuple[bool, float]] = {}


def chave_tabela(tabela: str) -> tuple[str, ...]:
    return ("tabela", tabela)


def chave_coluna(tabela: str, coluna: str) -> tuple[str, ...]:
    return ("coluna", tabela, coluna)


def consultar(chave: tuple[str, ...]) -> bool | None:
    """True/False guardado ainda valido, ou None se precisa perguntar ao banco."""
    item = _cache.get(chave)
    if item is None:
        return None
    existe, quando = item
    if existe:
        return True
    if time.monotonic() - quando < TTL_AUSENTE_SEC:
        return False
    _cache.pop(chave, None)
    return None


def guardar(chave: tuple[str, ...], existe: bool) -> None:
    _cache[chave] = (bool(existe), time.monotonic())


def limpar() -> None:
    _cache.clear()
