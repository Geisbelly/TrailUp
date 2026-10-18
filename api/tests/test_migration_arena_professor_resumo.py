from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261017_04:20261017_05", sql=True)
    return output.getvalue()


def test_posse_da_turma_antes_de_ler_qualquer_duelo() -> None:
    sql = _upgrade_sql()

    assert sql.index("app_classes_do_professor()") < sql.index("FROM public.guilda_desafios d")
    assert "NOT EXISTS (" in sql[sql.index("IF auth.uid() IS NULL") :][:200]
    assert "USING ERRCODE = '42501'" in sql
    assert "SECURITY DEFINER" in sql and "STABLE" in sql
    assert "SET search_path = public, pg_temp" in sql
    assert " NOT IN " not in sql


def test_so_leitura_e_so_da_turma_pedida() -> None:
    sql = _upgrade_sql()

    funcao = sql[sql.index("CREATE OR REPLACE FUNCTION") : sql.index("REVOKE ALL")]
    for escrita in ("INSERT ", "UPDATE ", "DELETE "):
        assert escrita not in funcao
    assert sql.count("d.classe_id = p_classe_id") == 3
    assert "LIMIT 40" in sql


def test_ranking_espelha_arena_encerrar_e_nunca_devolve_derrota() -> None:
    sql = _upgrade_sql()

    assert "d.status = 'encerrado' AND d.formato = 'guilda'" in sql
    assert "d.resultado IS DISTINCT FROM 'sem_adversario'" in sql
    assert "WHEN d.vencedor_equipe = 1 THEN 'vitoria'" in sql
    assert "WHEN d.vencedor_equipe = 2 THEN 'vitoria'" in sql
    assert "d.guilda_rival_id IS NULL AND d.resultado = 'vitoria'" in sql
    assert "derrota" not in sql.lower()


def test_nao_expoe_dado_pessoal_de_aluno() -> None:
    sql = _upgrade_sql()

    for proibido in ("email", "foto_url", "apelido", "auth.users", "FROM public.alunos"):
        assert proibido not in sql


def test_execute_so_para_autenticado_e_downgrade() -> None:
    sql = _upgrade_sql()
    assert "REVOKE ALL ON FUNCTION public.arena_professor_resumo(bigint) FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.arena_professor_resumo(bigint) TO authenticated" in sql

    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261017_05:20261017_04", sql=True)
    assert "DROP FUNCTION IF EXISTS public.arena_professor_resumo(bigint)" in output.getvalue()
