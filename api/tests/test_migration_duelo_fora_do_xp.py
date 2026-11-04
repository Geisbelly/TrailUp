"""Estrutura da `20261103_15` (duelo fora do XP, #154). O comportamento está no e2e."""

from __future__ import annotations

from tests import _f5_banco as f5

M = f5.modulo("20261103_15_duelo_fora_do_xp.py")


def test_encadeia_depois_da_20261103_14():
    assert M.revision == "20261103_15"
    assert M.down_revision == "20261103_14"


def test_sql_novo_sem_porcentagem():
    # O SQL offline do Alembic dobra `%` e corrompe o plpgsql sem erro.
    for sql in (M.COLUNA, M.MARCA, M.MARCA_O_QUE_JA_EXISTE, M.RECALCULA_NOTAS, M.XP_NOVO, M.DESFAZ):
        assert "%" not in sql


def test_view_nao_ganha_funcao_nova():
    # Função chamada na view precisa de EXECUTE para o cliente: foi o 42501 de 29/10.
    assert "fn_evento_e_duelo" not in M.view_nova()


def test_funcoes_novas_fora_do_alcance_do_cliente():
    assert "REVOKE ALL ON FUNCTION public.fn_evento_e_duelo(text, text) FROM PUBLIC, anon, authenticated" in M.MARCA
    assert "REVOKE ALL ON FUNCTION public.trg_eventos_aluno_fora_do_xp() FROM PUBLIC, anon, authenticated" in M.MARCA


def test_downgrade_recalcula_depois_de_tirar_a_coluna():
    sql = f5.sql_de(M, "downgrade")
    assert sql.index(M.DESFAZ) < sql.index(M.RECALCULA_NOTAS)
