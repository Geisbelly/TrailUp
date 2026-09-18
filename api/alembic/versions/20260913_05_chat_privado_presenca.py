"""Make private chat direct and refresh presence in the modal."""

from pathlib import Path

from alembic import op

revision = "20260913_05"
down_revision = "20260913_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    path = Path(__file__).resolve().parents[3] / "docs" / "mobile" / "sql" / "20260913_05_chat_privado_presenca.sql"
    op.execute(path.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.social_presenca_aluno(uuid);")
