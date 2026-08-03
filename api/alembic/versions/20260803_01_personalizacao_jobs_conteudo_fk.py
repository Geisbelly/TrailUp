"""formaliza a FK fk_personalizacao_jobs_conteudo (schema drift real)

A constraint fk_personalizacao_jobs_conteudo ja existe no banco de
producao/dev (confirmado via ForeignKeyViolationError real em producao),
mas nenhuma migration deste repositorio a cria - foi adicionada fora do
historico rastreado (schema drift). Esta migration formaliza o que ja
esta em vigor, pra que um banco novo criado so com `alembic upgrade head`
tenha o mesmo contrato do banco real. Idempotente: so cria a constraint se
ela ainda nao existir, pra nao quebrar em ambientes onde ja foi adicionada.

Revision ID: 20260803_01
Revises: 20260801_01
Create Date: 2026-08-03
"""

from alembic import op

revision = "20260803_01"
down_revision = "20260801_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_personalizacao_jobs_conteudo'
            ) THEN
                ALTER TABLE personalizacao_jobs
                ADD CONSTRAINT fk_personalizacao_jobs_conteudo
                FOREIGN KEY (conteudo_id) REFERENCES conteudos(id);
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE personalizacao_jobs DROP CONSTRAINT IF EXISTS fk_personalizacao_jobs_conteudo;"
    )
