"""add ai_patch to conteudo_personalizado"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "20260406_02"
down_revision = "20260406_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conteudo_personalizado", sa.Column("ai_patch", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("conteudo_personalizado", "ai_patch")
