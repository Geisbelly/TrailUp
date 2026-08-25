"""professor.geracao_automatica - controle manual/automatico de personalizacao

Adiciona a coluna que liga/desliga os disparos automaticos de
class_delta_sync (edicao de topico/conteudo). Default true preserva o
comportamento atual para todo professor existente. Ver
docs/superpowers/specs/2026-08-21-controle-geracao-manual-automatica-design.md.

Revision ID: 20260821_01
Revises: 20260819_01
Create Date: 2026-08-21
"""

from alembic import op

revision = "20260821_01"
down_revision = "20260819_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE professor
          ADD COLUMN IF NOT EXISTS geracao_automatica boolean NOT NULL DEFAULT true
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE professor DROP COLUMN IF EXISTS geracao_automatica")
