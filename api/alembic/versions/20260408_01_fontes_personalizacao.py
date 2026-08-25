"""create fontes_personalizacao table"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260408_01"
down_revision = "20260406_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fontes_personalizacao",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True, nullable=False),
        sa.Column("classe_id", sa.BigInteger(), nullable=False),
        sa.Column("topico_id", sa.BigInteger(), nullable=True),
        sa.Column("conteudo_id", sa.BigInteger(), nullable=True),
        sa.Column("aluno_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("professor_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("visibilidade", sa.Text(), nullable=False, server_default=sa.text("'classe'")),
        sa.Column("tipo", sa.Text(), nullable=False),
        sa.Column("titulo", sa.Text(), nullable=True),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("arquivo_url", sa.Text(), nullable=True),
        sa.Column("storage_path", sa.Text(), nullable=True),
        sa.Column("mime_type", sa.Text(), nullable=True),
        sa.Column("nome_arquivo", sa.Text(), nullable=True),
        sa.Column("tamanho_bytes", sa.BigInteger(), nullable=True),
        sa.Column("origem", sa.Text(), nullable=False, server_default=sa.text("'upload'")),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["classe_id"], ["classe.id"], name="fk_fontes_personalizacao_classe"),
        sa.ForeignKeyConstraint(["topico_id"], ["topicos.id"], name="fk_fontes_personalizacao_topico"),
        sa.ForeignKeyConstraint(["conteudo_id"], ["conteudos.id"], name="fk_fontes_personalizacao_conteudo"),
        sa.ForeignKeyConstraint(["aluno_id"], ["alunos.id"], name="fk_fontes_personalizacao_aluno"),
        sa.ForeignKeyConstraint(["professor_id"], ["professor.id"], name="fk_fontes_personalizacao_professor"),
    )

    op.create_index(
        "idx_fontes_personalizacao_contexto",
        "fontes_personalizacao",
        ["classe_id", "topico_id", "conteudo_id", "visibilidade", "aluno_id"],
        unique=False,
    )
    op.create_index(
        "idx_fontes_personalizacao_tipo",
        "fontes_personalizacao",
        ["tipo", "origem", "criado_em"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_fontes_personalizacao_tipo", table_name="fontes_personalizacao")
    op.drop_index("idx_fontes_personalizacao_contexto", table_name="fontes_personalizacao")
    op.drop_table("fontes_personalizacao")
