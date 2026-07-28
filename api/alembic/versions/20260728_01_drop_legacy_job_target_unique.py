"""drop legacy job target uniqueness that blocks BrainHex profiles

Revision ID: 20260728_01
Revises: 20260727_01
"""

from alembic import op

revision = "20260728_01"
down_revision = "20260727_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Constraint criada fora do Alembic no banco de producao. Ela limita cada
    # job a um unico alvo por aluno/topico e impede os sete perfis BrainHex.
    op.execute(
        """
        ALTER TABLE personalizacao_job_targets
        DROP CONSTRAINT IF EXISTS personalizacao_job_targets_job_id_aluno_id_topico_id_key
        """
    )
    op.execute(
        """
        DROP INDEX IF EXISTS personalizacao_job_targets_job_id_aluno_id_topico_id_key
        """
    )


def downgrade() -> None:
    # Correcao de drift: restaurar a restricao antiga voltaria a bloquear os
    # sete perfis e falharia em bancos que ja possuam mais de um perfil.
    pass
