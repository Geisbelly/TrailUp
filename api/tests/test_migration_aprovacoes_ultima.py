from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261013_02:20261013_03", sql=True)
    return output.getvalue()


def test_so_o_dono_e_antes_de_ler() -> None:
    sql = _upgrade_sql()

    assert sql.index("IF NOT public.app_e_dono()") < sql.index("FROM public.professor p")
    assert "USING ERRCODE = '42501'" in sql
    assert "SECURITY DEFINER" in sql
    assert "SET search_path = public, pg_temp" in sql


def test_devolve_a_mais_recente_e_ignora_quem_nao_tem_data() -> None:
    sql = _upgrade_sql()

    assert "WHERE p.liberado IS TRUE AND p.liberado_em IS NOT NULL" in sql
    assert "ORDER BY p.liberado_em DESC" in sql
    assert "LIMIT 1" in sql


def test_execute_so_para_autenticado_e_downgrade() -> None:
    sql = _upgrade_sql()
    assert "REVOKE ALL ON FUNCTION public.aprovacoes_ultima() FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.aprovacoes_ultima() TO authenticated" in sql

    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261013_03:20261013_02", sql=True)
    assert "DROP FUNCTION IF EXISTS public.aprovacoes_ultima()" in output.getvalue()
