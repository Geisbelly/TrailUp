"""Estrutura da `20261107_01`: as somas de XP leem `eventos_aluno.classe_id` em vez de resolvê-la.

A equivalência com a conta antiga foi medida em produção, em leitura (ver o docstring da
migration): nenhuma linha com `classe_id` nulo resolve para turma.
"""

from __future__ import annotations

import re

import pytest
from sqlalchemy import text

from tests import _f5_banco as f5

M = f5.modulo("20261107_01_xp_le_a_turma_gravada.py")
ANTERIOR = f5.modulo("20261103_15_duelo_fora_do_xp.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def _corpo(sql: str, funcao: str) -> str:
    # `professor_notas_da_turma` é `DROP` + `CREATE` desde a `20261102_13`: muda o retorno.
    inicio = re.search(rf"CREATE (OR REPLACE )?FUNCTION public\.{funcao}\(", sql).start()
    fim = sql.index("$fn$;", inicio)
    return sql[inicio:fim]


def test_encadeia_depois_da_20261106_07():
    assert M.revision == "20261107_01"
    assert M.down_revision == "20261106_07"


def test_upgrade_nao_resolve_turma_por_linha():
    assert "fn_eventos_aluno_resolve_classe_id" not in UP


@pytest.mark.parametrize(
    ("funcao", "filtro"),
    [
        ("fn_xp_da_matricula", "AND ea.classe_id = p_classe\n"),
        ("aluno_faixa_xp", "AND ea.classe_id = p_classe_id;"),
        ("professor_notas_da_turma", "AND ea.classe_id = p_classe_id\n"),
    ],
)
def test_cada_soma_filtra_pela_coluna_e_mantem_o_resto(funcao: str, filtro: str):
    corpo = _corpo(UP, funcao)
    assert filtro in corpo
    # O que a `20261103_15` pôs continua: duelo fora do XP e o mesmo dono da função.
    assert "AND NOT ea.fora_do_xp" in corpo
    assert "SECURITY DEFINER" in corpo
    assert "SET search_path TO 'public', 'pg_temp'" in corpo


def test_rpcs_do_cliente_continuam_conferindo_posse():
    assert "ca.aluno_id = v_aluno AND ca.classe_id = p_classe_id" in _corpo(UP, "aluno_faixa_xp")
    assert "app_classes_do_professor()" in _corpo(UP, "professor_notas_da_turma")
    assert UP.count("ERRCODE = '42501'") == 2


def test_downgrade_devolve_o_texto_da_20261103_15():
    assert ANTERIOR.XP_NOVO in DOWN
    assert ANTERIOR.faixa_nova() in DOWN
    assert ANTERIOR.notas_novas() in DOWN


@pytest.mark.parametrize("fn", ["upgrade", "downgrade"])
def test_sql_sem_porcentagem_nem_parametro_solto(fn: str):
    # O SQL offline do Alembic dobra `%`, e `text()` lê `:palavra` como parâmetro.
    for sql in f5.sql_de(M, fn):
        assert "%" not in sql
        assert text(sql).compile().params == {}
