"""Saúde dos clientes: erro, Web Vitals, falha de chamada e acesso, vistos de dentro do aparelho

## O que faltava

As sondas (`20261105_09`) provam que o site responde. Não veem tela branca, rede da escola, build antigo nem
RLS recusando, e o app fala com o Supabase sem passar por sonda nenhuma. O relatório de 05/11 (decisão 4) pede
gravação própria no Supabase. Não há API no caminho: a regra de fronteira vale, e erro é justamente o que
precisa chegar com a API fora.

## Volume

Com poucos alunos, amostrar destruiria a pouca evidência, então se agrega:

- `cliente_sessao`: uma linha por sessão, com contadores acumulados. Reenviar é idempotente, porque cada contador
  só sobe (`GREATEST`).
- `cliente_erro`: uma linha por assinatura, dia, superfície e versão. `sessoes` guarda até 50 ids, para contar
  pessoas afetadas sem gravar uma linha por ocorrência.

## O que não entra

`cliente_erro` não guarda stack, URL completa nem texto digitado. A mensagem é opcional, chega limpa do cliente e
passa por `fn_cliente_limpar_texto` aqui, porque mensagem de erro pode conter dado pessoal. `rota` e `destino` vêm
normalizados (`/turma/:id`, `rpc/nome`). Sem nenhum nome: a tela do dono só recebe agregado.

`cliente_saude_registrar` exige sessão: sem login não há escrita, e `anon` não tem EXECUTE. Falha antes do login fica
guardada no aparelho até haver sessão. As RPCs são a única porta: as tabelas nascem com RLS e sem policy nem GRANT.

Aluno com a coleta recusada ou pendente não envia nada: quem decide é o cliente, em `podeEnviar`. Isso conta menos
sessões do que existem, e é o lado certo para errar enquanto a decisão 7 do relatório (base legal) estiver aberta.

## Aviso

`fn_cliente_saude_varrer` roda a cada 10 min (`pg_cron`). Erro que derruba tela (`tela`, `fatal`) atingindo
`monitor_config.clientes.pessoas_alerta` pessoas (padrão 2) em 7 dias, na mesma versão, vira e-mail e sino, uma vez
por assinatura e versão. A regra é a do relatório: repetição entre pessoas diz mais que percentual.

## Retenção

90 dias. `cliente_sessao` entra em `retencao_politica`. `cliente_erro` não tem coluna de pessoa e o expurgo é aqui.

Sem `pg_cron` (banco local, CI) a migration passa e nada é agendado.

Revision ID: 20261105_14
Revises: 20261105_13
Create Date: 2026-11-05
"""

from __future__ import annotations

from alembic import op

revision = "20261105_14"
down_revision = "20261105_13"
branch_labels = None
depends_on = None

JOB_VARREDURA = "trailup_saude_clientes"

TABELAS = """
CREATE TABLE IF NOT EXISTS public.cliente_sessao (
  id                 uuid PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  superficie         text NOT NULL CHECK (superficie IN ('console', 'web_aluno', 'app')),
  versao             text,
  plataforma         text,
  formato            text CHECK (formato IN ('celular', 'desktop')),
  inicio             timestamptz NOT NULL,
  ultima_em          timestamptz NOT NULL,
  recebida_em        timestamptz NOT NULL DEFAULT now(),
  erros              integer NOT NULL DEFAULT 0,
  chamadas           integer NOT NULL DEFAULT 0,
  falhas_servidor    integer NOT NULL DEFAULT 0,
  sem_resposta       integer NOT NULL DEFAULT 0,
  criticas           integer NOT NULL DEFAULT 0,
  criticas_falha     integer NOT NULL DEFAULT 0,
  fallback_api       integer NOT NULL DEFAULT 0,
  falhas_por_destino jsonb NOT NULL DEFAULT '{}'::jsonb,
  lcp_ms             integer,
  inp_ms             integer,
  cls                numeric(7, 3),
  inicio_ms          integer
);
CREATE INDEX IF NOT EXISTS cliente_sessao_ultima_idx ON public.cliente_sessao (ultima_em);
CREATE INDEX IF NOT EXISTS cliente_sessao_user_idx ON public.cliente_sessao (user_id, recebida_em);
ALTER TABLE public.cliente_sessao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cliente_sessao FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.cliente_erro (
  id          bigserial PRIMARY KEY,
  dia         date NOT NULL,
  superficie  text NOT NULL CHECK (superficie IN ('console', 'web_aluno', 'app')),
  versao      text NOT NULL DEFAULT '',
  assinatura  text NOT NULL,
  tipo        text NOT NULL CHECK (tipo IN ('erro', 'promessa', 'tela', 'fatal')),
  nome        text,
  mensagem    text,
  rota        text,
  primeira_em timestamptz NOT NULL,
  ultima_em   timestamptz NOT NULL,
  vezes       integer NOT NULL DEFAULT 1,
  sessoes     uuid[] NOT NULL DEFAULT '{}',
  CONSTRAINT cliente_erro_unico UNIQUE (dia, superficie, versao, assinatura)
);
CREATE INDEX IF NOT EXISTS cliente_erro_ultima_idx ON public.cliente_erro (ultima_em);
ALTER TABLE public.cliente_erro ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cliente_erro FROM PUBLIC, anon, authenticated;

INSERT INTO public.retencao_politica
  (tabela, acao, coluna_aluno, coluna_tempo, dias, ordem, categoria, motivo)
VALUES
  ('cliente_sessao', 'apagar', 'user_id', 'ultima_em', 90, 87, 'telemetria',
   'saude tecnica por sessao: contadores e vitais, sem conteudo do aluno')
ON CONFLICT (tabela, acao) DO NOTHING;
"""

FUNCOES_SQL = r"""
-- Segunda linha de defesa: o cliente já limpa, mas quem grava não confia nele.
CREATE OR REPLACE FUNCTION public.fn_cliente_limpar_texto(p_texto text, p_max integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT nullif(btrim(left(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(p_texto, ''), '[^[:space:]@]+@[^[:space:]@]+', '<email>', 'g'),
        'https?://[^[:space:]]+', '<url>', 'g'),
      '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '<id>', 'g'),
    '[0-9]{4,}', '<n>', 'g'),
  p_max)), '')
$fn$;

CREATE OR REPLACE FUNCTION public.fn_cliente_inteiro(p_dados jsonb, p_chave text, p_max integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE WHEN jsonb_typeof(p_dados -> p_chave) = 'number'
              THEN least(greatest(round((p_dados ->> p_chave)::numeric), 0), p_max)::integer END
$fn$;

-- Relógio de aparelho é palpite: nada no futuro, nada mais velho que 30 dias.
CREATE OR REPLACE FUNCTION public.fn_cliente_instante(p_texto text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $fn$
BEGIN
  RETURN least(now(), greatest(now() - interval '30 days', coalesce(p_texto::timestamptz, now())));
EXCEPTION WHEN OTHERS THEN
  RETURN now();
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cliente_saude_registrar(p_sessao jsonb, p_erros jsonb DEFAULT '[]'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_superficie text := p_sessao ->> 'superficie';
  v_versao text := public.fn_cliente_limpar_texto(p_sessao ->> 'versao', 40);
  v_formato text := p_sessao ->> 'formato';
  v_inicio timestamptz := public.fn_cliente_instante(p_sessao ->> 'inicio');
  v_ultima timestamptz := public.fn_cliente_instante(p_sessao ->> 'ultima_em');
  v_destinos jsonb := '{}'::jsonb;
  v_linhas integer;
  v_erro jsonb;
  v_quando timestamptz;
  v_tipo text;
  v_assinatura text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão obrigatória.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_sessao) IS DISTINCT FROM 'object'
     OR v_superficie IS NULL OR v_superficie NOT IN ('console', 'web_aluno', 'app') THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_id := (p_sessao ->> 'id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '22023';
  END;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '22023';
  END IF;
  IF v_formato IS NOT NULL AND v_formato NOT IN ('celular', 'desktop') THEN
    v_formato := NULL;
  END IF;

  -- Teto por pessoa: um cliente em laço não enche o banco. Quem passa dele perde a sessão nova, sem erro.
  IF NOT EXISTS (SELECT 1 FROM public.cliente_sessao s WHERE s.id = v_id)
     AND (SELECT count(*) FROM public.cliente_sessao s
           WHERE s.user_id = v_uid AND s.recebida_em >= now() - interval '1 day') >= 200 THEN
    RETURN;
  END IF;

  IF jsonb_typeof(p_sessao -> 'falhas_por_destino') = 'object' THEN
    SELECT coalesce(jsonb_object_agg(d.chave, d.n), '{}'::jsonb) INTO v_destinos
      FROM (
        SELECT e.key AS chave, public.fn_cliente_inteiro(jsonb_build_object('n', e.value), 'n', 100000) AS n
          FROM jsonb_each(p_sessao -> 'falhas_por_destino') e
         WHERE e.key ~ '^[a-z0-9_/-]{1,80}$' AND jsonb_typeof(e.value) = 'number'
         ORDER BY e.key
         LIMIT 20
      ) d;
  END IF;

  INSERT INTO public.cliente_sessao AS s (
    id, user_id, superficie, versao, plataforma, formato, inicio, ultima_em,
    erros, chamadas, falhas_servidor, sem_resposta, criticas, criticas_falha, fallback_api,
    falhas_por_destino, lcp_ms, inp_ms, cls, inicio_ms)
  VALUES (
    v_id, v_uid, v_superficie, v_versao, public.fn_cliente_limpar_texto(p_sessao ->> 'plataforma', 20), v_formato,
    v_inicio, greatest(v_inicio, v_ultima),
    coalesce(public.fn_cliente_inteiro(p_sessao, 'erros', 100000), 0),
    coalesce(public.fn_cliente_inteiro(p_sessao, 'chamadas', 1000000), 0),
    coalesce(public.fn_cliente_inteiro(p_sessao, 'falhas_servidor', 1000000), 0),
    coalesce(public.fn_cliente_inteiro(p_sessao, 'sem_resposta', 1000000), 0),
    coalesce(public.fn_cliente_inteiro(p_sessao, 'criticas', 1000000), 0),
    coalesce(public.fn_cliente_inteiro(p_sessao, 'criticas_falha', 1000000), 0),
    coalesce(public.fn_cliente_inteiro(p_sessao, 'fallback_api', 100000), 0),
    v_destinos,
    public.fn_cliente_inteiro(p_sessao, 'lcp_ms', 600000),
    public.fn_cliente_inteiro(p_sessao, 'inp_ms', 600000),
    CASE WHEN jsonb_typeof(p_sessao -> 'cls') = 'number'
         THEN least(greatest((p_sessao ->> 'cls')::numeric, 0), 100) END,
    public.fn_cliente_inteiro(p_sessao, 'inicio_ms', 600000))
  ON CONFLICT (id) DO UPDATE SET
    ultima_em = greatest(s.ultima_em, EXCLUDED.ultima_em),
    recebida_em = now(),
    erros = greatest(s.erros, EXCLUDED.erros),
    chamadas = greatest(s.chamadas, EXCLUDED.chamadas),
    falhas_servidor = greatest(s.falhas_servidor, EXCLUDED.falhas_servidor),
    sem_resposta = greatest(s.sem_resposta, EXCLUDED.sem_resposta),
    criticas = greatest(s.criticas, EXCLUDED.criticas),
    criticas_falha = greatest(s.criticas_falha, EXCLUDED.criticas_falha),
    fallback_api = greatest(s.fallback_api, EXCLUDED.fallback_api),
    falhas_por_destino = s.falhas_por_destino || EXCLUDED.falhas_por_destino,
    lcp_ms = coalesce(EXCLUDED.lcp_ms, s.lcp_ms),
    inp_ms = coalesce(EXCLUDED.inp_ms, s.inp_ms),
    cls = coalesce(EXCLUDED.cls, s.cls),
    inicio_ms = coalesce(s.inicio_ms, EXCLUDED.inicio_ms)
  WHERE s.user_id = v_uid;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  -- Id de sessão de outra pessoa: nada muda, e os erros também não entram.
  IF v_linhas = 0 THEN
    RETURN;
  END IF;

  IF jsonb_typeof(p_erros) IS DISTINCT FROM 'array' THEN
    RETURN;
  END IF;
  FOR v_erro IN SELECT e.value FROM jsonb_array_elements(p_erros) AS e LIMIT 20 LOOP
    v_tipo := v_erro ->> 'tipo';
    v_assinatura := v_erro ->> 'assinatura';
    CONTINUE WHEN v_tipo IS NULL OR v_tipo NOT IN ('erro', 'promessa', 'tela', 'fatal');
    CONTINUE WHEN v_assinatura IS NULL OR v_assinatura !~ '^[a-z0-9]{1,32}$';
    v_quando := public.fn_cliente_instante(v_erro ->> 'em');
    INSERT INTO public.cliente_erro AS e (
      dia, superficie, versao, assinatura, tipo, nome, mensagem, rota, primeira_em, ultima_em, vezes, sessoes)
    VALUES (
      (v_quando AT TIME ZONE 'America/Sao_Paulo')::date, v_superficie, coalesce(v_versao, ''), v_assinatura, v_tipo,
      public.fn_cliente_limpar_texto(v_erro ->> 'nome', 60),
      public.fn_cliente_limpar_texto(v_erro ->> 'mensagem', 160),
      public.fn_cliente_limpar_texto(v_erro ->> 'rota', 80),
      v_quando, v_quando, greatest(coalesce(public.fn_cliente_inteiro(v_erro, 'vezes', 1000), 1), 1), ARRAY[v_id])
    ON CONFLICT ON CONSTRAINT cliente_erro_unico DO UPDATE SET
      vezes = least(e.vezes + EXCLUDED.vezes, 1000000),
      primeira_em = least(e.primeira_em, EXCLUDED.primeira_em),
      ultima_em = greatest(e.ultima_em, EXCLUDED.ultima_em),
      sessoes = CASE WHEN v_id = ANY (e.sessoes) OR cardinality(e.sessoes) >= 50 THEN e.sessoes
                     ELSE e.sessoes || v_id END;
  END LOOP;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_cliente_saude_varrer()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_min integer := greatest(coalesce((public.fn_monitor_cfg() -> 'clientes' ->> 'pessoas_alerta')::integer, 2), 1);
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_avisos integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT e.assinatura, e.superficie, e.versao, max(e.nome) AS nome, max(e.rota) AS rota,
           sum(e.vezes) AS vezes, count(DISTINCT s.user_id) AS pessoas
      FROM public.cliente_erro e
      CROSS JOIN LATERAL unnest(e.sessoes) AS q(sessao_id)
      JOIN public.cliente_sessao s ON s.id = q.sessao_id
     WHERE e.dia >= v_hoje - 7 AND e.tipo IN ('tela', 'fatal')
     GROUP BY e.assinatura, e.superficie, e.versao
    HAVING count(DISTINCT s.user_id) >= v_min
  LOOP
    PERFORM public.fn_monitor_alertar(
      'cliente-' || r.assinatura || '-' || r.versao,
      '[TrailUp] Erro derrubando tela em ' || r.superficie,
      format('%s afetou %s pessoas em 7 dias (%s ocorrências), versão %s, em %s.',
             coalesce(r.nome, 'Erro sem nome'), r.pessoas, r.vezes,
             coalesce(nullif(r.versao, ''), 'sem versão'), coalesce(r.rota, 'rota desconhecida')));
    v_avisos := v_avisos + 1;
  END LOOP;

  DELETE FROM public.cliente_erro e WHERE e.ultima_em < now() - interval '90 days';
  RETURN v_avisos;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.painel_clientes(p_horas integer DEFAULT 168)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_fuso constant text := 'America/Sao_Paulo';
  v_inicio timestamptz;
  v_superficies jsonb;
  v_erros jsonb;
  v_console jsonb;
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto acessa a saúde dos clientes.' USING ERRCODE = '42501';
  END IF;
  IF p_horas IS NULL OR p_horas < 1 OR p_horas > 720 THEN
    RAISE EXCEPTION 'A janela vai de 1 a 720 horas.' USING ERRCODE = '22023';
  END IF;
  v_inicio := now() - make_interval(hours => p_horas);

  WITH s AS (
    SELECT * FROM public.cliente_sessao x WHERE x.ultima_em >= v_inicio
  ),
  resumo AS (
    SELECT superficie,
           count(*) AS sessoes,
           count(DISTINCT user_id) AS pessoas,
           count(*) FILTER (WHERE erros > 0) AS sessoes_com_erro,
           count(*) FILTER (WHERE criticas > 0) AS sessoes_com_critica,
           count(*) FILTER (WHERE criticas > 0 AND criticas_falha = 0) AS sessoes_sem_falha,
           sum(chamadas) AS chamadas,
           sum(falhas_servidor) AS falhas_servidor,
           sum(sem_resposta) AS sem_resposta,
           sum(criticas) AS criticas,
           sum(criticas_falha) AS criticas_falha,
           sum(fallback_api) AS fallback_api,
           count(inicio_ms) AS inicio_n,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY inicio_ms) AS inicio_p75
      FROM s GROUP BY superficie
  ),
  vitais AS (
    SELECT superficie, coalesce(formato, 'sem_dado') AS formato,
           count(lcp_ms) AS lcp_n, percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp_ms) AS lcp_p75,
           count(inp_ms) AS inp_n, percentile_cont(0.75) WITHIN GROUP (ORDER BY inp_ms) AS inp_p75,
           count(cls) AS cls_n, percentile_cont(0.75) WITHIN GROUP (ORDER BY cls) AS cls_p75
      FROM s
     WHERE lcp_ms IS NOT NULL OR inp_ms IS NOT NULL OR cls IS NOT NULL
     GROUP BY superficie, coalesce(formato, 'sem_dado')
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'superficie', r.superficie,
           'sessoes', r.sessoes,
           'pessoas', r.pessoas,
           'sessoes_com_erro', r.sessoes_com_erro,
           'sessoes_com_critica', r.sessoes_com_critica,
           'sessoes_sem_falha', r.sessoes_sem_falha,
           'chamadas', r.chamadas,
           'falhas_servidor', r.falhas_servidor,
           'sem_resposta', r.sem_resposta,
           'criticas', r.criticas,
           'criticas_falha', r.criticas_falha,
           'fallback_api', r.fallback_api,
           'inicio_n', r.inicio_n,
           'inicio_p75_ms', round(r.inicio_p75::numeric),
           'vitais', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'formato', v.formato,
                      'lcp_n', v.lcp_n, 'lcp_p75_ms', round(v.lcp_p75::numeric),
                      'inp_n', v.inp_n, 'inp_p75_ms', round(v.inp_p75::numeric),
                      'cls_n', v.cls_n, 'cls_p75', round(v.cls_p75::numeric, 3)) ORDER BY v.formato)
               FROM vitais v WHERE v.superficie = r.superficie), '[]'::jsonb),
           'versoes', coalesce((
             SELECT jsonb_agg(jsonb_build_object('versao', w.versao, 'sessoes', w.n, 'com_erro', w.e) ORDER BY w.n DESC)
               FROM (SELECT coalesce(versao, 'sem_dado') AS versao, count(*) AS n, count(*) FILTER (WHERE erros > 0) AS e
                       FROM s WHERE s.superficie = r.superficie GROUP BY 1 ORDER BY 2 DESC LIMIT 6) w), '[]'::jsonb),
           'destinos', coalesce((
             SELECT jsonb_agg(jsonb_build_object('destino', d.destino, 'falhas', d.n) ORDER BY d.n DESC)
               FROM (SELECT j.key AS destino, sum(j.value::integer) AS n
                       FROM s CROSS JOIN LATERAL jsonb_each_text(s.falhas_por_destino) j
                      WHERE s.superficie = r.superficie
                      GROUP BY 1 ORDER BY 2 DESC LIMIT 8) d), '[]'::jsonb)
         ) ORDER BY r.superficie), '[]'::jsonb)
    INTO v_superficies
    FROM resumo r;

  WITH e AS (
    SELECT x.superficie, x.versao, x.assinatura,
           max(x.tipo) AS tipo, max(x.nome) AS nome, max(x.mensagem) AS mensagem, max(x.rota) AS rota,
           sum(x.vezes) AS vezes, min(x.primeira_em) AS primeira_em, max(x.ultima_em) AS ultima_em,
           array_agg(DISTINCT q.sessao_id) AS sessoes
      FROM public.cliente_erro x
      CROSS JOIN LATERAL unnest(x.sessoes) AS q(sessao_id)
     WHERE x.ultima_em >= v_inicio
     GROUP BY x.superficie, x.versao, x.assinatura
     ORDER BY max(x.ultima_em) DESC
     LIMIT 30
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'superficie', e.superficie,
           'versao', nullif(e.versao, ''),
           'assinatura', e.assinatura,
           'tipo', e.tipo,
           'nome', e.nome,
           'mensagem', e.mensagem,
           'rota', e.rota,
           'vezes', e.vezes,
           'sessoes', cardinality(e.sessoes),
           'pessoas', (SELECT count(DISTINCT c.user_id) FROM public.cliente_sessao c WHERE c.id = ANY (e.sessoes)),
           'primeira_em', e.primeira_em,
           'ultima_em', e.ultima_em,
           'nova', NOT EXISTS (
             SELECT 1 FROM public.cliente_erro o
              WHERE o.assinatura = e.assinatura AND o.superficie = e.superficie AND o.primeira_em < v_inicio)
         ) ORDER BY e.ultima_em DESC), '[]'::jsonb)
    INTO v_erros
    FROM e;

  SELECT jsonb_build_object(
           'professores', (SELECT count(*) FROM public.professor),
           'ativos_7d', (SELECT count(DISTINCT user_id) FROM public.cliente_sessao
                          WHERE superficie = 'console' AND ultima_em >= now() - interval '7 days'),
           'ativos_30d', (SELECT count(DISTINCT user_id) FROM public.cliente_sessao
                           WHERE superficie = 'console' AND ultima_em >= now() - interval '30 days'),
           'sessoes_7d', (SELECT count(*) FROM public.cliente_sessao
                           WHERE superficie = 'console' AND ultima_em >= now() - interval '7 days'),
           'serie_30d', coalesce((
             SELECT jsonb_agg(jsonb_build_object('dia', d.dia, 'professores', d.pessoas, 'sessoes', d.n) ORDER BY d.dia)
               FROM (SELECT (inicio AT TIME ZONE v_fuso)::date AS dia, count(DISTINCT user_id) AS pessoas, count(*) AS n
                       FROM public.cliente_sessao
                      WHERE superficie = 'console' AND inicio >= now() - interval '30 days'
                      GROUP BY 1) d), '[]'::jsonb))
    INTO v_console;

  RETURN jsonb_build_object(
    'gerado_em', now(),
    'janela_horas', p_horas,
    'superficies', v_superficies,
    'erros', v_erros,
    'console', v_console);
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_cliente_limpar_texto(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cliente_inteiro(jsonb, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cliente_instante(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cliente_saude_varrer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cliente_saude_registrar(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.painel_clientes(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_saude_registrar(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.painel_clientes(integer) TO authenticated;
"""

AGENDAR = f"""
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(j.jobname) FROM cron.job j WHERE j.jobname = '{JOB_VARREDURA}';
    PERFORM cron.schedule('{JOB_VARREDURA}', '*/10 * * * *', 'SELECT public.fn_cliente_saude_varrer()');
  END IF;
END
$cron$;
"""

DESAGENDAR = f"""
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(j.jobname) FROM cron.job j WHERE j.jobname = '{JOB_VARREDURA}';
  END IF;
END
$cron$;
"""


def upgrade() -> None:
    op.execute(TABELAS)
    op.execute(FUNCOES_SQL)
    op.execute(AGENDAR)


def downgrade() -> None:
    op.execute(DESAGENDAR)
    for funcao in (
        "painel_clientes(integer)",
        "fn_cliente_saude_varrer()",
        "cliente_saude_registrar(jsonb, jsonb)",
        "fn_cliente_instante(text)",
        "fn_cliente_inteiro(jsonb, text, integer)",
        "fn_cliente_limpar_texto(text, integer)",
    ):
        op.execute(f"DROP FUNCTION IF EXISTS public.{funcao}")
    op.execute("DELETE FROM public.retencao_politica WHERE tabela = 'cliente_sessao'")
    op.execute("DROP TABLE IF EXISTS public.cliente_erro, public.cliente_sessao")
