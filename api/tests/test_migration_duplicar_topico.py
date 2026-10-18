import re
from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261011_02:20261011_03", sql=True)
    return output.getvalue()


def _colunas_inseridas(sql: str, tabela: str) -> set[str]:
    m = re.search(rf"INSERT INTO public\.{tabela} \(([^)]*)\)", sql)
    assert m, f"sem INSERT em {tabela}"
    return {c.strip() for c in m.group(1).split(",")}


def test_funcao_confere_posse_e_so_executa_para_autenticado() -> None:
    sql = _upgrade_sql()

    assert "CREATE OR REPLACE FUNCTION public.duplicar_topico(p_topico_id bigint)" in sql
    assert "SECURITY DEFINER" in sql
    assert "SET search_path = public, pg_temp" in sql
    posse = sql.index("FROM public.app_classes_do_professor()")
    assert "NOT EXISTS (" in sql[posse - 200 : posse]
    # A posse vem antes de qualquer cópia.
    assert posse < sql.index("INSERT INTO public.topicos")
    assert "USING ERRCODE = '42501'" in sql
    assert "REVOKE ALL ON FUNCTION public.duplicar_topico(bigint) FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.duplicar_topico(bigint) TO authenticated" in sql


def test_copia_a_arvore_do_topico_sem_progresso_nem_ligacoes() -> None:
    sql = _upgrade_sql()

    assert _colunas_inseridas(sql, "conteudos") == {"topico_id", "titulo", "tipo", "conteudo", "ordem", "metadata"}
    assert {"pontuacao_maxima", "data_entrega", "metadata"} <= _colunas_inseridas(sql, "atividades")
    assert {"midia_url", "nota_estabelecida"} <= _colunas_inseridas(sql, "questoes")
    assert {"cor", "ordem", "conteudo_origem_id"} <= _colunas_inseridas(sql, "cards")
    assert "INSERT INTO public.atividade_conteudos" in sql
    # A cópia entra sem ligações e no fim da turma.
    assert "'[]'::json," in sql
    assert "coalesce(max(ordem), 0) + 1" in sql
    # Nada de aluno, telemetria ou personalização.
    for proibido in ("conteudo_aluno", "atividade_aluno", "telemetria", "conteudo_personalizado"):
        assert proibido not in sql


def test_topico_entra_antes_dos_conteudos_para_o_class_delta_coalescer() -> None:
    sql = _upgrade_sql()
    assert sql.index("INSERT INTO public.topicos") < sql.index("INSERT INTO public.conteudos")


def test_downgrade_remove_a_funcao() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261011_03:20261011_02", sql=True)
    assert "DROP FUNCTION IF EXISTS public.duplicar_topico(bigint)" in output.getvalue()
