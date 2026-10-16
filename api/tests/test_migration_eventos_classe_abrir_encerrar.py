from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261017_01:20261017_02", sql=True)
    return output.getvalue()


def test_posse_antes_de_qualquer_mudanca_nas_duas_funcoes() -> None:
    sql = _upgrade_sql()

    assert sql.count("app_classes_do_professor()") == 2
    assert sql.count("USING ERRCODE = '42501'") == 2
    assert sql.count("SECURITY DEFINER") == 2
    assert sql.count("SET search_path = public, pg_temp") == 2
    assert sql.index("app_classes_do_professor()") < sql.index("SET status = 'aberto'")
    assert " NOT IN " not in sql


def test_abrir_exige_rascunho_janela_viva_e_peca() -> None:
    sql = _upgrade_sql()

    assert "IF v_evento.status <> 'rascunho'" in sql
    assert "IF v_evento.fim <= now()" in sql
    assert "jsonb_array_length(v_evento.pecas) = 0" in sql
    assert "FOR UPDATE" in sql


def test_abrir_congela_guildas_so_com_modalidade_de_guilda() -> None:
    sql = _upgrade_sql()

    assert "IF v_evento.modalidade_guilda THEN" in sql
    assert "guilda_congelar_composicao(v_evento.id::text, v_evento.classe_id)" in sql


def test_encerrar_so_de_aberto_e_sem_fingir_apuracao() -> None:
    sql = _upgrade_sql()

    assert "IF v_evento.status <> 'aberto'" in sql
    assert "SET status = 'encerrado', encerrado_em = now()" in sql
    assert sql.count("set_config('app.evento_transicao', 'on', true)") == 2


def test_execute_so_para_autenticado_e_downgrade() -> None:
    sql = _upgrade_sql()
    for fn in ("evento_classe_abrir", "evento_classe_encerrar"):
        assert f"REVOKE ALL ON FUNCTION public.{fn}(uuid) FROM PUBLIC, anon" in sql
        assert f"GRANT EXECUTE ON FUNCTION public.{fn}(uuid) TO authenticated" in sql

    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261017_02:20261017_01", sql=True)
    assert "DROP FUNCTION IF EXISTS public.evento_classe_abrir(uuid)" in output.getvalue()
