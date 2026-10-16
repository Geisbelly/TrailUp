from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261013_01:20261013_02", sql=True)
    return output.getvalue()


def test_dono_vem_de_chave_privada_e_e_conferido_no_banco() -> None:
    sql = _upgrade_sql()

    # chave não pública: nenhuma policy de leitura do cliente a enxerga
    chave = sql[sql.index("'dono_email'") : sql.index("ON CONFLICT (chave) DO NOTHING")]
    assert "false" in chave
    assert "true" not in chave
    assert "auth.jwt() ->> 'email'" in sql
    assert "SECURITY DEFINER" in sql
    assert "SET search_path = public, pg_temp" in sql


def test_nao_dono_e_recusado_antes_de_ler_auth_users() -> None:
    sql = _upgrade_sql()

    corpo = sql[sql.index("CREATE OR REPLACE FUNCTION public.aprovacoes_pendentes()") :]
    assert corpo.index("IF NOT public.app_e_dono()") < corpo.index("JOIN auth.users")
    assert "USING ERRCODE = '42501'" in corpo


def test_so_devolve_pendentes_do_mais_antigo_ao_mais_novo_e_so_o_que_a_tela_usa() -> None:
    sql = _upgrade_sql()

    corpo = sql[sql.index("CREATE OR REPLACE FUNCTION public.aprovacoes_pendentes()") :]
    assert "WHERE p.liberado IS NOT TRUE" in corpo
    assert "ORDER BY p.created_at ASC" in corpo
    assert "encrypted_password" not in corpo
    assert "raw_user_meta_data" not in corpo


def test_execute_so_para_autenticado() -> None:
    sql = _upgrade_sql()

    for fn in ("app_e_dono()", "aprovacoes_pendentes()"):
        assert f"REVOKE ALL ON FUNCTION public.{fn} FROM PUBLIC, anon" in sql
        assert f"GRANT EXECUTE ON FUNCTION public.{fn} TO authenticated" in sql


def test_downgrade_remove_funcoes_e_chave() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261013_02:20261013_01", sql=True)
    sql = output.getvalue()
    assert "DROP FUNCTION IF EXISTS public.aprovacoes_pendentes()" in sql
    assert "DROP FUNCTION IF EXISTS public.app_e_dono()" in sql
    assert "chave = 'dono_email'" in sql
