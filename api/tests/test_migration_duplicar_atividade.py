import re
from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261011_03:20261011_04", sql=True)
    return output.getvalue()


def _colunas_inseridas(sql: str, tabela: str) -> set[str]:
    m = re.search(rf"INSERT INTO public\.{tabela} \(([^)]*)\)", sql)
    assert m, f"sem INSERT em {tabela}"
    return {c.strip() for c in m.group(1).split(",")}


def test_confere_posse_antes_de_copiar_e_restringe_a_execucao() -> None:
    sql = _upgrade_sql()

    assert "CREATE OR REPLACE FUNCTION public.duplicar_atividade(p_atividade_id bigint, p_conteudo_id bigint DEFAULT NULL)" in sql
    assert "SECURITY DEFINER" in sql
    posse = sql.index("FROM public.app_classes_do_professor()")
    assert "NOT EXISTS (" in sql[posse - 200 : posse]
    assert posse < sql.index("INSERT INTO public.atividades")
    assert "USING ERRCODE = '42501'" in sql
    assert "REVOKE ALL ON FUNCTION public.duplicar_atividade(bigint, bigint) FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.duplicar_atividade(bigint, bigint) TO authenticated" in sql


def test_conteudo_precisa_ser_do_mesmo_topico() -> None:
    sql = _upgrade_sql()
    assert "c.id = p_conteudo_id AND c.topico_id = v_origem.topico_id" in sql
    assert sql.index("c.id = p_conteudo_id") < sql.index("INSERT INTO public.atividades")


def test_copia_atividade_e_questoes_sem_dados_de_aluno() -> None:
    sql = _upgrade_sql()

    assert {"pontuacao_maxima", "data_entrega", "metadata"} <= _colunas_inseridas(sql, "atividades")
    assert {"midia_url", "nota_estabelecida", "resposta_correta"} <= _colunas_inseridas(sql, "questoes")
    assert "INSERT INTO public.atividade_conteudos" in sql
    for proibido in ("atividade_aluno", "questao_aluno", "telemetria"):
        assert proibido not in sql


def test_downgrade_remove_a_funcao() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261011_04:20261011_03", sql=True)
    assert "DROP FUNCTION IF EXISTS public.duplicar_atividade(bigint, bigint)" in output.getvalue()
