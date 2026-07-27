"""register the production schema baseline in the Alembic revision graph

Revision ID: 20260411_02
Revises: 20260421_02

O banco de producao foi marcado historicamente com ``20260411_02`` depois
que as estruturas cobertas ate ``20260421_02`` ja haviam sido aplicadas fora
do Alembic. A revisao nao estava no repositorio, impedindo qualquer upgrade.

Ela e intencionalmente vazia: em producao registra a linhagem ja existente;
em bancos novos vem depois das migracoes que criam essas estruturas.
"""

revision = "20260411_02"
down_revision = "20260421_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
