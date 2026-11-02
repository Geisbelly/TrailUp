"""Estrutura da `20261102_10` (faixas de XP, #143). O comportamento está no e2e."""

from __future__ import annotations

import re

from tests import _f5_banco as f5

M = f5.modulo("20261102_10_faixas_de_xp.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def test_encadeia_depois_da_20261102_09():
    assert M.revision == "20261102_10"
    assert M.down_revision == "20261102_09"


def test_sem_porcentagem():
    # O SQL offline do Alembic dobra `%` e corrompe o plpgsql sem erro.
    assert "%" not in UP
    assert "%" not in DOWN


def test_tabela_nasce_com_rls_e_policy_no_mesmo_commit():
    assert "ALTER TABLE public.xp_faixa ENABLE ROW LEVEL SECURITY" in UP
    assert "CREATE POLICY xp_faixa_sel ON public.xp_faixa\n  FOR SELECT TO authenticated" in UP
    # Anônimo não lê, e o cliente não escreve.
    assert "REVOKE ALL ON public.xp_faixa FROM PUBLIC, anon" in UP
    assert "REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.xp_faixa FROM authenticated" in UP
    assert not re.search(r"CREATE POLICY \w+ ON public\.xp_faixa\s+FOR (INSERT|UPDATE|DELETE|ALL)", UP)


def test_faixas_comecam_em_zero_e_as_cinco_primeiras_sao_as_de_odonovan():
    pisos = [minimo for minimo, _ in M.FAIXAS]
    assert pisos[:5] == [0, 50, 150, 250, 400]
    assert pisos == sorted(set(pisos))


def test_faixas_nao_lineares_crescem_depois_do_comeco():
    pisos = [minimo for minimo, _ in M.FAIXAS]
    larguras = [b - a for a, b in zip(pisos, pisos[1:])]
    # Barata no começo (a primeira é a menor) e nunca encolhe depois.
    assert larguras[0] == min(larguras)
    assert larguras == sorted(larguras)
    assert larguras[-1] > larguras[0]


def test_titulos_unicos_e_curtos():
    titulos = [titulo for _, titulo in M.FAIXAS]
    assert len(set(titulos)) == len(titulos)
    assert all(1 <= len(t) <= 40 and "'" not in t for t in titulos)
    for minimo, titulo in M.FAIXAS:
        assert f"({minimo}, '{titulo}')" in UP


def test_rpc_do_aluno_confere_matricula_e_so_soma_o_proprio_xp():
    corpo = UP[UP.index("CREATE OR REPLACE FUNCTION public.aluno_faixa_xp(") :]
    assert "SECURITY DEFINER" in corpo
    assert "SET search_path TO 'public', 'pg_temp'" in corpo
    assert "ca.aluno_id = v_aluno AND ca.classe_id = p_classe_id" in corpo
    assert "ERRCODE = '42501'" in corpo
    assert "WHERE ea.aluno_id = v_aluno" in corpo
    # A mesma resolução de turma do rank e do CSV do professor.
    assert "fn_eventos_aluno_resolve_classe_id(ea.tipo, ea.referencia)) = p_classe_id" in corpo


def test_grants_das_funcoes():
    assert "REVOKE ALL ON FUNCTION public.aluno_faixa_xp(bigint) FROM PUBLIC, anon" in UP
    assert "GRANT EXECUTE ON FUNCTION public.aluno_faixa_xp(bigint) TO authenticated, service_role" in UP
    assert "REVOKE ALL ON FUNCTION public.fn_faixa_xp(numeric) FROM PUBLIC, anon" in UP


def test_downgrade_derruba_o_que_o_upgrade_cria():
    for fn in re.findall(r"CREATE OR REPLACE FUNCTION public\.(\w+)\(", UP):
        assert f"DROP FUNCTION IF EXISTS public.{fn}(" in DOWN
    assert "DROP TABLE IF EXISTS public.xp_faixa" in DOWN
