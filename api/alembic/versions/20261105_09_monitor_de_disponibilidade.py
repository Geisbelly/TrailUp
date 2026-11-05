"""Monitor de disponibilidade: sondas, incidentes e alerta por e-mail, tudo no banco

## O que faltava

O painel técnico (`20261102_22`) dizia quando cada worker mexeu por último e nada mais: o banco não
enxergava a API. Quando ela caía, ninguém sabia até alguém reclamar. O incidente de 01/11 (502 por duas
cabeças no Alembic) foi descoberto assim, e o sino (`20261102_23`) só avisa quem abre o console.

## O que muda

O `pg_cron` roda `fn_monitor_tick()` a cada minuto. O tick faz, nesta ordem, cada passo isolado (um passo
com erro vira `WARNING` e o seguinte roda):

1. **colhe** as respostas das sondas anteriores em `net._http_response`;
2. **aplica** cada resultado na máquina de estados do alvo (`monitor_alvo`);
3. **varre** instabilidade, lentidão e os sinais que o banco já tem;
4. **dispara** as sondas do minuto com `net.http_get`;
5. **envia** e confere os e-mails pendentes (`monitor_alerta`).

Quem mede a API é o banco, de fora do VPS. Relógio e alerta continuam funcionando com a API fora do ar,
que é o motivo de não estarem nela (regra de fronteira do `CLAUDE.md`).

## O que é queda, instabilidade, lentidão e degradação

- **Queda** (`queda`): `falhas` sondas seguidas falham (padrão 3, ou 3 min na API). Volta depois de
  `sucessos` sondas seguidas boas. O início do incidente é a **primeira** sonda ruim, não a terceira.
  Um restart de deploy que dura menos que isso não abre incidente, mas fica na conta da disponibilidade.
- **Instabilidade** (`instabilidade`): falhas soltas sem chegar a queda (ao menos `falhas_min` e
  `falha_pct` % das sondas na janela) ou `quedas_em_6h` quedas em 6 h. Enquanto ela está aberta, as quedas do
  alvo não mandam e-mail: um serviço piscando viraria dezenas de avisos.
- **Lentidão** (`lentidao`): `fracao_pct` % das sondas da janela acima de `limite_ms`.
- **Degradação** (`degradacao`): o que não é sonda. O app relatando que não alcança a API, erro do modelo,
  rotina do `pg_cron` falhando, banco perto do limite.

Toda regra lê `app_config.monitor_config` (privada): mudar um limiar não pede migration.

## Horário de aula

O SLO vale em horário de aula, numa janela de 28 dias (`slo_janela_dias`); 24x7 fica como informativo. Sem plantão,
uma queda às 23 h vista às 7 h gastaria sozinha mais que o orçamento de 30 dias e não falaria do aluno. O banco não
tem grade de aula, então a janela é global e fica em `monitor_config.aula` (dias ISO, início, fim em Brasília e os
períodos `sem_aula`). Em aula, toda sonda roda a cada `intervalo_aula_min` (1 min); fora dela, a cada `intervalo_min`.
Com 5 min em aula, a menor queda declarada levaria 15 min, o que é boa parte do orçamento. Cada sonda grava `em_aula`
no momento em que sai, então mudar a janela não reescreve o passado.

## Honestidade da medida

- **Sonda sem resposta não é falha.** Se o `pg_net` não devolveu nada em 3 min, a sonda fica com
  `ok = NULL` e `motivo = 'sem_resposta'`: quem não respondeu foi o medidor, e isso é `sem_dado`.
- **A latência é um proxy.** O `pg_net` não grava a duração: `latencia_ms` é `created` da resposta menos
  `enviada_em`, com a espera do worker do `pg_net` dentro. Serve para tendência, não para o número absoluto.
- **O monitor cai com o banco.** Se o Supabase cair, nada aqui roda. Para isso existe a batida
  (`monitor_batida_url` no Vault): sem ela configurada, esse caso não é coberto, e o painel diz isso.
- `/health` consulta o banco. Falha nela pode ser a API ou o caminho entre API e banco.

## Tabelas sem policy, de propósito

`monitor_alvo`, `monitor_sonda`, `monitor_incidente` e `monitor_alerta` nascem com RLS e sem policy nem
GRANT para cliente: só as funções daqui e o `service_role` as tocam, e a leitura é a RPC
`painel_disponibilidade`, que confere `app_e_dono()` antes de ler.

## Volume

Uma linha por sonda: com a janela padrão, até ~3,5 mil linhas por dia útil, com retenção de 35 dias (o SLO é
de 28). Incidentes ficam para sempre: são poucos e são o histórico.

Sem `pg_cron` ou `pg_net` (banco local, CI) a migration passa e nada é agendado.

Revision ID: 20261105_09
Revises: 20261105_08
Create Date: 2026-11-05
"""

from __future__ import annotations

import json

from alembic import op

revision = "20261105_09"
down_revision = "20261105_08"
branch_labels = None
depends_on = None

JOB_TICK = "trailup_monitor_tick"
JOB_EXPURGO = "trailup_monitor_expurgo"

CONFIG_PADRAO = {
    "queda": {"falhas": 3, "sucessos": 2},
    "instabilidade": {"janela_min": 60, "falhas_min": 3, "falha_pct": 5, "quedas_em_6h": 2},
    "lentidao": {"janela_min": 15, "limite_ms": 3000, "fracao_pct": 50, "minimo": 10},
    "app_api": {"janela_min": 30, "minimo_lotes": 10, "falha_pct": 20},
    "ia": {"janela_min": 60, "minimo": 5, "erro_pct": 30},
    "banco": {"limite_mb": 500, "alerta_pct": 80, "conexoes_pct": 80},
    "rotinas": {"janela_min": 60, "falhas": 3},
    "slo": {"api": 99.5, "console": 99.5, "web_aluno": 99.5},
    "slo_janela_dias": 28,
    "slo_24x7": 99,
    "aula": {"dias": [1, 2, 3, 4, 5], "inicio": "07:00", "fim": "22:00", "sem_aula": []},
    "emails_por_dia": 10,
    "retencao_dias": 35,
    "painel_url": "https://trailup.vercel.app/console/tecnico",
}

TABELAS = """
CREATE TABLE IF NOT EXISTS public.monitor_alvo (
  id                text PRIMARY KEY CHECK (id ~ '^[a-z_]+$'),
  nome              text NOT NULL,
  url               text NOT NULL CHECK (url ~ '^https://'),
  corpo_esperado    text NULL,
  intervalo_min     integer NOT NULL DEFAULT 1 CHECK (intervalo_min BETWEEN 1 AND 60),
  intervalo_aula_min integer NOT NULL DEFAULT 1 CHECK (intervalo_aula_min BETWEEN 1 AND 60),
  timeout_ms        integer NOT NULL DEFAULT 10000 CHECK (timeout_ms BETWEEN 1000 AND 30000),
  ativo             boolean NOT NULL DEFAULT true,
  estado            text NOT NULL DEFAULT 'sem_dado' CHECK (estado IN ('ok', 'queda', 'sem_dado')),
  estado_desde      timestamptz NOT NULL DEFAULT now(),
  falhas_seguidas   integer NOT NULL DEFAULT 0,
  sucessos_seguidos integer NOT NULL DEFAULT 0,
  primeira_falha_em timestamptz NULL,
  primeiro_ok_em    timestamptz NULL,
  ultima_sonda_em   timestamptz NULL,
  ultima_versao     text NULL,
  versao_desde      timestamptz NULL
);

CREATE TABLE IF NOT EXISTS public.monitor_sonda (
  id          bigserial PRIMARY KEY,
  alvo_id     text NOT NULL REFERENCES public.monitor_alvo (id) ON DELETE CASCADE,
  pedido_id   bigint NOT NULL,
  enviada_em  timestamptz NOT NULL DEFAULT now(),
  em_aula     boolean NOT NULL DEFAULT false,
  colhida_em  timestamptz NULL,
  ok          boolean NULL,
  status      integer NULL,
  latencia_ms integer NULL,
  motivo      text NULL
);
CREATE INDEX IF NOT EXISTS monitor_sonda_alvo_em_idx ON public.monitor_sonda (alvo_id, enviada_em DESC);
CREATE INDEX IF NOT EXISTS monitor_sonda_a_colher_idx ON public.monitor_sonda (enviada_em) WHERE colhida_em IS NULL;

CREATE TABLE IF NOT EXISTS public.monitor_incidente (
  id       bigserial PRIMARY KEY,
  alvo_id  text NOT NULL,
  tipo     text NOT NULL CHECK (tipo IN ('queda', 'instabilidade', 'lentidao', 'degradacao')),
  inicio   timestamptz NOT NULL,
  fim      timestamptz NULL,
  motivo   text NULL,
  versao   text NULL,
  avisado  boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS monitor_incidente_um_aberto_idx
  ON public.monitor_incidente (alvo_id, tipo) WHERE fim IS NULL;
CREATE INDEX IF NOT EXISTS monitor_incidente_inicio_idx ON public.monitor_incidente (inicio DESC);

CREATE TABLE IF NOT EXISTS public.monitor_alerta (
  id                 bigserial PRIMARY KEY,
  chave              text NOT NULL UNIQUE,
  assunto            text NOT NULL,
  texto              text NOT NULL,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  pedido_id          bigint NULL,
  pedido_em          timestamptz NULL,
  tentativas         integer NOT NULL DEFAULT 0,
  proxima_tentativa  timestamptz NOT NULL DEFAULT now(),
  enviado_em         timestamptz NULL,
  erro               text NULL
);
CREATE INDEX IF NOT EXISTS monitor_alerta_pendente_idx ON public.monitor_alerta (id) WHERE enviado_em IS NULL;

ALTER TABLE public.monitor_alvo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitor_sonda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitor_incidente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitor_alerta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.monitor_alvo, public.monitor_sonda, public.monitor_incidente, public.monitor_alerta
  FROM PUBLIC, anon, authenticated;
"""

ALVOS = """
INSERT INTO public.monitor_alvo (id, nome, url, corpo_esperado, intervalo_min) VALUES
  ('api', 'API', 'https://api.trailup.promora.dev.br/health', '"status":"ok"', 1),
  ('console', 'Console do professor', 'https://trailup.vercel.app/version.json', 'build_commit', 5),
  ('web_aluno', 'Web do aluno', 'https://trailup.vercel.app/aluno/', 'id="root"', 5)
ON CONFLICT (id) DO NOTHING;
"""

PURAS = r"""
CREATE OR REPLACE FUNCTION public.fn_monitor_classificar(
  p_status integer, p_timed_out boolean, p_conteudo text, p_corpo_esperado text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $fn$
  -- NULL é sonda boa. O texto é o motivo da falha, sempre um rótulo fixo: nada do corpo da resposta sai daqui.
  SELECT CASE
    WHEN coalesce(p_timed_out, false) THEN 'timeout'
    WHEN p_status IS NULL THEN 'rede'
    WHEN p_status >= 500 THEN 'http_5xx'
    WHEN p_status >= 400 THEN 'http_4xx'
    WHEN p_status NOT BETWEEN 200 AND 299 THEN 'http_outro'
    WHEN p_corpo_esperado IS NOT NULL AND position(p_corpo_esperado IN coalesce(p_conteudo, '')) = 0 THEN 'corpo'
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_monitor_versao(p_conteudo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $fn$
  SELECT left((regexp_match(coalesce(p_conteudo, ''), '"build_commit"\s*:\s*"([0-9a-f]{7,40})"'))[1], 12);
$fn$;

CREATE OR REPLACE FUNCTION public.fn_monitor_duracao(p_de timestamptz, p_ate timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $fn$
  SELECT CASE
    WHEN extract(epoch FROM p_ate - p_de) < 3600 THEN greatest(round(extract(epoch FROM p_ate - p_de) / 60), 1)::integer::text || ' min'
    ELSE (floor(extract(epoch FROM p_ate - p_de) / 3600))::integer::text || ' h '
      || (round(extract(epoch FROM p_ate - p_de) / 60)::integer % 60)::text || ' min'
  END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_monitor_classificar(integer, boolean, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_versao(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_duracao(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
"""

NUCLEO = r"""
-- A config lida, por cima do padrão: chave ausente ou JSON inválido nunca para o monitor.
CREATE OR REPLACE FUNCTION public.fn_monitor_cfg()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_padrao constant jsonb := '__CONFIG__'::jsonb;
  v_lida jsonb;
BEGIN
  BEGIN
    SELECT c.valor::jsonb INTO v_lida FROM public.app_config c WHERE c.chave = 'monitor_config';
  EXCEPTION WHEN invalid_text_representation THEN
    v_lida := NULL;
  END;
  RETURN v_padrao || coalesce(v_lida, '{}'::jsonb);
END;
$fn$;

-- Se o dia é de aula: dia da semana certo e fora dos períodos `sem_aula`.
CREATE OR REPLACE FUNCTION public.fn_monitor_dia_de_aula(p_dia date, p_aula jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $fn$
  SELECT coalesce(p_aula -> 'dias', '[]'::jsonb) @> to_jsonb(extract(isodow FROM p_dia)::integer)
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(coalesce(p_aula -> 'sem_aula', '[]'::jsonb)) AS f
        WHERE p_dia BETWEEN (f ->> 'de')::date AND (f ->> 'ate')::date);
$fn$;

CREATE OR REPLACE FUNCTION public.fn_monitor_em_aula(p_em timestamptz, p_aula jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_local timestamp := p_em AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  RETURN public.fn_monitor_dia_de_aula(v_local::date, p_aula)
     AND v_local::time >= (p_aula ->> 'inicio')::time
     AND v_local::time < (p_aula ->> 'fim')::time;
EXCEPTION WHEN OTHERS THEN
  -- Janela mal escrita não para as sondas: elas seguem no intervalo de fora de aula.
  RAISE WARNING 'monitor: janela de aula invalida: %', SQLERRM;
  RETURN false;
END;
$fn$;

-- Minutos de aula entre dois instantes: é o denominador do orçamento.
CREATE OR REPLACE FUNCTION public.fn_monitor_minutos_aula(p_de timestamptz, p_ate timestamptz, p_aula jsonb)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_de timestamp := p_de AT TIME ZONE 'America/Sao_Paulo';
  v_ate timestamp := p_ate AT TIME ZONE 'America/Sao_Paulo';
  v_dia date;
  v_a timestamp;
  v_b timestamp;
  v_total numeric := 0;
BEGIN
  FOR v_dia IN SELECT d::date FROM generate_series(v_de::date, v_ate::date, interval '1 day') AS d LOOP
    CONTINUE WHEN NOT public.fn_monitor_dia_de_aula(v_dia, p_aula);
    v_a := greatest(v_dia + (p_aula ->> 'inicio')::time, v_de);
    v_b := least(v_dia + (p_aula ->> 'fim')::time, v_ate);
    IF v_b > v_a THEN
      v_total := v_total + extract(epoch FROM v_b - v_a) / 60;
    END IF;
  END LOOP;
  RETURN round(v_total);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'monitor: janela de aula invalida: %', SQLERRM;
  RETURN 0;
END;
$fn$;

-- Entra na fila de e-mail e no sino do dono. A mesma chave não entra duas vezes.
CREATE OR REPLACE FUNCTION public.fn_monitor_alertar(p_chave text, p_assunto text, p_texto text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_novo bigint;
  v_email text;
  v_dono uuid;
  v_url text := public.fn_monitor_cfg() ->> 'painel_url';
BEGIN
  INSERT INTO public.monitor_alerta (chave, assunto, texto)
  VALUES (p_chave, left(p_assunto, 200),
          left(p_texto, 4000) || E'\n\nPainel técnico: ' || coalesce(v_url, ''))
  ON CONFLICT (chave) DO NOTHING
  RETURNING id INTO v_novo;
  IF v_novo IS NULL THEN
    RETURN;
  END IF;

  -- O sino é o segundo caminho: se o Apps Script estiver fora, o aviso ainda aparece no console.
  BEGIN
    SELECT lower(btrim(c.valor)) INTO v_email FROM public.app_config c WHERE c.chave = 'dono_email';
    SELECT p.id INTO v_dono
      FROM public.professor p JOIN auth.users u ON u.id = p.id
     WHERE lower(u.email) = v_email LIMIT 1;
    IF v_dono IS NOT NULL THEN
      PERFORM public.fn_professor_notificar(
        v_dono, NULL, 'gatilho_tecnico', left(p_assunto, 160), left(p_texto, 500), 'tecnico', 'mon:' || p_chave);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'monitor: sino falhou: %', SQLERRM;
  END;
END;
$fn$;

-- Abre o incidente se não houver um aberto. `p_silencioso` grava sem avisar.
CREATE OR REPLACE FUNCTION public.fn_monitor_abrir(
  p_alvo text, p_tipo text, p_inicio timestamptz, p_motivo text,
  p_assunto text, p_texto text, p_silencioso boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.monitor_incidente (alvo_id, tipo, inicio, motivo, versao, avisado)
  VALUES (p_alvo, p_tipo, p_inicio, left(p_motivo, 200),
          (SELECT a.ultima_versao FROM public.monitor_alvo a WHERE a.id = p_alvo), NOT p_silencioso)
  ON CONFLICT (alvo_id, tipo) WHERE fim IS NULL DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL AND NOT p_silencioso THEN
    PERFORM public.fn_monitor_alertar('inc:' || v_id || '-abriu', p_assunto, p_texto);
  END IF;
  RETURN v_id;
END;
$fn$;

-- Fecha o incidente aberto. Só avisa da volta quem avisou da ida.
CREATE OR REPLACE FUNCTION public.fn_monitor_fechar(
  p_alvo text, p_tipo text, p_fim timestamptz, p_assunto text, p_texto text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id bigint;
  v_inicio timestamptz;
  v_avisado boolean;
BEGIN
  UPDATE public.monitor_incidente i
     SET fim = greatest(p_fim, i.inicio)
   WHERE i.alvo_id = p_alvo AND i.tipo = p_tipo AND i.fim IS NULL
  RETURNING i.id, i.inicio, i.avisado INTO v_id, v_inicio, v_avisado;
  IF v_id IS NOT NULL AND v_avisado THEN
    PERFORM public.fn_monitor_alertar(
      'inc:' || v_id || '-fechou', p_assunto,
      p_texto || E'\nDuração: ' || public.fn_monitor_duracao(v_inicio, greatest(p_fim, v_inicio)) || '.');
  END IF;
  RETURN v_id;
END;
$fn$;

-- Um resultado de sonda na máquina de estados do alvo. Chamada em ordem cronológica.
CREATE OR REPLACE FUNCTION public.fn_monitor_aplicar(
  p_alvo text, p_em timestamptz, p_motivo text, p_versao text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cfg jsonb := public.fn_monitor_cfg();
  v_falhas integer := greatest(coalesce((v_cfg #>> '{queda,falhas}')::integer, 3), 1);
  v_sucessos integer := greatest(coalesce((v_cfg #>> '{queda,sucessos}')::integer, 2), 1);
  v_fuso constant text := 'America/Sao_Paulo';
  v_a public.monitor_alvo%ROWTYPE;
  v_instavel boolean;
BEGIN
  SELECT * INTO v_a FROM public.monitor_alvo WHERE id = p_alvo FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_versao IS NOT NULL AND p_versao IS DISTINCT FROM v_a.ultima_versao THEN
    v_a.ultima_versao := p_versao;
    v_a.versao_desde := p_em;
  END IF;

  IF p_motivo IS NULL THEN
    v_a.sucessos_seguidos := v_a.sucessos_seguidos + 1;
    v_a.falhas_seguidas := 0;
    v_a.primeira_falha_em := NULL;
    v_a.primeiro_ok_em := coalesce(v_a.primeiro_ok_em, p_em);
    IF v_a.estado = 'sem_dado' THEN
      v_a.estado := 'ok';
      v_a.estado_desde := p_em;
    ELSIF v_a.estado = 'queda' AND v_a.sucessos_seguidos >= v_sucessos THEN
      v_a.estado := 'ok';
      v_a.estado_desde := v_a.primeiro_ok_em;
      PERFORM public.fn_monitor_fechar(
        v_a.id, 'queda', v_a.primeiro_ok_em,
        format('[TrailUp] %s voltou', v_a.nome),
        format('%s voltou a responder às %s (horário de Brasília).', v_a.nome,
               to_char(v_a.primeiro_ok_em AT TIME ZONE v_fuso, 'DD/MM HH24:MI')));
    END IF;
  ELSE
    v_a.falhas_seguidas := v_a.falhas_seguidas + 1;
    v_a.sucessos_seguidos := 0;
    v_a.primeiro_ok_em := NULL;
    v_a.primeira_falha_em := coalesce(v_a.primeira_falha_em, p_em);
    IF v_a.estado <> 'queda' AND v_a.falhas_seguidas >= v_falhas THEN
      v_a.estado := 'queda';
      v_a.estado_desde := v_a.primeira_falha_em;
      v_instavel := EXISTS (
        SELECT 1 FROM public.monitor_incidente i
         WHERE i.alvo_id = v_a.id AND i.tipo = 'instabilidade' AND i.fim IS NULL);
      PERFORM public.fn_monitor_abrir(
        v_a.id, 'queda', v_a.primeira_falha_em, p_motivo,
        format('[TrailUp] %s fora do ar', v_a.nome),
        format(E'%s não responde desde %s (horário de Brasília).\nMotivo da última sonda: %s.\n%s sondas seguidas falharam.',
               v_a.nome, to_char(v_a.primeira_falha_em AT TIME ZONE v_fuso, 'DD/MM HH24:MI'), p_motivo, v_a.falhas_seguidas),
        v_instavel);
    END IF;
  END IF;

  UPDATE public.monitor_alvo a
     SET estado = v_a.estado, estado_desde = v_a.estado_desde,
         falhas_seguidas = v_a.falhas_seguidas, sucessos_seguidos = v_a.sucessos_seguidos,
         primeira_falha_em = v_a.primeira_falha_em, primeiro_ok_em = v_a.primeiro_ok_em,
         ultima_versao = v_a.ultima_versao, versao_desde = v_a.versao_desde
   WHERE a.id = v_a.id;
END;
$fn$;

-- Lê as respostas guardadas pelo pg_net. Devolve quantas sondas colheu.
CREATE OR REPLACE FUNCTION public.fn_monitor_colher()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  r record;
  v_motivo text;
  v_n integer := 0;
BEGIN
  IF to_regclass('net._http_response') IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT s.id, s.alvo_id, s.enviada_em, a.corpo_esperado,
           h.status_code, h.timed_out, h.content, h.created
      FROM public.monitor_sonda s
      JOIN public.monitor_alvo a ON a.id = s.alvo_id
      JOIN net._http_response h ON h.id = s.pedido_id
     WHERE s.colhida_em IS NULL
     ORDER BY s.enviada_em, s.id
  LOOP
    v_motivo := public.fn_monitor_classificar(r.status_code, r.timed_out, r.content, r.corpo_esperado);
    UPDATE public.monitor_sonda s
       SET colhida_em = now(), ok = (v_motivo IS NULL), status = r.status_code, motivo = v_motivo,
           latencia_ms = greatest(round(extract(epoch FROM r.created - r.enviada_em) * 1000), 0)::integer
     WHERE s.id = r.id;
    PERFORM public.fn_monitor_aplicar(r.alvo_id, r.enviada_em, v_motivo, public.fn_monitor_versao(r.content));
    v_n := v_n + 1;
  END LOOP;

  -- Quem não respondeu foi o medidor: fica sem resultado, e a máquina de estados não anda.
  UPDATE public.monitor_sonda s
     SET colhida_em = now(), motivo = 'sem_resposta'
   WHERE s.colhida_em IS NULL AND s.enviada_em < now() - interval '3 minutes';
  RETURN v_n;
END;
$fn$;

-- Liga ou desliga um incidente por um sinal: TRUE abre, FALSE fecha, NULL (sem dado) não mexe.
CREATE OR REPLACE FUNCTION public.fn_monitor_sinal(
  p_alvo text, p_tipo text, p_ruim boolean, p_motivo text, p_assunto text, p_texto text, p_assunto_volta text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_ruim IS NULL THEN
    RETURN;
  ELSIF p_ruim THEN
    PERFORM public.fn_monitor_abrir(p_alvo, p_tipo, now(), p_motivo, p_assunto, p_texto);
  ELSE
    PERFORM public.fn_monitor_fechar(p_alvo, p_tipo, now(), p_assunto_volta, 'O sinal voltou ao normal.');
  END IF;
END;
$fn$;

-- Instabilidade e lentidão, por alvo.
CREATE OR REPLACE FUNCTION public.fn_monitor_varrer_alvos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cfg jsonb := public.fn_monitor_cfg();
  v_ins jsonb := v_cfg -> 'instabilidade';
  v_len jsonb := v_cfg -> 'lentidao';
  v_jan integer := coalesce((v_ins ->> 'janela_min')::integer, 60);
  v_a public.monitor_alvo%ROWTYPE;
  v_total integer;
  v_falhas integer;
  v_recentes integer;
  v_quedas integer;
  v_ruim boolean;
  v_lentas integer;
  v_medidas integer;
BEGIN
  FOR v_a IN SELECT * FROM public.monitor_alvo a WHERE a.ativo LOOP
    SELECT count(*) FILTER (WHERE s.ok IS NOT NULL), count(*) FILTER (WHERE s.ok IS FALSE),
           count(*) FILTER (WHERE s.ok IS FALSE AND s.enviada_em >= now() - make_interval(mins => v_jan / 2))
      INTO v_total, v_falhas, v_recentes
      FROM public.monitor_sonda s
     WHERE s.alvo_id = v_a.id AND s.enviada_em >= now() - make_interval(mins => v_jan);
    SELECT count(*) INTO v_quedas
      FROM public.monitor_incidente i
     WHERE i.alvo_id = v_a.id AND i.tipo = 'queda' AND i.inicio >= now() - interval '6 hours';

    v_ruim := v_quedas >= coalesce((v_ins ->> 'quedas_em_6h')::integer, 2)
      OR (v_falhas >= coalesce((v_ins ->> 'falhas_min')::integer, 3)
          AND 100.0 * v_falhas / greatest(v_total, 1) >= coalesce((v_ins ->> 'falha_pct')::numeric, 5));

    IF v_ruim AND v_a.estado <> 'queda' THEN
      PERFORM public.fn_monitor_abrir(
        v_a.id, 'instabilidade', now(),
        format('%s de %s sondas ruins em %s min; %s quedas em 6 h', v_falhas, v_total, v_jan, v_quedas),
        format('[TrailUp] %s instável', v_a.nome),
        format(E'%s está instável: %s de %s sondas falharam nos últimos %s min, e houve %s quedas em 6 h.\nAs quedas deste alvo não mandam e-mail enquanto a instabilidade estiver aberta.',
               v_a.nome, v_falhas, v_total, v_jan, v_quedas));
    ELSIF NOT v_ruim AND v_recentes = 0 AND v_a.estado = 'ok' THEN
      PERFORM public.fn_monitor_fechar(
        v_a.id, 'instabilidade', now(), format('[TrailUp] %s estável de novo', v_a.nome),
        format('%s ficou %s min sem nenhuma sonda ruim.', v_a.nome, v_jan / 2));
    END IF;

    SELECT count(*) FILTER (WHERE s.latencia_ms IS NOT NULL AND s.ok),
           count(*) FILTER (WHERE s.ok AND s.latencia_ms > coalesce((v_len ->> 'limite_ms')::integer, 3000))
      INTO v_medidas, v_lentas
      FROM public.monitor_sonda s
     WHERE s.alvo_id = v_a.id
       AND s.enviada_em >= now() - make_interval(mins => coalesce((v_len ->> 'janela_min')::integer, 15));
    PERFORM public.fn_monitor_sinal(
      v_a.id, 'lentidao',
      CASE WHEN v_medidas < coalesce((v_len ->> 'minimo')::integer, 10) THEN NULL
           ELSE 100.0 * v_lentas / v_medidas >= coalesce((v_len ->> 'fracao_pct')::numeric, 50) END,
      format('%s de %s sondas acima de %s ms', v_lentas, v_medidas, v_len ->> 'limite_ms'),
      format('[TrailUp] %s lenta', v_a.nome),
      format('%s de %s sondas de %s passaram de %s ms. A medida vem do banco e inclui a espera do pg_net: compare com a tendência do painel.',
             v_lentas, v_medidas, v_a.nome, v_len ->> 'limite_ms'),
      format('[TrailUp] %s voltou ao tempo normal', v_a.nome));
  END LOOP;
END;
$fn$;

-- O que o banco já sabe sem sonda. `p_lentos` liga as leituras que varrem mais (a cada 10 min).
CREATE OR REPLACE FUNCTION public.fn_monitor_varrer_sinais(p_lentos boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cfg jsonb := public.fn_monitor_cfg();
  v_app jsonb := v_cfg -> 'app_api';
  v_ia jsonb := v_cfg -> 'ia';
  v_banco jsonb := v_cfg -> 'banco';
  v_rot jsonb := v_cfg -> 'rotinas';
  v_total integer;
  v_ruins integer;
  v_mb numeric;
  v_limite numeric;
  v_con integer;
  v_max integer;
BEGIN
  -- O app dizendo que não alcançou a API. `sem_url`, `sem_sessao` e 4xx não são indisponibilidade dela.
  SELECT count(*), count(*) FILTER (WHERE l.via = 'direta' AND l.fallback_motivo IN ('rede', 'timeout', 'http_5xx'))
    INTO v_total, v_ruins
    FROM public.telemetria_lotes l
   WHERE l.created_at >= now() - make_interval(mins => coalesce((v_app ->> 'janela_min')::integer, 30));
  PERFORM public.fn_monitor_sinal(
    'app_api', 'degradacao',
    CASE WHEN v_total < coalesce((v_app ->> 'minimo_lotes')::integer, 10) THEN NULL
         ELSE 100.0 * v_ruins / v_total >= coalesce((v_app ->> 'falha_pct')::numeric, 20) END,
    format('%s de %s lotes sem alcançar a API', v_ruins, v_total),
    '[TrailUp] O app não está alcançando a API',
    format('%s de %s lotes de telemetria caíram no caminho direto por rede, timeout ou 5xx. É o que os aparelhos veem, mesmo que a sonda esteja boa.', v_ruins, v_total),
    '[TrailUp] O app voltou a alcançar a API');

  -- Erro do modelo: inclui cota esgotada, que aparece aqui antes de virar reclamação.
  SELECT count(*), count(*) FILTER (WHERE u.fim LIKE 'erro:%')
    INTO v_total, v_ruins
    FROM public.ia_uso_llm u
   WHERE u.criado_em >= now() - make_interval(mins => coalesce((v_ia ->> 'janela_min')::integer, 60));
  PERFORM public.fn_monitor_sinal(
    'ia', 'degradacao',
    CASE WHEN v_total < coalesce((v_ia ->> 'minimo')::integer, 5) THEN NULL
         ELSE 100.0 * v_ruins / v_total >= coalesce((v_ia ->> 'erro_pct')::numeric, 30) END,
    format('%s de %s chamadas com erro', v_ruins, v_total),
    '[TrailUp] Erros nas chamadas ao modelo',
    format('%s de %s chamadas ao modelo terminaram em erro na última hora. Pode ser cota do tier free.', v_ruins, v_total),
    '[TrailUp] As chamadas ao modelo voltaram ao normal');

  IF NOT p_lentos THEN
    RETURN;
  END IF;

  v_mb := pg_database_size(current_database()) / 1048576.0;
  v_limite := coalesce((v_banco ->> 'limite_mb')::numeric, 500);
  PERFORM public.fn_monitor_sinal(
    'banco_espaco', 'degradacao',
    100.0 * v_mb / v_limite >= coalesce((v_banco ->> 'alerta_pct')::numeric, 80),
    format('%s MB de %s MB', round(v_mb), v_limite),
    '[TrailUp] Banco perto do limite de espaço',
    format('O banco usa %s MB de %s MB. Passar da cota do plano Free pode restringir o projeto (Fair Use, HTTP 402).', round(v_mb), v_limite),
    '[TrailUp] Espaço do banco normalizado');

  SELECT count(*)::integer INTO v_con FROM pg_stat_activity WHERE datname = current_database();
  v_max := current_setting('max_connections')::integer;
  PERFORM public.fn_monitor_sinal(
    'banco_conexoes', 'degradacao',
    100.0 * v_con / v_max >= coalesce((v_banco ->> 'conexoes_pct')::numeric, 80),
    format('%s de %s conexões', v_con, v_max),
    '[TrailUp] Conexões do banco perto do limite',
    format('%s de %s conexões em uso.', v_con, v_max),
    '[TrailUp] Conexões do banco normalizadas');

  IF to_regclass('cron.job_run_details') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*)::integer FROM cron.job_run_details d
       WHERE d.status = 'failed' AND d.start_time >= now() - make_interval(mins => $1)
    $q$ INTO v_ruins USING coalesce((v_rot ->> 'janela_min')::integer, 60);
    PERFORM public.fn_monitor_sinal(
      'rotinas', 'degradacao',
      v_ruins >= coalesce((v_rot ->> 'falhas')::integer, 3),
      format('%s execuções com falha', v_ruins),
      '[TrailUp] Rotinas do banco falhando',
      format('%s execuções do pg_cron falharam na última hora. Notificações, eventos e retenção dependem delas.', v_ruins),
      '[TrailUp] Rotinas do banco voltaram ao normal');
  END IF;
END;
$fn$;

-- Sonda do minuto. Devolve quantas disparou.
CREATE OR REPLACE FUNCTION public.fn_monitor_disparar()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_a public.monitor_alvo%ROWTYPE;
  v_aula boolean := public.fn_monitor_em_aula(now(), public.fn_monitor_cfg() -> 'aula');
  v_pedido bigint;
  v_n integer := 0;
BEGIN
  IF to_regnamespace('net') IS NULL THEN
    RETURN 0;
  END IF;
  FOR v_a IN
    SELECT * FROM public.monitor_alvo a
     WHERE a.ativo
       -- Folga de 20 s: o cron não cai no segundo exato, e sem ela o alvo de 1 min pularia minutos.
       AND (a.ultima_sonda_em IS NULL
            OR a.ultima_sonda_em <= now() + interval '20 seconds'
               - make_interval(mins => CASE WHEN v_aula THEN a.intervalo_aula_min ELSE a.intervalo_min END))
  LOOP
    v_pedido := net.http_get(
      url := v_a.url,
      headers := jsonb_build_object('User-Agent', 'trailup-monitor/1.0'),
      timeout_milliseconds := v_a.timeout_ms);
    INSERT INTO public.monitor_sonda (alvo_id, pedido_id, em_aula) VALUES (v_a.id, v_pedido, v_aula);
    UPDATE public.monitor_alvo a SET ultima_sonda_em = now() WHERE a.id = v_a.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$fn$;

-- Confere os e-mails pedidos e pede os pendentes, dentro do teto do dia.
CREATE OR REPLACE FUNCTION public.fn_monitor_enviar_alertas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cfg jsonb := public.fn_monitor_cfg();
  v_teto integer := coalesce((v_cfg ->> 'emails_por_dia')::integer, 10);
  v_para text;
  v_usados integer;
  r public.monitor_alerta%ROWTYPE;
  v_pedido bigint;
  v_n integer := 0;
BEGIN
  IF to_regclass('net._http_response') IS NOT NULL THEN
    WITH resp AS (
      SELECT a.id, h.status_code, h.timed_out, h.error_msg, h.created,
             public.fn_email_apps_script_aceito(h.status_code, h.headers, h.content, h.timed_out) AS aceito
        FROM public.monitor_alerta a
        JOIN net._http_response h ON h.id = a.pedido_id
       WHERE a.pedido_id IS NOT NULL AND a.enviado_em IS NULL
    )
    UPDATE public.monitor_alerta a
       SET enviado_em = CASE WHEN resp.aceito THEN coalesce(resp.created, now()) END,
           erro = CASE WHEN resp.aceito THEN NULL
                       ELSE left(coalesce('HTTP ' || resp.status_code::text, '')
                                 || CASE WHEN resp.timed_out THEN ' timeout' ELSE '' END
                                 || coalesce(' ' || resp.error_msg, ''), 300) END,
           pedido_id = NULL,
           proxima_tentativa = now() + make_interval(mins => least(5 * (2 ^ greatest(a.tentativas - 1, 0))::integer, 240))
      FROM resp
     WHERE resp.id = a.id;
  END IF;

  UPDATE public.monitor_alerta a
     SET pedido_id = NULL, erro = 'sem resposta do pg_net', proxima_tentativa = now()
   WHERE a.pedido_id IS NOT NULL AND a.enviado_em IS NULL AND a.pedido_em < now() - interval '10 minutes';

  SELECT lower(btrim(coalesce(
           (SELECT c.valor FROM public.app_config c WHERE c.chave = 'monitor_email_destino'),
           (SELECT c.valor FROM public.app_config c WHERE c.chave = 'dono_email'))))
    INTO v_para;
  IF coalesce(v_para, '') = '' THEN
    RETURN 0;
  END IF;

  SELECT count(*)::integer INTO v_usados
    FROM public.monitor_alerta a
   WHERE a.pedido_em >= now() - interval '24 hours' AND (a.enviado_em IS NOT NULL OR a.pedido_id IS NOT NULL);

  FOR r IN
    SELECT * FROM public.monitor_alerta a
     WHERE a.enviado_em IS NULL AND a.pedido_id IS NULL AND a.tentativas < 6 AND a.proxima_tentativa <= now()
     ORDER BY a.id
     LIMIT greatest(least(5, v_teto - v_usados), 0)
  LOOP
    BEGIN
      v_pedido := public.fn_email_apps_script(v_para, r.assunto, r.texto);
      UPDATE public.monitor_alerta a
         SET pedido_id = v_pedido, pedido_em = now(), tentativas = a.tentativas + 1
       WHERE a.id = r.id;
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Sem Vault configurado ou pg_net fora: registra e tenta depois. O sino já foi avisado.
      UPDATE public.monitor_alerta a
         SET tentativas = a.tentativas + 1, erro = left(SQLERRM, 300),
             proxima_tentativa = now() + make_interval(mins => least(5 * (2 ^ a.tentativas)::integer, 240))
       WHERE a.id = r.id;
    END;
  END LOOP;
  RETURN v_n;
END;
$fn$;

-- Avisa um serviço de fora que o monitor está vivo. Sem `monitor_batida_url` no Vault, não faz nada.
CREATE OR REPLACE FUNCTION public.fn_monitor_bater()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault, pg_temp
AS $fn$
DECLARE
  v_url text;
BEGIN
  IF to_regnamespace('net') IS NULL OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN;
  END IF;
  SELECT btrim(s.decrypted_secret) INTO v_url FROM vault.decrypted_secrets s WHERE s.name = 'monitor_batida_url';
  IF coalesce(v_url, '') <> '' THEN
    PERFORM net.http_get(url := v_url, timeout_milliseconds := 10000);
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_monitor_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_minuto integer := extract(minute FROM now())::integer;
  v_colhidas integer := 0;
  v_disparadas integer := 0;
  v_emails integer := 0;
BEGIN
  -- Um tick demorado não pode correr junto com o seguinte: as sondas seriam aplicadas duas vezes.
  IF NOT pg_try_advisory_xact_lock(hashtext('fn_monitor_tick')) THEN
    RETURN jsonb_build_object('pulado', 'outro tick em andamento');
  END IF;

  BEGIN
    v_colhidas := public.fn_monitor_colher();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'monitor: colher: %', SQLERRM;
  END;
  BEGIN
    PERFORM public.fn_monitor_varrer_alvos();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'monitor: alvos: %', SQLERRM;
  END;
  BEGIN
    PERFORM public.fn_monitor_varrer_sinais(v_minuto % 10 = 0);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'monitor: sinais: %', SQLERRM;
  END;
  BEGIN
    v_disparadas := public.fn_monitor_disparar();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'monitor: disparar: %', SQLERRM;
  END;
  BEGIN
    v_emails := public.fn_monitor_enviar_alertas();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'monitor: e-mail: %', SQLERRM;
  END;
  IF v_minuto % 5 = 0 THEN
    BEGIN
      PERFORM public.fn_monitor_bater();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'monitor: batida: %', SQLERRM;
    END;
  END IF;
  RETURN jsonb_build_object('colhidas', v_colhidas, 'disparadas', v_disparadas, 'emails', v_emails);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_monitor_expurgar()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_dias integer := greatest(coalesce((public.fn_monitor_cfg() ->> 'retencao_dias')::integer, 35), 31);
  v_n integer;
BEGIN
  DELETE FROM public.monitor_sonda s WHERE s.enviada_em < now() - make_interval(days => v_dias);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  DELETE FROM public.monitor_alerta a WHERE a.criado_em < now() - interval '180 days';
  RETURN v_n;
END;
$fn$;

-- O gatilho técnico que já ia para o sino também vai para o e-mail.
CREATE OR REPLACE FUNCTION public.fn_monitor_gatilho_para_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.tipo = 'gatilho_tecnico' AND NEW.dedupe_key LIKE 'tec:%' THEN
    PERFORM public.fn_monitor_alertar(NEW.dedupe_key, '[TrailUp] ' || NEW.titulo, coalesce(NEW.corpo, ''));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- O aviso nunca derruba quem grava no sino.
  RAISE WARNING 'monitor: gatilho para e-mail: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_monitor_gatilho_para_email ON public.professor_notificacoes;
CREATE TRIGGER trg_monitor_gatilho_para_email
  AFTER INSERT ON public.professor_notificacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_monitor_gatilho_para_email();

REVOKE ALL ON FUNCTION public.fn_monitor_cfg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_dia_de_aula(date, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_em_aula(timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_minutos_aula(timestamptz, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_alertar(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_abrir(text, text, timestamptz, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_fechar(text, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_aplicar(text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_colher() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_sinal(text, text, boolean, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_varrer_alvos() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_varrer_sinais(boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_disparar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_enviar_alertas() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_bater() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_tick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_expurgar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_monitor_gatilho_para_email() FROM PUBLIC, anon, authenticated;
"""

CONFIG_SEED = """
INSERT INTO public.app_config (chave, valor, publico)
VALUES ('monitor_config', '__CONFIG__', false)
ON CONFLICT (chave) DO NOTHING;
"""

AGENDAR = f"""
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(j.jobname) FROM cron.job j WHERE j.jobname IN ('{JOB_TICK}', '{JOB_EXPURGO}');
    PERFORM cron.schedule('{JOB_TICK}', '* * * * *', 'SELECT public.fn_monitor_tick()');
    PERFORM cron.schedule('{JOB_EXPURGO}', '17 6 * * *', 'SELECT public.fn_monitor_expurgar()');
  END IF;
END
$cron$;
"""

DESAGENDAR = f"""
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(j.jobname) FROM cron.job j WHERE j.jobname IN ('{JOB_TICK}', '{JOB_EXPURGO}');
  END IF;
END
$cron$;
"""

FUNCOES = [
    "fn_monitor_gatilho_para_email()",
    "fn_monitor_expurgar()",
    "fn_monitor_tick()",
    "fn_monitor_bater()",
    "fn_monitor_enviar_alertas()",
    "fn_monitor_disparar()",
    "fn_monitor_varrer_sinais(boolean)",
    "fn_monitor_varrer_alvos()",
    "fn_monitor_sinal(text, text, boolean, text, text, text, text)",
    "fn_monitor_colher()",
    "fn_monitor_aplicar(text, timestamptz, text, text)",
    "fn_monitor_fechar(text, text, timestamptz, text, text)",
    "fn_monitor_abrir(text, text, timestamptz, text, text, text, boolean)",
    "fn_monitor_alertar(text, text, text)",
    "fn_monitor_minutos_aula(timestamptz, timestamptz, jsonb)",
    "fn_monitor_em_aula(timestamptz, jsonb)",
    "fn_monitor_dia_de_aula(date, jsonb)",
    "fn_monitor_cfg()",
    "fn_monitor_duracao(timestamptz, timestamptz)",
    "fn_monitor_versao(text)",
    "fn_monitor_classificar(integer, boolean, text, text)",
]


def _config() -> str:
    return json.dumps(CONFIG_PADRAO, ensure_ascii=False)


def upgrade() -> None:
    op.execute(TABELAS)
    op.execute(ALVOS)
    op.execute(CONFIG_SEED.replace("__CONFIG__", _config()))
    op.execute(PURAS)
    op.execute(NUCLEO.replace("__CONFIG__", _config()))
    op.execute(AGENDAR)


def downgrade() -> None:
    op.execute(DESAGENDAR)
    op.execute("DROP TRIGGER IF EXISTS trg_monitor_gatilho_para_email ON public.professor_notificacoes")
    for funcao in FUNCOES:
        op.execute(f"DROP FUNCTION IF EXISTS public.{funcao}")
    op.execute("DELETE FROM public.app_config WHERE chave = 'monitor_config'")
    op.execute(
        "DROP TABLE IF EXISTS public.monitor_alerta, public.monitor_incidente, public.monitor_sonda, public.monitor_alvo"
    )
