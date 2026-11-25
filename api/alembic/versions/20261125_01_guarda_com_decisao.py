"""A guarda das notificações pergunta também ao gemini-decision-1: sobe o mínimo que o banco entrega.

`problemas_por_decisao` recusa emoção e vigilância ditas com outras palavras ("Parece que a semana foi
pesada", "A gente viu que você travou na questão 3"), que a versão 3 deixava passar. O texto aprovado
pela versão 3 que espera na fila deixa de ser confiável, como na `20261105_08`.

Revision ID: 20261125_01
Revises: 20261124_08
"""

from __future__ import annotations

from alembic import op

revision = "20261125_01"
down_revision = "20261124_08"
branch_labels = None
depends_on = None

CHAVE = "texto_guarda_versao_minima"
VERSAO_MINIMA = 4
VERSAO_ANTERIOR = 3


def _definir(versao: int) -> str:
    return f"UPDATE public.notificacoes_config SET valor = '{versao}' WHERE chave = '{CHAVE}';"


def upgrade() -> None:
    op.execute(_definir(VERSAO_MINIMA))


def downgrade() -> None:
    op.execute(_definir(VERSAO_ANTERIOR))
