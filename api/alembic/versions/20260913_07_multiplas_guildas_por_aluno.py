"""Allow students to join multiple guilds in the same class."""

from pathlib import Path

from alembic import op

revision = "20260913_07"
down_revision = "20260913_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    path = Path(__file__).resolve().parents[3] / "docs" / "mobile" / "sql" / "20260913_07_multiplas_guildas_por_aluno.sql"
    op.execute(path.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS public.guilda_membro_ativo_por_guilda_uidx;")
