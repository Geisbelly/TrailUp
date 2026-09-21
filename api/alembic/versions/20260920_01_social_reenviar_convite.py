"""Reuse declined friendships and handle simultaneous invitations."""

from pathlib import Path

from alembic import op

revision = "20260920_01"
down_revision = "20260913_25"
branch_labels = None
depends_on = None


def upgrade() -> None:
    path = Path(__file__).resolve().parents[3] / "docs/mobile/sql/20260920_01_social_reenviar_convite.sql"
    op.execute(path.read_text(encoding="utf-8"))


def downgrade() -> None:
    # Restore only this function, not unrelated notification objects.
    path = Path(__file__).resolve().parents[3] / "docs/mobile/sql/20260913_04_notificacoes_convites_social.sql"
    source = path.read_text(encoding="utf-8")
    start = source.index("CREATE OR REPLACE FUNCTION public.social_enviar_convite(")
    end = source.index("CREATE OR REPLACE FUNCTION public.social_aceitar_convite(", start)
    op.execute(source[start:end])
