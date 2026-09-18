"""Use one canonical, item-weighted completion percentage.

The class percentage used to be the arithmetic mean of topic percentages.
That made a topic with two steps worth the same as a topic with fifty steps.
The topic function already defines the effective denominator (personalized
journey when present, teacher material otherwise); this migration applies the
same rule across the whole class and replays old rows.
"""

from alembic import op

revision = "20260913_11"
down_revision = "20260913_10"
branch_labels = None
depends_on = None


FUNCAO_CLASSE = """
CREATE OR REPLACE FUNCTION public.trailup_recalcular_classe_aluno(
  p_aluno uuid,
  p_classe bigint
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_total       bigint := 0;
  v_feitos      bigint := 0;
  v_pct         numeric := 0;
  v_tempo       numeric := 0;
  v_col_pct     text;
  v_col_done    text;
  v_col_tempo   text;
  v_sql         text;
BEGIN
  IF p_aluno IS NULL OR p_classe IS NULL THEN
    RETURN;
  END IF;

  -- Keep this denominator in lockstep with trailup_recalcular_topico_aluno:
  -- personalized items are the journey when they exist for the topic;
  -- otherwise the teacher's contents and activities are used.
  WITH professor AS (
    SELECT t.id AS topico_id, count(c.id)::bigint AS total,
           count(c.id) FILTER (
             WHERE position('concl' IN lower(coalesce(ca.status::text, ''))) > 0
                OR coalesce(ca.percentual_concluido, 0) >= 100
           )::bigint AS feitos
      FROM topicos t
      LEFT JOIN conteudos c ON c.topico_id = t.id
      LEFT JOIN conteudo_aluno ca
        ON ca.conteudo_id = c.id AND ca.aluno_id = p_aluno
     WHERE t.classe_id = p_classe
     GROUP BY t.id
    UNION ALL
    SELECT t.id, count(a.id)::bigint,
           count(a.id) FILTER (
             WHERE position('concl' IN lower(coalesce(aa.status::text, ''))) > 0
                OR coalesce(aa.percentual_concluido, 0) >= 100
           )::bigint
      FROM topicos t
      LEFT JOIN atividades a ON a.topico_id = t.id
      LEFT JOIN atividade_aluno aa
        ON aa.atividade_id = a.id AND aa.aluno_id = p_aluno
     WHERE t.classe_id = p_classe
     GROUP BY t.id
  ), professor_por_topico AS (
    SELECT topico_id, sum(total)::bigint AS total, sum(feitos)::bigint AS feitos
      FROM professor
     GROUP BY topico_id
  ), personalizado AS (
    SELECT topico_id, count(*)::bigint AS total,
           count(*) FILTER (
             WHERE position('concl' IN lower(coalesce(status, ''))) > 0
                OR coalesce(percentual_concluido, 0) >= 100
           )::bigint AS feitos
      FROM personalizacao_item_progresso
     WHERE aluno_id = p_aluno
       AND classe_id = p_classe
       AND left(coalesce(item_key, ''), 6) <> 'slide:'
     GROUP BY topico_id
  ), efetivo AS (
    SELECT t.id AS topico_id,
           CASE WHEN coalesce(p.total, 0) > 0 THEN p.total
                ELSE coalesce(pr.total, 0) END AS total,
           CASE WHEN coalesce(p.total, 0) > 0 THEN p.feitos
                ELSE coalesce(pr.feitos, 0) END AS feitos
      FROM topicos t
      LEFT JOIN professor_por_topico pr ON pr.topico_id = t.id
      LEFT JOIN personalizado p ON p.topico_id = t.id
     WHERE t.classe_id = p_classe
  )
  SELECT coalesce(sum(total), 0), coalesce(sum(feitos), 0)
    INTO v_total, v_feitos
    FROM efetivo;

  IF v_total > 0 THEN
    v_pct := round((v_feitos::numeric / v_total::numeric) * 100, 2);
  END IF;
  v_pct := greatest(0, least(100, v_pct));

  -- Class time is the sum of topic active time. Topic time is already the
  -- active_sec aggregate and therefore must not be added to item time again.
  SELECT coalesce(round(sum(greatest(0, coalesce(ta.tempo_gasto_min, 0)))::numeric, 2), 0)
    INTO v_tempo
    FROM topicos t
    LEFT JOIN topico_aluno ta
      ON ta.topico_id = t.id AND ta.aluno_id = p_aluno
   WHERE t.classe_id = p_classe;

  SELECT column_name INTO v_col_pct
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'classe_aluno'
     AND column_name IN ('porcentagemConcluida', 'porcentagemconcluida')
   LIMIT 1;
  IF v_col_pct IS NULL THEN
    RETURN;
  END IF;

  SELECT column_name INTO v_col_done
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'classe_aluno'
     AND column_name IN ('isComplete', 'iscomplete')
   LIMIT 1;
  SELECT column_name INTO v_col_tempo
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'classe_aluno'
     AND column_name IN ('tempoGastoMin', 'tempogastomin')
   LIMIT 1;

  v_sql := 'UPDATE classe_aluno SET ' || quote_ident(v_col_pct) || ' = $1';
  IF v_col_done IS NOT NULL THEN
    v_sql := v_sql || ', ' || quote_ident(v_col_done) || ' = ($1 >= 100)';
  END IF;
  IF v_col_tempo IS NOT NULL THEN
    v_sql := v_sql || ', ' || quote_ident(v_col_tempo) || ' = $4';
  END IF;
  v_sql := v_sql || ' WHERE aluno_id = $2 AND classe_id = $3';
  EXECUTE v_sql USING v_pct, p_aluno, p_classe, v_tempo;
END;
$fn$;
"""


RECALCULAR = """
DO $fn$
DECLARE
  classe RECORD;
BEGIN
  FOR classe IN SELECT aluno_id, classe_id FROM public.classe_aluno LOOP
    PERFORM public.trailup_recalcular_classe_aluno(classe.aluno_id, classe.classe_id);
  END LOOP;
END
$fn$;
"""


def upgrade() -> None:
    op.execute(FUNCAO_CLASSE)
    op.execute(RECALCULAR)


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: manter percentual ponderado")
