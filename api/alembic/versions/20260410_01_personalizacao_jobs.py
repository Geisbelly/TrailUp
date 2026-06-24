"""create personalizacao_jobs and personalizacao_job_targets tables"""

from alembic import op
from sqlalchemy.dialects import postgresql
import sqlalchemy as sa


revision = "20260410_01"
down_revision = "20260408_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "personalizacao_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("classe_id", sa.BigInteger(), nullable=False),
        sa.Column("aluno_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("topico_id", sa.BigInteger(), nullable=True),
        sa.Column("conteudo_id", sa.BigInteger(), nullable=True),
        sa.Column("trigger_source", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("total_targets", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("processed_targets", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("error_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["classe_id"], ["classe.id"], name="fk_personalizacao_jobs_classe"),
        sa.ForeignKeyConstraint(["aluno_id"], ["alunos.id"], name="fk_personalizacao_jobs_aluno"),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'partial', 'failed')",
            name="ck_personalizacao_jobs_status",
        ),
    )

    op.create_index(
        "idx_personalizacao_jobs_status_created",
        "personalizacao_jobs",
        ["status", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_personalizacao_jobs_classe",
        "personalizacao_jobs",
        ["classe_id", "status"],
        unique=False,
    )

    op.create_table(
        "personalizacao_job_targets",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True, nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("aluno_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("topico_id", sa.BigInteger(), nullable=False),
        sa.Column("conteudo_id", sa.BigInteger(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("personalizacao_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["job_id"], ["personalizacao_jobs.id"], name="fk_job_targets_job", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["aluno_id"], ["alunos.id"], name="fk_job_targets_aluno"),
        sa.ForeignKeyConstraint(["personalizacao_id"], ["conteudo_personalizado.id"], name="fk_job_targets_personalizacao"),
        sa.UniqueConstraint("job_id", "aluno_id", "topico_id", name="uq_job_target_aluno_topico"),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'failed', 'skipped')",
            name="ck_job_targets_status",
        ),
    )

    op.create_index(
        "idx_job_targets_job_status",
        "personalizacao_job_targets",
        ["job_id", "status"],
        unique=False,
    )
    op.create_index(
        "idx_job_targets_aluno",
        "personalizacao_job_targets",
        ["aluno_id", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_job_targets_aluno", table_name="personalizacao_job_targets")
    op.drop_index("idx_job_targets_job_status", table_name="personalizacao_job_targets")
    op.drop_table("personalizacao_job_targets")

    op.drop_index("idx_personalizacao_jobs_classe", table_name="personalizacao_jobs")
    op.drop_index("idx_personalizacao_jobs_status_created", table_name="personalizacao_jobs")
    op.drop_table("personalizacao_jobs")
