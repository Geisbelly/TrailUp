"""Show complete public achievements with their metadata."""

from pathlib import Path

from alembic import op

revision = "20260913_08"
down_revision = "20260913_07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    path = Path(__file__).resolve().parents[3] / "docs" / "mobile" / "sql" / "20260913_08_perfil_conquistas_completo.sql"
    op.execute(path.read_text(encoding="utf-8"))


def downgrade() -> None:
    pass
