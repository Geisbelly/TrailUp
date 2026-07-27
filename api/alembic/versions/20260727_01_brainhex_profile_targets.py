"""make BrainHex profile explicit in generation targets and personalized content"""

import sqlalchemy as sa

from alembic import op

revision = "20260727_01"
down_revision = "20260421_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "personalizacao_job_targets",
        # NULL identifica alvos legados, cujo perfil ainda vive no
        # payload.target_profile_map do job.
        sa.Column("brainhex_profile_key", sa.Text(), nullable=True),
    )
    op.add_column(
        "personalizacao_job_targets",
        sa.Column(
            "is_profile_template",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "conteudo_personalizado",
        sa.Column("brainhex_profile_key", sa.Text(), nullable=True),
    )
    op.execute(
        """
        UPDATE conteudo_personalizado
        SET brainhex_profile_key = COALESCE(
          NULLIF(LOWER(BTRIM(plano ->> 'brainhex_profile_key')), ''),
          NULLIF(LOWER(BTRIM(plano ->> 'perfil_dominante')), ''),
          'mastermind'
        )
        WHERE brainhex_profile_key IS NULL
        """
    )
    op.alter_column(
        "conteudo_personalizado",
        "brainhex_profile_key",
        nullable=False,
        server_default="mastermind",
    )

    op.drop_index(
        "uq_conteudo_personalizado_aluno_topico",
        table_name="conteudo_personalizado",
    )
    op.create_index(
        "uq_conteudo_personalizado_aluno_topico_perfil",
        "conteudo_personalizado",
        ["aluno_id", "topico_id", "brainhex_profile_key"],
        unique=True,
        postgresql_where=sa.text("topico_id IS NOT NULL"),
    )

    with op.batch_alter_table("personalizacao_job_targets") as batch_op:
        batch_op.drop_constraint("uq_job_target_aluno_topico_conteudo", type_="unique")
        batch_op.create_unique_constraint(
            "uq_job_target_aluno_topico_conteudo_perfil",
            ["job_id", "aluno_id", "topico_id", "conteudo_id", "brainhex_profile_key"],
        )


def downgrade() -> None:
    # Mantém apenas o registro mais recente por aluno/tópico antes de restaurar
    # a restrição antiga, evitando falha de downgrade por duplicidade.
    op.execute(
        """
        DELETE FROM conteudo_personalizado older
        USING conteudo_personalizado newer
        WHERE older.aluno_id = newer.aluno_id
          AND older.topico_id = newer.topico_id
          AND older.id < newer.id
        """
    )
    with op.batch_alter_table("personalizacao_job_targets") as batch_op:
        batch_op.drop_constraint(
            "uq_job_target_aluno_topico_conteudo_perfil",
            type_="unique",
        )
        batch_op.create_unique_constraint(
            "uq_job_target_aluno_topico_conteudo",
            ["job_id", "aluno_id", "topico_id", "conteudo_id"],
        )
    op.drop_index(
        "uq_conteudo_personalizado_aluno_topico_perfil",
        table_name="conteudo_personalizado",
    )
    op.create_index(
        "uq_conteudo_personalizado_aluno_topico",
        "conteudo_personalizado",
        ["aluno_id", "topico_id"],
        unique=True,
        postgresql_where=sa.text("topico_id IS NOT NULL"),
    )
    op.drop_column("conteudo_personalizado", "brainhex_profile_key")
    op.drop_column("personalizacao_job_targets", "is_profile_template")
    op.drop_column("personalizacao_job_targets", "brainhex_profile_key")
