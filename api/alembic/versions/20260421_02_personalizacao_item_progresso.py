"""create personalizacao_item_progresso

Tabela já existe em produção (criada fora do Alembic — a única referência
prévia é docs/mobile/sql/20260422_01_rls_personalizacao_item_progresso.sql,
que já assume a tabela existente e só aplica RLS). Reconstruído aqui a
partir das colunas usadas em app/repositories/personalizacao_progresso.py
(upsert com ON CONFLICT (aluno_id, personalizacao_id, item_key)), usando
CREATE TABLE IF NOT EXISTS para não quebrar em bancos onde já existe.
"""

import sqlalchemy as sa

from alembic import op

revision = "20260421_02"
down_revision = "20260421_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS personalizacao_item_progresso (
              id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
              personalizacao_id BIGINT NOT NULL,
              aluno_id UUID NOT NULL REFERENCES alunos(id),
              classe_id BIGINT NOT NULL,
              topico_id BIGINT NOT NULL,
              item_key TEXT NOT NULL,
              item_kind TEXT NOT NULL,
              item_title TEXT,
              status TEXT NOT NULL,
              percentual_concluido NUMERIC NOT NULL DEFAULT 0,
              acertos_percentual NUMERIC,
              tempo_gasto_min NUMERIC,
              pontuacao_obtida NUMERIC,
              pontuacao_maxima NUMERIC,
              metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
              completed_at TIMESTAMPTZ,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT uq_personalizacao_item_progresso_aluno_pers_item
                UNIQUE (aluno_id, personalizacao_id, item_key)
            )
            """
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS idx_personalizacao_item_progresso_aluno "
            "ON personalizacao_item_progresso (aluno_id)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS idx_personalizacao_item_progresso_personalizacao "
            "ON personalizacao_item_progresso (personalizacao_id)"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS personalizacao_item_progresso"))
