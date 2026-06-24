"""create ia_decision_logs table"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260410_02"
down_revision = "20260410_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ia_decision_logs",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True, nullable=False),
        sa.Column("ciclo_id", sa.Text(), nullable=True),
        sa.Column("batch_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("sessao_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("aluno_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("classe_id", sa.BigInteger(), nullable=False),
        sa.Column("topico_id", sa.BigInteger(), nullable=True),
        sa.Column("conteudo_id", sa.BigInteger(), nullable=True),
        sa.Column("atividade_id", sa.BigInteger(), nullable=True),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("stage", sa.Text(), nullable=False),
        sa.CheckConstraint(
            "source IN ('telemetria', 'personalizacao', 'chat', 'manual')",
            name="ck_ia_decision_logs_source",
        ),
        sa.Column("provider", sa.Text(), nullable=True),
        sa.Column("model_name", sa.Text(), nullable=True),
        sa.Column("trigger_event", sa.Text(), nullable=True),
        sa.Column("input_summary", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("prompt_text", sa.Text(), nullable=True),
        sa.Column("raw_response", sa.Text(), nullable=True),
        sa.Column("parsed_response", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("decision_summary", sa.Text(), nullable=True),
        sa.Column("actions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["aluno_id"], ["alunos.id"], name="fk_ia_decision_logs_aluno"),
        sa.ForeignKeyConstraint(["classe_id"], ["classe.id"], name="fk_ia_decision_logs_classe"),
    )

    op.create_index(
        "idx_ia_decision_logs_aluno_created",
        "ia_decision_logs",
        ["aluno_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_ia_decision_logs_stage",
        "ia_decision_logs",
        ["source", "stage", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_ia_decision_logs_ciclo",
        "ia_decision_logs",
        ["ciclo_id", "aluno_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_ia_decision_logs_ciclo", table_name="ia_decision_logs")
    op.drop_index("idx_ia_decision_logs_stage", table_name="ia_decision_logs")
    op.drop_index("idx_ia_decision_logs_aluno_created", table_name="ia_decision_logs")
    op.drop_table("ia_decision_logs")
