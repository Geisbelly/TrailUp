"""Estrutura da `20261124_07` (gabarito das objetivas no aparelho, decisão da autora em 24/11)."""

from __future__ import annotations

from tests import _f5_banco as f5

M = f5.modulo("20261124_07_gabarito_das_objetivas_no_aparelho.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def test_encadeia_depois_da_cabeca_da_main():
    assert M.revision == "20261124_07"
    assert M.down_revision == "20261124_06"


def test_docstring_registra_que_reabre_a_fase_3_so_para_as_objetivas():
    assert "Decisão da autora em 24/11" in M.__doc__
    assert "reabre o que a fase 3 fechou" in M.__doc__
    assert "só\npara as objetivas" in M.__doc__


def test_quem_decide_cada_candidata_e_a_conferencia_do_banco():
    # Nada de reescrever a normalização: a lista sai de `fn_questao_confere`, a mesma de
    # `questao_responder`, e o app só confere se a resposta está nela.
    assert "public.fn_questao_confere(r.id, c)" in UP
    assert "ARRAY['Verdadeiro', 'Falso']" in UP
    # Múltipla rica: o app manda a letra.
    assert "chr(65 + v_i)" in UP


def test_portao_da_matricula_e_do_topico_liberado():
    assert "auth.uid()" in UP
    assert "FROM public.classe_aluno ca" in UP
    assert "ca.aluno_id = v_me" in UP
    assert "public.app_topico_liberado(t.publicacao::text, t.publicar_em)" in UP


def test_fora_do_lote_as_corrigidas_so_no_servidor():
    for tipo in ("'dissertativa'", "'lacuna'", "'codigo'", "'numerica'", "'expressao'", "'associacao'"):
        assert tipo in M.TIPOS_FORA
    assert "CONTINUE WHEN r.tipo_q IN" in UP
    assert "OR r.tipo_a IN" in UP


def test_definer_com_search_path_e_execute_so_para_authenticated():
    assert "SECURITY DEFINER" in UP
    assert "SET search_path = public, pg_temp" in UP
    assert "REVOKE ALL ON FUNCTION public.questao_gabaritos_offline(bigint) FROM PUBLIC, anon;" in UP
    assert "GRANT EXECUTE ON FUNCTION public.questao_gabaritos_offline(bigint) TO authenticated;" in UP
    assert "service_role" not in UP


def test_sem_porcentagem_e_sem_dois_pontos_de_bind():
    # O SQL offline do Alembic dobra `%`, e `:palavra` em `op.execute` vira parâmetro.
    from sqlalchemy import text

    assert "%" not in M.SQL
    assert text(M.SQL).compile().params == {}
    assert text(M.DOWNGRADE_SQL).compile().params == {}


def test_downgrade_remove_a_funcao():
    assert "DROP FUNCTION IF EXISTS public.questao_gabaritos_offline(bigint);" in DOWN
