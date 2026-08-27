"""Persist active BrainHex profile selected by each student.

Revision ID: 20260826_13
Revises: 20260826_12
"""

from alembic import op
import sqlalchemy as sa


revision = "20260826_13"
down_revision = "20260826_12"
branch_labels = None
depends_on = None


PROFILE_KEYS = (
    "seeker",
    "survivor",
    "daredevil",
    "mastermind",
    "conqueror",
    "socializer",
    "achiever",
)


def upgrade() -> None:
    op.add_column(
        "alunos",
        sa.Column("perfil_ativo", sa.String(length=32), nullable=True),
    )
    allowed = ", ".join(f"'{profile}'" for profile in PROFILE_KEYS)
    op.create_check_constraint(
        "ck_alunos_perfil_ativo_brainhex",
        "alunos",
        f"perfil_ativo IS NULL OR perfil_ativo IN ({allowed})",
    )
    op.create_index("ix_alunos_perfil_ativo", "alunos", ["perfil_ativo"])


def downgrade() -> None:
    op.drop_index("ix_alunos_perfil_ativo", table_name="alunos")
    op.drop_constraint(
        "ck_alunos_perfil_ativo_brainhex",
        "alunos",
        type_="check",
    )
    op.drop_column("alunos", "perfil_ativo")
