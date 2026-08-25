"""scope BrainHex personalization uniqueness by content

Revision ID: 20260728_04
Revises: 20260728_03
"""

from alembic import op

revision = "20260728_04"
down_revision = "20260728_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS uq_conteudo_personalizado_aluno_topico_perfil
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS
          uq_conteudo_personalizado_aluno_topico_conteudo_perfil
        ON conteudo_personalizado (
          aluno_id,
          topico_id,
          conteudo_id,
          brainhex_profile_key
        )
        WHERE topico_id IS NOT NULL
          AND conteudo_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS
          uq_conteudo_personalizado_aluno_topico_perfil_sem_conteudo
        ON conteudo_personalizado (
          aluno_id,
          topico_id,
          brainhex_profile_key
        )
        WHERE topico_id IS NOT NULL
          AND conteudo_id IS NULL
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS
          uq_conteudo_personalizado_aluno_topico_perfil_sem_conteudo
        """
    )
    op.execute(
        """
        DROP INDEX IF EXISTS
          uq_conteudo_personalizado_aluno_topico_conteudo_perfil
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS
          uq_conteudo_personalizado_aluno_topico_perfil
        ON conteudo_personalizado (aluno_id, topico_id, brainhex_profile_key)
        WHERE topico_id IS NOT NULL
        """
    )
