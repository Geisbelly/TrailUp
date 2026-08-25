"""create classe_perfil_summary table for group profile distribution"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260420_01"
down_revision = "20260416_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "classe_perfil_summary",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True, nullable=False),
        sa.Column("classe_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "distribuicao",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("perfil_predominante", sa.Text(), nullable=True),
        sa.Column("total_alunos", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "media_desempenho",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["classe_id"], ["classe.id"], name="fk_classe_perfil_summary_classe"),
        sa.UniqueConstraint("classe_id", name="uq_classe_perfil_summary_classe"),
    )
    op.create_index(
        "idx_classe_perfil_summary_classe",
        "classe_perfil_summary",
        ["classe_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_classe_perfil_summary_classe", table_name="classe_perfil_summary")
    op.drop_table("classe_perfil_summary")
