"""`ia_uso_llm` guarda a versão do prompt de cada chamada.

Sem isso, não dá para comparar tokens, cache, tempo e motivo de parada antes e depois de mudar um
prompt: o nome do arquivo é o mesmo. Guarda só o começo do hash, sem texto. Linha anterior fica nula.

Revision ID: 20261105_07
Revises: 20261105_06
"""

from __future__ import annotations

from alembic import op

revision = "20261105_07"
down_revision = "20261105_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE public.ia_uso_llm ADD COLUMN IF NOT EXISTS prompt_versao text;")


def downgrade() -> None:
    op.execute("ALTER TABLE public.ia_uso_llm DROP COLUMN IF EXISTS prompt_versao;")
