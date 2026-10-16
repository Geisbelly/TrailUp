"""Retencao do texto livre do aluno em ia_decision_logs (item 4 da #195)

A #195 (LGPD) tem varios itens. Conferi todos ao vivo antes de escolher, e a
`main` ja mudou dois deles:

- item 2 (camera pre-marcada) esta no PR #309;
- item 3 (frames trafegam e sao descartados sem analise) mudou de natureza: o
  #305 ja entrou, e agora os frames SAO analisados (FER+ local). A exposicao
  deixou de ser sem contrapartida -- o que a LGPD pede ali agora e outra
  conversa, nao esta.

Este e o item 4: a mensagem que o aluno digita vai inteira para
`ia_decision_logs.input_summary`, junto com as 6 ultimas do historico, mais
`prompt_text` e `raw_response`. Conferido: a tabela e **write-only** -- nao ha
um unico SELECT sobre ela em `api/app` (sete arquivos escrevem, nenhum le) --
e **nao havia retencao nenhuma**: nenhum job em `cron.job` a menciona.

## Duas janelas, nao uma

Apagar tudo e simples, mas joga fora o unico valor que a tabela tem (que
estagio decidiu o que, com qual provedor). Entao:

1. **Redacao** aos `ia_logs_redigir_dias` dias (default 90): o verbatim sai,
   o metadado fica. `input_summary` recebe `{"redigido_em": <ts>}` -- NAO
   `NULL`, porque a coluna e NOT NULL (descobri rodando: o UPDATE para NULL
   levanta 23502). O marcador tambem torna a redacao auditavel e idempotente:
   a varredura seguinte nao reprocessa quem ja foi redigido.
2. **Expurgo** aos `ia_logs_expurgar_dias` dias (default 365): a linha sai.

`prompt_text`, `raw_response` e `parsed_response` sao anulaveis e vao a NULL.
`parsed_response` entra porque e saida de modelo e pode ecoar a mensagem do
aluno.

**`decision_summary` FICA, e isso e uma escolha, nao um esquecimento.** E o
resumo que o modelo escreveu da propria decisao -- o que ainda serve para
diagnostico depois da redacao. Ele PODE citar o aluno. Quem responde pela LGPD
aqui deve decidir se ele entra na redacao; mudar isso e uma linha.

Os dois prazos sao defaults defensaveis, nao numeros com respaldo juridico.
Ficam em `app_config` justamente para serem ajustados sem migracao.

Conferido ao vivo, em transacao revertida, com tres linhas sinteticas de 10,
120 e 400 dias: a de 10 ficou intacta, a de 120 foi redigida, a de 400 foi
apagada, e `stage`/`decision_summary`/`provider` sobreviveram nas duas que
ficaram.

Revision ID: 20261003_09
Revises: 20261003_08
Create Date: 2026-10-07
"""

from alembic import op

revision = "20261003_09"
down_revision = "20261003_08"
branch_labels = None
depends_on = None

_JOB = "trailup_retencao_ia_decision_logs"


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
          ('ia_logs_redigir_dias', '90',
           'Dias ate o texto livre do aluno sair de ia_decision_logs (o metadado fica).', false),
          ('ia_logs_expurgar_dias', '365',
           'Dias ate a linha de ia_decision_logs ser apagada.', false)
        ON CONFLICT (chave) DO NOTHING
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.trailup_retencao_ia_decision_logs()
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path TO 'public', 'pg_temp'
        AS $function$
        DECLARE
          v_redigir   integer;
          v_expurgar  integer;
          v_redigidas integer;
          v_apagadas  integer;
        BEGIN
          v_redigir := COALESCE(
            (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
               FROM public.app_config WHERE chave = 'ia_logs_redigir_dias'), 90);
          v_expurgar := COALESCE(
            (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
               FROM public.app_config WHERE chave = 'ia_logs_expurgar_dias'), 365);

          -- Prazo invertido apagaria antes de redigir, o que ate funciona, mas
          -- esconde o erro de configuracao. Melhor recusar.
          IF v_expurgar < v_redigir THEN
            RAISE EXCEPTION USING MESSAGE =
              'ia_logs_expurgar_dias (' || v_expurgar::text || ') < ia_logs_redigir_dias ('
              || v_redigir::text || ')';
          END IF;

          -- `input_summary` e NOT NULL: recebe marcador, nao NULL. O marcador
          -- torna a redacao idempotente -- sem ele, toda varredura reescreveria
          -- as mesmas linhas.
          UPDATE public.ia_decision_logs
             SET input_summary   = jsonb_build_object('redigido_em', now()),
                 prompt_text     = NULL,
                 raw_response    = NULL,
                 parsed_response = NULL
           WHERE created_at < now() - make_interval(days => v_redigir)
             AND NOT (input_summary ? 'redigido_em');
          GET DIAGNOSTICS v_redigidas = ROW_COUNT;

          DELETE FROM public.ia_decision_logs
           WHERE created_at < now() - make_interval(days => v_expurgar);
          GET DIAGNOSTICS v_apagadas = ROW_COUNT;

          RETURN jsonb_build_object(
            'redigidas', v_redigidas,
            'apagadas',  v_apagadas,
            'redigir_dias', v_redigir,
            'expurgar_dias', v_expurgar
          );
        END;
        $function$
        """
    )
    op.execute(
        "REVOKE EXECUTE ON FUNCTION public.trailup_retencao_ia_decision_logs()"
        " FROM PUBLIC, anon, authenticated"
    )

    # Indice do predicado da varredura. Sem ele, cada passada e seq scan na
    # tabela que mais cresce sem ninguem ler.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ia_decision_logs_created_at_idx
          ON public.ia_decision_logs (created_at)
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
              '{_JOB}',
              '41 3 * * *',
              'SELECT public.trailup_retencao_ia_decision_logs()'
            );
          END IF;
        END $$
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
        END $$
        """
    )
    op.execute("DROP FUNCTION IF EXISTS public.trailup_retencao_ia_decision_logs()")
    op.execute("DROP INDEX IF EXISTS public.ia_decision_logs_created_at_idx")
    # As chaves de app_config ficam: apagar reabriria a retencao infinita, e
    # o time pode ter ajustado os prazos.
