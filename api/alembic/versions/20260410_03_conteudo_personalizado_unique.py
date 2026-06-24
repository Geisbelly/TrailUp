"""add unique index on conteudo_personalizado (aluno_id, topico_id)"""

import sqlalchemy as sa

from alembic import op

revision = "20260410_03"
down_revision = "20260410_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_conteudo_personalizado_aluno_topico",
        "conteudo_personalizado",
        ["aluno_id", "topico_id"],
        unique=True,
        postgresql_where=sa.text("topico_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_conteudo_personalizado_aluno_topico", table_name="conteudo_personalizado")
