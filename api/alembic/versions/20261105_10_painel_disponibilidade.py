"""Painel de disponibilidade e acessos: o que o monitor mediu, para o dono ler

Lê o que a `20261105_09` grava e o que o banco já tinha, sem passar pela API, que é uma das coisas
observadas. Duas RPCs, ambas conferem `app_e_dono()` antes de qualquer leitura (42501 para quem não é):

- `painel_disponibilidade(p_horas)`: alvos, incidentes, o que os aparelhos relatam, uso do modelo, banco,
  alertas e acessos **agregados**. Nenhum `aluno_id`, nenhum texto de erro de cliente.
- `painel_acessos_alunos(p_dias, p_revelar)`: a lista por aluno.

## A lista por aluno, e por que o nome vem fechado

Pseudônimo continua sendo dado pessoal e não protege contra quem administra o banco, então o código
curto aqui é só minimização de tela: quem olha a lista para achar problema técnico não precisa ver nomes.
Ver o nome é um pedido explícito (`p_revelar`) e fica registrado em `monitor_consulta` (quem, quando,
quantos dias). A lista tem só acesso: nada de emoção, perfil BrainHex, nota ou progresso. A janela vai até 90
dias. Base da decisão: `docs/analises/2026-11-05-metricas-e-metas-de-desempenho.md`.

## O que é um acesso

`aluno_sessoes_app` grava uma linha por entrada no app, inclusive reabertura. Duas linhas do mesmo aluno a
menos de 30 min uma da outra são um acesso só (a convenção de sessão do GA4). A unidade principal é **dia com
acesso**: login mede autenticação, não uso.

## Sem dado é sem dado

Alvo sem sonda recente volta `sem_dado` mesmo que o último estado fosse `ok`: é o medidor que parou.
`disponibilidade_pct` é NULL quando não há sonda colhida. A meta vale em horário de aula, nos últimos
`slo_janela_dias`, e o orçamento sai dos minutos de aula desde a primeira sonda (`fn_monitor_minutos_aula`):
`cobertura_aula_pct` diz quanto deles foi medido. Sem nenhuma sonda em aula, a disponibilidade de aula é NULL,
nunca 100%. O 24x7 de 30 dias segue como informativo.
O painel mostra contagem com denominador; com poucos alunos, percentual sozinho engana.

`monitor_consulta` nasce com RLS e sem policy, de propósito: só a RPC escreve e nenhum cliente lê.

Revision ID: 20261105_10
Revises: 20261105_09
Create Date: 2026-11-05
"""

from __future__ import annotations

from alembic import op

revision = "20261105_10"
down_revision = "20261105_09"
branch_labels = None
depends_on = None

TABELA = """
CREATE TABLE IF NOT EXISTS public.monitor_consulta (
  id        bigserial PRIMARY KEY,
  por       uuid NULL,
  em        timestamptz NOT NULL DEFAULT now(),
  dias      integer NOT NULL,
  alunos    integer NOT NULL
);
ALTER TABLE public.monitor_consulta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.monitor_consulta FROM PUBLIC, anon, authenticated;
"""

PAINEL = r"""
CREATE OR REPLACE FUNCTION public.painel_disponibilidade(p_horas integer DEFAULT 168)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_fuso constant text := 'America/Sao_Paulo';
  v_fim timestamptz := now();
  v_inicio timestamptz;
  v_mes timestamptz := now() - interval '30 days';
  v_slo_inicio timestamptz;
  v_hoje date := (now() AT TIME ZONE v_fuso)::date;
  v_cfg jsonb;
  v_alvos jsonb;
  v_incidentes jsonb;
  v_abertos jsonb;
  v_cliente jsonb;
  v_ia jsonb;
  v_banco jsonb;
  v_alertas jsonb;
  v_acessos jsonb;
  v_rotinas integer;
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto acessa o painel de disponibilidade.' USING ERRCODE = '42501';
  END IF;
  IF p_horas IS NULL OR p_horas < 1 OR p_horas > 720 THEN
    RAISE EXCEPTION 'A janela vai de 1 a 720 horas.' USING ERRCODE = '22023';
  END IF;
  v_inicio := v_fim - make_interval(hours => p_horas);
  v_cfg := public.fn_monitor_cfg();
  v_slo_inicio := v_fim - make_interval(days => coalesce((v_cfg ->> 'slo_janela_dias')::integer, 28));

  -- ---------------------------------------------------------------- alvos
  WITH base AS (
    SELECT a.*, (v_cfg -> 'slo' ->> a.id)::numeric AS slo,
           (SELECT min(s.enviada_em) FROM public.monitor_sonda s WHERE s.alvo_id = a.id) AS primeira
      FROM public.monitor_alvo a
     WHERE a.ativo
  ),
  janela AS (
    SELECT s.alvo_id,
           count(*) FILTER (WHERE s.ok IS NOT NULL) AS medidas,
           count(*) FILTER (WHERE s.ok) AS boas,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY s.latencia_ms) FILTER (WHERE s.ok) AS p50,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY s.latencia_ms) FILTER (WHERE s.ok) AS p95
      FROM public.monitor_sonda s
     WHERE s.enviada_em >= v_inicio
     GROUP BY s.alvo_id
  ),
  mes AS (
    SELECT s.alvo_id,
           count(*) FILTER (WHERE s.ok IS NOT NULL) AS medidas,
           count(*) FILTER (WHERE s.ok) AS boas
      FROM public.monitor_sonda s
     WHERE s.enviada_em >= v_mes
     GROUP BY s.alvo_id
  ),
  aula AS (
    SELECT s.alvo_id,
           count(*) FILTER (WHERE s.ok IS NOT NULL) AS medidas,
           count(*) FILTER (WHERE s.ok) AS boas
      FROM public.monitor_sonda s
     WHERE s.enviada_em >= v_slo_inicio AND s.em_aula
     GROUP BY s.alvo_id
  ),
  minutos AS (
    SELECT b.id,
           CASE WHEN b.primeira IS NOT NULL THEN
             public.fn_monitor_minutos_aula(greatest(b.primeira, v_slo_inicio), v_fim, v_cfg -> 'aula') END AS aula
      FROM base b
  ),
  dias AS (
    SELECT d.alvo_id,
           jsonb_agg(jsonb_build_object('dia', d.dia, 'medidas', d.medidas, 'boas', d.boas) ORDER BY d.dia) AS serie
      FROM (
        SELECT s.alvo_id, (s.enviada_em AT TIME ZONE v_fuso)::date AS dia,
               count(*) FILTER (WHERE s.ok IS NOT NULL) AS medidas,
               count(*) FILTER (WHERE s.ok) AS boas
          FROM public.monitor_sonda s
         WHERE s.enviada_em >= v_mes
         GROUP BY 1, 2
      ) d
     GROUP BY d.alvo_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id,
           'nome', b.nome,
           -- Sonda parada há mais de 5 intervalos: quem parou foi o medidor.
           'estado', CASE WHEN b.ultima_sonda_em IS NULL
                            OR b.ultima_sonda_em < v_fim - make_interval(mins => b.intervalo_min * 5)
                          THEN 'sem_dado' ELSE b.estado END,
           'estado_desde', b.estado_desde,
           'ultima_sonda_em', b.ultima_sonda_em,
           'intervalo_min', b.intervalo_min,
           'versao', b.ultima_versao,
           'versao_desde', b.versao_desde,
           'medidas', coalesce(j.medidas, 0),
           'boas', coalesce(j.boas, 0),
           'disponibilidade_pct', CASE WHEN j.medidas > 0 THEN round(100.0 * j.boas / j.medidas, 3) END,
           'latencia_p50_ms', round(j.p50::numeric),
           'latencia_p95_ms', round(j.p95::numeric),
           'slo_pct', b.slo,
           'medidas_aula', coalesce(au.medidas, 0),
           'disponibilidade_aula_pct', CASE WHEN au.medidas > 0 THEN round(100.0 * au.boas / au.medidas, 3) END,
           'minutos_aula', mi.aula,
           'cobertura_aula_pct', CASE WHEN mi.aula > 0 THEN least(round(
             100.0 * coalesce(au.medidas, 0) * b.intervalo_aula_min / mi.aula, 1), 100) END,
           'minutos_fora_aula', (coalesce(au.medidas, 0) - coalesce(au.boas, 0)) * b.intervalo_aula_min,
           'orcamento_aula_min', CASE WHEN b.slo IS NOT NULL AND mi.aula IS NOT NULL THEN round(mi.aula * (100 - b.slo) / 100) END,
           'medidas_30d', coalesce(m.medidas, 0),
           'disponibilidade_30d_pct', CASE WHEN m.medidas > 0 THEN round(100.0 * m.boas / m.medidas, 3) END,
           'serie_30d', coalesce(d.serie, '[]'::jsonb)
         ) ORDER BY b.intervalo_min, b.id), '[]'::jsonb)
    INTO v_alvos
    FROM base b
    LEFT JOIN janela j ON j.alvo_id = b.id
    LEFT JOIN mes m ON m.alvo_id = b.id
    LEFT JOIN aula au ON au.alvo_id = b.id
    LEFT JOIN minutos mi ON mi.id = b.id
    LEFT JOIN dias d ON d.alvo_id = b.id;

  -- ---------------------------------------------------------------- incidentes
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.inicio DESC), '[]'::jsonb)
    INTO v_incidentes
    FROM (
      SELECT x.id, x.alvo_id, x.tipo, x.inicio, x.fim, x.motivo, x.versao,
             round(extract(epoch FROM coalesce(x.fim, v_fim) - x.inicio) / 60) AS minutos
        FROM public.monitor_incidente x
       WHERE x.fim IS NULL OR x.fim >= v_inicio
       ORDER BY x.inicio DESC
       LIMIT 50
    ) i;

  SELECT jsonb_build_object(
           'abertos', count(*) FILTER (WHERE x.fim IS NULL),
           'quedas', count(*) FILTER (WHERE x.tipo = 'queda'),
           'instabilidades', count(*) FILTER (WHERE x.tipo = 'instabilidade'),
           'lentidoes', count(*) FILTER (WHERE x.tipo = 'lentidao'),
           'degradacoes', count(*) FILTER (WHERE x.tipo = 'degradacao'),
           -- Mediana, não média: com poucos incidentes, um só longo arrastaria a média.
           'mediana_queda_min', round((percentile_cont(0.5) WITHIN GROUP (
             ORDER BY extract(epoch FROM x.fim - x.inicio) / 60)
             FILTER (WHERE x.tipo = 'queda' AND x.fim IS NOT NULL))::numeric))
    INTO v_abertos
    FROM public.monitor_incidente x
   WHERE x.fim IS NULL OR x.fim >= v_inicio;

  -- ---------------------------------------------------------------- o que os aparelhos relatam
  WITH l AS (
    SELECT t.via, t.fallback_motivo,
           nullif(t.payload -> 'cliente' ->> 'app_version', '') AS versao,
           nullif(t.payload -> 'cliente' ->> 'plataforma', '') AS plataforma
      FROM public.telemetria_lotes t
     WHERE t.created_at >= v_inicio
  )
  SELECT jsonb_build_object(
           'lotes', (SELECT count(*) FROM l),
           'pela_api', (SELECT count(*) FROM l WHERE via = 'api'),
           'diretos', (SELECT count(*) FROM l WHERE via = 'direta'),
           'sem_alcancar_api', (SELECT count(*) FROM l WHERE via = 'direta' AND fallback_motivo IN ('rede', 'timeout', 'http_5xx')),
           'motivos', coalesce((
             SELECT jsonb_agg(jsonb_build_object('motivo', m.motivo, 'lotes', m.n) ORDER BY m.n DESC)
               FROM (SELECT coalesce(fallback_motivo, 'desconhecido') AS motivo, count(*) AS n
                       FROM l WHERE via = 'direta' GROUP BY 1) m), '[]'::jsonb),
           'versoes', coalesce((
             SELECT jsonb_agg(jsonb_build_object('versao', v.versao, 'plataforma', v.plataforma, 'lotes', v.n) ORDER BY v.n DESC)
               FROM (SELECT coalesce(versao, 'sem_dado') AS versao, coalesce(plataforma, 'sem_dado') AS plataforma, count(*) AS n
                       FROM l GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 12) v), '[]'::jsonb))
    INTO v_cliente;

  -- ---------------------------------------------------------------- modelo
  WITH u AS (
    SELECT * FROM public.ia_uso_llm x WHERE x.criado_em >= v_inicio
  )
  SELECT jsonb_build_object(
           'chamadas', (SELECT count(*) FROM u),
           'erros', (SELECT count(*) FROM u WHERE fim LIKE 'erro:%'),
           'latencia_p95_ms', (SELECT round((percentile_cont(0.95) WITHIN GROUP (ORDER BY latencia_ms))::numeric) FROM u),
           'tokens_entrada', (SELECT coalesce(sum(tokens_entrada), 0) FROM u),
           'tokens_saida', (SELECT coalesce(sum(tokens_saida), 0) FROM u),
           'por_prompt', coalesce((
             SELECT jsonb_agg(jsonb_build_object('prompt', p.prompt, 'chamadas', p.n, 'erros', p.e) ORDER BY p.n DESC)
               FROM (SELECT prompt, count(*) AS n, count(*) FILTER (WHERE fim LIKE 'erro:%') AS e
                       FROM u GROUP BY 1 ORDER BY 2 DESC LIMIT 10) p), '[]'::jsonb))
    INTO v_ia;

  -- ---------------------------------------------------------------- banco
  IF to_regclass('cron.job_run_details') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*)::integer FROM cron.job_run_details d
       WHERE d.status = 'failed' AND d.start_time >= now() - interval '24 hours'
    $q$ INTO v_rotinas;
  END IF;
  v_banco := jsonb_build_object(
    'tamanho_mb', round(pg_database_size(current_database()) / 1048576.0),
    'limite_mb', coalesce((v_cfg #>> '{banco,limite_mb}')::numeric, 500),
    'conexoes', (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()),
    'conexoes_max', current_setting('max_connections')::integer,
    'rotinas_com_falha_24h', v_rotinas);

  -- ---------------------------------------------------------------- alertas
  SELECT jsonb_build_object(
           'enviados_24h', (SELECT count(*) FROM public.monitor_alerta a WHERE a.enviado_em >= v_fim - interval '24 hours'),
           'pendentes', (SELECT count(*) FROM public.monitor_alerta a WHERE a.enviado_em IS NULL AND a.tentativas < 6),
           'desistidos', (SELECT count(*) FROM public.monitor_alerta a WHERE a.enviado_em IS NULL AND a.tentativas >= 6),
           'teto_dia', coalesce((v_cfg ->> 'emails_por_dia')::integer, 10),
           'ultimos', coalesce((
             SELECT jsonb_agg(to_jsonb(x) ORDER BY x.criado_em DESC)
               FROM (SELECT a.assunto, a.criado_em, a.enviado_em, a.tentativas, left(a.erro, 160) AS erro
                       FROM public.monitor_alerta a ORDER BY a.id DESC LIMIT 10) x), '[]'::jsonb))
    INTO v_alertas;

  -- ---------------------------------------------------------------- acessos, agregados
  WITH sessoes AS (
    SELECT s.aluno_id, s.plataforma, s.iniciada_em,
           s.iniciada_em - lag(coalesce(s.encerrada_em, s.iniciada_em))
             OVER (PARTITION BY s.aluno_id ORDER BY s.iniciada_em) AS intervalo
      FROM public.aluno_sessoes_app s
     WHERE s.iniciada_em >= v_mes
  ),
  acessos AS (
    SELECT * FROM sessoes WHERE intervalo IS NULL OR intervalo > interval '30 minutes'
  ),
  diaria AS (
    SELECT d.dia, count(DISTINCT d.aluno_id) AS alunos,
           round(sum(d.tempo_uso_seg) / 60.0) AS minutos
      FROM public.aluno_atividade_diaria d
     WHERE d.dia >= v_hoje - 29
     GROUP BY d.dia
  )
  SELECT jsonb_build_object(
           'matriculados', (SELECT count(DISTINCT ca.aluno_id) FROM public.classe_aluno ca),
           'ativos_hoje', (SELECT count(DISTINCT d.aluno_id) FROM public.aluno_atividade_diaria d WHERE d.dia = v_hoje),
           'ativos_7d', (SELECT count(DISTINCT d.aluno_id) FROM public.aluno_atividade_diaria d WHERE d.dia >= v_hoje - 6),
           'ativos_30d', (SELECT count(DISTINCT d.aluno_id) FROM public.aluno_atividade_diaria d WHERE d.dia >= v_hoje - 29),
           'acessos_7d', (SELECT count(*) FROM acessos WHERE iniciada_em >= v_fim - interval '7 days'),
           'acessos_30d', (SELECT count(*) FROM acessos),
           'por_plataforma', coalesce((
             SELECT jsonb_agg(jsonb_build_object('plataforma', p.plataforma, 'acessos', p.n) ORDER BY p.n DESC)
               FROM (SELECT plataforma, count(*) AS n FROM acessos GROUP BY 1) p), '[]'::jsonb),
           'serie_30d', coalesce((
             SELECT jsonb_agg(jsonb_build_object('dia', d.dia, 'alunos', d.alunos, 'minutos', d.minutos) ORDER BY d.dia)
               FROM diaria d), '[]'::jsonb))
    INTO v_acessos;

  RETURN jsonb_build_object(
    'gerado_em', v_fim,
    'janela_horas', p_horas,
    'aula', jsonb_build_object(
      'agora', public.fn_monitor_em_aula(v_fim, v_cfg -> 'aula'),
      'dias', v_cfg #> '{aula,dias}',
      'inicio', v_cfg #>> '{aula,inicio}',
      'fim', v_cfg #>> '{aula,fim}',
      'slo_janela_dias', coalesce((v_cfg ->> 'slo_janela_dias')::integer, 28),
      'slo_24x7_pct', (v_cfg ->> 'slo_24x7')::numeric),
    'alvos', v_alvos,
    'incidentes', v_incidentes,
    'resumo_incidentes', v_abertos,
    'cliente', v_cliente,
    'ia', v_ia,
    'banco', v_banco,
    'alertas', v_alertas,
    'acessos', v_acessos);
END;
$fn$;

REVOKE ALL ON FUNCTION public.painel_disponibilidade(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_disponibilidade(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.painel_acessos_alunos(p_dias integer DEFAULT 30, p_revelar boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_fuso constant text := 'America/Sao_Paulo';
  v_hoje date := (now() AT TIME ZONE v_fuso)::date;
  v_inicio timestamptz;
  v_lista jsonb;
  v_n integer;
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto acessa a lista de acessos.' USING ERRCODE = '42501';
  END IF;
  IF p_dias IS NULL OR p_dias < 1 OR p_dias > 90 THEN
    RAISE EXCEPTION 'A janela vai de 1 a 90 dias.' USING ERRCODE = '22023';
  END IF;
  v_inicio := now() - make_interval(days => p_dias);

  WITH matriculados AS (
    SELECT DISTINCT ca.aluno_id FROM public.classe_aluno ca
  ),
  sessoes AS (
    SELECT s.aluno_id, s.iniciada_em,
           s.iniciada_em - lag(coalesce(s.encerrada_em, s.iniciada_em))
             OVER (PARTITION BY s.aluno_id ORDER BY s.iniciada_em) AS intervalo
      FROM public.aluno_sessoes_app s
     WHERE s.iniciada_em >= v_inicio
  ),
  acessos AS (
    SELECT aluno_id, count(*) AS n FROM sessoes
     WHERE intervalo IS NULL OR intervalo > interval '30 minutes'
     GROUP BY aluno_id
  ),
  diaria AS (
    SELECT d.aluno_id, count(*) AS dias, round(sum(d.tempo_uso_seg) / 60.0) AS minutos,
           max(d.ultimo_acesso_em) AS ultimo
      FROM public.aluno_atividade_diaria d
     WHERE d.dia >= v_hoje - (p_dias - 1)
     GROUP BY d.aluno_id
  ),
  ultimo AS (
    SELECT d.aluno_id, max(d.ultimo_acesso_em) AS ultimo
      FROM public.aluno_atividade_diaria d GROUP BY d.aluno_id
  )
  SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'codigo', left(md5(m.aluno_id::text), 6),
           'nome', CASE WHEN p_revelar THEN a.nome END,
           'dias_com_acesso', coalesce(d.dias, 0),
           'acessos', coalesce(x.n, 0),
           'minutos', coalesce(d.minutos, 0)
         )) || jsonb_build_object('ultimo_acesso_em', u.ultimo)
         ORDER BY u.ultimo ASC NULLS FIRST, m.aluno_id), '[]'::jsonb),
         count(*)::integer
    INTO v_lista, v_n
    FROM matriculados m
    LEFT JOIN public.alunos a ON a.id = m.aluno_id
    LEFT JOIN acessos x ON x.aluno_id = m.aluno_id
    LEFT JOIN diaria d ON d.aluno_id = m.aluno_id
    LEFT JOIN ultimo u ON u.aluno_id = m.aluno_id;

  IF p_revelar THEN
    INSERT INTO public.monitor_consulta (por, dias, alunos) VALUES (auth.uid(), p_dias, v_n);
  END IF;

  RETURN jsonb_build_object('dias', p_dias, 'alunos', v_lista, 'revelado', p_revelar);
END;
$fn$;

REVOKE ALL ON FUNCTION public.painel_acessos_alunos(integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_acessos_alunos(integer, boolean) TO authenticated;
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(PAINEL)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.painel_acessos_alunos(integer, boolean)")
    op.execute("DROP FUNCTION IF EXISTS public.painel_disponibilidade(integer)")
    op.execute("DROP TABLE IF EXISTS public.monitor_consulta")
