"""create conteudo_personalizado table"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "20260406_01"
down_revision = "20260405_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conteudo_personalizado",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("aluno_id", sa.Uuid(), nullable=False),
        sa.Column("conteudo_id", sa.BigInteger(), nullable=True),
        sa.Column("topico_id", sa.BigInteger(), nullable=True),
        sa.Column("ciclo_id", sa.Text(), nullable=False),
        sa.Column("plano", JSONB(), nullable=True),
        sa.Column("materiais", JSONB(), nullable=True),
        sa.Column("formato_prioritario", sa.Text(), nullable=True),
        sa.Column("formatos_gerados", sa.ARRAY(sa.Text()), nullable=True),
        sa.Column(
            "gerado_em",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.ForeignKeyConstraint(["aluno_id"], ["alunos.id"], name="fk_conteudo_personalizado_aluno"),
        sa.ForeignKeyConstraint(["conteudo_id"], ["conteudos.id"], name="fk_conteudo_personalizado_conteudo"),
        sa.ForeignKeyConstraint(["topico_id"], ["topicos.id"], name="fk_conteudo_personalizado_topico"),
    )
    op.create_index(
        "idx_conteudo_personalizado_aluno_conteudo",
        "conteudo_personalizado",
        ["aluno_id", "conteudo_id"],
        unique=False,
    )
    op.create_index(
        "idx_conteudo_personalizado_aluno_topico",
        "conteudo_personalizado",
        ["aluno_id", "topico_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_conteudo_personalizado_aluno_topico", table_name="conteudo_personalizado")
    op.drop_index("idx_conteudo_personalizado_aluno_conteudo", table_name="conteudo_personalizado")
    op.drop_table("conteudo_personalizado")
