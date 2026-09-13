"""Add guild chat and enforce a maximum of ten members per guild."""

from pathlib import Path

from alembic import op

revision = "20260913_01"
down_revision = "20260912_13"
branch_labels = None
depends_on = None


def upgrade() -> None:
    path = Path(__file__).resolve().parents[3] / "docs" / "mobile" / "sql" / "20260913_01_guilda_chat_limite.sql"
    op.execute(path.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("""
      DROP FUNCTION IF EXISTS public.guilda_chat_enviar(uuid,text,text,jsonb);
      DROP FUNCTION IF EXISTS public.guilda_chat_listar(uuid,integer);
      DROP TABLE IF EXISTS public.guilda_mensagens;
    """)
