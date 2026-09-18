"""Send operating-system notifications for social invitations."""

from pathlib import Path

from alembic import op

revision = "20260913_04"
down_revision = "20260913_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    path = Path(__file__).resolve().parents[3] / "docs" / "mobile" / "sql" / "20260913_04_notificacoes_convites_social.sql"
    op.execute(path.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.social_notificar_evento(uuid,text,text,text,text,jsonb);")
