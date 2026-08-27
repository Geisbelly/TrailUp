"""motor de push passa a usar `expo_tokens`; `notificacoes_dispositivos` sai

`expo_tokens` (id, aluno_id, token, device_name, created_at) ja existia no banco
e eu nao a encontrei antes de criar `notificacoes_dispositivos` em
`20260826_03` — duas tabelas para a mesma coisa. Uma varredura de RLS revelou a
duplicacao. Fica a que ja existia; a nova sai.

O que faltava em `expo_tokens` para o motor funcionar:

- **unico por token**: o token E a identidade do aparelho para a Expo. Num
  celular compartilhado o token e o mesmo e precisa MUDAR de dono no upsert,
  senao o aluno anterior segue recebendo push no aparelho do colega;
- **`ativo`**: sem isso nao ha como desligar um aparelho no logout nem parar de
  gastar cota com token morto;
- **`timezone`**: a rotina diaria e "as 19h DO ALUNO"; so UTC dispararia de
  madrugada para parte da base.

`device_name` e mantido (ja e da tabela) e passa a receber o `device_id` do app.

Revision ID: 20260826_07
Revises: 20260826_06
Create Date: 2026-08-26
"""

from alembic import op

revision = "20260826_07"
down_revision = "20260826_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE expo_tokens
          ADD COLUMN IF NOT EXISTS plataforma          text        NOT NULL DEFAULT 'desconhecida',
          ADD COLUMN IF NOT EXISTS app_version         text        NULL,
          ADD COLUMN IF NOT EXISTS timezone            text        NOT NULL DEFAULT 'UTC',
          ADD COLUMN IF NOT EXISTS ativo               boolean     NOT NULL DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS desativado_motivo   text        NULL,
          ADD COLUMN IF NOT EXISTS ultima_atividade_em timestamptz NOT NULL DEFAULT now(),
          ADD COLUMN IF NOT EXISTS atualizado_em       timestamptz NOT NULL DEFAULT now()
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS expo_tokens_token_uidx
          ON expo_tokens (token)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS expo_tokens_aluno_idx
          ON expo_tokens (aluno_id) WHERE ativo
        """
    )

    # Migra o que houver antes de descartar a tabela nova. Hoje ela esta vazia,
    # mas a migracao nao pode depender disso para ser correta.
    op.execute(
        """
        INSERT INTO expo_tokens (
          aluno_id, token, device_name, plataforma, app_version, timezone,
          ativo, desativado_motivo, ultima_atividade_em
        )
        SELECT d.aluno_id, d.push_token, d.device_id, d.plataforma, d.app_version,
               d.timezone, d.ativo, d.desativado_motivo, d.ultima_atividade_em
          FROM notificacoes_dispositivos d
        ON CONFLICT (token) DO NOTHING
        """
    )

    # As policies abertas de `expo_tokens` (SELECT/UPDATE com USING (true) para
    # `public`) deixavam qualquer um ler e redirecionar push alheio.
    for nome in (
        '"Enable read access for all users"',
        '"Policy with table joins"',
        '"Enable insert for authenticated users only"',
        "expo_tokens_aluno_sel",
        "expo_tokens_aluno_ins",
        "expo_tokens_aluno_upd",
    ):
        op.execute(f"DROP POLICY IF EXISTS {nome} ON expo_tokens")
    op.execute(
        """
        CREATE POLICY expo_tokens_aluno_sel ON expo_tokens
          FOR SELECT TO authenticated USING (aluno_id = auth.uid())
        """
    )
    op.execute(
        """
        CREATE POLICY expo_tokens_aluno_ins ON expo_tokens
          FOR INSERT TO authenticated WITH CHECK (aluno_id = auth.uid())
        """
    )
    op.execute(
        """
        CREATE POLICY expo_tokens_aluno_upd ON expo_tokens
          FOR UPDATE TO authenticated
          USING (aluno_id = auth.uid()) WITH CHECK (aluno_id = auth.uid())
        """
    )

    # Funcoes reapontadas para expo_tokens.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.notificacoes_enviar_push(
          p_aluno uuid, p_notificacao_id bigint, p_titulo text, p_corpo text,
          p_dados jsonb, p_prioridade integer DEFAULT 0
        )
        RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
        DECLARE
          v_mensagens jsonb;
          v_headers   jsonb;
          v_token     text;
          v_qtd       integer := 0;
        BEGIN
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'to', d.token,
                     'title', p_titulo,
                     'body', p_corpo,
                     'data', COALESCE(p_dados, '{}'::jsonb)
                             || jsonb_build_object('notificacao_id', p_notificacao_id),
                     'sound', 'default',
                     -- 'high' e o que acorda o app em Doze mode no Android; com
                     -- 'default' a notificacao pode ficar retida ate a proxima
                     -- janela de manutencao, justo o caso "celular fechado".
                     'priority', CASE WHEN p_prioridade > 0 THEN 'high' ELSE 'default' END,
                     'channelId', 'trailup'
                   )
                 )
            INTO v_mensagens
            FROM expo_tokens d
           WHERE d.aluno_id = p_aluno
             AND d.ativo
             AND NOT public.notificacoes_em_silencio(d.timezone);

          IF v_mensagens IS NULL OR jsonb_array_length(v_mensagens) = 0 THEN
            RETURN 0;
          END IF;
          v_qtd := jsonb_array_length(v_mensagens);

          v_headers := jsonb_build_object('Content-Type', 'application/json',
                                          'Accept', 'application/json');
          v_token := public.notificacoes_cfg_txt('push_access_token', '');
          IF v_token <> '' THEN
            v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_token);
          END IF;

          PERFORM net.http_post(
            url := public.notificacoes_cfg_txt('push_url', 'https://exp.host/--/api/v2/push/send'),
            body := v_mensagens,
            headers := v_headers,
            timeout_milliseconds := public.notificacoes_cfg_int('push_timeout_ms', 15000)
          );

          UPDATE notificacoes SET push_enviado_em = now() WHERE id = p_notificacao_id;
          RETURN v_qtd;
        EXCEPTION WHEN OTHERS THEN
          -- Push e o AVISO, nao a notificacao: a linha na caixa de entrada ja
          -- existe. Falhar aqui nao pode derrubar a entrega nem o login.
          UPDATE notificacoes SET push_erro = left(SQLERRM, 500) WHERE id = p_notificacao_id;
          RETURN 0;
        END;
        $fn$
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.notificacoes_registrar_login(
          p_plataforma text DEFAULT 'desconhecida',
          p_timezone text DEFAULT 'UTC',
          p_device_id text DEFAULT NULL,
          p_app_version text DEFAULT NULL,
          p_push_token text DEFAULT NULL
        )
        RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
        DECLARE
          v_aluno  uuid := auth.uid();
          v_tz     text := public.notificacoes_tz(p_timezone);
          v_sessao bigint;
          v_criadas integer := 0;
          v_entregues integer;
        BEGIN
          IF v_aluno IS NULL THEN
            RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
          END IF;

          -- Sessao anterior aberta (app morto pelo SO, sem chance de avisar) e
          -- fechada antes de abrir a nova, senao o aluno acumula sessoes
          -- fantasma para sempre.
          UPDATE aluno_sessoes_app
             SET encerrada_em = atualizado_em, atualizado_em = now()
           WHERE aluno_id = v_aluno AND encerrada_em IS NULL;

          INSERT INTO aluno_sessoes_app (aluno_id, origem, plataforma, device_id, timezone)
          VALUES (v_aluno, 'login', p_plataforma, p_device_id, v_tz)
          RETURNING id INTO v_sessao;

          INSERT INTO aluno_atividade_diaria (
            aluno_id, dia, timezone, aberturas, primeiro_acesso_em, ultimo_acesso_em
          )
          VALUES (v_aluno, public.notificacoes_dia_local(v_tz), v_tz, 1, now(), now())
          ON CONFLICT (aluno_id, dia) DO UPDATE
            SET aberturas = aluno_atividade_diaria.aberturas + 1,
                ultimo_acesso_em = now(), timezone = EXCLUDED.timezone,
                atualizado_em = now();

          IF p_push_token IS NOT NULL AND p_push_token <> '' THEN
            -- Conflito no TOKEN e nao em (aluno, token): num aparelho
            -- compartilhado o token e o mesmo e precisa MUDAR de dono.
            INSERT INTO expo_tokens (
              aluno_id, token, device_name, plataforma, app_version, timezone
            )
            VALUES (v_aluno, p_push_token, p_device_id, p_plataforma, p_app_version, v_tz)
            ON CONFLICT (token) DO UPDATE
              SET aluno_id = EXCLUDED.aluno_id,
                  plataforma = EXCLUDED.plataforma,
                  device_name = COALESCE(EXCLUDED.device_name, expo_tokens.device_name),
                  app_version = COALESCE(EXCLUDED.app_version, expo_tokens.app_version),
                  timezone = EXCLUDED.timezone,
                  ativo = TRUE, desativado_motivo = NULL,
                  ultima_atividade_em = now(), atualizado_em = now();
          END IF;

          PERFORM public.notificacoes_garantir_rotinas(v_aluno, v_tz);
          v_criadas := public.notificacoes_processar_rotinas(v_aluno, 'login');
          v_criadas := v_criadas + public.notificacoes_processar_rotinas(v_aluno, 'horario');
          v_entregues := public.notificacoes_entregar(v_aluno, ARRAY['login', 'horario']);

          RETURN jsonb_build_object(
            'sessao_id', v_sessao, 'pendentes_criadas', v_criadas, 'entregues', v_entregues
          );
        END;
        $fn$
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.notificacoes_desativar_dispositivo(p_push_token text)
        RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
        DECLARE
          v_aluno uuid := auth.uid();
        BEGIN
          IF v_aluno IS NULL OR p_push_token IS NULL OR p_push_token = '' THEN
            RETURN;
          END IF;
          -- So o dono desliga: sem o filtro por aluno, qualquer um silenciaria
          -- o aparelho de outro mandando o token dele.
          UPDATE expo_tokens
             SET ativo = FALSE, desativado_motivo = 'logout', atualizado_em = now()
           WHERE token = p_push_token AND aluno_id = v_aluno;
        END;
        $fn$
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.notificacoes_ia_promover()
        RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
        DECLARE
          v_tz   text;
          v_dia  date;
          v_gat  text;
          v_pend bigint;
        BEGIN
          IF NEW.aluno_id IS NULL THEN
            RETURN NEW;
          END IF;

          SELECT d.timezone INTO v_tz
            FROM expo_tokens d
           WHERE d.aluno_id = NEW.aluno_id AND d.ativo
           ORDER BY d.ultima_atividade_em DESC
           LIMIT 1;
          v_tz  := public.notificacoes_tz(v_tz);
          v_dia := public.notificacoes_dia_local(v_tz);

          -- Sem aparelho registrado nao ha como alcancar o aluno com o app
          -- fechado — a sugestao espera o proximo login em vez de ser entregue
          -- no vazio.
          v_gat := COALESCE(NEW.contexto->>'gatilho', 'horario');
          IF v_gat NOT IN ('horario', 'login', 'tempo_uso') THEN
            v_gat := 'horario';
          END IF;
          IF v_gat = 'horario'
             AND NOT EXISTS (SELECT 1 FROM expo_tokens d
                              WHERE d.aluno_id = NEW.aluno_id AND d.ativo) THEN
            v_gat := 'login';
          END IF;

          INSERT INTO notificacoes_pendentes (
            aluno_id, tipo, contexto, titulo, corpo, horario, status, prioridade,
            gatilho, expira_em, sugestao_id, dedupe_key
          )
          VALUES (
            NEW.aluno_id, NEW.tipo,
            COALESCE(NEW.contexto, '{}'::jsonb)
              || jsonb_build_object('dia', v_dia::text, 'timezone', v_tz),
            COALESCE(NEW.titulo, 'TrailUp'), COALESCE(NEW.corpo, ''), now(), 'pendente',
            COALESCE(NEW.prioridade, 0), v_gat,
            now() + make_interval(hours => public.notificacoes_cfg_int('expiracao_padrao_horas', 48)),
            NEW.id,
            public.notificacoes_dedupe_key(NEW.tipo, NEW.contexto->>'motivo', v_dia)
          )
          ON CONFLICT DO NOTHING
          RETURNING id INTO v_pend;

          IF v_pend IS NOT NULL THEN
            UPDATE notificacoes_ia
               SET status = 'promovida', promovida_em = now(), pendente_id = v_pend
             WHERE id = NEW.id;
          END IF;

          RETURN NEW;
        END;
        $fn$
        """
    )

    op.execute("DROP TABLE IF EXISTS notificacoes_dispositivos")


def downgrade() -> None:
    # Recria a tabela vazia; as funcoes voltam a apontar para ela ao reverter
    # `20260826_04`, que e quem as define.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS notificacoes_dispositivos (
          id                  bigserial   PRIMARY KEY,
          aluno_id            uuid        NOT NULL,
          push_token          text        NOT NULL,
          plataforma          text        NOT NULL DEFAULT 'desconhecida',
          device_id           text        NULL,
          app_version         text        NULL,
          timezone            text        NOT NULL DEFAULT 'UTC',
          ativo               boolean     NOT NULL DEFAULT TRUE,
          desativado_motivo   text        NULL,
          ultima_atividade_em timestamptz NOT NULL DEFAULT now(),
          criado_em           timestamptz NOT NULL DEFAULT now(),
          atualizado_em       timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_dispositivos_token_uidx
          ON notificacoes_dispositivos (push_token)
        """
    )
    op.execute("DROP POLICY IF EXISTS expo_tokens_aluno_upd ON expo_tokens")
    op.execute("DROP POLICY IF EXISTS expo_tokens_aluno_ins ON expo_tokens")
    op.execute("DROP POLICY IF EXISTS expo_tokens_aluno_sel ON expo_tokens")
    op.execute("DROP INDEX IF EXISTS expo_tokens_aluno_idx")
    op.execute("DROP INDEX IF EXISTS expo_tokens_token_uidx")
    op.execute(
        """
        ALTER TABLE expo_tokens
          DROP COLUMN IF EXISTS plataforma, DROP COLUMN IF EXISTS app_version,
          DROP COLUMN IF EXISTS timezone, DROP COLUMN IF EXISTS ativo,
          DROP COLUMN IF EXISTS desativado_motivo,
          DROP COLUMN IF EXISTS ultima_atividade_em,
          DROP COLUMN IF EXISTS atualizado_em
        """
    )
