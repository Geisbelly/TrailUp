"""create telemetria_eventos_app and telemetria_time_metric_entries

Essas duas tabelas já existem em produção (criadas fora do Alembic — só há
guards defensivos referenciando-as em frontend/supabase/migrations/20260413113000_fix_telemetria_rls.sql,
nenhuma migração que as crie). Reconstruído aqui a partir das colunas
efetivamente usadas em app/repositories/telemetria.py (insert_eventos_app /
insert_time_metric_entries), usando CREATE TABLE IF NOT EXISTS para não
quebrar em bancos onde a tabela já existe.
"""

import sqlalchemy as sa

from alembic import op

revision = "20260421_01"
down_revision = "20260420_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS telemetria_eventos_app (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              client_event_id TEXT NOT NULL,
              sessao_id UUID NOT NULL REFERENCES telemetria_sessoes(id),
              aluno_id UUID NOT NULL REFERENCES alunos(id),
              classe_id BIGINT,
              topico_id BIGINT,
              conteudo_id BIGINT,
              atividade_id BIGINT,
              questao_id BIGINT,
              item_key TEXT,
              screen_name TEXT,
              route_name TEXT,
              event_group TEXT NOT NULL,
              event_name TEXT NOT NULL,
              event_source TEXT NOT NULL,
              occurred_at TIMESTAMPTZ,
              time_since_prev_sec NUMERIC,
              attempt_number INTEGER,
              is_correct BOOLEAN,
              chat_role TEXT,
              trigger_context TEXT,
              payload JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT uq_telemetria_eventos_app_sessao_client_event UNIQUE (sessao_id, client_event_id)
            )
            """
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS idx_telemetria_eventos_app_aluno "
            "ON telemetria_eventos_app (aluno_id)"
        )
    )

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS telemetria_time_metric_entries (
              id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
              lote_id UUID NOT NULL REFERENCES telemetria_lotes(id),
              sessao_id UUID NOT NULL REFERENCES telemetria_sessoes(id),
              aluno_id UUID NOT NULL REFERENCES alunos(id),
              classe_id BIGINT,
              topico_id BIGINT,
              conteudo_id BIGINT,
              atividade_id BIGINT,
              item_key TEXT,
              material_key TEXT,
              material_tipo TEXT,
              scope TEXT NOT NULL,
              visits INTEGER NOT NULL DEFAULT 0,
              dwell_sec NUMERIC NOT NULL DEFAULT 0,
              active_sec NUMERIC NOT NULL DEFAULT 0,
              idle_sec NUMERIC NOT NULL DEFAULT 0,
              touch_count INTEGER NOT NULL DEFAULT 0,
              scroll_distance_px NUMERIC NOT NULL DEFAULT 0,
              max_depth_px NUMERIC NOT NULL DEFAULT 0,
              captured_at TIMESTAMPTZ NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS idx_telemetria_time_metric_entries_lote "
            "ON telemetria_time_metric_entries (lote_id)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS idx_telemetria_time_metric_entries_aluno "
            "ON telemetria_time_metric_entries (aluno_id)"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS telemetria_time_metric_entries"))
    op.execute(sa.text("DROP TABLE IF EXISTS telemetria_eventos_app"))
