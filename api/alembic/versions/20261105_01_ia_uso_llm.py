"""Uso de modelo por chamada: tokens, cache e prompt

O painel técnico (`20261102_22`) mede custo por proxy porque o banco não grava tokens. Esta tabela
grava, por chamada: prompt, provedor, modelo, tokens, tokens servidos de cache e o motivo de parada
(`fim`: resposta cortada ou recusada pelo provedor).

**Sem `aluno_id` e sem texto**, de propósito: a pergunta é de custo por prompt, não por pessoa.

**Sem policy, por decisão:** só o `service_role` (API) escreve e lê. RLS fica ligada, e o REVOKE
deixa isso explícito para `anon` e `authenticated`.

Retenção: 180 dias, por pg_cron, porque é só volume e não há dado pessoal.

Revision ID: 20261105_01
Revises: 20261104_08
"""

from __future__ import annotations

from alembic import op

revision = "20261105_01"
down_revision = "20261104_08"
branch_labels = None
depends_on = None

_JOB = "trailup_ia_uso_llm_retencao"


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.ia_uso_llm (
          id             bigserial PRIMARY KEY,
          criado_em      timestamptz NOT NULL DEFAULT now(),
          prompt         text NOT NULL,
          provedor       text NOT NULL,
          modelo         text NULL,
          tokens_entrada integer NULL,
          tokens_saida   integer NULL,
          tokens_cache   integer NULL,
          usou_rag       boolean NOT NULL DEFAULT false,
          fim            text NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ia_uso_llm_criado_em ON public.ia_uso_llm (criado_em);
        ALTER TABLE public.ia_uso_llm ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON public.ia_uso_llm FROM anon, authenticated;
        """
    )
    op.execute(
        f"""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
            PERFORM cron.unschedule('{_JOB}')
              WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{_JOB}');
            PERFORM cron.schedule(
              '{_JOB}', '47 3 * * *',
              $job$DELETE FROM public.ia_uso_llm WHERE criado_em < now() - interval '180 days'$job$
            );
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
            PERFORM cron.unschedule('{_JOB}')
              WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{_JOB}');
          END IF;
        END $$;
        DROP TABLE IF EXISTS public.ia_uso_llm;
        """
    )
