#!/usr/bin/env python3
"""Compara o apêndice de 05-dados.md com as tabelas de `public` no banco.

Só lê, numa transação `READ ONLY`. A URL vem de `DATABASE_URL`, nunca de argumento.
Sai com erro se alguma tabela do banco não estiver no apêndice.

    DATABASE_URL=... python docs/tcc/modelagem/conferir_tabelas.py
"""

import os
import re
import sys
from pathlib import Path

import psycopg

APENDICE = "## Apêndice: todas as tabelas por domínio"


def tabelas_do_apendice(texto: str) -> set[str]:
    return set(re.findall(r"`([A-Za-z_]+)`", texto.split(APENDICE, 1)[1]))


def main() -> int:
    url = os.environ["DATABASE_URL"].replace("+asyncpg", "").replace("+psycopg", "")
    doc = tabelas_do_apendice((Path(__file__).parent / "05-dados.md").read_text(encoding="utf-8"))
    with psycopg.connect(url, prepare_threshold=None, autocommit=True) as conexao:
        conexao.execute("BEGIN READ ONLY")
        linhas = conexao.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        ).fetchall()
        conexao.execute("ROLLBACK")
    banco = {linha[0] for linha in linhas}
    print(f"{len(banco)} no banco, {len(doc)} no apêndice")
    if banco - doc:
        print("Sem citação:", ", ".join(sorted(banco - doc)))
    if doc - banco:
        print("Só no apêndice:", ", ".join(sorted(doc - banco)))
    return 1 if banco - doc else 0


if __name__ == "__main__":
    sys.exit(main())
