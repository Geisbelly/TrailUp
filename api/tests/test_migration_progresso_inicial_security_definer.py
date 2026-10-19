from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261017_03:20261017_04", sql=True)
    return output.getvalue()


def test_as_duas_funcoes_rodam_como_dono_com_search_path_fixo() -> None:
    sql = _upgrade_sql()

    for funcao in ("trg_conteudos_after_insert", "trg_atividades_after_insert"):
        inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{funcao}()")
        cabecalho = sql[inicio : sql.index("AS $fn$", inicio)]
        assert "SECURITY DEFINER" in cabecalho
        assert "SET search_path = public, pg_temp" in cabecalho


def test_so_cria_a_linha_inicial_de_quem_esta_na_turma_e_nunca_sobrescreve() -> None:
    sql = _upgrade_sql()

    for tabela in ("conteudo_aluno", "atividade_aluno"):
        corpo = sql[sql.index(f"INSERT INTO public.{tabela}") :][:700]
        assert "FROM public.classe_aluno ca" in corpo
        assert "WHERE ca.classe_id = v_classe_id" in corpo
        assert "NOT EXISTS (" in corpo
        assert "'não iniciado'::status_atividade" in corpo
    assert "UPDATE public.conteudo_aluno" not in sql
    assert "UPDATE public.atividade_aluno" not in sql


def test_gatilhos_versionados_e_funcoes_fora_da_superficie_rest() -> None:
    sql = _upgrade_sql()

    assert "AFTER INSERT ON public.conteudos" in sql
    assert "AFTER INSERT ON public.atividades" in sql
    assert "REVOKE ALL ON FUNCTION public.trg_conteudos_after_insert() FROM PUBLIC, anon, authenticated" in sql
    assert "REVOKE ALL ON FUNCTION public.trg_atividades_after_insert() FROM PUBLIC, anon, authenticated" in sql
