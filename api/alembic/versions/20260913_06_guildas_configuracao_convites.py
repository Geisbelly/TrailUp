"""Add guild configuration fields and allow active members to invite."""

from pathlib import Path

from alembic import op

revision = "20260913_06"
down_revision = "20260913_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    path = Path(__file__).resolve().parents[3] / "docs" / "mobile" / "sql" / "20260913_06_guildas_configuracao_convites.sql"
    op.execute(path.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.guilda_atualizar_config(uuid,text,text,text,text,text,text);")
