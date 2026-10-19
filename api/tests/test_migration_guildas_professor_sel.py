from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261019_02:20261019_03", sql=True)
    return output.getvalue()


def test_professor_le_as_guildas_das_proprias_turmas() -> None:
    sql = _upgrade_sql()

    assert "GRANT SELECT ON public.guildas TO authenticated" in sql
    policy = sql[sql.index("CREATE POLICY guildas_professor_sel ON public.guildas") :][:300]
    assert "FOR SELECT TO authenticated" in policy
    assert "classe_id IN (SELECT public.app_classes_do_professor())" in policy


def test_so_leitura_e_nada_para_anon() -> None:
    sql = _upgrade_sql()

    assert "REVOKE ALL ON public.guildas FROM anon, authenticated" in sql
    assert "GRANT INSERT" not in sql
    assert "GRANT UPDATE" not in sql
    assert "GRANT DELETE" not in sql
    assert "TO anon" not in sql
    assert "FOR INSERT" not in sql and "FOR UPDATE" not in sql and "FOR DELETE" not in sql and "FOR ALL" not in sql
