"""Estrutura da `20261110_05` (cronômetro pelas questões e pausa). O comportamento está no e2e."""

from __future__ import annotations

from tests import _f5_banco as f5

M = f5.modulo("20261110_05_cronometro_pelas_questoes_e_pausa.py")


def test_encadeia_depois_da_fila_de_notas():
    assert (M.revision, M.down_revision) == ("20261110_05", "20261110_03")


def test_so_o_inicio_da_tentativa_e_redefinido_e_a_resposta_fica_intocada():
    # A `20261110_04` (corte do gabarito, em PR) redefine a responder: as duas não podem colidir.
    sql = "\n".join(f5.sql_de(M))
    assert "atividade_responder_tentativa" not in sql
    assert "fn_tempo_da_atividade(p_atividade)" in M.INICIAR
    assert "cronometro_atividade_padrao_seg', 120);" not in M.INICIAR.split("v_cronometrada THEN")[1].split("END IF")[0]


def test_downgrade_devolve_o_inicio_da_20261101_13():
    assert f5.sql_de(M, "downgrade")[0] == M.INICIAR_ANTES
