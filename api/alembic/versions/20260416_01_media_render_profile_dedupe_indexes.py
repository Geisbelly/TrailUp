"""add indexes for media render dedupe by brainhex profile

Revision ID: 20260416_01
Revises: 20260415_01
Create Date: 2026-04-16
"""

from alembic import op


revision = "20260416_01"
down_revision = "20260415_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_personalizacao_jobs_media_profile_dedupe
          ON personalizacao_jobs (
            kind,
            classe_id,
            topico_id,
            (COALESCE(payload ->> 'ciclo_id', '')),
            (COALESCE(payload ->> 'source_hash', '')),
            (COALESCE(payload ->> 'brainhex_profile_key', '')),
            created_at DESC
          )
          WHERE status IN ('pending', 'processing', 'partial')
            AND kind IN ('media_render', 'personalizacao_media_render')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS idx_personalizacao_jobs_media_profile_dedupe
        """
    )

