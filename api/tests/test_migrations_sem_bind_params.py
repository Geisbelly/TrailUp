"""Nenhuma migration pode mandar `:nome` cru para `op.execute(str)`.

Online, o Alembic embrulha a string em `sqlalchemy.text()`, que lê `:nome` como bind param: sem valor,
o `upgrade head` do boot quebra (`A value is required for bind parameter ...`), tudo volta no rollback e a
API entra em loop de 502. Offline (`--sql`) o mesmo bind vira `NULL` em silêncio. Foi o que aconteceu com
`(?:public|...)` na `20261024_07`. Escreva `\\:` (ou evite o `:`) quando o SQL precisar de `:` literal.

Aqui cada migration roda com um `op` falso que só guarda o que iria para `execute`; nada toca banco.
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path
from unittest import mock

import pytest
from sqlalchemy import text

import alembic

VERSIONS = Path(__file__).resolve().parents[1] / "alembic" / "versions"
MIGRATIONS = sorted(p for p in VERSIONS.glob("*.py") if not p.name.startswith("__"))


def _sql_executado(caminho: Path, funcao: str, *, estrito: bool = False) -> list[str]:
    """SQL (str) que a função mandaria para `op.execute`, na ordem.

    Downgrades "manuais" levantam de propósito e migrations de dados antigas leem o banco/settings; nesses
    casos fica o SQL coletado até ali. Com `estrito`, qualquer exceção falha o teste.
    """
    executados: list[str] = []
    op_falso = mock.MagicMock(name="op")
    op_falso.execute.side_effect = lambda sql, *a, **k: executados.append(sql)
    with mock.patch.object(alembic, "op", op_falso), mock.patch.dict(sys.modules, {"alembic.op": op_falso}):
        modulo = runpy.run_path(str(caminho))
        if funcao in modulo:
            try:
                modulo[funcao]()
            except Exception:
                if estrito:
                    raise
    return [sql for sql in executados if isinstance(sql, str)]


def test_ha_migrations_para_verificar() -> None:
    assert any(p.name.startswith("20261024_07_") for p in MIGRATIONS)


@pytest.mark.parametrize("funcao", ["upgrade", "downgrade"])
@pytest.mark.parametrize("caminho", MIGRATIONS, ids=lambda p: p.stem)
def test_sql_da_migration_sem_bind_param(caminho: Path, funcao: str) -> None:
    for sql in _sql_executado(caminho, funcao):
        binds = sorted(text(sql)._bindparams)
        assert not binds, f"{caminho.name}:{funcao} tem ':{binds[0]}' que o text() lê como bind param: {binds}"


RECENTES = [p for p in MIGRATIONS if p.name >= "20261024_02"]


@pytest.mark.parametrize("caminho", RECENTES, ids=lambda p: p.stem)
def test_upgrade_recente_roda_inteiro_no_op_falso(caminho: Path) -> None:
    """As migrations que ainda vão para prod (a partir da 20261024_02) são verificadas por inteiro."""
    assert _sql_executado(caminho, "upgrade", estrito=True)


def test_regex_da_07_sai_com_dois_pontos_literais() -> None:
    """O escape não muda o SQL: a função criada continua com `(?:public|sign|authenticated)`."""
    from sqlalchemy.dialects import postgresql

    caminho = next(p for p in MIGRATIONS if p.name.startswith("20261024_07_"))
    sql = str(text(runpy.run_path(str(caminho))["PROFESSOR_SQL"]).compile(dialect=postgresql.psycopg.dialect()))
    assert "/storage/v1/object/(?:public|sign|authenticated)/conteudos/" in sql
    assert "(?\\:" not in sql
