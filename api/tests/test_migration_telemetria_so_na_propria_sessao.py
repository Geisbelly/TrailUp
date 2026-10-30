"""SQL offline da `20261029_08`: o aluno só grava telemetria na própria sessão.

O comportamento (B não grava na sessão nem no lote de A, A grava, API e `service_role` não são afetados,
downgrade reabre) é medido contra Postgres de verdade, no papel `authenticated`, em
`test_e2e_telemetria_so_na_propria_sessao.py`. Aqui fica o que a leitura do SQL garante sem banco.
"""

import re
from io import StringIO

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

TABELAS = ("telemetria_lotes", "telemetria_eventos_app", "telemetria_time_metric_entries")
HELPERS = ("app_minha_sessao_de_telemetria", "app_meu_lote_de_telemetria")


def _sql_bruto(intervalo: str, *, downgrade: bool = False) -> str:
    output = StringIO()
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(_offline_alembic_config(output), intervalo, sql=True)
    return output.getvalue()


def _upgrade_sql() -> str:
    return _sql_bruto("20261029_07:20261029_08")


def _downgrade_sql() -> str:
    return _sql_bruto("20261029_08:20261029_07", downgrade=True)


def _normal(texto: str) -> str:
    return re.sub(r"\s+", " ", texto).strip()


def _policy(sql: str, nome: str) -> str:
    inicio = sql.index(f"CREATE POLICY {nome}")
    return _normal(sql[inicio : sql.index(";", inicio)])


def _funcao(sql: str, nome: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
    return _normal(sql[inicio : sql.index("$function$;", inicio)])


def test_uma_cabeca_so_e_ela_vem_depois_do_fechamento_pelo_banco() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    heads = scripts.get_heads()
    assert len(heads) == 1, f"a árvore bifurcou: {sorted(heads)}"
    assert "20261029_08" in {r.revision for r in scripts.walk_revisions("base", heads[0])}
    assert scripts.get_revision("20261029_08").down_revision == "20261029_07"


def test_sql_offline_nao_tem_porcento() -> None:
    """O Alembic offline dobra `%` e corrompe SQL sem dar erro; aqui não há nenhum para dobrar."""
    assert "%" not in _upgrade_sql()
    assert "%" not in _downgrade_sql()


def test_policies_sao_restritivas_e_so_para_authenticated() -> None:
    """RESTRICTIVE soma com AND às PERMISSIVE: nenhuma policy de INSERT futura reabre a brecha."""
    sql = _upgrade_sql()
    for tabela in TABELAS:
        for acao, comando in (("ins", "FOR INSERT"), ("upd", "FOR UPDATE")):
            corpo = _policy(sql, f"{tabela}_sessao_propria_{acao}")
            assert f"ON public.{tabela} AS RESTRICTIVE {comando} TO authenticated" in corpo
            assert "public.app_minha_sessao_de_telemetria(sessao_id)" in corpo
            temlote = "public.app_meu_lote_de_telemetria(lote_id)" in corpo
            assert temlote == (tabela == "telemetria_time_metric_entries"), corpo
    # a policy de posse de antes fica intocada
    assert "_insert_own" not in sql


def test_helpers_sao_definer_com_search_path_vazio_e_sem_anon() -> None:
    sql = _upgrade_sql()
    for nome, tabela in zip(HELPERS, ("telemetria_sessoes", "telemetria_lotes"), strict=True):
        corpo = _funcao(sql, nome)
        assert "RETURNS boolean" in corpo
        assert "SECURITY DEFINER" in corpo
        assert "SET search_path = ''" in corpo
        assert f"FROM public.{tabela}" in corpo
        assert "aluno_id = auth.uid()" in corpo
        assert f"REVOKE ALL ON FUNCTION public.{nome}(uuid) FROM PUBLIC, anon" in sql
        assert f"GRANT EXECUTE ON FUNCTION public.{nome}(uuid) TO authenticated, service_role" in sql


def test_downgrade_tira_policies_e_helpers_e_nao_toca_na_posse() -> None:
    sql = _downgrade_sql()
    for tabela in TABELAS:
        for acao in ("ins", "upd"):
            assert f"DROP POLICY IF EXISTS {tabela}_sessao_propria_{acao} ON public.{tabela}" in sql
    for nome in HELPERS:
        assert f"DROP FUNCTION IF EXISTS public.{nome}(uuid)" in sql
    assert "_insert_own" not in sql
    assert "CREATE POLICY" not in sql
