from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261016_03:20261016_04", sql=True)
    return output.getvalue()


def test_posse_da_turma_antes_de_ler_qualquer_dado_de_aluno() -> None:
    sql = _upgrade_sql()

    assert sql.index("app_classes_do_professor()") < sql.index("FROM public.classe_aluno ca")
    assert "NOT EXISTS (" in sql[sql.index("IF auth.uid() IS NULL") :][:200]
    assert "USING ERRCODE = '42501'" in sql
    assert "SECURITY DEFINER" in sql
    assert "SET search_path = public, pg_temp" in sql


def test_so_dissertativas_dos_topicos_da_turma_pedida() -> None:
    sql = _upgrade_sql()

    assert "a.tipo = 'essay'" in sql
    assert "t.classe_id = ca.classe_id" in sql
    assert "WHERE ca.classe_id = p_classe_id" in sql


def test_entra_quem_respondeu_e_quem_nao_respondeu_com_prazo_vencido() -> None:
    sql = _upgrade_sql()

    assert "ult.resposta IS NOT NULL" in sql
    assert "a.data_entrega::timestamptz < now()" in sql
    # a resposta mostrada é a mais recente
    assert "ORDER BY qa.criado_em DESC NULLS LAST, qa.id DESC" in sql


def test_avaliacao_do_professor_vem_do_metadata_e_sem_colunas_novas() -> None:
    sql = _upgrade_sql()

    assert "avaliacao_metadata #>> '{professor,avaliado_em}'" in sql
    assert "avaliacao_metadata #>> '{professor,feedback}'" in sql
    assert "ALTER TABLE" not in sql


def test_nao_devolve_dado_alem_do_que_a_tela_usa() -> None:
    sql = _upgrade_sql()

    for proibido in ("email", "auth.users", "telemetria"):
        assert proibido not in sql


def test_execute_so_para_autenticado_e_downgrade() -> None:
    sql = _upgrade_sql()
    assert "REVOKE ALL ON FUNCTION public.notas_fila(bigint) FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.notas_fila(bigint) TO authenticated" in sql

    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261016_04:20261016_03", sql=True)
    assert "DROP FUNCTION IF EXISTS public.notas_fila(bigint)" in output.getvalue()
