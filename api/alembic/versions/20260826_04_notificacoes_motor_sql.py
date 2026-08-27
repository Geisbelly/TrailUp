"""motor de notificacoes em SQL: RPC do app, rotinas, entrega, push e RLS

Complemento de `20260826_03`, que so mexeu no formato das tabelas. Aqui vive a
LOGICA — dentro do banco, porque a API e para IA e o resto e via banco
(CLAUDE.md). O ganho concreto: a API hiberna no free tier do Render, e um
despachante hospedado nela pararia de despachar exatamente quando ninguem esta
olhando.

O mobile conversa com tudo isso por `supabase.rpc(...)`, no mesmo caminho
autenticado que ele ja usa para ler `notificacoes`.

Push sai do proprio Postgres via `pg_net` (`net.http_post`), que ja esta
instalado no projeto. E assincrono: a chamada enfileira o POST e devolve na
hora, entao a transacao do aluno nunca espera a Expo responder.

Seguranca: as policies antigas eram `USING (true)` para o role `public` em
SELECT/UPDATE/DELETE — qualquer portador da chave anon lia e apagava a
notificacao de QUALQUER aluno. Com o mobile escrevendo direto, RLS deixa de ser
defesa em profundidade e passa a ser A autorizacao. Refeitas por aluno.

Revision ID: 20260826_04
Revises: 20260826_03
Create Date: 2026-08-26
"""

from alembic import op

revision = "20260826_04"
down_revision = "20260826_03"
branch_labels = None
depends_on = None


FUNCOES = r"""
-- ====================================================================
-- Helpers de configuracao: nenhum numero magico dentro das funcoes.
-- ====================================================================
CREATE OR REPLACE FUNCTION public.notificacoes_cfg_int(p_chave text, p_default integer)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT NULLIF(valor, '')::integer FROM notificacoes_config WHERE chave = p_chave),
    p_default
  )
$$;

CREATE OR REPLACE FUNCTION public.notificacoes_cfg_txt(p_chave text, p_default text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT NULLIF(valor, '') FROM notificacoes_config WHERE chave = p_chave),
    p_default
  )
$$;

-- Um fuso invalido vindo do aparelho nao pode derrubar o login do aluno. O pior
-- caso aceitavel e a rotina dele rodar em UTC.
CREATE OR REPLACE FUNCTION public.notificacoes_tz(p_timezone text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  PERFORM now() AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC');
  RETURN COALESCE(NULLIF(p_timezone, ''), 'UTC');
EXCEPTION WHEN OTHERS THEN
  RETURN 'UTC';
END;
$$;

-- O dia do ALUNO, nao o dia UTC: em UTC-3 a virada aconteceria no meio da
-- tarde e a rotina diaria dispararia duas vezes.
CREATE OR REPLACE FUNCTION public.notificacoes_dia_local(
  p_timezone text, p_momento timestamptz DEFAULT now()
)
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (p_momento AT TIME ZONE public.notificacoes_tz(p_timezone))::date
$$;

-- Chave de "esta mesma notificacao ja esta na fila?". Nao inclui titulo/corpo:
-- a IA reescreve o texto a cada ciclo e comparar texto faria o dedupe nunca
-- casar.
CREATE OR REPLACE FUNCTION public.notificacoes_dedupe_key(
  p_tipo text, p_motivo text, p_dia date
)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT substr(md5(COALESCE(p_tipo,'') || '|' || COALESCE(p_motivo,'') || '|' || COALESCE(p_dia::text,'')), 1, 32)
$$;

-- ====================================================================
-- Recorrencia
-- ====================================================================
CREATE OR REPLACE FUNCTION public.notificacoes_proxima_ocorrencia(
  p_recorrencia text,
  p_agora timestamptz,
  p_hora smallint,
  p_minuto smallint,
  p_timezone text
)
RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_rec   text := lower(trim(COALESCE(p_recorrencia, 'diaria')));
  v_tz    text := public.notificacoes_tz(p_timezone);
  v_local timestamp;
  v_alvo  timestamp;
  v_passo interval;
  v_n     integer;
BEGIN
  -- Rotina por EVENTO nao tem relogio: e avaliada no momento do login ou do
  -- heartbeat, entao nao tem proxima ocorrencia agendavel.
  IF v_rec IN ('unica', 'login', 'tempo_uso_diario') THEN
    RETURN NULL;
  END IF;

  IF v_rec ~ '^horas:[0-9]+$' THEN
    v_n := GREATEST(1, split_part(v_rec, ':', 2)::integer);
    RETURN p_agora + make_interval(hours => v_n);
  END IF;

  IF v_rec ~ '^minutos:[0-9]+$' THEN
    v_n := GREATEST(1, split_part(v_rec, ':', 2)::integer);
    RETURN p_agora + make_interval(mins => v_n);
  END IF;

  v_passo := CASE WHEN v_rec = 'semanal' THEN interval '7 days' ELSE interval '1 day' END;
  v_local := p_agora AT TIME ZONE v_tz;
  v_alvo  := date_trunc('day', v_local)
             + make_interval(hours => COALESCE(p_hora, EXTRACT(HOUR FROM v_local)::int),
                             mins  => COALESCE(p_minuto, 0));

  -- LOOP e nao um unico `+ passo`: se o banco/app ficou dias sem rodar, o alvo
  -- pode estar varios ciclos atras, e agendar no passado faria a rotina
  -- disparar em rajada na volta.
  WHILE v_alvo <= v_local LOOP
    v_alvo := v_alvo + v_passo;
  END LOOP;

  RETURN v_alvo AT TIME ZONE v_tz;
END;
$$;

-- ====================================================================
-- Push do SO (Expo) — assincrono, via pg_net
-- ====================================================================
-- Silencio e sobre o PUSH, nao sobre a notificacao: a linha na caixa de entrada
-- entra na hora. Adiar a linha faria o aluno abrir o app de manha e nao ver
-- nada do que aconteceu durante a noite.
CREATE OR REPLACE FUNCTION public.notificacoes_em_silencio(
  p_timezone text, p_momento timestamptz DEFAULT now()
)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_ini  integer := public.notificacoes_cfg_int('janela_silencio_inicio', 22) % 24;
  v_fim  integer := public.notificacoes_cfg_int('janela_silencio_fim', 7) % 24;
  v_hora integer;
BEGIN
  IF v_ini = v_fim THEN
    RETURN FALSE;
  END IF;
  v_hora := EXTRACT(HOUR FROM (p_momento AT TIME ZONE public.notificacoes_tz(p_timezone)))::int;
  IF v_ini < v_fim THEN
    RETURN v_hora >= v_ini AND v_hora < v_fim;
  END IF;
  -- Janela que cruza a meia-noite (ex.: 22h -> 7h).
  RETURN v_hora >= v_ini OR v_hora < v_fim;
END;
$$;

CREATE OR REPLACE FUNCTION public.notificacoes_enviar_push(
  p_aluno uuid, p_notificacao_id bigint, p_titulo text, p_corpo text,
  p_dados jsonb, p_prioridade integer DEFAULT 0
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_mensagens jsonb := '[]'::jsonb;
  v_headers   jsonb;
  v_token     text;
  v_qtd       integer := 0;
BEGIN
  SELECT jsonb_agg(
           jsonb_build_object(
             'to', d.push_token,
             'title', p_titulo,
             'body', p_corpo,
             'data', COALESCE(p_dados, '{}'::jsonb) || jsonb_build_object('notificacao_id', p_notificacao_id),
             'sound', 'default',
             -- 'high' e o que acorda o app em Doze mode no Android. Com
             -- 'default' a notificacao pode ficar retida ate a proxima janela
             -- de manutencao — justo o caso "celular fechado".
             'priority', CASE WHEN p_prioridade > 0 THEN 'high' ELSE 'default' END,
             'channelId', 'trailup'
           )
         )
    INTO v_mensagens
    FROM notificacoes_dispositivos d
   WHERE d.aluno_id = p_aluno
     AND d.ativo
     AND NOT public.notificacoes_em_silencio(d.timezone);

  IF v_mensagens IS NULL OR jsonb_array_length(v_mensagens) = 0 THEN
    RETURN 0;
  END IF;
  v_qtd := jsonb_array_length(v_mensagens);

  v_headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json');
  v_token := public.notificacoes_cfg_txt('push_access_token', '');
  IF v_token <> '' THEN
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_token);
  END IF;

  -- pg_net e assincrono: enfileira o POST e volta na hora. A transacao do
  -- aluno nunca espera a Expo. Em troca, `push_enviado_em` e otimista — a
  -- confirmacao real chega depois em `net._http_response`.
  PERFORM net.http_post(
    url := public.notificacoes_cfg_txt('push_url', 'https://exp.host/--/api/v2/push/send'),
    body := v_mensagens,
    headers := v_headers,
    timeout_milliseconds := public.notificacoes_cfg_int('push_timeout_ms', 15000)
  );

  UPDATE notificacoes SET push_enviado_em = now() WHERE id = p_notificacao_id;
  RETURN v_qtd;
EXCEPTION WHEN OTHERS THEN
  -- Push e o AVISO, nao a notificacao: a linha na caixa de entrada ja existe.
  -- Falhar aqui nao pode derrubar a entrega nem o login do aluno.
  UPDATE notificacoes SET push_erro = left(SQLERRM, 500) WHERE id = p_notificacao_id;
  RETURN 0;
END;
$$;

-- ====================================================================
-- Entrega: fila -> caixa de entrada -> push
-- ====================================================================
CREATE OR REPLACE FUNCTION public.notificacoes_entregar(
  p_aluno uuid, p_gatilhos text[] DEFAULT ARRAY['horario','login']
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_teto  integer := public.notificacoes_cfg_int('max_por_dia', 6);
  v_dia   date;
  v_hoje  integer;
  v_reg   record;
  v_id    bigint;
  v_n     integer := 0;
BEGIN
  -- Vencida e marcada, nao entregue: "volte a estudar hoje" tres dias depois e
  -- pior que nada.
  UPDATE notificacoes_pendentes
     SET status = 'expirada', atualizado_em = now()
   WHERE aluno_id = p_aluno
     AND status = 'pendente'
     AND expira_em IS NOT NULL
     AND expira_em <= now();

  FOR v_reg IN
    SELECT p.*
      FROM notificacoes_pendentes p
     WHERE p.aluno_id = p_aluno
       AND p.status = 'pendente'
       AND p.gatilho = ANY(p_gatilhos)
       AND (p.gatilho <> 'horario' OR p.horario <= now())
       AND (p.expira_em IS NULL OR p.expira_em > now())
     ORDER BY p.prioridade DESC, p.horario ASC
       FOR UPDATE SKIP LOCKED
  LOOP
    v_dia := public.notificacoes_dia_local(COALESCE(v_reg.contexto->>'timezone', 'UTC'));

    SELECT COALESCE(notificacoes_dia, 0) INTO v_hoje
      FROM aluno_atividade_diaria WHERE aluno_id = p_aluno AND dia = v_dia;
    v_hoje := COALESCE(v_hoje, 0);

    -- Teto diario: a excedente e SUPRIMIDA, nao adiada. Adiar so empurraria a
    -- avalanche para o dia seguinte.
    IF v_teto > 0 AND v_hoje >= v_teto THEN
      UPDATE notificacoes_pendentes
         SET status = 'suprimida', ultimo_erro = 'teto diario', atualizado_em = now()
       WHERE id = v_reg.id;
      IF v_reg.sugestao_id IS NOT NULL THEN
        UPDATE notificacoes_ia
           SET status = 'suprimida', motivo = 'teto_diario'
         WHERE id = v_reg.sugestao_id AND status = 'sugerida';
      END IF;
      CONTINUE;
    END IF;

    -- A linha na caixa de entrada vem ANTES do push: se o push falhar o aluno
    -- ainda ve a notificacao ao abrir o app. Na ordem inversa, uma falha aqui
    -- deixaria um aviso no aparelho que nao existe em lugar nenhum.
    INSERT INTO notificacoes (
      aluno_id, titulo, corpo, tipo, horario_envio, status, read,
      origem, origem_id, contexto
    )
    VALUES (
      p_aluno, COALESCE(v_reg.titulo, 'TrailUp'), COALESCE(v_reg.corpo, ''), v_reg.tipo,
      now(), 'enviada', FALSE, 'motor', v_reg.id, COALESCE(v_reg.contexto, '{}'::jsonb)
    )
    RETURNING id INTO v_id;

    UPDATE notificacoes_pendentes
       SET status = 'entregue', entregue_em = now(),
           notificacao_id = v_id, atualizado_em = now()
     WHERE id = v_reg.id;

    IF v_reg.sugestao_id IS NOT NULL THEN
      UPDATE notificacoes_ia
         SET status = 'promovida', promovida_em = now(), pendente_id = v_reg.id
       WHERE id = v_reg.sugestao_id;
    END IF;

    INSERT INTO aluno_atividade_diaria (aluno_id, dia, notificacoes_dia)
    VALUES (p_aluno, v_dia, 1)
    ON CONFLICT (aluno_id, dia) DO UPDATE
      SET notificacoes_dia = aluno_atividade_diaria.notificacoes_dia + 1,
          atualizado_em = now();

    PERFORM public.notificacoes_enviar_push(
      p_aluno, v_id, COALESCE(v_reg.titulo, 'TrailUp'), COALESCE(v_reg.corpo, ''),
      COALESCE(v_reg.contexto, '{}'::jsonb) - 'texto', COALESCE(v_reg.prioridade, 0)
    );

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

-- ====================================================================
-- Rotinas
-- ====================================================================
CREATE OR REPLACE FUNCTION public.notificacoes_garantir_rotinas(
  p_aluno uuid, p_timezone text DEFAULT 'UTC'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tz   text := public.notificacoes_tz(p_timezone);
  v_hora smallint := public.notificacoes_cfg_int('rotina_diaria_hora', 19)::smallint;
  v_min  smallint := public.notificacoes_cfg_int('rotina_diaria_minuto', 0)::smallint;
BEGIN
  -- `proxima_execucao` so e definida quando ainda NAO existe: um upsert
  -- disparado a cada login nao pode empurrar a rotina 24h para a frente toda
  -- vez que o aluno abre o app — ela nunca dispararia.
  INSERT INTO notificacoes_agendamentos (
    aluno_id, tipo, recorrencia, gatilho, titulo, corpo,
    hora_local, minuto_local, timezone, prioridade, contexto, proxima_execucao, horario, ativo
  )
  VALUES (
    p_aluno, 'revisao_diaria', 'diaria', 'horario',
    'Sua revisao de hoje', 'Ha uma sugestao da IA esperando por voce na trilha.',
    v_hora, v_min, v_tz, 1, jsonb_build_object('motivo', 'revisao_diaria'),
    public.notificacoes_proxima_ocorrencia('diaria', now(), v_hora, v_min, v_tz),
    public.notificacoes_proxima_ocorrencia('diaria', now(), v_hora, v_min, v_tz),
    TRUE
  )
  ON CONFLICT (aluno_id, tipo) WHERE aluno_id IS NOT NULL DO UPDATE
    SET timezone = EXCLUDED.timezone, atualizado_em = now();

  INSERT INTO notificacoes_agendamentos (
    aluno_id, tipo, recorrencia, gatilho, titulo, corpo, timezone, prioridade, contexto, ativo
  )
  VALUES (
    p_aluno, 'pausa_saudavel', 'tempo_uso_diario', 'tempo_uso',
    'Hora de uma pausa', 'Voce ja estudou bastante hoje. Uma pausa curta ajuda a fixar.',
    v_tz, 0,
    jsonb_build_object('motivo', 'tempo_uso',
                       'limiar_min', public.notificacoes_cfg_int('tempo_uso_limiar_min', 25)),
    TRUE
  )
  ON CONFLICT (aluno_id, tipo) WHERE aluno_id IS NOT NULL DO UPDATE
    SET timezone = EXCLUDED.timezone, atualizado_em = now();

  INSERT INTO notificacoes_agendamentos (
    aluno_id, tipo, recorrencia, gatilho, titulo, corpo, timezone, prioridade, contexto, ativo
  )
  VALUES (
    p_aluno, 'retomada_login', 'login', 'login',
    'Bem-vindo de volta', 'Continue de onde parou na sua trilha.',
    v_tz, 0, jsonb_build_object('motivo', 'retomada'), TRUE
  )
  ON CONFLICT (aluno_id, tipo) WHERE aluno_id IS NOT NULL DO UPDATE
    SET timezone = EXCLUDED.timezone, atualizado_em = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.notificacoes_processar_rotinas(
  p_aluno uuid, p_gatilho text, p_uso_seg integer DEFAULT 0
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_reg      record;
  v_dia      date;
  v_ctx      jsonb;
  v_titulo   text;
  v_corpo    text;
  v_prio     integer;
  v_sug      record;
  v_sug_id   bigint;
  v_pend     bigint;
  v_n        integer := 0;
BEGIN
  FOR v_reg IN
    SELECT a.*
      FROM notificacoes_agendamentos a
     WHERE a.aluno_id = p_aluno
       AND a.ativo
       AND a.gatilho = p_gatilho
       AND (p_gatilho <> 'horario'
            OR (a.proxima_execucao IS NOT NULL AND a.proxima_execucao <= now()))
     ORDER BY a.prioridade DESC
       FOR UPDATE SKIP LOCKED
  LOOP
    v_dia    := public.notificacoes_dia_local(v_reg.timezone);
    v_ctx    := COALESCE(v_reg.contexto, '{}'::jsonb);
    v_titulo := COALESCE(v_reg.titulo, 'TrailUp');
    v_corpo  := COALESCE(v_reg.corpo, 'Voce tem novidades na sua trilha.');
    v_prio   := COALESCE(v_reg.prioridade, 0);
    v_sug_id := NULL;

    -- Gatilho de tempo de uso: so dispara acima do limiar do proprio contexto.
    IF p_gatilho = 'tempo_uso'
       AND (p_uso_seg / 60) < COALESCE((v_ctx->>'limiar_min')::int,
                                       public.notificacoes_cfg_int('tempo_uso_limiar_min', 25)) THEN
      CONTINUE;
    END IF;

    -- A rotina de revisao e uma VERIFICACAO das sugestoes da IA, nao um texto
    -- fixo. O `agente_notificacao` ja produz sugestoes a cada ciclo; pedir uma
    -- mensagem nova ao LLM todo dia so para reescrever o que existe seria custo
    -- sem ganho. O texto proprio da rotina so aparece quando a IA nao tem nada.
    IF v_reg.tipo = 'revisao_diaria' THEN
      SELECT i.id, i.titulo, i.corpo, i.contexto, i.prioridade INTO v_sug
        FROM notificacoes_ia i
       WHERE i.aluno_id = p_aluno
         AND i.status = 'sugerida'
         AND i.created_at >= now() - interval '48 hours'
       ORDER BY i.prioridade DESC, i.created_at DESC
       LIMIT 1;

      IF FOUND THEN
        v_sug_id := v_sug.id;
        v_titulo := COALESCE(v_sug.titulo, v_titulo);
        v_corpo  := COALESCE(v_sug.corpo, v_corpo);
        v_prio   := GREATEST(v_prio, COALESCE(v_sug.prioridade, 0));
        v_ctx    := COALESCE(v_sug.contexto, '{}'::jsonb)
                    || jsonb_build_object('motivo', v_ctx->>'motivo', 'sugestao_ia', true);
        -- As outras sugestoes do periodo sao encerradas junto: entregar todas
        -- viraria rajada, e deixa-las 'sugerida' faria a rotina de amanha
        -- reentregar mensagem de dois dias atras.
        UPDATE notificacoes_ia
           SET status = 'suprimida', motivo = 'substituida_por_revisao'
         WHERE aluno_id = p_aluno AND status = 'sugerida' AND id <> v_sug_id;
      END IF;
    END IF;

    v_ctx := v_ctx || jsonb_build_object(
      'dia', v_dia::text, 'timezone', v_reg.timezone, 'agendamento_tipo', v_reg.tipo
    );

    INSERT INTO notificacoes_pendentes (
      aluno_id, tipo, contexto, titulo, corpo, horario, status, prioridade,
      gatilho, expira_em, agendamento_id, sugestao_id, dedupe_key
    )
    VALUES (
      p_aluno, v_reg.tipo, v_ctx, v_titulo, v_corpo, now(), 'pendente', v_prio,
      v_reg.gatilho,
      now() + make_interval(hours => public.notificacoes_cfg_int('expiracao_padrao_horas', 48)),
      v_reg.id, v_sug_id,
      public.notificacoes_dedupe_key(v_reg.tipo, v_ctx->>'motivo', v_dia)
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_pend;

    IF v_pend IS NOT NULL THEN
      v_n := v_n + 1;
      UPDATE notificacoes_agendamentos
         SET ultima_execucao = now(), execucoes = execucoes + 1
       WHERE id = v_reg.id;
    END IF;

    -- Rotina de relogio avanca; rotina por evento nao tem relogio e continua
    -- ATIVA com proxima_execucao NULL — NULL aqui nao significa "acabou".
    IF v_reg.gatilho = 'horario' THEN
      UPDATE notificacoes_agendamentos
         SET proxima_execucao = public.notificacoes_proxima_ocorrencia(
               v_reg.recorrencia, now(), v_reg.hora_local, v_reg.minuto_local, v_reg.timezone
             ),
             horario = public.notificacoes_proxima_ocorrencia(
               v_reg.recorrencia, now(), v_reg.hora_local, v_reg.minuto_local, v_reg.timezone
             ),
             ativo = (public.notificacoes_proxima_ocorrencia(
               v_reg.recorrencia, now(), v_reg.hora_local, v_reg.minuto_local, v_reg.timezone
             ) IS NOT NULL),
             atualizado_em = now()
       WHERE id = v_reg.id;
    END IF;
  END LOOP;

  RETURN v_n;
END;
$$;

-- ====================================================================
-- Trigger: a API so insere a SUGESTAO; o banco faz o resto
-- ====================================================================
CREATE OR REPLACE FUNCTION public.notificacoes_ia_promover()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
    FROM notificacoes_dispositivos d
   WHERE d.aluno_id = NEW.aluno_id AND d.ativo
   ORDER BY d.ultima_atividade_em DESC
   LIMIT 1;
  v_tz  := public.notificacoes_tz(v_tz);
  v_dia := public.notificacoes_dia_local(v_tz);

  -- Sem aparelho registrado nao ha como alcancar o aluno com o app fechado —
  -- a sugestao espera o proximo login em vez de ser entregue no vazio.
  v_gat := COALESCE(NEW.contexto->>'gatilho', 'horario');
  IF v_gat NOT IN ('horario', 'login', 'tempo_uso') THEN
    v_gat := 'horario';
  END IF;
  IF v_gat = 'horario'
     AND NOT EXISTS (SELECT 1 FROM notificacoes_dispositivos d
                      WHERE d.aluno_id = NEW.aluno_id AND d.ativo) THEN
    v_gat := 'login';
  END IF;

  INSERT INTO notificacoes_pendentes (
    aluno_id, tipo, contexto, titulo, corpo, horario, status, prioridade,
    gatilho, expira_em, sugestao_id, dedupe_key
  )
  VALUES (
    NEW.aluno_id, NEW.tipo,
    COALESCE(NEW.contexto, '{}'::jsonb) || jsonb_build_object('dia', v_dia::text, 'timezone', v_tz),
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
$$;

DROP TRIGGER IF EXISTS trg_notificacoes_ia_promover ON notificacoes_ia;
CREATE TRIGGER trg_notificacoes_ia_promover
  AFTER INSERT ON notificacoes_ia
  FOR EACH ROW EXECUTE FUNCTION public.notificacoes_ia_promover();

-- ====================================================================
-- RPC do app
-- ====================================================================
CREATE OR REPLACE FUNCTION public.notificacoes_registrar_login(
  p_plataforma text DEFAULT 'desconhecida',
  p_timezone text DEFAULT 'UTC',
  p_device_id text DEFAULT NULL,
  p_app_version text DEFAULT NULL,
  p_push_token text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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

  -- Sessao anterior aberta (app morto pelo SO, sem chance de avisar) e fechada
  -- antes de abrir a nova, senao o aluno acumula sessoes fantasma para sempre.
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
        ultimo_acesso_em = now(), timezone = EXCLUDED.timezone, atualizado_em = now();

  IF p_push_token IS NOT NULL AND p_push_token <> '' THEN
    INSERT INTO notificacoes_dispositivos (
      aluno_id, push_token, plataforma, device_id, app_version, timezone
    )
    VALUES (v_aluno, p_push_token, p_plataforma, p_device_id, p_app_version, v_tz)
    ON CONFLICT (push_token) DO UPDATE
      SET aluno_id = EXCLUDED.aluno_id, plataforma = EXCLUDED.plataforma,
          device_id = COALESCE(EXCLUDED.device_id, notificacoes_dispositivos.device_id),
          app_version = COALESCE(EXCLUDED.app_version, notificacoes_dispositivos.app_version),
          timezone = EXCLUDED.timezone, ativo = TRUE, desativado_motivo = NULL,
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
$$;

CREATE OR REPLACE FUNCTION public.notificacoes_heartbeat(
  p_segundos integer DEFAULT 0,
  p_timezone text DEFAULT 'UTC',
  p_sessao_id bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_aluno uuid := auth.uid();
  v_tz    text := public.notificacoes_tz(p_timezone);
  v_dia   date;
  v_seg   integer := GREATEST(0, LEAST(COALESCE(p_segundos, 0), 3600));
  v_total integer;
  v_criadas integer;
  v_entregues integer;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
  END IF;
  v_dia := public.notificacoes_dia_local(v_tz);

  -- O app manda DELTA, nao total acumulado: reenviar uma batida perdida
  -- somaria o total inteiro de novo e inflaria o tempo de estudo.
  INSERT INTO aluno_atividade_diaria (
    aluno_id, dia, timezone, tempo_uso_seg, primeiro_acesso_em, ultimo_acesso_em
  )
  VALUES (v_aluno, v_dia, v_tz, v_seg, now(), now())
  ON CONFLICT (aluno_id, dia) DO UPDATE
    SET tempo_uso_seg = aluno_atividade_diaria.tempo_uso_seg + EXCLUDED.tempo_uso_seg,
        ultimo_acesso_em = now(), timezone = EXCLUDED.timezone, atualizado_em = now()
  RETURNING tempo_uso_seg INTO v_total;

  IF p_sessao_id IS NOT NULL THEN
    UPDATE aluno_sessoes_app
       SET duracao_seg = duracao_seg + v_seg, atualizado_em = now()
     WHERE id = p_sessao_id AND aluno_id = v_aluno AND encerrada_em IS NULL;
  END IF;

  v_criadas := public.notificacoes_processar_rotinas(v_aluno, 'tempo_uso', v_total);
  v_criadas := v_criadas + public.notificacoes_processar_rotinas(v_aluno, 'horario');
  v_entregues := public.notificacoes_entregar(v_aluno, ARRAY['tempo_uso', 'horario']);

  RETURN jsonb_build_object(
    'tempo_uso_seg', v_total, 'pendentes_criadas', v_criadas, 'entregues', v_entregues
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.notificacoes_encerrar_sessao()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_aluno uuid := auth.uid();
BEGIN
  IF v_aluno IS NULL THEN
    RETURN;
  END IF;
  UPDATE aluno_sessoes_app
     SET encerrada_em = now(), atualizado_em = now()
   WHERE aluno_id = v_aluno AND encerrada_em IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notificacoes_desativar_dispositivo(p_push_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_aluno uuid := auth.uid();
BEGIN
  IF v_aluno IS NULL OR p_push_token IS NULL OR p_push_token = '' THEN
    RETURN;
  END IF;
  -- So o dono do registro pode desligar: sem o filtro por aluno, qualquer um
  -- silenciaria o aparelho de outro mandando o token dele.
  UPDATE notificacoes_dispositivos
     SET ativo = FALSE, desativado_motivo = 'logout', atualizado_em = now()
   WHERE push_token = p_push_token AND aluno_id = v_aluno;
END;
$$;

-- O app le as rotinas para AGENDAR NOTIFICACAO LOCAL no aparelho. E o que faz o
-- lembrete diario funcionar com o app fechado sem depender de servidor nenhum.
CREATE OR REPLACE FUNCTION public.notificacoes_minhas_rotinas()
RETURNS TABLE (
  id bigint, tipo text, recorrencia text, gatilho text, titulo text, corpo text,
  hora_local smallint, minuto_local smallint, timezone text, prioridade integer,
  contexto jsonb, ativo boolean, proxima_execucao timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id, a.tipo, a.recorrencia, a.gatilho, a.titulo, a.corpo,
         a.hora_local, a.minuto_local, a.timezone, a.prioridade,
         a.contexto, a.ativo, a.proxima_execucao
    FROM notificacoes_agendamentos a
   WHERE a.aluno_id = auth.uid()
   ORDER BY a.tipo
$$;

CREATE OR REPLACE FUNCTION public.notificacoes_salvar_rotina(
  p_tipo text,
  p_recorrencia text DEFAULT 'diaria',
  p_gatilho text DEFAULT 'horario',
  p_titulo text DEFAULT NULL,
  p_corpo text DEFAULT NULL,
  p_hora_local smallint DEFAULT NULL,
  p_minuto_local smallint DEFAULT 0,
  p_timezone text DEFAULT 'UTC',
  p_prioridade integer DEFAULT 0,
  p_contexto jsonb DEFAULT '{}'::jsonb,
  p_ativo boolean DEFAULT TRUE
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_aluno uuid := auth.uid();
  v_tz    text := public.notificacoes_tz(p_timezone);
  v_prox  timestamptz;
  v_id    bigint;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
  END IF;
  IF p_gatilho NOT IN ('horario', 'login', 'tempo_uso') THEN
    RAISE EXCEPTION 'gatilho invalido: %', p_gatilho USING ERRCODE = '22023';
  END IF;

  v_prox := public.notificacoes_proxima_ocorrencia(
    p_recorrencia, now(), p_hora_local, p_minuto_local, v_tz
  );

  INSERT INTO notificacoes_agendamentos (
    aluno_id, tipo, recorrencia, gatilho, titulo, corpo, hora_local, minuto_local,
    timezone, prioridade, contexto, proxima_execucao, horario, ativo
  )
  VALUES (
    v_aluno, p_tipo, p_recorrencia, p_gatilho, p_titulo, p_corpo, p_hora_local,
    COALESCE(p_minuto_local, 0), v_tz, COALESCE(p_prioridade, 0),
    COALESCE(p_contexto, '{}'::jsonb), v_prox, v_prox, COALESCE(p_ativo, TRUE)
  )
  ON CONFLICT (aluno_id, tipo) WHERE aluno_id IS NOT NULL DO UPDATE
    SET recorrencia = EXCLUDED.recorrencia, gatilho = EXCLUDED.gatilho,
        titulo = COALESCE(EXCLUDED.titulo, notificacoes_agendamentos.titulo),
        corpo = COALESCE(EXCLUDED.corpo, notificacoes_agendamentos.corpo),
        hora_local = EXCLUDED.hora_local, minuto_local = EXCLUDED.minuto_local,
        timezone = EXCLUDED.timezone, prioridade = EXCLUDED.prioridade,
        contexto = EXCLUDED.contexto,
        -- Edicao EXPLICITA do aluno reagenda: mudar o horario da rotina e
        -- exatamente pedir que ela mude de horario (ao contrario do upsert
        -- automatico do login, que preserva).
        proxima_execucao = EXCLUDED.proxima_execucao,
        horario = EXCLUDED.horario,
        ativo = EXCLUDED.ativo, atualizado_em = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'proxima_execucao', v_prox);
END;
$$;

-- Faxina + varredura global, para pg_cron alcancar quem NAO abriu o app.
CREATE OR REPLACE FUNCTION public.notificacoes_varrer(p_limite integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_aluno uuid;
  v_criadas integer := 0;
  v_entregues integer := 0;
  v_ociosa integer := public.notificacoes_cfg_int('sessao_ociosa_min', 15);
BEGIN
  UPDATE aluno_sessoes_app
     SET encerrada_em = atualizado_em, atualizado_em = now()
   WHERE encerrada_em IS NULL
     AND atualizado_em < now() - make_interval(mins => v_ociosa);

  UPDATE notificacoes_pendentes
     SET status = 'expirada', atualizado_em = now()
   WHERE status = 'pendente' AND expira_em IS NOT NULL AND expira_em <= now();

  FOR v_aluno IN
    SELECT DISTINCT a.aluno_id
      FROM notificacoes_agendamentos a
     WHERE a.ativo AND a.gatilho = 'horario'
       AND a.aluno_id IS NOT NULL
       AND a.proxima_execucao IS NOT NULL AND a.proxima_execucao <= now()
     LIMIT GREATEST(1, p_limite)
  LOOP
    v_criadas := v_criadas + public.notificacoes_processar_rotinas(v_aluno, 'horario');
    v_entregues := v_entregues + public.notificacoes_entregar(v_aluno, ARRAY['horario']);
  END LOOP;

  RETURN jsonb_build_object('pendentes_criadas', v_criadas, 'entregues', v_entregues);
END;
$$;
"""


PERMISSOES = r"""
-- Só as RPCs que o app chama ficam expostas. As funcoes internas (entregar,
-- processar_rotinas, enviar_push, varrer) NAO recebem GRANT: elas rodam como
-- SECURITY DEFINER a partir das RPCs, e expo-las deixaria o app disparar
-- entrega em nome de qualquer aluno.
REVOKE ALL ON FUNCTION public.notificacoes_entregar(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_processar_rotinas(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_garantir_rotinas(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_enviar_push(uuid, bigint, text, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_varrer(integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.notificacoes_registrar_login(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notificacoes_heartbeat(integer, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notificacoes_encerrar_sessao() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notificacoes_desativar_dispositivo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notificacoes_minhas_rotinas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notificacoes_salvar_rotina(text, text, text, text, text, smallint, smallint, text, integer, jsonb, boolean) TO authenticated;
"""


# As policies antigas eram `USING (true)` para `public` — leitura e DELETE
# irrestritos sobre a notificacao de qualquer aluno. Com o mobile escrevendo
# direto no banco, RLS deixa de ser defesa extra e vira A autorizacao.
POLICIES = r"""
DROP POLICY IF EXISTS "Enable read access for all users" ON notificacoes;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON notificacoes;
DROP POLICY IF EXISTS "Policy with table joins" ON notificacoes;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON notificacoes;
DROP POLICY IF EXISTS notificacoes_aluno_sel ON notificacoes;
DROP POLICY IF EXISTS notificacoes_aluno_upd ON notificacoes;
DROP POLICY IF EXISTS notificacoes_aluno_del ON notificacoes;
CREATE POLICY notificacoes_aluno_sel ON notificacoes
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());
CREATE POLICY notificacoes_aluno_upd ON notificacoes
  FOR UPDATE TO authenticated USING (aluno_id = auth.uid()) WITH CHECK (aluno_id = auth.uid());
CREATE POLICY notificacoes_aluno_del ON notificacoes
  FOR DELETE TO authenticated USING (aluno_id = auth.uid());
-- INSERT continua permitido, mas so PARA SI (`Notificacao.create` no app usa
-- isso para conquista/rank). O buraco antigo nao era o app inserir — era o
-- `WITH CHECK (true)`, que deixava forjar notificacao no nome de qualquer
-- aluno. O motor, sendo SECURITY DEFINER, passa por cima da policy de todo
-- jeito e nao depende dela.
DROP POLICY IF EXISTS notificacoes_aluno_ins ON notificacoes;
CREATE POLICY notificacoes_aluno_ins ON notificacoes
  FOR INSERT TO authenticated WITH CHECK (aluno_id = auth.uid());

DROP POLICY IF EXISTS "Enable read access for all users" ON notificacoes_pendentes;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON notificacoes_pendentes;
DROP POLICY IF EXISTS "Policy with table joins" ON notificacoes_pendentes;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON notificacoes_pendentes;
DROP POLICY IF EXISTS notificacoes_pendentes_aluno_sel ON notificacoes_pendentes;
CREATE POLICY notificacoes_pendentes_aluno_sel ON notificacoes_pendentes
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());

DROP POLICY IF EXISTS "Enable read access for all users" ON notificacoes_ia;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON notificacoes_ia;
DROP POLICY IF EXISTS "Policy with table joins" ON notificacoes_ia;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON notificacoes_ia;
DROP POLICY IF EXISTS notificacoes_ia_aluno_sel ON notificacoes_ia;
CREATE POLICY notificacoes_ia_aluno_sel ON notificacoes_ia
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());

DROP POLICY IF EXISTS "Enable read access for all users" ON notificacoes_agendamentos;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON notificacoes_agendamentos;
DROP POLICY IF EXISTS "Policy with table joins" ON notificacoes_agendamentos;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON notificacoes_agendamentos;
DROP POLICY IF EXISTS notificacoes_agendamentos_aluno_sel ON notificacoes_agendamentos;
CREATE POLICY notificacoes_agendamentos_aluno_sel ON notificacoes_agendamentos
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());

ALTER TABLE notificacoes_dispositivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notificacoes_dispositivos_aluno_sel ON notificacoes_dispositivos;
CREATE POLICY notificacoes_dispositivos_aluno_sel ON notificacoes_dispositivos
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());

ALTER TABLE aluno_sessoes_app ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aluno_sessoes_app_aluno_sel ON aluno_sessoes_app;
CREATE POLICY aluno_sessoes_app_aluno_sel ON aluno_sessoes_app
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());

ALTER TABLE aluno_atividade_diaria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aluno_atividade_diaria_aluno_sel ON aluno_atividade_diaria;
CREATE POLICY aluno_atividade_diaria_aluno_sel ON aluno_atividade_diaria
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());

-- Config e leitura publica autenticada (o app precisa do limiar para o contador
-- local) e escrita so por service_role.
ALTER TABLE notificacoes_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notificacoes_config_sel ON notificacoes_config;
CREATE POLICY notificacoes_config_sel ON notificacoes_config
  FOR SELECT TO authenticated USING (true);
"""


def upgrade() -> None:
    op.execute(FUNCOES)
    op.execute(PERMISSOES)
    op.execute(POLICIES)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_notificacoes_ia_promover ON notificacoes_ia")
    for assinatura in (
        "public.notificacoes_ia_promover()",
        "public.notificacoes_varrer(integer)",
        "public.notificacoes_salvar_rotina(text, text, text, text, text, smallint, smallint, text, integer, jsonb, boolean)",
        "public.notificacoes_minhas_rotinas()",
        "public.notificacoes_desativar_dispositivo(text)",
        "public.notificacoes_encerrar_sessao()",
        "public.notificacoes_heartbeat(integer, text, bigint)",
        "public.notificacoes_registrar_login(text, text, text, text, text)",
        "public.notificacoes_processar_rotinas(uuid, text, integer)",
        "public.notificacoes_garantir_rotinas(uuid, text)",
        "public.notificacoes_entregar(uuid, text[])",
        "public.notificacoes_enviar_push(uuid, bigint, text, text, jsonb, integer)",
        "public.notificacoes_em_silencio(text, timestamptz)",
        "public.notificacoes_proxima_ocorrencia(text, timestamptz, smallint, smallint, text)",
        "public.notificacoes_dedupe_key(text, text, date)",
        "public.notificacoes_dia_local(text, timestamptz)",
        "public.notificacoes_tz(text)",
        "public.notificacoes_cfg_txt(text, text)",
        "public.notificacoes_cfg_int(text, integer)",
    ):
        op.execute(f"DROP FUNCTION IF EXISTS {assinatura}")

    for tabela in (
        "notificacoes",
        "notificacoes_pendentes",
        "notificacoes_ia",
        "notificacoes_agendamentos",
    ):
        op.execute(f'DROP POLICY IF EXISTS {tabela}_aluno_sel ON {tabela}')
    op.execute('DROP POLICY IF EXISTS notificacoes_aluno_upd ON notificacoes')
    op.execute('DROP POLICY IF EXISTS notificacoes_aluno_del ON notificacoes')
    op.execute('DROP POLICY IF EXISTS notificacoes_aluno_ins ON notificacoes')
    # As policies abertas originais NAO sao recriadas de proposito: elas eram o
    # buraco de seguranca que esta migracao fechou.
