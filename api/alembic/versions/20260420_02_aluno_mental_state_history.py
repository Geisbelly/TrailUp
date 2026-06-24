"""create aluno_mental_state_history table"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260420_02"
down_revision = "20260420_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "aluno_mental_state_history",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True, nullable=False),
        sa.Column("aluno_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("ciclo_id", sa.Text(), nullable=True),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("intensity", sa.Numeric(5, 4), nullable=True),
        sa.Column("confidence", sa.Numeric(5, 4), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["aluno_id"], ["alunos.id"], name="fk_aluno_mental_state_history_aluno"),
    )
    op.create_index(
        "idx_aluno_mental_state_history_aluno_created",
        "aluno_mental_state_history",
        ["aluno_id", sa.text("created_at DESC")],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "idx_aluno_mental_state_history_aluno_created",
        table_name="aluno_mental_state_history",
    )
    op.drop_table("aluno_mental_state_history")
