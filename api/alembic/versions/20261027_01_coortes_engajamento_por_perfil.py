"""Coortes descritivas de engajamento por perfil BrainHex.

A issue #12 fixou janela, denominadores e política de nulos para a turma. A
#13 aplica o mesmo contrato a segmentos comparáveis, sem fingir que uma
segmentação observacional é experimento:

* perfil dominante forma sete coortes disjuntas;
* segundo perfil com afinidade > 20 forma segmentos sobrepostos, em bloco
  separado;
* perfil atual não reconstrói o perfil histórico: a resposta declara a hora da
  segmentação e ``historico_perfil_disponivel = false``;
* amostra menor que cinco é sinalizada, mas não escondida do professor dono;
* conclusão continua marcada como estado atual;
* retorno só compara semanas completas consecutivas, como na #12.

Revision ID: 20261027_01
Revises: 20261026_01
Create Date: 2026-10-27
"""

from alembic import op

revision = "20261027_01"
down_revision = "20261026_01"
branch_labels = None
depends_on = None


SQL = r"""
CREATE OR REPLACE FUNCTION public.metricas_engajamento_coortes_turma(
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
  v_geral jsonb;
  v_resultado jsonb;
BEGIN
  -- Não depender só da delegação para a barreira ficar auditável no corpo:
  -- SECURITY DEFINER exposta sempre cita a sessão e a posse diretamente.
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id)
     WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'turma_nao_encontrada_ou_sem_permissao'
      USING ERRCODE = '42501';
  END IF;

  -- A função da #12 valida também período/timezone e devolve o agregado geral.
  v_geral := public.metricas_engajamento_turma(
    p_classe_id, p_inicio, p_fim, p_timezone
  );
  v_inicio := p_inicio::timestamp AT TIME ZONE p_timezone;
  v_fim_exclusivo := (p_fim + 1)::timestamp AT TIME ZONE p_timezone;

  WITH
  perfis(nome, ordem) AS (
    VALUES
      ('seeker'::text, 1), ('survivor', 2), ('daredevil', 3),
      ('mastermind', 4), ('conqueror', 5), ('socializer', 6),
      ('achiever', 7)
  ),
  tipos(tipo, sobreposta, ordem) AS (
    VALUES
      ('dominante'::text, false, 1),
      ('secundario_elegivel'::text, true, 2)
  ),
  coortes AS (
    SELECT t.tipo, t.sobreposta, t.ordem AS tipo_ordem,
           p.nome AS perfil, p.ordem AS perfil_ordem
      FROM tipos t CROSS JOIN perfis p
  ),
  matriculados AS (
    SELECT DISTINCT ca.aluno_id
      FROM public.classe_aluno ca
     WHERE ca.classe_id = p_classe_id
       AND ca.aluno_id IS NOT NULL
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
  membros AS (
    SELECT 'dominante'::text AS tipo, d.perfil, d.aluno_id
      FROM dominantes d
    UNION ALL
    SELECT 'secundario_elegivel', r.perfil, r.aluno_id
      FROM afinidades_rankeadas r
     WHERE r.posicao = 2
       AND COALESCE(r.afinidade, 0) > 20
       AND NOT EXISTS (
         SELECT 1 FROM dominantes d
          WHERE d.aluno_id = r.aluno_id AND d.perfil = r.perfil
       )
  ),
  tamanho AS (
    SELECT tipo, perfil, count(DISTINCT aluno_id)::integer AS alunos
      FROM membros
     GROUP BY tipo, perfil
  ),
  tempo AS (
    SELECT
      m.tipo,
      m.perfil,
      count(DISTINCT e.aluno_id) FILTER (WHERE e.active_sec > 0)::integer
        AS alunos_ativos,
      COALESCE(sum(e.active_sec), 0)::numeric AS tempo_ativo_seg,
      COALESCE(sum(e.dwell_sec), 0)::numeric AS tempo_presenca_seg,
      COALESCE(sum(e.idle_sec), 0)::numeric AS tempo_ocioso_seg
    FROM membros m
    LEFT JOIN public.telemetria_time_metric_entries e
      ON e.aluno_id = m.aluno_id
     AND e.classe_id = p_classe_id
     AND e.scope = 'topic'
     AND e.captured_at >= v_inicio
     AND e.captured_at < v_fim_exclusivo
    GROUP BY m.tipo, m.perfil
  ),
  sessoes AS (
    SELECT
      m.tipo,
      m.perfil,
      count(s.id)::integer AS total,
      count(DISTINCT s.aluno_id)::integer AS alunos_com_sessao,
      count(s.id) FILTER (WHERE s.ended_at IS NULL)::integer AS em_aberto,
      count(s.id) FILTER (
        WHERE s.ended_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
              FROM public.telemetria_eventos_app ev
             WHERE ev.sessao_id = s.id
               AND ev.event_name = 'topic_complete'
               AND ev.occurred_at >= v_inicio
               AND ev.occurred_at < v_fim_exclusivo
          )
      )::integer AS encerradas_sem_conclusao
    FROM membros m
    LEFT JOIN public.telemetria_sessoes s
      ON s.aluno_id = m.aluno_id
     AND s.classe_id = p_classe_id
     AND s.started_at >= v_inicio
     AND s.started_at < v_fim_exclusivo
    GROUP BY m.tipo, m.perfil
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
      m.tipo,
      m.perfil,
      m.aluno_id,
      s.inicio,
      s.completa,
      COALESCE(bool_or(e.active_sec > 0), false) AS ativo
    FROM membros m
    CROSS JOIN semanas s
    LEFT JOIN public.telemetria_time_metric_entries e
      ON e.aluno_id = m.aluno_id
     AND e.classe_id = p_classe_id
     AND e.scope = 'topic'
     AND e.captured_at >= (s.inicio::timestamp AT TIME ZONE p_timezone)
     AND e.captured_at < ((s.inicio + 7)::timestamp AT TIME ZONE p_timezone)
     AND e.captured_at >= v_inicio
     AND e.captured_at < v_fim_exclusivo
    GROUP BY m.tipo, m.perfil, m.aluno_id, s.inicio, s.completa
  ),
  retorno AS (
    SELECT
      a.tipo,
      a.perfil,
      count(*) FILTER (WHERE a.ativo)::integer AS elegiveis,
      count(*) FILTER (WHERE a.ativo AND b.ativo)::integer AS retornaram
    FROM atividade_semana a
    JOIN atividade_semana b
      ON b.tipo = a.tipo
     AND b.perfil = a.perfil
     AND b.aluno_id = a.aluno_id
     AND b.inicio = a.inicio + 7
    WHERE a.completa AND b.completa
    GROUP BY a.tipo, a.perfil
  ),
  topicos_da_turma AS (
    SELECT t.id FROM public.topicos t WHERE t.classe_id = p_classe_id
  ),
  conclusao AS (
    SELECT
      m.tipo,
      m.perfil,
      count(t.id)::integer AS alvos,
      count(t.id) FILTER (
        WHERE COALESCE(ta.status::text, '') = 'concluido'
      )::integer AS concluidos
    FROM membros m
    CROSS JOIN topicos_da_turma t
    LEFT JOIN public.topico_aluno ta
      ON ta.aluno_id = m.aluno_id AND ta.topico_id = t.id
    GROUP BY m.tipo, m.perfil
  ),
  metricas AS (
    SELECT
      c.tipo,
      c.sobreposta,
      c.tipo_ordem,
      c.perfil,
      c.perfil_ordem,
      COALESCE(n.alunos, 0) AS alunos,
      COALESCE(t.alunos_ativos, 0) AS alunos_ativos,
      COALESCE(t.tempo_ativo_seg, 0) AS tempo_ativo_seg,
      COALESCE(t.tempo_presenca_seg, 0) AS tempo_presenca_seg,
      COALESCE(t.tempo_ocioso_seg, 0) AS tempo_ocioso_seg,
      COALESCE(s.total, 0) AS sessoes,
      COALESCE(s.alunos_com_sessao, 0) AS alunos_com_sessao,
      COALESCE(s.em_aberto, 0) AS sessoes_em_aberto,
      COALESCE(s.encerradas_sem_conclusao, 0) AS encerradas_sem_conclusao,
      COALESCE(r.elegiveis, 0) AS retorno_elegiveis,
      COALESCE(r.retornaram, 0) AS retornaram,
      COALESCE(cn.alvos, 0) AS conclusao_alvos,
      COALESCE(cn.concluidos, 0) AS concluidos
    FROM coortes c
    LEFT JOIN tamanho n ON n.tipo = c.tipo AND n.perfil = c.perfil
    LEFT JOIN tempo t ON t.tipo = c.tipo AND t.perfil = c.perfil
    LEFT JOIN sessoes s ON s.tipo = c.tipo AND s.perfil = c.perfil
    LEFT JOIN retorno r ON r.tipo = c.tipo AND r.perfil = c.perfil
    LEFT JOIN conclusao cn ON cn.tipo = c.tipo AND cn.perfil = c.perfil
  ),
  linhas AS (
    SELECT
      m.*,
      jsonb_build_object(
        'tipo', m.tipo,
        'perfil', m.perfil,
        'sobreposta', m.sobreposta,
        'alunos', m.alunos,
        'amostra_pequena', m.alunos > 0 AND m.alunos < 5,
        'engajamento', jsonb_build_object(
          'alunos_ativos', m.alunos_ativos,
          'taxa_atividade_pct',
            CASE WHEN m.alunos = 0 THEN NULL
                 ELSE round(100.0 * m.alunos_ativos / m.alunos, 2) END,
          'tempo_ativo_seg', m.tempo_ativo_seg,
          'tempo_presenca_seg', m.tempo_presenca_seg,
          'tempo_ocioso_seg', m.tempo_ocioso_seg,
          'tempo_ativo_medio_por_aluno_ativo_seg',
            CASE WHEN m.alunos_ativos = 0 THEN NULL
                 ELSE round(m.tempo_ativo_seg / m.alunos_ativos, 2) END,
          'sessoes', m.sessoes,
          'alunos_com_sessao', m.alunos_com_sessao,
          'sessoes_media_por_aluno_ativo',
            CASE WHEN m.alunos_ativos = 0 THEN NULL
                 ELSE round(m.sessoes::numeric / m.alunos_ativos, 2) END
        ),
        'retorno_semanal', jsonb_build_object(
          'retornaram', m.retornaram,
          'elegiveis', m.retorno_elegiveis,
          'taxa_pct',
            CASE WHEN m.retorno_elegiveis = 0 THEN NULL
                 ELSE round(100.0 * m.retornaram / m.retorno_elegiveis, 2) END
        ),
        'jornada_sessoes', jsonb_build_object(
          'em_aberto', m.sessoes_em_aberto,
          'encerradas_sem_conclusao', m.encerradas_sem_conclusao
        ),
        'estado_atual', jsonb_build_object(
          'conclusao', jsonb_build_object(
            'alvos', m.conclusao_alvos,
            'concluidos', m.concluidos,
            'taxa_pct',
              CASE WHEN m.conclusao_alvos = 0 THEN NULL
                   ELSE round(100.0 * m.concluidos / m.conclusao_alvos, 2) END
          )
        )
      ) AS linha
    FROM metricas m
  )
  SELECT jsonb_build_object(
    'versao', 1,
    'classe_id', p_classe_id,
    'periodo', v_geral -> 'periodo',
    'segmentacao', jsonb_build_object(
      'medida_em', statement_timestamp(),
      'historico_perfil_disponivel', false,
      'comparacao_causal', false,
      'perfil_dominante', 'maior_afinidade_desempate_nome',
      'secundario_elegivel', 'segunda_maior_afinidade_maior_que_20'
    ),
    'geral', v_geral,
    'coortes_dominantes', COALESCE((
      SELECT jsonb_agg(linha ORDER BY perfil_ordem)
        FROM linhas WHERE tipo = 'dominante'
    ), '[]'::jsonb),
    'segmentos_secundarios', COALESCE((
      SELECT jsonb_agg(linha ORDER BY perfil_ordem)
        FROM linhas WHERE tipo = 'secundario_elegivel'
    ), '[]'::jsonb)
  )
  INTO v_resultado;

  RETURN v_resultado;
END;
$fn$;

REVOKE ALL ON FUNCTION public.metricas_engajamento_coortes_turma(
  bigint, date, date, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metricas_engajamento_coortes_turma(
  bigint, date, date, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(
        "DROP FUNCTION IF EXISTS "
        "public.metricas_engajamento_coortes_turma(bigint, date, date, text)"
    )
