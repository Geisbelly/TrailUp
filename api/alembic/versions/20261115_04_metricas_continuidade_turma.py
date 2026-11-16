"""Sessão de estudo por inatividade, funil de ativação e estados de retenção por turma

Três medidas que faltavam, levantadas na comparação com o mercado e a literatura
(`docs/analises/2026-11-15-metricas-de-uso-mercado-e-literatura.md`, P1 a P3). Só leitura de
tabelas que já existem: o coletor, o pipeline de análise e as views atuais não mudam.

## O que entra

- **`vw_metricas_sessoes_estudo`** (`security_invoker`): uma linha por **sessão de estudo** do aluno
  numa turma. Sessão de estudo é um período contínuo, cortado por 30 min sem lote de estudo (o corte
  do Firebase/GA4). Hoje "sessão" no console é `telemetria_sessoes`, uma por abertura de tela; essa
  continua existindo e continua sendo o denominador da I16.
- **`metricas_continuidade_turma(classe, inicio, fim, fuso)`**: RPC do professor dono, com quatro
  blocos:
  - `sessoes_estudo`: quantas, por aluno, duração e tempo ativo medianos, fração engajada;
  - `funil`: da matrícula ao primeiro acesso, primeiro tópico aberto, primeiro minuto ativo,
    primeira entrega e primeiro tópico concluído;
  - `semanas`: por semana completa do período, os alunos em cada estado (novo, atual, reativado,
    ressuscitado, em risco, dormente, nunca ativo) e as taxas de retorno e de reativação;
  - `retencao_por_semana_do_curso`: fração dos matriculados com estudo na semana `k` desde a
    matrícula, `k` de 1 a 8.
- Quatro chaves em `metricas_catalogo`.

## Definições que não são óbvias

- **Lote é o intervalo `[captured_at − Σ dwell_sec, captured_at]`.** Um lote pode ter mais de uma
  linha no escopo `topic` (tópicos diferentes, em sequência): elas são somadas antes de fundir.
- **A fusão compara com o maior `fim` já visto**, não com o lote anterior: lote fora de ordem ou
  sobreposto não abre sessão falsa.
- **A sessão é por turma.** Estudar duas turmas seguidas dá duas sessões, uma em cada.
- **Semana ativa de estudo:** semana (segunda a domingo, no fuso pedido) em que o aluno teve, na
  turma, lote com `active_sec > 0` no escopo `topic`, tentativa de atividade entregue
  (`atividade_tentativas.respondida_em`) ou primeira conclusão de tópico (`topico_aluno_conclusao`).
  Entrar no app sem estudar não conta. As duas últimas fontes não dependem do consentimento de
  telemetria.
- **O funil e a retenção por semana do curso olham a vida inteira da matrícula até o fim do
  período.** `p_inicio` não os restringe: a turma se matricula no começo, e um período recente
  deixaria o funil vazio. Só os blocos `sessoes_estudo` e `semanas` usam `p_inicio`.
- **Cada passo do funil é contado sozinho.** Quem recusou telemetria pode entregar atividade sem
  aparecer em "abriu tópico": isso fica visível em vez de sumir.
- **Denominador de "em 7 dias" e da retenção por semana do curso:** só quem já completou o prazo.
  Aluno matriculado ontem não entra como "não chegou em 7 dias".
- **`semanas` só traz semana completa**, contida no período e já encerrada: na semana corrente todo
  mundo que ainda não estudou pareceria "em risco".
- **`retorno`** é a conta de `retorno_semanal_pct` (`20261031_05`), agora por semana: dos ativos na
  semana anterior, quantos estão ativos nesta. Inclui os novos. `retorno_de_novos` separa só eles.

## Limites

- O instante dos lotes é o relógio do aparelho. Sessão de estudo não entra em nota nem em XP.
- Sem calendário escolar, recesso aparece como queda em todos os estados.
- Quem saiu da turma some da conta: a matrícula é apagada, não encerrada.
- `mediana_dias` de cada passo é só de quem chegou ao passo.
- A RPC devolve contagens da turma, nunca lista de alunos por estado.

Sem `%` no SQL (o SQL offline do Alembic o dobra).

## Downgrade

Derruba a RPC e a view e remove as quatro chaves do catálogo.

Revision ID: 20261115_04
Revises: 20261110_04
Create Date: 2026-11-15
"""

from alembic import op

revision = "20261115_04"
down_revision = "20261110_04"
branch_labels = None
depends_on = None

CORTE_SESSAO_MIN = 30
ENGAJADA_SEG = 10
ESTUDOU_SEG = 60
SEMANAS_DO_CURSO = 8

VIEW = rf"""
CREATE VIEW public.vw_metricas_sessoes_estudo WITH (security_invoker = on) AS
WITH lotes AS (
  -- Um intervalo por lote. Só o escopo `topic`: os outros contam o mesmo intervalo de novo.
  SELECT e.aluno_id,
         e.classe_id,
         e.lote_id,
         e.sessao_id,
         e.captured_at AS fim,
         e.captured_at - make_interval(secs => sum(e.dwell_sec)::double precision) AS inicio,
         sum(e.dwell_sec) AS presenca_seg,
         sum(e.active_sec) AS tempo_ativo_seg
    FROM public.telemetria_time_metric_entries e
   WHERE e.scope = 'topic' AND e.classe_id IS NOT NULL
   GROUP BY e.aluno_id, e.classe_id, e.lote_id, e.sessao_id, e.captured_at
), marcados AS (
  -- Abre sessão quando o lote começa mais de {CORTE_SESSAO_MIN} min depois do maior fim já visto.
  -- No primeiro lote a comparação é NULL e cai no ELSE.
  SELECT l.*,
         CASE WHEN l.inicio <= max(l.fim) OVER anteriores + interval '{CORTE_SESSAO_MIN} minutes' THEN 0 ELSE 1 END
           AS abre
    FROM lotes l
  WINDOW anteriores AS (PARTITION BY l.aluno_id, l.classe_id ORDER BY l.inicio, l.fim, l.lote_id
                        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
), numerados AS (
  SELECT m.*,
         sum(m.abre) OVER (PARTITION BY m.aluno_id, m.classe_id ORDER BY m.inicio, m.fim, m.lote_id) AS numero
    FROM marcados m
), topicos AS (
  SELECT n.aluno_id, n.classe_id, n.numero, count(DISTINCT e.topico_id) AS topicos
    FROM numerados n
    JOIN public.telemetria_time_metric_entries e
      ON e.lote_id = n.lote_id AND e.scope = 'topic' AND e.aluno_id = n.aluno_id AND e.classe_id = n.classe_id
   GROUP BY n.aluno_id, n.classe_id, n.numero
)
SELECT n.aluno_id,
       n.classe_id,
       n.numero::integer AS numero,
       (min(n.inicio) AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
       min(n.inicio) AS inicio,
       max(n.fim) AS fim,
       EXTRACT(epoch FROM max(n.fim) - min(n.inicio))::numeric AS duracao_seg,
       sum(n.presenca_seg)::numeric AS presenca_seg,
       sum(n.tempo_ativo_seg)::numeric AS tempo_ativo_seg,
       count(*) AS lotes,
       max(t.topicos) AS topicos,
       count(DISTINCT n.sessao_id) AS telas,
       sum(n.tempo_ativo_seg) >= {ENGAJADA_SEG} AS engajada
  FROM numerados n
  JOIN topicos t ON t.aluno_id = n.aluno_id AND t.classe_id = n.classe_id AND t.numero = n.numero
 GROUP BY n.aluno_id, n.classe_id, n.numero;

COMMENT ON VIEW public.vw_metricas_sessoes_estudo IS
  'Sessao de estudo do aluno numa turma: lotes do escopo topic fundidos por {CORTE_SESSAO_MIN} min de inatividade. Nao e telemetria_sessoes (uma por abertura de tela).';

REVOKE ALL ON public.vw_metricas_sessoes_estudo FROM anon;
GRANT SELECT ON public.vw_metricas_sessoes_estudo TO authenticated;
"""

RPC = rf"""
CREATE OR REPLACE FUNCTION public.metricas_continuidade_turma(
  p_classe_id bigint,
  p_inicio date,
  p_fim date,
  p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_inicio timestamptz;
  v_fim_exclusivo timestamptz;
  v_limite timestamptz;
  v_hoje date;
  v_primeira_semana date;
  v_ultimo_dia date;
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.app_classes_do_professor() AS minha(id)
     WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'turma_nao_encontrada_ou_sem_permissao'
      USING ERRCODE = '42501';
  END IF;

  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio THEN
    RAISE EXCEPTION 'periodo_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_fim - p_inicio > 366 THEN
    RAISE EXCEPTION 'periodo_excede_366_dias' USING ERRCODE = '22023';
  END IF;
  IF NOT public.trailup_fuso_valido(p_timezone) THEN
    RAISE EXCEPTION 'timezone_invalido' USING ERRCODE = '22023';
  END IF;

  v_inicio := p_inicio::timestamp AT TIME ZONE p_timezone;
  v_fim_exclusivo := (p_fim + 1)::timestamp AT TIME ZONE p_timezone;
  -- Nada depois de agora: período que avança no futuro não inventa prazo cumprido.
  v_limite := LEAST(v_fim_exclusivo, now());
  v_hoje := (now() AT TIME ZONE p_timezone)::date;
  -- Semanas completas contidas no período e já encerradas (segunda a domingo).
  v_primeira_semana := date_trunc('week', (p_inicio + 6)::timestamp)::date;
  v_ultimo_dia := LEAST(p_fim, v_hoje - 1);

  WITH
  matriculados AS (
    SELECT ca.aluno_id, min(ca.created_at) AS matriculado_em
      FROM public.classe_aluno ca
     WHERE ca.classe_id = p_classe_id
       AND ca.aluno_id IS NOT NULL
     GROUP BY ca.aluno_id
    HAVING min(ca.created_at) < v_limite
  ),
  -- ------------------------------------------------------------------ sessões de estudo
  sessoes AS (
    SELECT s.aluno_id, s.duracao_seg, s.tempo_ativo_seg, s.engajada
      FROM public.vw_metricas_sessoes_estudo s
      JOIN matriculados m ON m.aluno_id = s.aluno_id
     WHERE s.classe_id = p_classe_id
       AND s.inicio >= v_inicio
       AND s.inicio < v_fim_exclusivo
  ),
  sessoes_por_aluno AS (
    SELECT aluno_id, count(*)::numeric AS n
      FROM sessoes
     GROUP BY aluno_id
  ),
  bloco_sessoes AS (
    SELECT jsonb_build_object(
      'sessoes', (SELECT count(*) FROM sessoes),
      'alunos_com_sessao', (SELECT count(*) FROM sessoes_por_aluno),
      'sessoes_por_aluno', (
        SELECT jsonb_build_object(
                 'mediana', round(percentile_cont(0.5) WITHIN GROUP (ORDER BY n)::numeric, 2),
                 'p25', round(percentile_cont(0.25) WITHIN GROUP (ORDER BY n)::numeric, 2),
                 'p75', round(percentile_cont(0.75) WITHIN GROUP (ORDER BY n)::numeric, 2))
          FROM sessoes_por_aluno),
      'sessoes_por_aluno_semana_mediana', (
        SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY n))::numeric * 7 / (p_fim - p_inicio + 1), 2)
          FROM sessoes_por_aluno),
      'duracao_mediana_seg', (
        SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duracao_seg)::numeric, 1) FROM sessoes),
      'tempo_ativo_mediano_seg', (
        SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY tempo_ativo_seg)::numeric, 1) FROM sessoes),
      'engajadas', (SELECT count(*) FILTER (WHERE engajada) FROM sessoes),
      'engajadas_pct', (
        SELECT round(count(*) FILTER (WHERE engajada)::numeric * 100 / NULLIF(count(*), 0), 2) FROM sessoes)
    ) AS j
  ),
  -- ------------------------------------------------------------------ fatos de estudo
  tempo AS (
    SELECT e.id, e.aluno_id, e.captured_at, e.active_sec
      FROM public.telemetria_time_metric_entries e
      JOIN matriculados m ON m.aluno_id = e.aluno_id
     WHERE e.classe_id = p_classe_id
       AND e.scope = 'topic'
       AND e.captured_at < v_limite
  ),
  entregas AS (
    SELECT t.aluno_id, t.respondida_em AS quando
      FROM public.atividade_tentativas t
      JOIN matriculados m ON m.aluno_id = t.aluno_id
     WHERE t.classe_id = p_classe_id
       AND t.respondida_em IS NOT NULL
       AND t.respondida_em < v_limite
  ),
  conclusoes AS (
    SELECT c.aluno_id, c.concluido_em AS quando
      FROM public.topico_aluno_conclusao c
      JOIN matriculados m ON m.aluno_id = c.aluno_id
     WHERE c.classe_id = p_classe_id
       AND c.concluido_em < v_limite
  ),
  fatos AS (
    SELECT aluno_id, captured_at AS quando FROM tempo WHERE active_sec > 0
    UNION ALL
    SELECT aluno_id, quando FROM entregas
    UNION ALL
    SELECT aluno_id, quando FROM conclusoes
  ),
  semanas_ativas AS (
    SELECT DISTINCT f.aluno_id, date_trunc('week', f.quando AT TIME ZONE p_timezone)::date AS semana
      FROM fatos f
  ),
  -- ------------------------------------------------------------------ funil de ativação
  tempo_acumulado AS (
    SELECT t.aluno_id, t.captured_at,
           sum(t.active_sec) OVER (PARTITION BY t.aluno_id ORDER BY t.captured_at, t.id) AS acumulado
      FROM tempo t
  ),
  marcos AS (
    SELECT m.aluno_id,
           m.matriculado_em,
           (SELECT min(s.iniciada_em) FROM public.aluno_sessoes_app s
             WHERE s.aluno_id = m.aluno_id AND s.iniciada_em >= m.matriculado_em AND s.iniciada_em < v_limite) AS entrou,
           (SELECT min(t.captured_at) FROM tempo t WHERE t.aluno_id = m.aluno_id) AS abriu,
           (SELECT min(a.captured_at) FROM tempo_acumulado a
             WHERE a.aluno_id = m.aluno_id AND a.acumulado >= {ESTUDOU_SEG}) AS estudou,
           (SELECT min(e.quando) FROM entregas e WHERE e.aluno_id = m.aluno_id) AS entregou,
           (SELECT min(c.quando) FROM conclusoes c WHERE c.aluno_id = m.aluno_id) AS concluiu
      FROM matriculados m
  ),
  passos AS (
    SELECT p.ordem, p.passo, mc.matriculado_em, p.em
      FROM marcos mc
     CROSS JOIN LATERAL (VALUES
       (1, 'entrou_no_app', mc.entrou),
       (2, 'abriu_topico', mc.abriu),
       (3, 'estudou_1_min', mc.estudou),
       (4, 'entregou_atividade', mc.entregou),
       (5, 'concluiu_topico', mc.concluiu)
     ) AS p(ordem, passo, em)
  ),
  bloco_funil AS (
    SELECT COALESCE(jsonb_agg(x.j ORDER BY x.ordem), '[]'::jsonb) AS j
      FROM (
        SELECT ps.ordem,
               jsonb_build_object(
                 'passo', ps.passo,
                 'alunos', count(ps.em),
                 'mediana_dias', round((percentile_cont(0.5) WITHIN GROUP (
                     ORDER BY GREATEST(EXTRACT(epoch FROM ps.em - ps.matriculado_em), 0) / 86400.0)
                   -- Sem o filtro, GREATEST(NULL, 0) = 0 poria na mediana quem nunca chegou ao passo.
                   FILTER (WHERE ps.em IS NOT NULL))::numeric, 1),
                 'com_7_dias_de_matricula',
                   count(*) FILTER (WHERE ps.matriculado_em + interval '7 days' <= v_limite),
                 'chegaram_em_7_dias',
                   count(*) FILTER (WHERE ps.matriculado_em + interval '7 days' <= v_limite
                                      AND ps.em < ps.matriculado_em + interval '7 days')
               ) AS j
          FROM passos ps
         GROUP BY ps.ordem, ps.passo
      ) x
  ),
  -- ------------------------------------------------------------------ estados por semana
  semanas AS (
    SELECT g::date AS s
      FROM generate_series(v_primeira_semana::timestamp, (v_ultimo_dia - 6)::timestamp, interval '1 week') AS g
  ),
  situacao AS (
    SELECT w.s,
           m.aluno_id,
           COALESCE(bool_or(sa.semana = w.s), false) AS a0,
           COALESCE(bool_or(sa.semana = w.s - 7), false) AS a1,
           COALESCE(bool_or(sa.semana BETWEEN w.s - 28 AND w.s - 14), false) AS a2a4,
           min(sa.semana) AS primeira
      FROM semanas w
      JOIN matriculados m ON m.matriculado_em < ((w.s + 7)::timestamp AT TIME ZONE p_timezone)
      LEFT JOIN semanas_ativas sa ON sa.aluno_id = m.aluno_id AND sa.semana <= w.s
     GROUP BY w.s, m.aluno_id
  ),
  estado AS (
    SELECT st.*,
           CASE
             WHEN st.a0 AND st.primeira = st.s THEN 'novo'
             WHEN st.a0 AND st.a1 THEN 'atual'
             WHEN st.a0 AND st.a2a4 THEN 'reativado'
             WHEN st.a0 THEN 'ressuscitado'
             WHEN st.a1 THEN 'em_risco'
             WHEN st.primeira IS NOT NULL THEN 'dormente'
             ELSE 'nunca_ativo'
           END AS estado,
           (st.primeira = st.s - 7) AS novo_na_anterior,
           (NOT st.a1 AND st.primeira < st.s - 7) AS parado_na_anterior
      FROM situacao st
  ),
  bloco_semanas AS (
    SELECT COALESCE(jsonb_agg(x.j ORDER BY x.s), '[]'::jsonb) AS j
      FROM (
        SELECT e.s,
               jsonb_build_object(
                 'semana_inicio', e.s,
                 'semana_fim', e.s + 6,
                 'matriculados', count(*),
                 'ativos', count(*) FILTER (WHERE e.a0),
                 'estados', jsonb_build_object(
                   'novo', count(*) FILTER (WHERE e.estado = 'novo'),
                   'atual', count(*) FILTER (WHERE e.estado = 'atual'),
                   'reativado', count(*) FILTER (WHERE e.estado = 'reativado'),
                   'ressuscitado', count(*) FILTER (WHERE e.estado = 'ressuscitado'),
                   'em_risco', count(*) FILTER (WHERE e.estado = 'em_risco'),
                   'dormente', count(*) FILTER (WHERE e.estado = 'dormente'),
                   'nunca_ativo', count(*) FILTER (WHERE e.estado = 'nunca_ativo')),
                 'retorno', jsonb_build_object(
                   'ativos_na_anterior', count(*) FILTER (WHERE e.a1),
                   'voltaram', count(*) FILTER (WHERE e.a1 AND e.a0),
                   'pct', round(count(*) FILTER (WHERE e.a1 AND e.a0)::numeric * 100
                                / NULLIF(count(*) FILTER (WHERE e.a1), 0), 2)),
                 'retorno_de_novos', jsonb_build_object(
                   'novos_na_anterior', count(*) FILTER (WHERE e.novo_na_anterior),
                   'voltaram', count(*) FILTER (WHERE e.novo_na_anterior AND e.a0),
                   'pct', round(count(*) FILTER (WHERE e.novo_na_anterior AND e.a0)::numeric * 100
                                / NULLIF(count(*) FILTER (WHERE e.novo_na_anterior), 0), 2)),
                 'reativacao', jsonb_build_object(
                   'parados_na_anterior', count(*) FILTER (WHERE e.parado_na_anterior),
                   'voltaram', count(*) FILTER (WHERE e.parado_na_anterior AND e.a0),
                   'pct', round(count(*) FILTER (WHERE e.parado_na_anterior AND e.a0)::numeric * 100
                                / NULLIF(count(*) FILTER (WHERE e.parado_na_anterior), 0), 2))
               ) AS j
          FROM estado e
         GROUP BY e.s
      ) x
  ),
  -- ------------------------------------------------------------------ retenção por semana do curso
  bloco_retencao AS (
    SELECT COALESCE(jsonb_agg(x.j ORDER BY x.k), '[]'::jsonb) AS j
      FROM (
        SELECT k.k,
               jsonb_build_object(
                 'semana', k.k,
                 'elegiveis', count(m.aluno_id),
                 'ativos', count(m.aluno_id) FILTER (WHERE EXISTS (
                   SELECT 1 FROM fatos f
                    WHERE f.aluno_id = m.aluno_id
                      AND f.quando >= m.matriculado_em + make_interval(days => 7 * (k.k - 1))
                      AND f.quando < m.matriculado_em + make_interval(days => 7 * k.k))),
                 'pct', round(count(m.aluno_id) FILTER (WHERE EXISTS (
                   SELECT 1 FROM fatos f
                    WHERE f.aluno_id = m.aluno_id
                      AND f.quando >= m.matriculado_em + make_interval(days => 7 * (k.k - 1))
                      AND f.quando < m.matriculado_em + make_interval(days => 7 * k.k)))::numeric * 100
                   / NULLIF(count(m.aluno_id), 0), 2)
               ) AS j
          FROM generate_series(1, {SEMANAS_DO_CURSO}) AS k(k)
          LEFT JOIN matriculados m ON m.matriculado_em + make_interval(days => 7 * k.k) <= v_limite
         GROUP BY k.k
      ) x
  )
  SELECT jsonb_build_object(
    'versao', 1,
    'medido_em', statement_timestamp(),
    'classe_id', p_classe_id,
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'timezone', p_timezone),
    'matriculados', (SELECT count(*) FROM matriculados),
    'sessoes_estudo', (SELECT j FROM bloco_sessoes),
    'funil', (SELECT j FROM bloco_funil),
    'semanas', (SELECT j FROM bloco_semanas),
    'retencao_por_semana_do_curso', (SELECT j FROM bloco_retencao),
    'definicoes', jsonb_build_object(
      'sessao_de_estudo', 'lotes do escopo topic da turma fundidos por {CORTE_SESSAO_MIN} min sem estudo; nao e a sessao por tela',
      'engajada', 'sessao com {ENGAJADA_SEG} s ou mais de tempo ativo',
      'semana_ativa', 'semana (segunda a domingo, no fuso pedido) com tempo ativo no escopo topic, atividade entregue ou topico concluido na turma; entrar no app sem estudar nao conta',
      'funil', 'matriculados ate o fim do periodo; cada passo contado sozinho, do momento da matricula ate o fim do periodo; p_inicio nao restringe',
      'estudou_1_min', 'instante em que o tempo ativo acumulado na turma chegou a {ESTUDOU_SEG} s',
      'mediana_dias', 'dias da matricula ao passo, so de quem chegou ao passo',
      'chegaram_em_7_dias', 'sobre com_7_dias_de_matricula: quem ainda nao completou 7 dias nao entra',
      'novo', 'a primeira semana ativa do aluno na turma e esta',
      'atual', 'ativo nesta semana e na anterior',
      'reativado', 'ativo nesta, inativo na anterior, ativo em alguma das tres antes dela',
      'ressuscitado', 'ativo nesta, inativo nas quatro anteriores, ativo antes disso',
      'em_risco', 'inativo nesta, ativo na anterior',
      'dormente', 'inativo nesta e na anterior, ativo alguma vez antes',
      'nunca_ativo', 'nenhuma semana ativa ate esta',
      'retorno', 'dos ativos na semana anterior (novos incluidos), quantos estao ativos nesta',
      'retorno_de_novos', 'dos que tiveram a primeira semana ativa na anterior, quantos estao ativos nesta',
      'reativacao', 'dos em risco ou dormentes na semana anterior, quantos estao ativos nesta',
      'semanas', 'so semana completa contida no periodo e ja encerrada',
      'retencao_por_semana_do_curso', 'semana k = dias 7(k-1) a 7k desde a matricula; elegiveis = quem ja completou k semanas'
    ),
    'limitacoes', jsonb_build_array(
      'o instante dos lotes e o relogio do aparelho',
      'sem calendario escolar, recesso aparece como queda em todos os estados',
      'quem saiu da turma nao entra: a matricula e apagada, nao encerrada',
      'quem recusou telemetria so aparece pelos passos e semanas de entrega e conclusao',
      'turma pequena: uma pessoa muda muito o percentual; leia a contagem ao lado'
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$fn$;

REVOKE ALL ON FUNCTION public.metricas_continuidade_turma(bigint, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metricas_continuidade_turma(bigint, date, date, text) TO authenticated;
"""

CHAVES = ("prof.sessao_estudo", "prof.funil_ativacao", "prof.estados_retencao", "prof.retencao_semana_curso")

CATALOGO = """
INSERT INTO public.metricas_catalogo
  (chave, nome, descricao, publico, unidade, janela, fonte, nulo_significa, requer_validacao, invariantes)
VALUES
  ('prof.sessao_estudo', 'Sessões de estudo',
   'Períodos contínuos de estudo na turma, cortados por 30 minutos sem estudo: quantos por aluno, duração e tempo ativo.',
   '{professor,dev}', 'contagem', 'período escolhido', 'metricas_continuidade_turma.sessoes_estudo',
   'sem telemetria no período', 'nenhuma', '{I01,I02,I03}'),
  ('prof.funil_ativacao', 'Funil de ativação',
   'Da matrícula ao primeiro acesso, primeiro tópico aberto, primeiro minuto de estudo, primeira entrega e primeiro tópico concluído.',
   '{professor,dev}', 'contagem', 'da matrícula ao fim do período', 'metricas_continuidade_turma.funil',
   'turma sem matrícula', 'nenhuma', '{I01}'),
  ('prof.estados_retencao', 'Estados de retenção por semana',
   'Por semana completa, quantos alunos são novos, atuais, reativados, ressuscitados, em risco, dormentes ou nunca ativos, e as taxas de retorno.',
   '{professor,dev}', 'contagem', 'semanas completas do período', 'metricas_continuidade_turma.semanas',
   'nenhuma semana completa no período', 'nenhuma', '{I01}'),
  ('prof.retencao_semana_curso', 'Retenção por semana do curso',
   'Dos matriculados que já completaram a semana k desde a matrícula, quantos estudaram nela (k de 1 a 8).',
   '{professor,dev}', 'percentual', 'da matrícula ao fim do período', 'metricas_continuidade_turma.retencao_por_semana_do_curso',
   'ninguém completou a semana', 'nenhuma', '{I01}')
ON CONFLICT (chave) DO UPDATE SET
  nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, publico = EXCLUDED.publico, unidade = EXCLUDED.unidade,
  janela = EXCLUDED.janela, fonte = EXCLUDED.fonte, nulo_significa = EXCLUDED.nulo_significa,
  requer_validacao = EXCLUDED.requer_validacao, invariantes = EXCLUDED.invariantes;
"""

DOWNGRADE = """
DROP FUNCTION IF EXISTS public.metricas_continuidade_turma(bigint, date, date, text);
DROP VIEW IF EXISTS public.vw_metricas_sessoes_estudo;
DELETE FROM public.metricas_catalogo
 WHERE chave IN ('prof.sessao_estudo', 'prof.funil_ativacao', 'prof.estados_retencao', 'prof.retencao_semana_curso');
"""


def upgrade() -> None:
    op.execute("DROP VIEW IF EXISTS public.vw_metricas_sessoes_estudo")
    op.execute(VIEW)
    op.execute(RPC)
    op.execute(CATALOGO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(DOWNGRADE)
    op.execute("NOTIFY pgrst, 'reload schema'")
