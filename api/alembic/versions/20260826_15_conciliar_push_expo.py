"""concilia a resposta da Expo e desativa o token de aparelho morto

Fecha a issue #36.

`notificacoes_enviar_push` dispara o POST por `pg_net`, que e ASSINCRONO: a
chamada enfileira e volta na hora, entao `notificacoes.push_enviado_em` sempre
foi otimista. A resposta real da Expo cai em `net._http_response` — e nada lia
essa tabela.

Consequencia concreta: um aparelho que desinstalou o app devolve
`DeviceNotRegistered` a cada envio, e continuava marcado como ativo em
`expo_tokens`. A cota de push era gasta para sempre com um destino morto, e o
`push_erro` da notificacao ficava nulo como se tudo tivesse dado certo.

Como a conciliacao e possivel: `net.http_post` devolve o id da requisicao, e
`net._http_response.id` usa o mesmo valor. O que faltava era guardar esse id
junto da ORDEM dos tokens enviados — a Expo responde um ticket por mensagem, na
mesma ordem do array que recebeu, e sem essa ordem nao da para saber qual
ticket condena qual token.

`net._http_response` e podada pelo pg_net depois de algumas horas. Por isso a
conciliacao entra no mesmo `pg_cron` de 5 em 5 minutos da varredura: esperar
mais que isso deixaria a resposta expirar antes de ser lida.

Revision ID: 20260826_15
Revises: 20260826_14
Create Date: 2026-08-27
"""

from alembic import op

revision = "20260826_15"
down_revision = "20260826_14"
branch_labels = None
depends_on = None

CRON_JOB = "trailup-notificacoes-conciliar-push"


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Registro do envio: o elo entre a requisicao e os tokens
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS notificacoes_push_envios (
          request_id     bigint      PRIMARY KEY,
          notificacao_id bigint      NULL,
          aluno_id       uuid        NULL,
          -- ORDEM importa: a Expo devolve um ticket por mensagem, na mesma
          -- ordem do array enviado. E o indice que liga ticket a token.
          tokens         text[]      NOT NULL,
          criado_em      timestamptz NOT NULL DEFAULT now(),
          conciliado_em  timestamptz NULL,
          resultado      text        NULL
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS notificacoes_push_envios_pendentes_idx
          ON notificacoes_push_envios (criado_em)
          WHERE conciliado_em IS NULL
        """
    )

    # ------------------------------------------------------------------
    # Envio passa a guardar o id da requisicao
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.notificacoes_enviar_push(
          p_aluno uuid, p_notificacao_id bigint, p_titulo text, p_corpo text,
          p_dados jsonb, p_prioridade integer DEFAULT 0
        )
        RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = public, pg_temp AS $fn$
        DECLARE
          v_mensagens jsonb;
          v_tokens    text[];
          v_headers   jsonb;
          v_token     text;
          v_request   bigint;
        BEGIN
          -- Uma unica leitura ordenada alimenta as mensagens E a lista de
          -- tokens. Duas consultas separadas poderiam devolver ordens
          -- diferentes, e a conciliacao passaria a condenar o token errado.
          SELECT
            jsonb_agg(
              jsonb_build_object(
                'to', d.token,
                'title', p_titulo,
                'body', p_corpo,
                'data', COALESCE(p_dados, '{}'::jsonb)
                        || jsonb_build_object('notificacao_id', p_notificacao_id),
                'sound', 'default',
                -- 'high' e o que acorda o app em Doze mode no Android.
                'priority', CASE WHEN p_prioridade > 0 THEN 'high' ELSE 'default' END,
                'channelId', 'trailup'
              ) ORDER BY d.id
            ),
            array_agg(d.token ORDER BY d.id)
            INTO v_mensagens, v_tokens
            FROM expo_tokens d
           WHERE d.aluno_id = p_aluno
             AND d.ativo
             AND NOT public.notificacoes_em_silencio(d.timezone);

          IF v_mensagens IS NULL OR jsonb_array_length(v_mensagens) = 0 THEN
            RETURN 0;
          END IF;

          v_headers := jsonb_build_object('Content-Type', 'application/json',
                                          'Accept', 'application/json');
          v_token := public.notificacoes_cfg_txt('push_access_token', '');
          IF v_token <> '' THEN
            v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_token);
          END IF;

          v_request := net.http_post(
            url := public.notificacoes_cfg_txt('push_url', 'https://exp.host/--/api/v2/push/send'),
            body := v_mensagens,
            headers := v_headers,
            timeout_milliseconds := public.notificacoes_cfg_int('push_timeout_ms', 15000)
          );

          INSERT INTO notificacoes_push_envios (request_id, notificacao_id, aluno_id, tokens)
          VALUES (v_request, p_notificacao_id, p_aluno, v_tokens)
          ON CONFLICT (request_id) DO NOTHING;

          UPDATE notificacoes SET push_enviado_em = now() WHERE id = p_notificacao_id;
          RETURN array_length(v_tokens, 1);
        EXCEPTION WHEN OTHERS THEN
          -- Push e o AVISO, nao a notificacao: a linha na caixa de entrada ja
          -- existe. Falhar aqui nao pode derrubar a entrega nem o login.
          UPDATE notificacoes SET push_erro = left(SQLERRM, 500) WHERE id = p_notificacao_id;
          RETURN 0;
        END;
        $fn$
        """
    )

    # ------------------------------------------------------------------
    # Conciliacao
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.notificacoes_conciliar_push(
          p_limite integer DEFAULT 200
        )
        RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = public, pg_temp AS $fn$
        DECLARE
          v_envio     record;
          v_resposta  record;
          v_tickets   jsonb;
          v_ticket    jsonb;
          v_i         integer;
          v_token     text;
          v_erro      text;
          v_afetados  integer := 0;
          v_mortos    integer := 0;
          v_ok        integer := 0;
          v_conciliados integer := 0;
        BEGIN
          FOR v_envio IN
            SELECT e.*
              FROM notificacoes_push_envios e
             WHERE e.conciliado_em IS NULL
             ORDER BY e.criado_em
             LIMIT GREATEST(1, p_limite)
          LOOP
            SELECT r.status_code, r.content, r.error_msg
              INTO v_resposta
              FROM net._http_response r
             WHERE r.id = v_envio.request_id;

            IF NOT FOUND THEN
              -- Ainda em voo, ou a resposta ja foi podada pelo pg_net. Marcar
              -- como conciliado depois de um tempo evita varrer para sempre uma
              -- linha cuja resposta nunca mais vai existir.
              IF v_envio.criado_em < now() - interval '6 hours' THEN
                UPDATE notificacoes_push_envios
                   SET conciliado_em = now(), resultado = 'resposta expirada'
                 WHERE request_id = v_envio.request_id;
              END IF;
              CONTINUE;
            END IF;

            v_conciliados := v_conciliados + 1;

            IF v_resposta.error_msg IS NOT NULL OR v_resposta.status_code >= 400 THEN
              UPDATE notificacoes SET push_erro = left(
                COALESCE(v_resposta.error_msg, 'HTTP ' || v_resposta.status_code), 500)
               WHERE id = v_envio.notificacao_id;
              UPDATE notificacoes_push_envios
                 SET conciliado_em = now(),
                     resultado = left(COALESCE(v_resposta.error_msg,
                                               'HTTP ' || v_resposta.status_code), 200)
               WHERE request_id = v_envio.request_id;
              CONTINUE;
            END IF;

            BEGIN
              v_tickets := (v_resposta.content::jsonb) -> 'data';
            EXCEPTION WHEN OTHERS THEN
              v_tickets := NULL;
            END;

            IF v_tickets IS NULL OR jsonb_typeof(v_tickets) <> 'array' THEN
              UPDATE notificacoes_push_envios
                 SET conciliado_em = now(), resultado = 'resposta sem data[]'
               WHERE request_id = v_envio.request_id;
              CONTINUE;
            END IF;

            -- O ticket i corresponde ao token i: a Expo responde na ordem do
            -- array que recebeu.
            FOR v_i IN 0 .. jsonb_array_length(v_tickets) - 1 LOOP
              v_ticket := v_tickets -> v_i;
              v_token := v_envio.tokens[v_i + 1];
              IF v_token IS NULL THEN
                CONTINUE;
              END IF;

              IF COALESCE(v_ticket ->> 'status', '') = 'ok' THEN
                v_ok := v_ok + 1;
                CONTINUE;
              END IF;

              v_erro := COALESCE(v_ticket -> 'details' ->> 'error', '');
              -- So estes dois significam "este token nunca mais vai funcionar".
              -- Erros transitorios (MessageRateExceeded, por exemplo) nao podem
              -- desativar o aparelho de um aluno.
              IF v_erro IN ('DeviceNotRegistered', 'InvalidCredentials') THEN
                UPDATE expo_tokens
                   SET ativo = FALSE, desativado_motivo = v_erro, atualizado_em = now()
                 WHERE token = v_token AND ativo;
                -- Conta so o que REALMENTE mudou: o mesmo token pode aparecer
                -- em varias respostas, e somar cegamente inflaria a metrica.
                GET DIAGNOSTICS v_afetados = ROW_COUNT;
                v_mortos := v_mortos + v_afetados;
              END IF;
            END LOOP;

            UPDATE notificacoes_push_envios
               SET conciliado_em = now(),
                   resultado = format('%s ok, %s recusados', v_ok, v_mortos)
             WHERE request_id = v_envio.request_id;
          END LOOP;

          RETURN jsonb_build_object(
            'conciliados', v_conciliados, 'entregues', v_ok, 'tokens_desativados', v_mortos
          );
        END;
        $fn$
        """
    )

    op.execute("REVOKE ALL ON FUNCTION public.notificacoes_conciliar_push(integer) FROM PUBLIC, anon, authenticated")

    # ------------------------------------------------------------------
    # Agendamento
    # ------------------------------------------------------------------
    op.execute(
        f"""
        DO $$
        BEGIN
          PERFORM cron.unschedule('{CRON_JOB}')
            WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{CRON_JOB}');
          PERFORM cron.schedule(
            '{CRON_JOB}', '*/5 * * * *',
            $cron$SELECT public.notificacoes_conciliar_push(200)$cron$
          );
        EXCEPTION
          WHEN insufficient_privilege OR undefined_file OR feature_not_supported
            OR undefined_table OR invalid_schema_name THEN
            RAISE NOTICE
              'pg_cron indisponivel; a conciliacao de push fica desligada e o '
              'token morto continuara ativo ate o aluno fazer logout.';
        END $$
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
          PERFORM cron.unschedule('{CRON_JOB}')
            WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{CRON_JOB}');
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'pg_cron indisponivel; nada a desagendar.';
        END $$
        """
    )
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_conciliar_push(integer)")
    op.execute("DROP TABLE IF EXISTS notificacoes_push_envios")
