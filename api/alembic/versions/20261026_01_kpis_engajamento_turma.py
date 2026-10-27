"""KPIs de engajamento por período, com definições auditáveis.

As views ``vw_metricas_*`` consumidas pelo console nasceram fora da cadeia e
misturam conceitos sem expor janela, denominador ou política de nulos. Esta
RPC não as embrulha: calcula, a partir das fontes versionadas, as medidas que
a issue #12 precisa.

Decisões do contrato:

* usuário ativo na semana é uma contagem; retorno é a interseção entre duas
  semanas completas consecutivas;
* tempo ativo vem somente de ``scope = 'topic'``. Somar os quatro escopos
  multiplicaria o mesmo intervalo;
* sessão encerrada sem ``topic_complete`` e sessão ainda aberta são medidas
  distintas — a segunda não é abandono;
* conclusão e cobertura de personalização são estado atual, porque o banco
  não guarda snapshots históricos confiáveis desses dois indicadores;
* cobertura aceita material base por perfil (``aluno_id IS NULL``) ou
  individual. Payload terminal ``failed_quality`` nunca conta como entregue.

Revision ID: 20261026_01
Revises: 20261025_04
Create Date: 2026-10-26
"""

from alembic import op

revision = "20261026_01"
down_revision = "20261025_04"
branch_labels = None
depends_on = None


SQL = r"""
CREATE INDEX IF NOT EXISTS idx_tme_kpis_classe_scope_captura
  ON public.telemetria_time_metric_entries
  (classe_id, scope, captured_at, aluno_id);
CREATE INDEX IF NOT EXISTS idx_telemetria_sessoes_kpis_classe_inicio
  ON public.telemetria_sessoes (classe_id, started_at, aluno_id);
CREATE INDEX IF NOT EXISTS idx_eventos_app_kpis_sessao_evento
  ON public.telemetria_eventos_app (sessao_id, event_name, occurred_at);

CREATE OR REPLACE FUNCTION public.metricas_engajamento_turma(
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
  IF p_timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_timezone
  ) THEN
    RAISE EXCEPTION 'timezone_invalido' USING ERRCODE = '22023';
  END IF;

  v_inicio := p_inicio::timestamp AT TIME ZONE p_timezone;
  v_fim_exclusivo := (p_fim + 1)::timestamp AT TIME ZONE p_timezone;

  WITH
  perfis(nome) AS (
    VALUES
      ('seeker'::text), ('survivor'), ('daredevil'), ('mastermind'),
      ('conqueror'), ('socializer'), ('achiever')
  ),
  matriculados AS (
    SELECT DISTINCT ca.aluno_id
      FROM public.classe_aluno ca
     WHERE ca.classe_id = p_classe_id
       AND ca.aluno_id IS NOT NULL
  ),
  topicos_da_turma AS (
    SELECT t.id
      FROM public.topicos t
     WHERE t.classe_id = p_classe_id
  ),
  tempo AS (
    SELECT
      COALESCE(sum(e.active_sec), 0)::numeric AS ativo_seg,
      COALESCE(sum(e.dwell_sec), 0)::numeric AS presenca_seg,
      COALESCE(sum(e.idle_sec), 0)::numeric AS ocioso_seg,
      count(DISTINCT e.aluno_id) FILTER (WHERE e.active_sec > 0) AS alunos_ativos
    FROM public.telemetria_time_metric_entries e
    JOIN matriculados m ON m.aluno_id = e.aluno_id
    WHERE e.classe_id = p_classe_id
      AND e.scope = 'topic'
      AND e.captured_at >= v_inicio
      AND e.captured_at < v_fim_exclusivo
  ),
  sessoes AS (
    SELECT
      s.id,
      s.aluno_id,
      s.started_at,
      s.ended_at,
      EXISTS (
        SELECT 1
          FROM public.telemetria_eventos_app ev
         WHERE ev.sessao_id = s.id
           AND ev.event_name = 'topic_complete'
           AND ev.occurred_at >= v_inicio
           AND ev.occurred_at < v_fim_exclusivo
      ) AS concluiu_topico
    FROM public.telemetria_sessoes s
    JOIN matriculados m ON m.aluno_id = s.aluno_id
    WHERE s.classe_id = p_classe_id
      AND s.started_at >= v_inicio
      AND s.started_at < v_fim_exclusivo
  ),
  semanas AS (
    SELECT
      g::date AS inicio,
      (g::date + 6) AS fim,
      (g::date >= p_inicio AND g::date + 6 <= p_fim) AS completa
    FROM generate_series(
      date_trunc('week', p_inicio::timestamp),
      date_trunc('week', p_fim::timestamp),
      interval '1 week'
    ) AS g
  ),
  atividade_semana AS (
    SELECT
      s.inicio,
      s.fim,
      s.completa,
      m.aluno_id,
      COALESCE(bool_or(e.active_sec > 0), false) AS ativo
    FROM semanas s
    CROSS JOIN matriculados m
    LEFT JOIN public.telemetria_time_metric_entries e
      ON e.aluno_id = m.aluno_id
     AND e.classe_id = p_classe_id
     AND e.scope = 'topic'
     AND e.captured_at >= (s.inicio::timestamp AT TIME ZONE p_timezone)
     AND e.captured_at < ((s.inicio + 7)::timestamp AT TIME ZONE p_timezone)
     AND e.captured_at >= v_inicio
     AND e.captured_at < v_fim_exclusivo
    GROUP BY s.inicio, s.fim, s.completa, m.aluno_id
  ),
  semanas_resumo AS (
    SELECT
      inicio,
      fim,
      completa,
      count(*) FILTER (WHERE ativo)::integer AS usuarios_ativos
    FROM atividade_semana
    GROUP BY inicio, fim, completa
  ),
  pares_retorno AS (
    SELECT
      count(*) FILTER (WHERE a.ativo AND b.ativo)::integer AS retornaram,
      count(*) FILTER (WHERE a.ativo)::integer AS elegiveis
    FROM atividade_semana a
    JOIN atividade_semana b
      ON b.aluno_id = a.aluno_id
     AND b.inicio = a.inicio + 7
    WHERE a.completa AND b.completa
  ),
  afinidades_rankeadas AS (
    SELECT
      m.aluno_id,
      lower(btrim(p.nome)) AS perfil,
      ap.afinidade,
      row_number() OVER (
        PARTITION BY m.aluno_id
        ORDER BY ap.afinidade DESC NULLS LAST, lower(btrim(p.nome)) ASC
      ) AS posicao
    FROM matriculados m
    JOIN public.aluno_perfil ap ON ap.aluno_id = m.aluno_id
    JOIN public.perfil p ON p.id = ap.perfil_id
    WHERE lower(btrim(p.nome)) IN (SELECT nome FROM perfis)
  ),
  dominantes AS (
    SELECT aluno_id, perfil
      FROM afinidades_rankeadas
     WHERE posicao = 1
    UNION ALL
    SELECT m.aluno_id, 'mastermind'
      FROM matriculados m
     WHERE NOT EXISTS (
       SELECT 1 FROM afinidades_rankeadas r WHERE r.aluno_id = m.aluno_id
     )
  ),
  perfis_elegiveis AS (
    SELECT d.aluno_id, d.perfil, true AS dominante
      FROM dominantes d
    UNION ALL
    SELECT r.aluno_id, r.perfil, false
      FROM afinidades_rankeadas r
     WHERE r.posicao = 2
       AND COALESCE(r.afinidade, 0) > 20
       AND NOT EXISTS (
         SELECT 1
           FROM dominantes d
          WHERE d.aluno_id = r.aluno_id AND d.perfil = r.perfil
       )
  ),
  alvos_personalizacao AS (
    SELECT e.aluno_id, e.perfil, e.dominante, t.id AS topico_id
      FROM perfis_elegiveis e
      CROSS JOIN topicos_da_turma t
  ),
  cobertura_alvos AS (
    SELECT
      a.aluno_id,
      a.perfil,
      a.dominante,
      a.topico_id,
      material.origem
    FROM alvos_personalizacao a
    LEFT JOIN LATERAL (
      SELECT CASE WHEN cp.aluno_id IS NULL THEN 'compartilhado' ELSE 'individual' END AS origem
        FROM public.conteudo_personalizado cp
       WHERE cp.classe_id = p_classe_id
         AND cp.topico_id = a.topico_id
         AND lower(btrim(cp.brainhex_profile_key)) = a.perfil
         AND (cp.aluno_id IS NULL OR cp.aluno_id = a.aluno_id)
         AND lower(COALESCE(cp.status, '')) = 'pronto'
         AND EXISTS (
           SELECT 1
             FROM jsonb_each(
               CASE
                 WHEN jsonb_typeof(cp.materiais) = 'object' THEN cp.materiais
                 ELSE '{}'::jsonb
               END
             ) AS mat(tipo, payload)
            WHERE (
              (
                jsonb_typeof(mat.payload) = 'string'
                AND btrim(mat.payload #>> '{}') <> ''
              )
              OR (
                jsonb_typeof(mat.payload) = 'object'
                AND lower(COALESCE(
                  mat.payload #>> '{metadata,status}',
                  mat.payload ->> 'status',
                  'completed'
                )) NOT IN (
                  'failed', 'falha', 'failed_quality', 'error',
                  'pending', 'processing', 'processando'
                )
                AND (
                  NULLIF(btrim(mat.payload ->> 'url'), '') IS NOT NULL
                  OR NULLIF(btrim(mat.payload ->> 'markdown'), '') IS NOT NULL
                  OR NULLIF(btrim(mat.payload ->> 'texto'), '') IS NOT NULL
                  OR NULLIF(btrim(mat.payload ->> 'text'), '') IS NOT NULL
                  OR NULLIF(btrim(mat.payload ->> 'content'), '') IS NOT NULL
                  OR NULLIF(btrim(mat.payload ->> 'html'), '') IS NOT NULL
                  OR CASE
                       WHEN jsonb_typeof(mat.payload -> 'cards') = 'array'
                       THEN jsonb_array_length(mat.payload -> 'cards') > 0
                       ELSE false
                     END
                  OR CASE
                       WHEN jsonb_typeof(mat.payload -> 'items') = 'array'
                       THEN jsonb_array_length(mat.payload -> 'items') > 0
                       ELSE false
                     END
                )
              )
            )
         )
       ORDER BY (cp.aluno_id IS NOT NULL) DESC, cp.updated_at DESC, cp.id DESC
       LIMIT 1
    ) material ON true
  ),
  dominantes_por_perfil AS (
    SELECT perfil, count(DISTINCT aluno_id)::integer AS alunos_dominantes
      FROM dominantes
     GROUP BY perfil
  ),
  elegiveis_por_perfil AS (
    SELECT perfil, count(DISTINCT aluno_id)::integer AS alunos_elegiveis
      FROM perfis_elegiveis
     GROUP BY perfil
  ),
  cobertura_por_perfil AS (
    SELECT
      c.perfil,
      count(c.topico_id)::integer AS alvos,
      count(c.topico_id) FILTER (WHERE c.origem IS NOT NULL)::integer AS alvos_cobertos,
      count(c.topico_id) FILTER (WHERE c.origem = 'compartilhado')::integer AS cobertos_compartilhados,
      count(c.topico_id) FILTER (WHERE c.origem = 'individual')::integer AS cobertos_individuais
    FROM cobertura_alvos c
    GROUP BY c.perfil
  ),
  cobertura_perfil AS (
    SELECT
      p.nome AS perfil,
      COALESCE(d.alunos_dominantes, 0) AS alunos_dominantes,
      COALESCE(e.alunos_elegiveis, 0) AS alunos_elegiveis,
      COALESCE(c.alvos, 0) AS alvos,
      COALESCE(c.alvos_cobertos, 0) AS alvos_cobertos,
      COALESCE(c.cobertos_compartilhados, 0) AS cobertos_compartilhados,
      COALESCE(c.cobertos_individuais, 0) AS cobertos_individuais
    FROM perfis p
    LEFT JOIN dominantes_por_perfil d ON d.perfil = p.nome
    LEFT JOIN elegiveis_por_perfil e ON e.perfil = p.nome
    LEFT JOIN cobertura_por_perfil c ON c.perfil = p.nome
  ),
  conclusao_atual AS (
    SELECT
      count(*)::integer AS alvos,
      count(*) FILTER (WHERE COALESCE(ta.status::text, '') = 'concluido')::integer AS concluidos
    FROM matriculados m
    CROSS JOIN topicos_da_turma t
    LEFT JOIN public.topico_aluno ta
      ON ta.aluno_id = m.aluno_id AND ta.topico_id = t.id
  )
  SELECT jsonb_build_object(
    'versao', 1,
    'classe_id', p_classe_id,
    'periodo', jsonb_build_object(
      'inicio', p_inicio,
      'fim', p_fim,
      'timezone', p_timezone,
      'inicio_utc', v_inicio,
      'fim_exclusivo_utc', v_fim_exclusivo,
      'dias', p_fim - p_inicio + 1
    ),
    'populacao', jsonb_build_object(
      'alunos_matriculados', (SELECT count(*) FROM matriculados)
    ),
    'engajamento', jsonb_build_object(
      'alunos_ativos', tempo.alunos_ativos,
      'taxa_atividade_pct',
        CASE
          WHEN (SELECT count(*) FROM matriculados) = 0 THEN NULL
          ELSE round(
            100.0 * tempo.alunos_ativos / (SELECT count(*) FROM matriculados),
            2
          )
        END,
      'tempo_ativo_seg', tempo.ativo_seg,
      'tempo_presenca_seg', tempo.presenca_seg,
      'tempo_ocioso_seg', tempo.ocioso_seg,
      'tempo_ativo_medio_por_aluno_ativo_seg',
        CASE WHEN tempo.alunos_ativos = 0 THEN NULL
             ELSE round(tempo.ativo_seg / tempo.alunos_ativos, 2) END,
      'sessoes', (SELECT count(*) FROM sessoes),
      'alunos_com_sessao', (SELECT count(DISTINCT aluno_id) FROM sessoes),
      'sessoes_media_por_aluno_ativo',
        CASE
          WHEN tempo.alunos_ativos = 0 THEN NULL
          ELSE round(
            (SELECT count(*) FROM sessoes)::numeric / tempo.alunos_ativos,
            2
          )
        END
    ),
    'retorno_semanal', jsonb_build_object(
      'definicao', 'ativo_em_duas_semanas_calendario_completas_consecutivas',
      'retornaram', COALESCE((SELECT retornaram FROM pares_retorno), 0),
      'elegiveis', COALESCE((SELECT elegiveis FROM pares_retorno), 0),
      'taxa_pct',
        CASE
          WHEN COALESCE((SELECT elegiveis FROM pares_retorno), 0) = 0 THEN NULL
          ELSE round(
            100.0 * (SELECT retornaram FROM pares_retorno)
            / (SELECT elegiveis FROM pares_retorno),
            2
          )
        END,
      'semanas', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'inicio', inicio,
            'fim', fim,
            'completa', completa,
            'usuarios_ativos', usuarios_ativos
          )
          ORDER BY inicio
        )
        FROM semanas_resumo
      ), '[]'::jsonb)
    ),
    'jornada_sessoes', jsonb_build_object(
      'total', (SELECT count(*) FROM sessoes),
      'concluidas', (SELECT count(*) FROM sessoes WHERE concluiu_topico),
      'encerradas_sem_conclusao', (
        SELECT count(*) FROM sessoes WHERE ended_at IS NOT NULL AND NOT concluiu_topico
      ),
      'em_aberto', (SELECT count(*) FROM sessoes WHERE ended_at IS NULL)
    ),
    'estado_atual', jsonb_build_object(
      'medido_em', statement_timestamp(),
      'historico_disponivel', false,
      'conclusao', (
        SELECT jsonb_build_object(
          'alvos', alvos,
          'concluidos', concluidos,
          'taxa_pct',
            CASE WHEN alvos = 0 THEN NULL
                 ELSE round(100.0 * concluidos / alvos, 2) END
        )
        FROM conclusao_atual
      ),
      'personalizacao', jsonb_build_object(
        'definicao_elegivel', 'perfil_dominante_ou_segundo_com_afinidade_maior_que_20',
        'perfis', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'perfil', perfil,
              'alunos_dominantes', alunos_dominantes,
              'alunos_elegiveis', alunos_elegiveis,
              'alvos', alvos,
              'alvos_cobertos', alvos_cobertos,
              'cobertos_compartilhados', cobertos_compartilhados,
              'cobertos_individuais', cobertos_individuais,
              'cobertura_pct',
                CASE WHEN alvos = 0 THEN NULL
                     ELSE round(100.0 * alvos_cobertos / alvos, 2) END
            )
            ORDER BY array_position(
              ARRAY[
                'seeker', 'survivor', 'daredevil', 'mastermind',
                'conqueror', 'socializer', 'achiever'
              ]::text[],
              perfil
            )
          )
          FROM cobertura_perfil
        ), '[]'::jsonb)
      )
    )
  )
  INTO v_resultado
  FROM tempo;

  RETURN v_resultado;
END;
$fn$;

REVOKE ALL ON FUNCTION public.metricas_engajamento_turma(bigint, date, date, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metricas_engajamento_turma(bigint, date, date, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(
        "DROP FUNCTION IF EXISTS public.metricas_engajamento_turma(bigint, date, date, text)"
    )
    op.execute("DROP INDEX IF EXISTS public.idx_eventos_app_kpis_sessao_evento")
    op.execute("DROP INDEX IF EXISTS public.idx_telemetria_sessoes_kpis_classe_inicio")
    op.execute("DROP INDEX IF EXISTS public.idx_tme_kpis_classe_scope_captura")
