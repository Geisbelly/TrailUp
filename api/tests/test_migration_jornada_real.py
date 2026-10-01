from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20260929_01:20260929_02", sql=True)
    return output.getvalue()


def test_professor_passa_a_ler_estudo_sessoes_das_proprias_classes() -> None:
    rendered = _upgrade_sql()

    assert "CREATE POLICY estudo_sessoes_professor_sel ON public.estudo_sessoes" in rendered
    politica = rendered[rendered.index("CREATE POLICY estudo_sessoes_professor_sel") :]
    assert "classe_id IN (SELECT public.app_classes_do_professor())" in politica.split(";")[0]


def test_comentarios_por_passo_so_do_professor_da_classe() -> None:
    rendered = _upgrade_sql()

    assert "CREATE TABLE IF NOT EXISTS public.professor_intervencoes_passo" in rendered
    assert "professor_id uuid        NOT NULL DEFAULT auth.uid()" in rendered
    assert "CHECK (char_length(btrim(texto)) BETWEEN 1 AND 2000)" in rendered
    assert "ALTER TABLE public.professor_intervencoes_passo ENABLE ROW LEVEL SECURITY" in rendered

    # Leitura e escrita presas as classes do professor; ninguem grava em nome de outro.
    assert "CREATE POLICY professor_intervencoes_passo_sel" in rendered
    insercao = rendered[rendered.index("CREATE POLICY professor_intervencoes_passo_ins") :].split(";")[0]
    assert "professor_id = auth.uid()" in insercao
    assert "public.app_classes_do_professor()" in insercao
    assert "public.app_alunos_do_professor()" in insercao

    # Historico: sem UPDATE nem DELETE, e o aluno (nem o anonimo) le.
    assert "FOR UPDATE" not in rendered
    assert "FOR DELETE" not in rendered
    assert "aluno_id = auth.uid()" not in rendered
    assert rendered.index("REVOKE ALL ON public.professor_intervencoes_passo FROM anon, authenticated") < rendered.index(
        "GRANT SELECT, INSERT ON public.professor_intervencoes_passo TO authenticated"
    )
    assert "UPDATE alembic_version SET version_num='20260929_02'" in rendered


def test_downgrade_remove_tabela_e_policy() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20260929_02:20260929_01", sql=True)
    rendered = output.getvalue()

    assert rendered.index("DROP POLICY IF EXISTS professor_intervencoes_passo_ins") < rendered.index(
        "DROP TABLE IF EXISTS public.professor_intervencoes_passo"
    )
    assert "DROP POLICY IF EXISTS estudo_sessoes_professor_sel ON public.estudo_sessoes" in rendered
