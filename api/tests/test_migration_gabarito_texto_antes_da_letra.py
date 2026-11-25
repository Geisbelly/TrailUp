"""Estrutura da `20261124_08`: o gabarito de uma letra só casa primeiro com o texto da alternativa.

O comportamento foi ensaiado no banco de dev em 24/11, numa transação desfeita no fim: com as
alternativas "B", "A e B", "A" e "Nada" e gabarito "B", só "B" dá certo; com "x", "y", "z" e
gabarito "b", "y", "B" e "1" dão certo.
"""

from __future__ import annotations

from tests import _f5_banco as f5

M = f5.modulo("20261124_08_gabarito_texto_antes_da_letra.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def test_encadeia_depois_da_cabeca_da_main():
    assert M.revision == "20261124_08"
    assert M.down_revision == "20261124_07"


def test_laco_antigo_sai_e_a_conferencia_compara_posicoes():
    # O laço que aceitava texto, índice e letra ao mesmo tempo em cada posição.
    assert "IF v_gab = v_texto OR v_gab = v_i::text OR v_gab = lower(chr(65 + v_i))" not in M.CONFERE
    assert "IF v_gab = v_texto OR v_gab = v_i::text OR v_gab = lower(chr(65 + v_i))" in M.CONFERE_PRODUCAO
    assert "v_pos_resp := public.fn_questao_posicao_simples(v_alts, p_resposta);" in M.CONFERE
    assert "v_pos_gab := public.fn_questao_posicao_simples(v_alts, v_gabarito);" in M.CONFERE
    assert "RETURN v_pos_resp IS NOT NULL AND v_pos_resp = v_pos_gab;" in M.CONFERE


def test_o_resto_da_conferencia_continua_igual():
    for trecho in (
        "public.fn_questao_posicao_rica(v_alts, p_resposta)",
        "IF v_resp = v_gab THEN RETURN true; END IF;",
        "public.fn_questao_confere_lista(v_tipo, v_gabarito, p_resposta)",
        "public.fn_texto_parecido(p_resposta, x)",
        "SECURITY DEFINER",
    ):
        assert trecho in M.CONFERE


def test_ajudante_procura_o_texto_antes_da_letra_e_do_indice():
    texto = M.AJUDANTE.index("public.fn_texto_comparavel(p_alts ->> i) = v_valor")
    letra = M.AJUDANTE.index("v_valor ~ '^[a-z]$'")
    indice = M.AJUDANTE.index("v_valor ~ '^[0-9]+$'")
    assert texto < letra < indice
    assert "REVOKE ALL ON FUNCTION public.fn_questao_posicao_simples(jsonb, text) FROM PUBLIC, anon, authenticated;" in M.AJUDANTE


def test_downgrade_devolve_o_corpo_de_producao_e_tira_o_ajudante():
    assert M.CONFERE_PRODUCAO.strip() in DOWN
    assert "DROP FUNCTION IF EXISTS public.fn_questao_posicao_simples(jsonb, text);" in DOWN
    assert DOWN.index("CREATE OR REPLACE FUNCTION public.fn_questao_confere(") < DOWN.index("DROP FUNCTION")


def test_sem_porcentagem_e_sem_dois_pontos_de_bind():
    from sqlalchemy import text

    for sql in (M.AJUDANTE, M.CONFERE, M.CONFERE_PRODUCAO):
        assert "%" not in sql
        assert text(sql).compile().params == {}
