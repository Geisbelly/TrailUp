"""add nota_estabelecida to questoes"""

from alembic import op

revision = "20260410_04"
down_revision = "20260410_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE questoes ADD COLUMN IF NOT EXISTS nota_estabelecida numeric(10,2) NOT NULL DEFAULT 1"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE questoes DROP COLUMN IF EXISTS nota_estabelecida")
