"""Estrutura da `20261110_03` (fila de correção pelas questões). O comportamento está no e2e."""

from __future__ import annotations

from tests import _f5_banco as f5

M = f5.modulo("20261110_03_fila_de_notas_so_o_que_o_professor_corrige.py")


def test_encadeia_depois_das_respostas_ricas():
    assert M.revision == "20261110_03"
    assert M.down_revision == "20261110_02"


def test_decide_pela_questao_com_a_regra_de_correcao_do_banco():
    assert "public.fn_questao_corrigida_por_ia(qm.id)" in M.NOTAS_FILA
    # O tipo da atividade só vale quando ela não tem questão (trabalho, entrega).
    assert "NOT EXISTS (SELECT 1 FROM public.questoes qm WHERE qm.atividade_id = a.id)" in M.NOTAS_FILA


def test_continua_definer_e_so_para_quem_entra():
    assert "SECURITY DEFINER" in M.NOTAS_FILA
    assert "app_classes_do_professor()" in M.NOTAS_FILA
    assert "REVOKE ALL ON FUNCTION public.notas_fila(bigint) FROM PUBLIC, anon;" in M.NOTAS_FILA


def test_sem_porcentagem():
    assert "%" not in M.NOTAS_FILA
