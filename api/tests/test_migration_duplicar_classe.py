import re
from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261003_10:20261011_01", sql=True)
    return output.getvalue()


def _colunas_inseridas(sql: str, tabela: str) -> set[str]:
    m = re.search(rf"INSERT INTO public\.{tabela} \(([^)]*)\)", sql)
    assert m, f"sem INSERT em {tabela}"
    return {c.strip() for c in m.group(1).split(",")}


def test_funcao_confere_posse_antes_de_ler_a_trilha() -> None:
    sql = _upgrade_sql()

    assert "CREATE OR REPLACE FUNCTION public.duplicar_classe(p_classe_id bigint)" in sql
    assert "RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER" in sql
    assert "SET search_path = public, pg_temp" in sql
    # NOT EXISTS (não NOT IN) sobre o helper de posse, e antes de qualquer leitura da trilha.
    posse = sql.index("FROM public.app_classes_do_professor()")
    assert "NOT EXISTS (" in sql[posse - 200 : posse]
    assert posse < sql.index("FROM public.topicos WHERE classe_id = p_classe_id")
    assert "USING ERRCODE = '42501'" in sql
    assert "v_professor IS NULL" in sql
    # A cópia pertence a quem duplicou.
    assert "INSERT INTO public.classe (materia_id, professor_id, descricao)" in sql
    assert "v_professor," in sql


def test_copia_todas_as_colunas_de_conteudo() -> None:
    sql = _upgrade_sql()

    assert _colunas_inseridas(sql, "topicos") == {"classe_id", "nome", "descricao", "ordem"}
    assert _colunas_inseridas(sql, "conteudos") == {"topico_id", "titulo", "tipo", "conteudo", "ordem", "metadata"}
    assert _colunas_inseridas(sql, "atividades") == {
        "topico_id", "titulo", "descricao", "tipo", "pontuacao_maxima", "data_entrega", "metadata",
    }
    assert _colunas_inseridas(sql, "questoes") == {
        "atividade_id", "enunciado", "tipo", "alternativas", "resposta_correta", "midia_url", "nota_estabelecida",
    }
    assert _colunas_inseridas(sql, "cards") == {
        "conteudo_id", "titulo", "descricao", "imagem_url", "cor", "ordem", "conteudo_origem_id",
    }
    assert _colunas_inseridas(sql, "atividade_conteudos") == {"atividade_id", "conteudo_id"}
    # next/depende remapeados para os tópicos novos; origem do card remapeada.
    assert "json_array_elements_text(r.next)" in sql and "json_array_elements_text(r.depende)" in sql
    assert "k.conteudo_origem_id IS NOT NULL AND v_conteudos ? k.conteudo_origem_id::text" in sql


def test_nao_copia_dado_de_aluno_nem_personalizacao() -> None:
    sql = _upgrade_sql()
    corpo = sql[sql.index("CREATE OR REPLACE FUNCTION public.duplicar_classe") : sql.index("REVOKE ALL ON FUNCTION public.duplicar_classe")]

    for tabela in (
        "classe_aluno", "topico_aluno", "conteudo_aluno", "atividade_aluno", "questao_aluno",
        "personalizacao_item_progresso", "telemetria_lotes", "estudo_sessoes", "guilda", "ranks",
        "conteudo_personalizado", "cards_personalizados", "fontes_personalizacao",
    ):
        assert f"INSERT INTO public.{tabela}" not in corpo, tabela


def test_nome_da_copia_e_numeracao() -> None:
    sql = _upgrade_sql()

    assert "' (cópia)'" in sql
    assert "' (cópia ' || v_numero || ')'" in sql
    # Duplicar uma cópia continua a numeração do original.
    assert r"regexp_replace(v_base, '\s*\(cópia(\s+[0-9]+)?\)$', '')" in sql
    # Duas duplicações simultâneas não escolhem o mesmo número.
    assert "pg_advisory_xact_lock(hashtext('duplicar_classe:' || v_professor::text))" in sql


def test_ordem_que_evita_alvos_repetidos_no_class_delta() -> None:
    sql = _upgrade_sql()
    corpo = sql[sql.index("CREATE OR REPLACE FUNCTION public.duplicar_classe") :]

    # Conteúdos entram dentro do laço do tópico, e next/depende só depois.
    assert corpo.index("INSERT INTO public.topicos") < corpo.index("INSERT INTO public.conteudos")
    assert corpo.index("INSERT INTO public.conteudos") < corpo.index("UPDATE public.topicos SET")


def test_permissoes_e_downgrade() -> None:
    sql = _upgrade_sql()
    assert sql.index("REVOKE ALL ON FUNCTION public.duplicar_classe(bigint) FROM PUBLIC, anon") < sql.index(
        "GRANT EXECUTE ON FUNCTION public.duplicar_classe(bigint) TO authenticated"
    )
    assert "UPDATE alembic_version SET version_num='20261011_01'" in sql

    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261011_01:20261003_10", sql=True)
    assert "DROP FUNCTION IF EXISTS public.duplicar_classe(bigint)" in output.getvalue()
