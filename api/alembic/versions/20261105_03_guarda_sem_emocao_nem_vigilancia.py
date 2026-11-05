"""Sugestão aprovada pela guarda antiga deixa de sair: a guarda agora recusa emoção e vigilância.

O prompt da notificação proíbe citar emoção detectada ou dizer que o aluno foi monitorado, e o modelo
recebe `emocao_atual`, mas `problemas_do_texto` não conferia isso. "Percebi que você anda ansioso"
passava, e o sistema nem mede emoção (DAT-45).

A guarda endureceu, então o texto aprovado pela versão 1 que espera na fila não é mais confiável. É o
caso previsto na `20261102_24`: sobe o mínimo, e o banco suprime o que uma guarda mais velha aprovou.

Revision ID: 20261105_03
Revises: 20261105_02
"""

from __future__ import annotations

from alembic import op

revision = "20261105_03"
down_revision = "20261105_02"
branch_labels = None
depends_on = None

CHAVE = "texto_guarda_versao_minima"
VERSAO_MINIMA = 2
VERSAO_ANTERIOR = 1


def _definir(versao: int) -> str:
    return f"UPDATE public.notificacoes_config SET valor = '{versao}' WHERE chave = '{CHAVE}';"


def upgrade() -> None:
    op.execute(_definir(VERSAO_MINIMA))


def downgrade() -> None:
    op.execute(_definir(VERSAO_ANTERIOR))
