"""Estrutura da `20261102_08` (limite de tentativas e segunda chance, #136). O comportamento está no e2e."""

from __future__ import annotations

import re

from tests import _f5_banco as f5

M = f5.modulo("20261102_08_tentativas_com_limite.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def test_encadeia_depois_da_20261102_07():
    assert M.revision == "20261102_08"
    assert M.down_revision == "20261102_07"


def test_sem_porcentagem():
    # O SQL offline do Alembic dobra `%` e corrompe o plpgsql sem erro.
    assert "%" not in UP
    assert "%" not in DOWN


def test_regra_da_loja_so_ganha_o_trecho_da_tentativa_livre():
    # O resto de fn_loja_checa_limite tem de ser o da 20261020_06, sem reescrita à mão.
    anterior = M.checa_limite_anterior()
    novo = M.checa_limite_novo()
    assert novo.replace(M.TRECHO_TENTATIVA_LIVRE, M.ANCORA) == anterior
    assert "'tem_tentativa_livre'" in novo
    assert anterior in DOWN


def test_downgrade_derruba_o_que_o_upgrade_cria():
    for gatilho in re.findall(r"CREATE TRIGGER (\w+)", UP):
        assert f"DROP TRIGGER IF EXISTS {gatilho}" in DOWN
    for fn in re.findall(r"CREATE OR REPLACE FUNCTION public\.(\w+)\(", UP):
        if fn == "fn_loja_checa_limite":
            continue  # volta ao corpo anterior, não sai
        assert f"DROP FUNCTION IF EXISTS public.{fn}(" in DOWN


def test_rpc_de_situacao_e_do_aluno_e_as_auxiliares_nao():
    assert "GRANT EXECUTE ON FUNCTION public.atividade_situacao_tentativas(bigint) TO authenticated" in UP
    assert "REVOKE ALL ON FUNCTION public.fn_tentativas_livres(uuid, bigint) FROM PUBLIC, anon, authenticated" in UP
