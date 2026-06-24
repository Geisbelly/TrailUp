"""create personalized cards/activities/questions tables"""

from alembic import op
from sqlalchemy.dialects import postgresql
import sqlalchemy as sa


revision = "20260410_05"
down_revision = "20260410_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cards_personalizados",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True, nullable=False),
        sa.Column("aluno_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("classe_id", sa.BigInteger(), nullable=False),
        sa.Column("topico_id", sa.BigInteger(), nullable=False),
        sa.Column("conteudo_id", sa.BigInteger(), nullable=True),
        sa.Column("ciclo_id", sa.Text(), nullable=False),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("titulo", sa.Text(), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("icone", sa.Text(), nullable=True),
        sa.Column("dificuldade", sa.Text(), nullable=True),
        sa.Column("xp", sa.Integer(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
        sa.Column("obsoleto_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["aluno_id"], ["alunos.id"], name="fk_cards_personalizados_aluno"),
        sa.ForeignKeyConstraint(["classe_id"], ["classe.id"], name="fk_cards_personalizados_classe"),
        sa.ForeignKeyConstraint(["topico_id"], ["topicos.id"], name="fk_cards_personalizados_topico"),
        sa.ForeignKeyConstraint(["conteudo_id"], ["conteudos.id"], name="fk_cards_personalizados_conteudo"),
    )
    op.create_index(
        "idx_cards_personalizados_lookup",
        "cards_personalizados",
        ["aluno_id", "topico_id", "ciclo_id", "ordem"],
        unique=False,
    )
    op.create_index(
        "idx_cards_personalizados_active",
        "cards_personalizados",
        ["aluno_id", "topico_id", "ativo"],
        unique=False,
    )

    op.create_table(
        "atividades_personalizadas",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True, nullable=False),
        sa.Column("aluno_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("classe_id", sa.BigInteger(), nullable=False),
        sa.Column("topico_id", sa.BigInteger(), nullable=False),
        sa.Column("conteudo_id", sa.BigInteger(), nullable=True),
        sa.Column("ciclo_id", sa.Text(), nullable=False),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("titulo", sa.Text(), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("conteudo", sa.Text(), nullable=True),
        sa.Column("tipo", sa.Text(), nullable=False, server_default=sa.text("'quiz'")),
        sa.Column("pontuacao_maxima", sa.Numeric(10, 2), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
        sa.Column("obsoleto_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["aluno_id"], ["alunos.id"], name="fk_atividades_personalizadas_aluno"),
        sa.ForeignKeyConstraint(["classe_id"], ["classe.id"], name="fk_atividades_personalizadas_classe"),
        sa.ForeignKeyConstraint(["topico_id"], ["topicos.id"], name="fk_atividades_personalizadas_topico"),
        sa.ForeignKeyConstraint(["conteudo_id"], ["conteudos.id"], name="fk_atividades_personalizadas_conteudo"),
    )
    op.create_index(
        "idx_atividades_personalizadas_lookup",
        "atividades_personalizadas",
        ["aluno_id", "topico_id", "ciclo_id", "ordem"],
        unique=False,
    )
    op.create_index(
        "idx_atividades_personalizadas_active",
        "atividades_personalizadas",
        ["aluno_id", "topico_id", "ativo"],
        unique=False,
    )

    op.create_table(
        "questoes_personalizadas",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True, nullable=False),
        sa.Column("atividade_personalizada_id", sa.BigInteger(), nullable=False),
        sa.Column("aluno_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("classe_id", sa.BigInteger(), nullable=False),
        sa.Column("topico_id", sa.BigInteger(), nullable=False),
        sa.Column("conteudo_id", sa.BigInteger(), nullable=True),
        sa.Column("ciclo_id", sa.Text(), nullable=False),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("tipo", sa.Text(), nullable=False, server_default=sa.text("'quiz'")),
        sa.Column("enunciado", sa.Text(), nullable=False),
        sa.Column("alternativas", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("resposta_correta", sa.Text(), nullable=True),
        sa.Column("explicacao", sa.Text(), nullable=True),
        sa.Column("nota_estabelecida", sa.Numeric(10, 2), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
        sa.Column("obsoleto_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(
            ["atividade_personalizada_id"],
            ["atividades_personalizadas.id"],
            name="fk_questoes_personalizadas_atividade",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["aluno_id"], ["alunos.id"], name="fk_questoes_personalizadas_aluno"),
        sa.ForeignKeyConstraint(["classe_id"], ["classe.id"], name="fk_questoes_personalizadas_classe"),
        sa.ForeignKeyConstraint(["topico_id"], ["topicos.id"], name="fk_questoes_personalizadas_topico"),
        sa.ForeignKeyConstraint(["conteudo_id"], ["conteudos.id"], name="fk_questoes_personalizadas_conteudo"),
    )
    op.create_index(
        "idx_questoes_personalizadas_lookup",
        "questoes_personalizadas",
        ["aluno_id", "topico_id", "ciclo_id", "ordem"],
        unique=False,
    )
    op.create_index(
        "idx_questoes_personalizadas_active",
        "questoes_personalizadas",
        ["aluno_id", "topico_id", "ativo"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_questoes_personalizadas_active", table_name="questoes_personalizadas")
    op.drop_index("idx_questoes_personalizadas_lookup", table_name="questoes_personalizadas")
    op.drop_table("questoes_personalizadas")

    op.drop_index("idx_atividades_personalizadas_active", table_name="atividades_personalizadas")
    op.drop_index("idx_atividades_personalizadas_lookup", table_name="atividades_personalizadas")
    op.drop_table("atividades_personalizadas")

    op.drop_index("idx_cards_personalizados_active", table_name="cards_personalizados")
    op.drop_index("idx_cards_personalizados_lookup", table_name="cards_personalizados")
    op.drop_table("cards_personalizados")
