"""memoria do aluno - dominio por topico persistido entre ciclos

Cria aluno_topico_dominio: domínio/dificuldade estimado por (aluno, tópico),
persistido a cada ciclo de análise (DeepKnowledgeTracingAnalyzer), em vez de
recalculado do zero a partir de uma média flat toda vez. Ver
docs/superpowers/specs/2026-08-19-memoria-aluno-design.md.

Revision ID: 20260819_01
Revises: 20260818_01
Create Date: 2026-08-19
"""

from alembic import op

revision = "20260819_01"
down_revision = "20260818_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS aluno_topico_dominio (
          id BIGSERIAL PRIMARY KEY,
          aluno_id UUID NOT NULL,
          topico_id BIGINT NOT NULL REFERENCES topicos(id) ON DELETE CASCADE,
          dominio_estimado DOUBLE PRECISION NOT NULL,
          tendencia TEXT NOT NULL,
          confianca DOUBLE PRECISION NOT NULL,
          atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (aluno_id, topico_id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_aluno_topico_dominio_aluno
        ON aluno_topico_dominio (aluno_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_aluno_topico_dominio_aluno")
    op.execute("DROP TABLE IF EXISTS aluno_topico_dominio")
