"""A guarda recusa mais emoção, vigilância e "o aluno": sobe o mínimo que o banco entrega.

A avaliação da #976 achou textos que passavam: "você está desanimado", "cansaço", "acompanhamos cada
passo seu" e "o aluno deve voltar". O texto aprovado pela versão 2 que espera na fila deixa de ser
confiável, como na `20261105_03`.

Revision ID: 20261105_08
Revises: 20261105_07
"""

from __future__ import annotations

from alembic import op

revision = "20261105_08"
down_revision = "20261105_07"
branch_labels = None
depends_on = None

CHAVE = "texto_guarda_versao_minima"
VERSAO_MINIMA = 3
VERSAO_ANTERIOR = 2


def _definir(versao: int) -> str:
    return f"UPDATE public.notificacoes_config SET valor = '{versao}' WHERE chave = '{CHAVE}';"


def upgrade() -> None:
    op.execute(_definir(VERSAO_MINIMA))


def downgrade() -> None:
    op.execute(_definir(VERSAO_ANTERIOR))
