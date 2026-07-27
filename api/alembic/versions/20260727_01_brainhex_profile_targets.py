"""make BrainHex profile explicit in generation targets and personalized content"""

import sqlalchemy as sa

from alembic import op

revision = "20260727_01"
down_revision = "20260411_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Parte da estrutura de producao foi criada historicamente fora do
    # Alembic. Os comandos defensivos abaixo aceitam tanto indices quanto
    # constraints com os nomes legados e tornam um novo deploy repetivel.
    op.execute(
        """
        ALTER TABLE personalizacao_job_targets
        ADD COLUMN IF NOT EXISTS brainhex_profile_key TEXT
        """
    )
    op.execute(
        """
        ALTER TABLE personalizacao_job_targets
        ADD COLUMN IF NOT EXISTS is_profile_template BOOLEAN NOT NULL DEFAULT false
        """
    )
    op.execute(
        """
        ALTER TABLE conteudo_personalizado
        ADD COLUMN IF NOT EXISTS brainhex_profile_key TEXT
        """
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
    op.execute(
        """
        ALTER TABLE conteudo_personalizado
        ALTER COLUMN brainhex_profile_key SET NOT NULL
        """
    )
    op.execute(
        """
        ALTER TABLE conteudo_personalizado
        ALTER COLUMN brainhex_profile_key SET DEFAULT 'mastermind'
        """
    )
    op.execute(
        """
        ALTER TABLE conteudo_personalizado
        DROP CONSTRAINT IF EXISTS uq_conteudo_personalizado_aluno_topico
        """
    )
    op.execute("DROP INDEX IF EXISTS uq_conteudo_personalizado_aluno_topico")
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_conteudo_personalizado_aluno_topico_perfil
        ON conteudo_personalizado (aluno_id, topico_id, brainhex_profile_key)
        WHERE topico_id IS NOT NULL
        """
    )
    op.execute(
        """
        ALTER TABLE personalizacao_job_targets
        DROP CONSTRAINT IF EXISTS uq_job_target_aluno_topico_conteudo
        """
    )
    op.execute("DROP INDEX IF EXISTS uq_job_target_aluno_topico_conteudo")
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'uq_job_target_aluno_topico_conteudo_perfil'
              AND conrelid = 'personalizacao_job_targets'::regclass
          ) THEN
            ALTER TABLE personalizacao_job_targets
            ADD CONSTRAINT uq_job_target_aluno_topico_conteudo_perfil
            UNIQUE (job_id, aluno_id, topico_id, conteudo_id, brainhex_profile_key);
          END IF;
        END $$;
        """
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
