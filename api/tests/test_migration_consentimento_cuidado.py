"""Estrutura da `20261121_01` (consentimento do modo de cuidado). O comportamento esta no e2e."""

from __future__ import annotations

import re

from tests import _f5_banco as f5

M = f5.modulo("20261121_01_consentimento_cuidado.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def test_encadeia_depois_da_20261120_05():
    assert M.revision == "20261121_01"
    assert M.down_revision == "20261120_05"


def test_versao_vigente():
    assert M.VERSAO_CUIDADO == "2026-11-20-cuid-v1"
    assert "SELECT '2026-11-20-cuid-v1'::text" in UP


def test_sem_porcentagem():
    # O SQL offline do Alembic dobra `%` e corrompe o plpgsql sem erro.
    assert "%" not in UP
    assert "%" not in DOWN


def test_tabela_nasce_com_rls_e_policy_no_mesmo_arquivo():
    assert "ALTER TABLE public.consentimento_cuidado ENABLE ROW LEVEL SECURITY" in UP
    assert "REVOKE ALL ON public.consentimento_cuidado FROM PUBLIC, anon, authenticated" in UP
    assert "GRANT SELECT ON public.consentimento_cuidado TO authenticated" in UP
    politicas = re.findall(r"CREATE POLICY (\w+)\s+ON public\.consentimento_cuidado\s+FOR (\w+) TO (\w+)", UP)
    assert politicas == [("consentimento_cuidado_aluno_sel", "SELECT", "authenticated")]
    assert "USING (aluno_id = auth.uid())" in UP
    assert "trg_consentimento_carimbo" in UP


def test_coluna_de_versao_do_cuidado_no_responsavel():
    assert "ADD COLUMN IF NOT EXISTS cuidado_versao text" in UP


def test_funcao_interna_sem_execute_para_o_cliente():
    assert "REVOKE ALL ON FUNCTION public.aluno_cuidado_permitido(uuid) FROM PUBLIC, anon, authenticated" in UP
    assert not re.search(r"GRANT EXECUTE ON FUNCTION public\.aluno_cuidado_permitido\(uuid\) TO[^;\n]*authenticated", UP)


def test_funcoes_do_cliente_so_para_authenticated_e_service_role():
    for assinatura in M.FUNCOES_DO_CLIENTE:
        assert f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon" in UP
        assert f"GRANT EXECUTE ON FUNCTION {assinatura} TO authenticated, service_role" in UP


def test_todas_as_funcoes_security_definer_fixam_o_search_path():
    corpos = re.findall(r"CREATE OR REPLACE FUNCTION.*?\$function\$;", UP, flags=re.S)
    assert len(corpos) == 5
    for corpo in corpos:
        assert "SET search_path TO 'public', 'pg_temp'" in corpo


def test_revogar_so_apaga_momentos_se_a_tabela_existir():
    assert "to_regclass('public.aluno_momento_cuidado') IS NOT NULL" in UP


def test_downgrade_nao_apaga_prova_de_consentimento():
    assert "DROP TABLE" not in DOWN
    assert "DROP COLUMN" not in DOWN
