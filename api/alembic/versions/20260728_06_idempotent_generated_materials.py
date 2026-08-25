"""make generated material history idempotent per generation

Revision ID: 20260728_06
Revises: 20260728_05
"""

from alembic import op

revision = "20260728_06"
down_revision = "20260728_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE public.materiais_gerados
        ADD COLUMN IF NOT EXISTS generation_key TEXT
        GENERATED ALWAYS AS (
          NULLIF(metadata ->> 'generation_key', '')
        ) STORED
        """
    )
    op.execute(
        """
        WITH ranked AS (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY personalizacao_id, tipo, generation_key
              ORDER BY criado_em DESC, id DESC
            ) AS position
          FROM public.materiais_gerados
          WHERE personalizacao_id IS NOT NULL
            AND generation_key IS NOT NULL
        )
        DELETE FROM public.materiais_gerados material
        USING ranked
        WHERE material.id = ranked.id
          AND ranked.position > 1
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS
          uq_materiais_gerados_personalizacao_tipo_generation
        ON public.materiais_gerados (
          personalizacao_id,
          tipo,
          generation_key
        )
        """
    )
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS
          public.uq_materiais_gerados_personalizacao_tipo_generation
        """
    )
    op.execute(
        """
        ALTER TABLE public.materiais_gerados
        DROP COLUMN IF EXISTS generation_key
        """
    )
