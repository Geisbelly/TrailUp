"""Expose authorized guild questions and persist typed chat answers."""

from pathlib import Path

from alembic import op

revision = "20260913_03"
down_revision = "20260913_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    path = Path(__file__).resolve().parents[3] / "docs" / "mobile" / "sql" / "20260913_03_chat_questoes_respostas.sql"
    op.execute(path.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.guilda_chat_questao_responder(uuid,text);")
