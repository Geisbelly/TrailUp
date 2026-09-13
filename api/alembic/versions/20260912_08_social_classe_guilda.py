"""Make Social class-scoped and expose each classmate guild summary."""

from pathlib import Path

from alembic import op

revision = "20260912_08"
down_revision = "20260912_07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql = (Path(__file__).resolve().parents[3] / "docs" / "mobile" / "sql" / "20260912_03_guildas_perfil_publico.sql").read_text(encoding="utf-8")
    start = sql.index("CREATE OR REPLACE FUNCTION public.social_listar_pessoas(p_classe_id bigint)")
    end = sql.index("COMMIT;", start)
    op.execute("DROP FUNCTION IF EXISTS public.social_listar_pessoas(bigint);")
    op.execute(sql[start:end] + "GRANT EXECUTE ON FUNCTION public.social_listar_pessoas(bigint) TO authenticated;")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.social_listar_pessoas(bigint);")
