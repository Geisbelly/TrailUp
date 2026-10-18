from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261017_09:20261017_10", sql=True)
    return output.getvalue()


def _funcao(sql: str) -> str:
    inicio = sql.index("CREATE OR REPLACE FUNCTION public.evento_classe_definir_missoes")
    return sql[inicio : sql.index("REVOKE ALL ON FUNCTION", inicio)]


def test_tabela_com_rls_e_policies_de_professor_e_aluno_sem_escrita_direta() -> None:
    sql = _upgrade_sql()

    assert "CREATE TABLE IF NOT EXISTS public.eventos_classe_missoes" in sql
    assert "PRIMARY KEY (evento_id, atividade_id)" in sql
    assert "ALTER TABLE public.eventos_classe_missoes ENABLE ROW LEVEL SECURITY" in sql
    assert "CREATE POLICY eventos_classe_missoes_professor_sel" in sql
    assert "CREATE POLICY eventos_classe_missoes_aluno_sel" in sql
    assert "e.status <> 'rascunho'" in sql
    assert "REVOKE ALL ON public.eventos_classe_missoes FROM anon, authenticated" in sql
    assert "GRANT SELECT ON public.eventos_classe_missoes TO authenticated" in sql
    assert "GRANT INSERT" not in sql and "GRANT UPDATE" not in sql and "GRANT DELETE" not in sql
    assert " NOT IN " not in sql


def test_posse_antes_de_tudo_e_so_em_rascunho() -> None:
    f = _funcao(_upgrade_sql())

    assert f.index("app_classes_do_professor()") < f.index("DELETE FROM public.eventos_classe_missoes")
    assert "USING ERRCODE = '42501'" in f
    assert "IF v_evento.status <> 'rascunho' THEN" in f
    assert "FOR UPDATE" in f
    assert "SECURITY DEFINER" in f and "SET search_path = public, pg_temp" in f


def test_so_missoes_da_mesma_turma_e_no_maximo_20() -> None:
    f = _funcao(_upgrade_sql())

    assert "a.tipo = 'missao' AND t.classe_id = v_evento.classe_id" in f
    assert "IF v_validas <> cardinality(v_ids) THEN" in f
    assert "IF cardinality(v_ids) > 20 THEN" in f
    # lista repetida ou com nulo não quebra nem passa duas vezes
    assert "array_agg(DISTINCT x)" in f and "WHERE x IS NOT NULL" in f


def test_troca_a_lista_inteira_e_so_o_cliente_autenticado_executa() -> None:
    sql = _upgrade_sql()
    f = _funcao(sql)

    assert f.index("DELETE FROM public.eventos_classe_missoes") < f.index("INSERT INTO public.eventos_classe_missoes")
    assert "REVOKE ALL ON FUNCTION public.evento_classe_definir_missoes(uuid, bigint[]) FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.evento_classe_definir_missoes(uuid, bigint[]) TO authenticated" in sql


def test_downgrade() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261017_10:20261017_09", sql=True)
    sql = output.getvalue()

    assert "DROP FUNCTION IF EXISTS public.evento_classe_definir_missoes(uuid, bigint[])" in sql
    assert "DROP TABLE IF EXISTS public.eventos_classe_missoes" in sql
