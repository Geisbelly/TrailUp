"""geracao granular e retomavel por bloco/parte/perfil

Estende personalizacao_job_targets com colunas opcionais para targets
granulares (bloco para enriquecimento/capitulo, parte de entrega para
audio/apresentacao) e cria personalizacao_blocos_gerados, um cache de
conteudo por bloco escopado a um job (ciclo de geracao) - permite retomar
uma tentativa que falhou parcialmente sem rechamar o LLM para o que ja
funcionou. Ver docs/superpowers/specs/2026-08-18-geracao-granular-retomavel-design.md.

Revision ID: 20260818_01
Revises: 20260803_01
Create Date: 2026-08-18
"""

from alembic import op

revision = "20260818_01"
down_revision = "20260803_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE personalizacao_job_targets
        ADD COLUMN IF NOT EXISTS media_kind TEXT
        """
    )
    op.execute(
        """
        ALTER TABLE personalizacao_job_targets
        ADD COLUMN IF NOT EXISTS block_id TEXT
        """
    )
    op.execute(
        """
        ALTER TABLE personalizacao_job_targets
        ADD COLUMN IF NOT EXISTS part_ordem INTEGER
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'ck_job_targets_media_key'
              AND conrelid = 'personalizacao_job_targets'::regclass
          ) THEN
            ALTER TABLE personalizacao_job_targets
            ADD CONSTRAINT ck_job_targets_media_key CHECK (
              (media_kind IN ('enriquecimento', 'capitulo') AND block_id IS NOT NULL AND part_ordem IS NULL)
              OR (media_kind IN ('audio', 'apresentacao') AND part_ordem IS NOT NULL AND block_id IS NULL)
              OR media_kind IS NULL
            );
          END IF;
        END $$;
        """
    )
    # A constraint antiga (job_id, aluno_id, topico_id, conteudo_id,
    # brainhex_profile_key) impediria multiplos targets granulares no mesmo
    # aluno/topico/conteudo/perfil (um por bloco/parte). Vira dois indices
    # unicos parciais: um preserva a garantia antiga para targets legados
    # (media_kind IS NULL), outro cobre os novos targets granulares - NULL
    # em block_id/part_ordem nao colide entre linhas diferentes num indice
    # unico comum, entao precisam ficar em predicados separados.
    op.execute(
        """
        ALTER TABLE personalizacao_job_targets
        DROP CONSTRAINT IF EXISTS uq_job_target_aluno_topico_conteudo_perfil
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_job_target_legado
        ON personalizacao_job_targets (job_id, aluno_id, topico_id, conteudo_id, brainhex_profile_key)
        WHERE media_kind IS NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_job_target_granular
        ON personalizacao_job_targets (job_id, aluno_id, topico_id, media_kind, block_id, part_ordem)
        WHERE media_kind IS NOT NULL
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS personalizacao_blocos_gerados (
          id BIGSERIAL PRIMARY KEY,
          job_id UUID NOT NULL REFERENCES personalizacao_jobs(id) ON DELETE CASCADE,
          block_id TEXT NOT NULL,
          enriched_payload JSONB,
          markdown TEXT,
          audio_script TEXT,
          slides JSONB,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (job_id, block_id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_personalizacao_blocos_gerados_job
        ON personalizacao_blocos_gerados (job_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS personalizacao_blocos_gerados")
    op.execute("DROP INDEX IF EXISTS uq_job_target_granular")
    op.execute("DROP INDEX IF EXISTS uq_job_target_legado")
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
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
    op.execute(
        "ALTER TABLE personalizacao_job_targets DROP CONSTRAINT IF EXISTS ck_job_targets_media_key"
    )
    op.execute("ALTER TABLE personalizacao_job_targets DROP COLUMN IF EXISTS part_ordem")
    op.execute("ALTER TABLE personalizacao_job_targets DROP COLUMN IF EXISTS block_id")
    op.execute("ALTER TABLE personalizacao_job_targets DROP COLUMN IF EXISTS media_kind")
