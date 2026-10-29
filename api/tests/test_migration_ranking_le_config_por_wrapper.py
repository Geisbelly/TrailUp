"""F1 (segurança) — SQL offline da `20261029_04`: o ranking lê a config por wrapper, não por `fn_app_config_int`.

`fn_app_config_int` perdeu o EXECUTE do cliente de propósito (ela também lê tetos anti-abuso:
`credito_extra_maximo`, `conquista_recompensa_maxima`, `contato_envios_por_hora`). A view
`vw_rank_posicoes_por_classe_todas` a chamava duas vezes e, por isso, todo aluno recebia `42501` ao
ler o ranking. Aqui fica o que a leitura do SQL garante sem banco; o `42501` e o ranking lido de
verdade por um `authenticated` são medidos em `test_e2e_ranking_le_config_por_wrapper.py`.
"""

import re
from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

WRAPPERS = {
    "app_elo_inicial": ("elo_inicial", 1000),
    "app_rank_progresso_min_participantes": ("rank_progresso_min_participantes", 8),
}
VIEW = "vw_rank_posicoes_por_classe_todas"


def _sql(intervalo: str, downgrade: bool = False) -> str:
    output = StringIO()
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(_offline_alembic_config(output), intervalo, sql=True)
    return output.getvalue().replace("%%", "%")


def _upgrade() -> str:
    return _sql("20261029_03:20261029_04")


def _downgrade() -> str:
    return _sql("20261029_04:20261029_03", downgrade=True)


def _funcao(sql: str, nome: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}()")
    return sql[inicio : sql.index("$function$;", inicio)]


def _view(sql: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE VIEW public.{VIEW}")
    fim = sql.index("CROSS JOIN progresso_config pcfg", inicio)
    return sql[inicio : sql.index(";", fim) + 1]


def test_wrappers_tem_o_contrato():
    sql = _upgrade()

    for nome, (chave, padrao) in WRAPPERS.items():
        bloco = _funcao(sql, nome)
        assert re.search(rf"FUNCTION public\.{nome}\(\)\s+RETURNS integer", bloco), nome
        assert "SECURITY DEFINER" in bloco, nome
        assert "SET search_path = ''" in bloco, nome
        # uma chave só, com o padrão de hoje: o wrapper não é um `fn_app_config_int` com outro nome
        assert f"chave = '{chave}'" in bloco, nome
        assert bloco.count("chave = '") == 1, nome
        assert re.search(rf"\b{padrao}\b", bloco), nome
        assert "p_chave" not in bloco and "fn_app_config_int" not in bloco, nome
        # search_path vazio: nada sem esquema
        assert "public.app_config" in bloco, nome


def test_wrappers_so_o_authenticated_executa():
    sql = _upgrade()

    for nome in WRAPPERS:
        assert f"REVOKE ALL ON FUNCTION public.{nome}() FROM PUBLIC, anon;" in sql, nome
        assert f"GRANT EXECUTE ON FUNCTION public.{nome}() TO authenticated;" in sql, nome
    # só os dois wrappers recebem GRANT, e nenhum vai para anon
    grants = re.findall(r"^\s*GRANT .*$", sql, re.M)
    assert len(grants) == 2, grants
    assert not any("anon" in g for g in grants)


def test_fn_app_config_int_continua_fechada():
    """A função genérica continua sem GRANT: a migration não a recria nem a abre."""
    sql = _upgrade()

    assert not re.search(r"GRANT[^;]*fn_app_config_int", sql)
    assert "CREATE OR REPLACE FUNCTION public.fn_app_config_int" not in sql
    assert "ALTER FUNCTION public.fn_app_config_int" not in sql
    # nem o downgrade a abre
    assert not re.search(r"GRANT[^;]*fn_app_config_int", _downgrade())


def test_view_nova_nao_chama_fn_app_config_int():
    view = _view(_upgrade())

    assert "fn_app_config_int" not in view
    assert view.count("public.app_elo_inicial()") == 1
    assert view.count("public.app_rank_progresso_min_participantes()") == 1
    # o resto da view é o da 20261025_02, intacto: percentual, Elo, junção do config
    assert "CROSS JOIN progresso_config pcfg" in view
    assert "CROSS JOIN elo_config ecfg" in view
    assert "WHEN o.criterio = 'elo'::text THEN NULL::numeric" in view


def test_wrappers_existem_antes_da_view():
    sql = _upgrade()
    view = sql.index(f"CREATE OR REPLACE VIEW public.{VIEW}")

    for nome in WRAPPERS:
        assert sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}()") < view, nome


def test_i10_mede_as_dependencias_das_duas_views_e_nao_o_texto_da_definicao():
    sql = _upgrade()
    bloco = _funcao(sql, "fn_inv_i10")

    assert "LANGUAGE plpgsql" in bloco and "SECURITY DEFINER" in bloco and "SET search_path = ''" in bloco
    assert "RETURNS TABLE (id text)" in bloco
    assert "pg_catalog.pg_depend" in bloco and "pg_catalog.pg_rewrite" in bloco
    assert "'public.vw_rank_posicoes_por_classe'::regclass" in bloco
    assert "'public.vw_rank_posicoes_por_classe_todas'::regclass" in bloco
    assert "NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')" in bloco
    assert "LIKE" not in bloco and "pg_get_viewdef" not in bloco
    # continua fechada para o cliente, como as outras 19
    assert "REVOKE ALL ON FUNCTION public.fn_inv_i10() FROM PUBLIC, anon, authenticated;" in sql


def test_so_a_i10_e_redefinida():
    sql = _upgrade()

    assert re.findall(r"CREATE OR REPLACE FUNCTION public\.(fn_inv_i\d+)\(\)", sql) == ["fn_inv_i10"]


def test_downgrade_volta_a_view_e_a_i10_da_f0_e_dropa_os_wrappers():
    sql = _downgrade()

    # a view volta a chamar a função genérica (a da 20261025_02)
    view = _view(sql)
    assert view.count("public.fn_app_config_int('elo_inicial', 1000)") == 1
    assert view.count("public.fn_app_config_int('rank_progresso_min_participantes', 8)") == 1
    assert "app_elo_inicial" not in view and "app_rank_progresso_min_participantes" not in view
    # a I10 volta ao corpo da F0 (recortado do módulo dela, R1)
    bloco = _funcao(sql, "fn_inv_i10")
    assert "has_function_privilege('authenticated', 'public.fn_app_config_int(text,integer)', 'EXECUTE')" in bloco
    assert "pg_get_viewdef" not in bloco
    assert "REVOKE ALL ON FUNCTION public.fn_inv_i10() FROM PUBLIC, anon, authenticated;" in sql
    # os wrappers saem DEPOIS de a view parar de usá-los
    for nome in WRAPPERS:
        drop = f"DROP FUNCTION IF EXISTS public.{nome}()"
        assert drop in sql, nome
        assert sql.index(f"CREATE OR REPLACE VIEW public.{VIEW}") < sql.index(drop), nome


def test_downgrade_nao_restaura_o_grant_da_fn_app_config_int():
    sql = _downgrade()

    assert not re.search(r"^\s*GRANT ", sql, re.M)
