"""Push lê os recibos da Expo e para de mandar para aparelho que desinstalou o app.

## O que estava errado

A `20260826_15` desativa o token quando a Expo responde `DeviceNotRegistered`, mas só lê o
**ticket**, a resposta imediata do `POST /push/send`. Ticket `ok` quer dizer só que a Expo
recebeu a mensagem. O aviso de que o app foi desinstalado vem do FCM/APNs depois, no **recibo**
(`POST /push/getReceipts`), que fica pronto em uns 15 minutos e some em 24 horas. Nenhum código
pedia o recibo, então o token de quem desinstalou continuava ativo e recebia todo envio.

Medido em produção em 08/11, em leitura: o único token ativo em `expo_tokens` é um Android do
app 1.0.4, sem atividade desde 26/08, e os envios para ele voltaram `1 ok` na conciliação.

## O que muda

- `notificacoes_push_tickets` guarda o id de cada ticket `ok`, com o token e a notificação.
- `notificacoes_pedir_recibos_push` pede os recibos dos tickets com mais de 15 minutos, até
  1.000 por requisição (limite da Expo), pelo mesmo `pg_net` do envio.
- `notificacoes_conciliar_recibos_push` lê a resposta. `DeviceNotRegistered` desativa o token;
  qualquer outro erro vai para `notificacoes.push_erro` e o token fica como está. Recibo que
  ainda não saiu é pedido de novo na próxima volta, até o ticket fazer 23 horas.
- `notificacoes_conciliar_push`, que o `pg_cron` já roda a cada 5 minutos, chama as duas no
  fim. O agendamento não muda. Falha nelas não desfaz a conciliação dos tickets.

## Dois ajustes na conciliação dos tickets

- **`InvalidCredentials` não desativa mais o token.** Pela documentação da Expo é credencial
  do projeto (chave do FCM ou do APNs), não aparelho morto. Desativar silenciava um aparelho
  bom até o próximo login, e foi o que aconteceu com o único token iOS em 07/11.
- **Atividade depois do envio protege o token.** Só desativa se o aparelho não abriu o app
  depois do envio (`ultima_atividade_em`). Senão um recibo atrasado derrubaria um token que o
  login acabou de reativar.
- O `resultado` de cada envio passa a contar só aquele envio. Antes os contadores eram da
  volta inteira do cron e somavam os envios anteriores.

## O token do Expo Go

O único token Android ativo (app 1.0.4, 26/08) não é de um build do TrailUp: nenhum build teve o
`google-services.json`, e sem Firebase o Android não gera push token (#1067). Ele veio do
**Expo Go**, que tem o próprio Firebase, um dia antes de o app passar a recusar push no Expo Go
(`7493e4e2`, 27/08). Por isso o aparelho recebe push mesmo sem o TrailUp instalado: quem mostra é
o Expo Go. E o recibo dele volta `ok`, então a leitura de recibo sozinha nunca o derrubaria.

A migração desativa (`desativado_motivo = 'expo_go'`) todo token Android criado antes de 27/08.
O dono dele abriu o app Android 50 vezes em 30 dias, sempre mandando token nulo (medido em 08/11):
ele não perde nada que funcionasse. Token gerado por build com Firebase nasce depois disso e não
é tocado. O downgrade não reativa: seria voltar a mandar push para o Expo Go.

## Acesso

`notificacoes_push_tickets` não tem policy, de propósito: só as funções `SECURITY DEFINER`
acima e o `service_role` tocam nela. Não tem coluna de pessoa (o token liga ao aparelho, e a FK
com `ON DELETE CASCADE` apaga a linha junto com o token). A própria conciliação apaga as linhas
conciliadas há mais de 7 dias, então ela não entra em `retencao_politica`.
"""

from alembic import op

revision = "20261108_02"
down_revision = "20261108_01"
branch_labels = None
depends_on = None


TABELA = """
-- Já existe em produção (`20260826_07`); a FK abaixo depende dele.
CREATE UNIQUE INDEX IF NOT EXISTS expo_tokens_token_uidx ON public.expo_tokens (token);

CREATE TABLE IF NOT EXISTS public.notificacoes_push_tickets (
  ticket_id         text        PRIMARY KEY,
  token             text        NOT NULL REFERENCES public.expo_tokens (token) ON DELETE CASCADE,
  notificacao_id    bigint      NULL,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  recibo_request_id bigint      NULL,
  recibo_pedido_em  timestamptz NULL,
  conciliado_em     timestamptz NULL,
  resultado         text        NULL
);

CREATE INDEX IF NOT EXISTS notificacoes_push_tickets_a_pedir_idx
  ON public.notificacoes_push_tickets (criado_em)
  WHERE conciliado_em IS NULL AND recibo_request_id IS NULL;

CREATE INDEX IF NOT EXISTS notificacoes_push_tickets_pedidos_idx
  ON public.notificacoes_push_tickets (recibo_request_id)
  WHERE conciliado_em IS NULL AND recibo_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notificacoes_push_tickets_conciliados_idx
  ON public.notificacoes_push_tickets (conciliado_em)
  WHERE conciliado_em IS NOT NULL;

ALTER TABLE public.notificacoes_push_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notificacoes_push_tickets FROM PUBLIC, anon, authenticated;
"""


PEDIR = """
CREATE OR REPLACE FUNCTION public.notificacoes_pedir_recibos_push(
  p_limite integer DEFAULT 1000
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
DECLARE
  v_ids     text[];
  v_headers jsonb;
  v_token   text;
  v_request bigint;
BEGIN
  -- A Expo aceita até 1000 ids por pedido. O recibo leva uns 15 minutos para sair e some em
  -- 24 horas: antes disso não há o que pedir, depois não há mais o que ler.
  SELECT array_agg(s.ticket_id ORDER BY s.criado_em)
    INTO v_ids
    FROM (
      SELECT t.ticket_id, t.criado_em
        FROM notificacoes_push_tickets t
       WHERE t.conciliado_em IS NULL
         AND t.recibo_request_id IS NULL
         AND t.criado_em < now() - interval '15 minutes'
         AND t.criado_em > now() - interval '23 hours'
       ORDER BY t.criado_em
       LIMIT LEAST(GREATEST(p_limite, 1), 1000)
    ) s;

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  v_headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Accept', 'application/json');
  v_token := public.notificacoes_cfg_txt('push_access_token', '');
  IF v_token <> '' THEN
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_token);
  END IF;

  v_request := net.http_post(
    url := public.notificacoes_cfg_txt('push_recibos_url',
                                       'https://exp.host/--/api/v2/push/getReceipts'),
    body := jsonb_build_object('ids', to_jsonb(v_ids)),
    headers := v_headers,
    timeout_milliseconds := public.notificacoes_cfg_int('push_timeout_ms', 15000)
  );

  UPDATE notificacoes_push_tickets
     SET recibo_request_id = v_request, recibo_pedido_em = now()
   WHERE ticket_id = ANY (v_ids);

  RETURN array_length(v_ids, 1);
END;
$fn$;

REVOKE ALL ON FUNCTION public.notificacoes_pedir_recibos_push(integer) FROM PUBLIC, anon, authenticated;
"""


CONCILIAR_RECIBOS = """
CREATE OR REPLACE FUNCTION public.notificacoes_conciliar_recibos_push(
  p_limite integer DEFAULT 20
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
DECLARE
  v_pedido   record;
  v_resposta record;
  v_dados    jsonb;
  v_ticket   record;
  v_recibo   jsonb;
  v_erro     text;
  v_afetados integer;
  v_ok       integer := 0;
  v_erros    integer := 0;
  v_mortos   integer := 0;
  v_espera   integer := 0;
  v_expirados integer := 0;
BEGIN
  FOR v_pedido IN
    SELECT t.recibo_request_id, min(t.recibo_pedido_em) AS pedido_em
      FROM notificacoes_push_tickets t
     WHERE t.conciliado_em IS NULL
       AND t.recibo_request_id IS NOT NULL
     GROUP BY t.recibo_request_id
     ORDER BY 2
     LIMIT GREATEST(p_limite, 1)
  LOOP
    SELECT r.status_code, r.content, r.error_msg
      INTO v_resposta
      FROM net._http_response r
     WHERE r.id = v_pedido.recibo_request_id;

    v_dados := NULL;
    IF FOUND AND v_resposta.error_msg IS NULL AND v_resposta.status_code < 400 THEN
      BEGIN
        v_dados := (v_resposta.content::jsonb) -> 'data';
      EXCEPTION WHEN OTHERS THEN
        v_dados := NULL;
      END;
    END IF;

    IF v_dados IS NULL OR jsonb_typeof(v_dados) <> 'object' THEN
      -- Sem resposta útil. Ainda em voo: espera. Falhou, ou sumiu do pg_net: pede de novo na
      -- próxima volta (o recibo continua na Expo até o ticket fazer 24 horas).
      IF FOUND OR v_pedido.pedido_em < now() - interval '1 hour' THEN
        UPDATE notificacoes_push_tickets
           SET recibo_request_id = NULL, recibo_pedido_em = NULL
         WHERE recibo_request_id = v_pedido.recibo_request_id
           AND conciliado_em IS NULL;
      END IF;
      CONTINUE;
    END IF;

    FOR v_ticket IN
      SELECT t.ticket_id, t.token, t.notificacao_id, t.criado_em
        FROM notificacoes_push_tickets t
       WHERE t.recibo_request_id = v_pedido.recibo_request_id
         AND t.conciliado_em IS NULL
    LOOP
      v_recibo := v_dados -> v_ticket.ticket_id;

      IF v_recibo IS NULL THEN
        -- A Expo omite o id cujo recibo ainda não saiu: volta para a fila.
        UPDATE notificacoes_push_tickets
           SET recibo_request_id = NULL, recibo_pedido_em = NULL
         WHERE ticket_id = v_ticket.ticket_id;
        v_espera := v_espera + 1;
        CONTINUE;
      END IF;

      IF COALESCE(v_recibo ->> 'status', '') = 'ok' THEN
        UPDATE notificacoes_push_tickets
           SET conciliado_em = now(), resultado = 'ok'
         WHERE ticket_id = v_ticket.ticket_id;
        v_ok := v_ok + 1;
        CONTINUE;
      END IF;

      v_erro := COALESCE(NULLIF(v_recibo -> 'details' ->> 'error', ''), 'erro sem codigo');
      v_erros := v_erros + 1;

      -- Só DeviceNotRegistered diz que o aparelho não recebe mais. Os outros (credencial do
      -- projeto, mensagem grande, excesso de envio) não são culpa do aparelho.
      -- Abrir o app depois do envio prova que ele está vivo: o recibo é velho.
      IF v_erro = 'DeviceNotRegistered' THEN
        UPDATE expo_tokens
           SET ativo = FALSE, desativado_motivo = v_erro, atualizado_em = now()
         WHERE token = v_ticket.token
           AND ativo
           AND (ultima_atividade_em IS NULL OR ultima_atividade_em < v_ticket.criado_em);
        GET DIAGNOSTICS v_afetados = ROW_COUNT;
        v_mortos := v_mortos + v_afetados;
      END IF;

      UPDATE notificacoes
         SET push_erro = left('recibo: ' || v_erro, 500)
       WHERE id = v_ticket.notificacao_id
         AND push_erro IS NULL;

      UPDATE notificacoes_push_tickets
         SET conciliado_em = now(), resultado = left(v_erro, 200)
       WHERE ticket_id = v_ticket.ticket_id;
    END LOOP;
  END LOOP;

  -- Recibo que não saiu em 23 horas não sai mais.
  UPDATE notificacoes_push_tickets
     SET conciliado_em = now(), resultado = 'recibo expirado'
   WHERE conciliado_em IS NULL
     AND criado_em < now() - interval '23 hours';
  GET DIAGNOSTICS v_expirados = ROW_COUNT;

  DELETE FROM notificacoes_push_tickets
   WHERE conciliado_em < now() - interval '7 days';

  RETURN jsonb_build_object(
    'entregues', v_ok, 'erros', v_erros, 'tokens_desativados', v_mortos,
    'esperando', v_espera, 'expirados', v_expirados
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.notificacoes_conciliar_recibos_push(integer) FROM PUBLIC, anon, authenticated;
"""


def _conciliar_tickets(com_recibos: bool) -> str:
    """`notificacoes_conciliar_push`. Sem recibos é o comportamento da `20260826_15`."""
    if com_recibos:
        guarda_ticket = """
                IF NULLIF(v_ticket ->> 'id', '') IS NOT NULL THEN
                  -- O SELECT em expo_tokens evita violar a FK se o token sumiu no meio.
                  INSERT INTO notificacoes_push_tickets (ticket_id, token, notificacao_id)
                  SELECT v_ticket ->> 'id', t.token, v_envio.notificacao_id
                    FROM expo_tokens t
                   WHERE t.token = v_token
                  ON CONFLICT (ticket_id) DO NOTHING;
                END IF;"""
        erros_que_matam = "('DeviceNotRegistered')"
        guarda_atividade = """
                   AND (ultima_atividade_em IS NULL OR ultima_atividade_em < v_envio.criado_em)"""
        recibos = """
          -- Os recibos rodam na mesma volta do cron. Falha neles não desfaz o que veio acima.
          BEGIN
            v_recibos := public.notificacoes_conciliar_recibos_push();
            v_recibos := v_recibos || jsonb_build_object(
              'pedidos', public.notificacoes_pedir_recibos_push());
          EXCEPTION WHEN OTHERS THEN
            -- Mensagem por concatenação: o SQL offline do Alembic dobra o marcador de formato.
            RAISE WARNING USING MESSAGE = 'recibos de push: ' || SQLERRM;
            v_recibos := jsonb_build_object('erro', left(SQLERRM, 200));
          END;
"""
        retorno_extra = " || jsonb_build_object('recibos', v_recibos)"
    else:
        guarda_ticket = ""
        erros_que_matam = "('DeviceNotRegistered', 'InvalidCredentials')"
        guarda_atividade = ""
        recibos = ""
        retorno_extra = ""

    return f"""
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
          v_ok_envio     integer;
          v_mortos_envio integer;
          v_conciliados integer := 0;
          v_recibos   jsonb := '{{}}'::jsonb;
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

            v_ok_envio := 0;
            v_mortos_envio := 0;

            -- O ticket i corresponde ao token i: a Expo responde na ordem do array que recebeu.
            FOR v_i IN 0 .. jsonb_array_length(v_tickets) - 1 LOOP
              v_ticket := v_tickets -> v_i;
              v_token := v_envio.tokens[v_i + 1];
              IF v_token IS NULL THEN
                CONTINUE;
              END IF;

              IF COALESCE(v_ticket ->> 'status', '') = 'ok' THEN
                v_ok_envio := v_ok_envio + 1;{guarda_ticket}
                CONTINUE;
              END IF;

              v_erro := COALESCE(v_ticket -> 'details' ->> 'error', '');
              IF v_erro IN {erros_que_matam} THEN
                UPDATE expo_tokens
                   SET ativo = FALSE, desativado_motivo = v_erro, atualizado_em = now()
                 WHERE token = v_token
                   AND ativo{guarda_atividade};
                GET DIAGNOSTICS v_afetados = ROW_COUNT;
                v_mortos_envio := v_mortos_envio + v_afetados;
              END IF;
            END LOOP;

            v_ok := v_ok + v_ok_envio;
            v_mortos := v_mortos + v_mortos_envio;

            UPDATE notificacoes_push_envios
               SET conciliado_em = now(),
                   resultado = v_ok_envio || ' ok, ' || v_mortos_envio || ' recusados'
             WHERE request_id = v_envio.request_id;
          END LOOP;
{recibos}
          RETURN jsonb_build_object(
            'conciliados', v_conciliados, 'entregues', v_ok, 'tokens_desativados', v_mortos
          ){retorno_extra};
        END;
        $fn$
        """


TOKEN_DO_EXPO_GO = """
UPDATE public.expo_tokens
   SET ativo = FALSE, desativado_motivo = 'expo_go', atualizado_em = now()
 WHERE ativo
   AND plataforma = 'android'
   AND created_at < TIMESTAMPTZ '2026-08-27 00:00:00-03';
"""


def upgrade() -> None:
    op.execute(TOKEN_DO_EXPO_GO)
    op.execute(TABELA)
    op.execute(PEDIR)
    op.execute(CONCILIAR_RECIBOS)
    op.execute(_conciliar_tickets(com_recibos=True))
    op.execute(
        "REVOKE ALL ON FUNCTION public.notificacoes_conciliar_push(integer) FROM PUBLIC, anon, authenticated"
    )


def downgrade() -> None:
    op.execute(_conciliar_tickets(com_recibos=False))
    op.execute(
        "REVOKE ALL ON FUNCTION public.notificacoes_conciliar_push(integer) FROM PUBLIC, anon, authenticated"
    )
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_conciliar_recibos_push(integer)")
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_pedir_recibos_push(integer)")
    op.execute("DROP TABLE IF EXISTS public.notificacoes_push_tickets")
