"""Fundo da turma: a política de retenção chega a quem já tinha aplicado a 20261101_04 (#144)

A `20261101_04` foi aplicada em produção antes de ganhar o `INSERT` em `retencao_politica` (o portão
`test_retencao_politica` pegou na CI). A `_04` agora registra a política em banco novo; esta revisão
registra no banco que já passou dela. `ON CONFLICT DO NOTHING`: em banco novo não faz nada.

Revision ID: 20261101_05
Revises: 20261101_04
Create Date: 2026-11-01
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261101_05"
down_revision = "20261101_04"
branch_labels = None
depends_on = None


def _fundo():
    caminho = Path(__file__).with_name("20261101_04_fundo_da_turma.py")
    spec = importlib.util.spec_from_file_location("fundo_da_turma_20261101_04", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def upgrade() -> None:
    op.execute(_fundo().RETENCAO)


def downgrade() -> None:
    # A política é da `_04`, que a remove no próprio downgrade.
    pass
