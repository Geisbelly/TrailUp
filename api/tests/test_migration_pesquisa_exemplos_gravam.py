"""Estrutura da `20261124_02`: os exemplos da turma de demonstração gravam de verdade.

A `_01` acumulava os feitos com `text[] || 'literal'`, que o Postgres lê como array||array e recusa
(`malformed array literal`) no fim de cada bloco, desfazendo o exemplo. Medido num Postgres com o
esqueleto de produção e todas as migrations: 0 de 7 antes, 7 de 7 depois.
"""

import importlib.util
import re
from pathlib import Path

from sqlalchemy import text

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo():
    caminho = _VERSOES / "20261124_02_pesquisa_exemplos_gravam_de_verdade.py"
    spec = importlib.util.spec_from_file_location("m20261124_02", caminho)
    assert spec and spec.loader
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_encadeia_na_01() -> None:
    modulo = _modulo()
    assert modulo.revision == "20261124_02"
    assert modulo.down_revision == "20261124_01"


def test_nenhum_array_concatenado_com_literal() -> None:
    sql = _modulo().SEMEAR
    # text[] || 'x' vira array||array: o literal tem de ir por array_append (ou com cast).
    assert not re.search(r"\|\|\s*'[a-z_]+'\s*;", sql)
    assert sql.count("v_feitos := array_append(v_feitos, '") == 7


def test_evento_so_recebe_missao() -> None:
    sql = _modulo().SEMEAR
    trecho = sql[
        sql.index("SELECT a.id INTO v_atividade") : sql.index("LIMIT 1", sql.index("SELECT a.id INTO v_atividade"))
    ]
    assert "a.tipo = 'missao'" in trecho


def test_so_muda_o_que_estava_errado() -> None:
    modulo = _modulo()
    volta = modulo.SEMEAR.replace(" AND a.tipo = 'missao'", "")
    volta = re.sub(r"v_feitos := array_append\(v_feitos, '([a-z]+)'\);", r"v_feitos := v_feitos || '\1';", volta)
    assert volta == modulo.M01.SEMEAR


def test_backfill_semeia_todos_e_nao_derruba_a_api() -> None:
    sql = _modulo().BACKFILL
    assert "exemplos_em IS NULL" not in sql  # a _01 marcou quem não recebeu nada
    semeia = sql.index("fn_pesquisa_semear_exemplos")
    assert sql.rindex("BEGIN", 0, semeia) < semeia < sql.index("EXCEPTION WHEN OTHERS THEN", semeia)
    assert "RAISE WARNING" in sql and "RAISE EXCEPTION" not in sql


def test_sql_sem_bind_acidental() -> None:
    modulo = _modulo()
    for bloco in (modulo.SEMEAR, modulo.BACKFILL):
        assert text(bloco).compile().params == {}
