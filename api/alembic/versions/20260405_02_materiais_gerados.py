"""create materiais gerados table"""

import sqlalchemy as sa

from alembic import op

revision = "20260405_02"
down_revision = "20260405_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "materiais_gerados",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("aluno_id", sa.Uuid(), nullable=False),
        sa.Column("conteudo_id", sa.BigInteger(), nullable=True),
        sa.Column("tipo", sa.Text(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("arquivo_url", sa.Text(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["aluno_id"], ["alunos.id"], name="fk_materiais_gerados_aluno"),
        sa.ForeignKeyConstraint(["conteudo_id"], ["conteudos.id"], name="fk_materiais_gerados_conteudo"),
    )
    op.create_index(
        "idx_materiais_gerados_aluno_conteudo_tipo",
        "materiais_gerados",
        ["aluno_id", "conteudo_id", "tipo"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_materiais_gerados_aluno_conteudo_tipo", table_name="materiais_gerados")
    op.drop_table("materiais_gerados")
