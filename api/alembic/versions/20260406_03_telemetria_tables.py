"""create telemetria tables"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260406_03"
down_revision = "20260406_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "telemetria_sessoes",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, nullable=False),
        sa.Column("aluno_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("classe_id", sa.BigInteger(), nullable=False),
        sa.Column("topico_inicial_id", sa.BigInteger(), nullable=True),
        sa.Column("camera_opt_in", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["aluno_id"], ["alunos.id"], name="fk_telemetria_sessoes_aluno"),
    )

    op.create_table(
        "telemetria_lotes",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, nullable=False),
        sa.Column("sessao_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("aluno_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("classe_id", sa.BigInteger(), nullable=False),
        sa.Column("topico_id", sa.BigInteger(), nullable=True),
        sa.Column("atividade_id", sa.BigInteger(), nullable=True),
        sa.Column("conteudo_id", sa.BigInteger(), nullable=True),
        sa.Column("screen_name", sa.Text(), nullable=False),
        sa.Column("route_name", sa.Text(), nullable=False),
        sa.Column("flush_reason", sa.Text(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("study_elapsed_sec", sa.Numeric(), nullable=False),
        sa.Column("screen_dwell_sec", sa.Numeric(), nullable=False),
        sa.Column("active_sec", sa.Numeric(), nullable=False),
        sa.Column("idle_sec", sa.Numeric(), nullable=False),
        sa.Column("touch_count", sa.Integer(), nullable=False),
        sa.Column("scroll_distance_px", sa.Numeric(), nullable=False),
        sa.Column("max_depth_px", sa.Numeric(), nullable=False),
        sa.Column("frame_sent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("analysis_ciclo_id", sa.Text(), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["sessao_id"], ["telemetria_sessoes.id"], name="fk_telemetria_lotes_sessao"),
        sa.ForeignKeyConstraint(["aluno_id"], ["alunos.id"], name="fk_telemetria_lotes_aluno"),
    )

    op.create_index(
        "uq_telemetria_lotes_sessao_captured_at_flush_reason",
        "telemetria_lotes",
        ["sessao_id", "captured_at", "flush_reason"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_telemetria_lotes_sessao_captured_at_flush_reason", table_name="telemetria_lotes")
    op.drop_table("telemetria_lotes")
    op.drop_table("telemetria_sessoes")
