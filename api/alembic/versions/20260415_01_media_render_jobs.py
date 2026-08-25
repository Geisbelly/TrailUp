"""add media_render snapshot and materiais media status columns

Revision ID: 20260415_01
Revises: 20260413_01
Create Date: 2026-04-15
"""

from alembic import op

revision = "20260415_01"
down_revision = "20260413_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE personalizacao_jobs
        ADD COLUMN IF NOT EXISTS media_snapshot JSONB
        """
    )
    op.execute(
        """
        ALTER TABLE materiais_gerados
        ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        """
    )
    op.execute(
        """
        ALTER TABLE materiais_gerados
        ADD COLUMN IF NOT EXISTS storage_path TEXT
        """
    )
    op.execute(
        """
        ALTER TABLE materiais_gerados
        ADD COLUMN IF NOT EXISTS personalizacao_id BIGINT
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_materiais_gerados_personalizacao
          ON materiais_gerados (personalizacao_id, tipo, criado_em DESC)
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_materiais_gerados_personalizacao'
          ) THEN
            ALTER TABLE materiais_gerados
              ADD CONSTRAINT fk_materiais_gerados_personalizacao
              FOREIGN KEY (personalizacao_id)
              REFERENCES conteudo_personalizado(id)
              ON DELETE SET NULL;
          END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'ck_personalizacao_jobs_kind'
          ) THEN
            ALTER TABLE personalizacao_jobs DROP CONSTRAINT ck_personalizacao_jobs_kind;
            ALTER TABLE personalizacao_jobs
              ADD CONSTRAINT ck_personalizacao_jobs_kind
              CHECK (
                kind IN (
                  'personalizacao',
                  'media_render',
                  'student_enrollment',
                  'student_cleanup',
                  'class_delta_sync',
                  'full_class_sync',
                  'manual_retry',
                  'class_theme_sync',
                  'personalizacao_media_render'
                )
              );
          ELSIF EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'personalizacao_jobs_kind_check'
          ) THEN
            ALTER TABLE personalizacao_jobs DROP CONSTRAINT personalizacao_jobs_kind_check;
            ALTER TABLE personalizacao_jobs
              ADD CONSTRAINT personalizacao_jobs_kind_check
              CHECK (
                kind IN (
                  'personalizacao',
                  'media_render',
                  'student_enrollment',
                  'student_cleanup',
                  'class_delta_sync',
                  'full_class_sync',
                  'manual_retry',
                  'class_theme_sync',
                  'personalizacao_media_render'
                )
              );
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE personalizacao_jobs DROP COLUMN IF EXISTS media_snapshot")
    op.execute("DROP INDEX IF EXISTS idx_materiais_gerados_personalizacao")
    op.execute(
        """
        ALTER TABLE materiais_gerados
        DROP CONSTRAINT IF EXISTS fk_materiais_gerados_personalizacao
        """
    )
    op.execute("ALTER TABLE materiais_gerados DROP COLUMN IF EXISTS personalizacao_id")
    op.execute("ALTER TABLE materiais_gerados DROP COLUMN IF EXISTS storage_path")
    op.execute("ALTER TABLE materiais_gerados DROP COLUMN IF EXISTS metadata")
