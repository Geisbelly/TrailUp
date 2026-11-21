"""Estrutura da `20261121_02` (momentos de cuidado). O comportamento esta no e2e."""

from __future__ import annotations

import re

from tests import _f5_banco as f5

M = f5.modulo("20261121_02_momentos_de_cuidado.py")
UP = "\n".join(f5.sql_de(M))


def test_encadeia_depois_da_20261121_01():
    assert (M.revision, M.down_revision) == ("20261121_02", "20261121_01")


def test_sem_porcentagem():
    # O SQL offline do Alembic dobra `%` e corrompe o plpgsql sem erro.
    assert "%" not in UP


def test_tabela_nasce_com_rls_e_so_a_policy_do_aluno():
    assert "ALTER TABLE public.aluno_momento_cuidado ENABLE ROW LEVEL SECURITY" in UP
    assert "REVOKE ALL ON public.aluno_momento_cuidado FROM PUBLIC, anon, authenticated" in UP
    assert "GRANT SELECT ON public.aluno_momento_cuidado TO authenticated" in UP
    politicas = re.findall(r"CREATE POLICY (\w+)\s+ON public\.aluno_momento_cuidado\s+FOR (\w+) TO (\w+)", UP)
    assert politicas == [("aluno_momento_cuidado_aluno_sel", "SELECT", "authenticated")]
    assert "USING (aluno_id = auth.uid())" in UP


def test_funcoes_internas_sem_execute_para_o_cliente():
    for assinatura in M.INTERNAS:
        assert f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon, authenticated" in UP
        assert not re.search(rf"GRANT EXECUTE ON FUNCTION {re.escape(assinatura)} TO[^;\n]*authenticated", UP)


def test_funcoes_do_cliente():
    for assinatura in M.DO_CLIENTE:
        assert f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon" in UP
        assert f"GRANT EXECUTE ON FUNCTION {assinatura} TO authenticated, service_role" in UP


def test_todas_as_funcoes_fixam_o_search_path():
    corpos = re.findall(r"CREATE OR REPLACE FUNCTION.*?\$function\$;", UP, flags=re.S)
    assert len(corpos) == 8  # 6 novas + fn_cronometro_ligado + responsavel_registrar_cuidado
    for corpo in corpos:
        assert "SET search_path TO 'public', 'pg_temp'" in corpo


def test_da_turma_confere_posse_antes_de_ler_e_nao_devolve_nivel():
    corpo = re.search(r"FUNCTION public\.cuidado_da_turma.*?\$function\$;", UP, flags=re.S).group(0)
    assert "NOT EXISTS" in corpo and "app_classes_do_professor()" in corpo
    assert "NOT IN" not in corpo
    assert corpo.index("app_classes_do_professor") < corpo.index("RETURN QUERY")
    assert "m.nivel" not in corpo and "nivel text" not in corpo
    assert "SECURITY DEFINER" in corpo


def test_cronometro_mantem_invoker_stable_e_checa_o_cuidado():
    corpo = re.search(r"FUNCTION public\.fn_cronometro_ligado.*?\$function\$;", UP, flags=re.S).group(0)
    assert "LANGUAGE sql" in corpo and "STABLE" in corpo and "SECURITY DEFINER" not in corpo
    assert "aluno_momento_cuidado" in corpo and "mc.expira_em > now()" in corpo and "COALESCE" in corpo


def test_responsavel_regravado_apaga_momentos():
    corpo = re.search(r"FUNCTION public\.responsavel_registrar_cuidado.*?\$function\$;", UP, flags=re.S).group(0)
    assert "DELETE FROM public.aluno_momento_cuidado WHERE aluno_id = v_uid" in corpo


def test_chaves_de_config_e_retencao():
    for chave, valor in (("cuidado_erros_seguidos", 5), ("cuidado_minutos_sem_parar", 50),
                         ("cuidado_abandonos", 2), ("cuidado_intervalo_min", 120),
                         ("cuidado_duracao_min", 120)):
        assert re.search(rf"\('{chave}', '{valor}',[^;]*?true\)", UP, flags=re.S)
    assert "'aluno_momento_cuidado', 'apagar', 'aluno_id', 'criado_em', 180, 180" in UP


def test_lista_de_fatos_acoes_e_niveis():
    assert M.FATOS == ("erros_seguidos", "minutos_sem_parar", "abandonos")
    assert M.ACOES == ("pausa_sugerida", "cronometro_desligado", "tecnica_oferecida", "cvv_indicado")
    assert M.NIVEIS == ("desconforto", "crise", "risco")
