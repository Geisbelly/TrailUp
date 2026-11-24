"""Estrutura da `20261124_06`: o resumo da turma não se multiplica com `iaDescricao` repetida."""

from __future__ import annotations

import re

from tests import _f5_banco as f5

M = f5.modulo("20261124_06_resumo_da_turma_uma_linha_por_matricula.py")


def _colunas(sql: str) -> list[str]:
    corpo = sql.split("SELECT", 1)[1].split("FROM public.classe_aluno", 1)[0]
    return [linha.strip().rstrip(",") for linha in corpo.strip().splitlines() if linha.strip()]


def test_encadeia_depois_do_aluno_de_teste_matriculado():
    assert M.revision == "20261124_06"
    assert M.down_revision == "20261124_05"


def test_ia_descricao_entra_por_uma_linha_so():
    sql = M.UPGRADE_SQL
    assert "LEFT JOIN LATERAL (" in sql
    assert "LIMIT 1" in sql
    # A mesma linha que a API atualiza: a mais recente do aluno.
    assert "ORDER BY i.created_at DESC NULLS LAST, i.id DESC" in sql
    # A junção crua por aluno (a que multiplicava a matrícula) não pode voltar no upgrade.
    assert 'LEFT JOIN public."iaDescricao" iad ON iad.aluno_id = ca.aluno_id' not in sql


def test_view_continua_invoker_e_com_as_mesmas_colunas():
    # CREATE OR REPLACE VIEW exige as mesmas colunas, na mesma ordem.
    assert "CREATE OR REPLACE VIEW public.vw_aluno_classe_resumo WITH (security_invoker = on)" in M.UPGRADE_SQL
    assert _colunas(M.UPGRADE_SQL) == _colunas(M.DOWNGRADE_SQL)
    assert _colunas(M.UPGRADE_SQL)[-1] == "c.descricao AS classe_nome"
    assert len(_colunas(M.UPGRADE_SQL)) == 19


def test_nao_apaga_nada_nem_mexe_em_grant():
    for sql in (M.UPGRADE_SQL, M.DOWNGRADE_SQL):
        assert not re.search(r"\b(DELETE|DROP|TRUNCATE|GRANT|REVOKE)\b", sql)


def test_sem_porcentagem():
    # O SQL offline do Alembic dobra `%`.
    assert "%" not in M.UPGRADE_SQL
    assert "%" not in M.DOWNGRADE_SQL
