"""Use only the active, ready personalized journey in completion totals.

Progress rows survive content regeneration and may exist for every BrainHex
profile.  Counting all of them makes the same student appear incomplete in
the trail and in the ranking even when the active journey is complete.
"""

from alembic import op

revision = "20260913_15"
down_revision = "20260913_14"
branch_labels = None
depends_on = None


FUNCAO_TOPICO = """
CREATE OR REPLACE FUNCTION public.trailup_recalcular_topico_aluno(
  p_aluno uuid, p_topico bigint
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_total bigint := 0;
  v_feitos bigint := 0;
  v_pct numeric := 0;
  v_status status_atividade;
BEGIN
  IF p_aluno IS NULL OR p_topico IS NULL THEN RETURN; END IF;

  WITH professor AS (
    SELECT count(*)::bigint AS total,
           count(*) FILTER (WHERE position('concl' IN lower(coalesce(ca.status::text, ''))) > 0
                             OR coalesce(ca.percentual_concluido, 0) >= 100)::bigint AS feitos
      FROM conteudos c
      LEFT JOIN conteudo_aluno ca ON ca.conteudo_id = c.id AND ca.aluno_id = p_aluno
     WHERE c.topico_id = p_topico
    UNION ALL
    SELECT count(*)::bigint,
           count(*) FILTER (WHERE position('concl' IN lower(coalesce(aa.status::text, ''))) > 0
                             OR coalesce(aa.percentual_concluido, 0) >= 100)::bigint
      FROM atividades a
      LEFT JOIN atividade_aluno aa ON aa.atividade_id = a.id AND aa.aluno_id = p_aluno
     WHERE a.topico_id = p_topico
  ), professor_total AS (
    SELECT coalesce(sum(total), 0)::bigint AS total,
           coalesce(sum(feitos), 0)::bigint AS feitos FROM professor
  ), personalizado AS (
    SELECT count(*)::bigint AS total,
           count(*) FILTER (WHERE position('concl' IN lower(coalesce(pip.status, ''))) > 0
                             OR coalesce(pip.percentual_concluido, 0) >= 100)::bigint AS feitos
      FROM personalizacao_item_progresso pip
      JOIN conteudo_personalizado cp ON cp.id = pip.personalizacao_id
      JOIN alunos al ON al.id = pip.aluno_id
     WHERE pip.aluno_id = p_aluno
       AND pip.classe_id = (SELECT t.classe_id FROM topicos t WHERE t.id = p_topico)
       AND pip.topico_id = p_topico
       AND cp.aluno_id = p_aluno
       AND cp.classe_id = pip.classe_id
       AND cp.brainhex_profile_key = al.perfil_ativo
       AND lower(coalesce(cp.status, '')) = 'pronto'
       AND left(coalesce(pip.item_key, ''), 6) <> 'slide:'
  ), efetivo AS (
    SELECT CASE WHEN p.total > 0 THEN p.total ELSE pr.total END AS total,
           CASE WHEN p.total > 0 THEN p.feitos ELSE pr.feitos END AS feitos
      FROM professor_total pr CROSS JOIN personalizado p
  )
  SELECT coalesce(sum(total), 0), coalesce(sum(feitos), 0) INTO v_total, v_feitos FROM efetivo;

  IF v_total > 0 THEN v_pct := round((v_feitos::numeric / v_total::numeric) * 100, 2); END IF;
  v_pct := greatest(0, least(100, v_pct));
  v_status := CASE WHEN v_pct >= 100 THEN 'concluido'
                   WHEN v_pct > 0 THEN 'em andamento' ELSE 'não iniciado' END;

  INSERT INTO topico_aluno (aluno_id, topico_id, percentual_concluido, status, updated_at)
  VALUES (p_aluno, p_topico, v_pct, v_status, now())
  ON CONFLICT (aluno_id, topico_id) DO UPDATE
    SET percentual_concluido = EXCLUDED.percentual_concluido,
        status = EXCLUDED.status, updated_at = now();
END;
$fn$;
"""


FUNCAO_CLASSE = """
CREATE OR REPLACE FUNCTION public.trailup_recalcular_classe_aluno(
  p_aluno uuid, p_classe bigint
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_total bigint := 0;
  v_feitos bigint := 0;
  v_pct numeric := 0;
  v_tempo numeric := 0;
  v_col_pct text;
  v_col_done text;
  v_col_tempo text;
  v_sql text;
BEGIN
  IF p_aluno IS NULL OR p_classe IS NULL THEN RETURN; END IF;

  WITH professor AS (
    SELECT t.id AS topico_id, count(c.id)::bigint AS total,
           count(c.id) FILTER (WHERE position('concl' IN lower(coalesce(ca.status::text, ''))) > 0
                                OR coalesce(ca.percentual_concluido, 0) >= 100)::bigint AS feitos
      FROM topicos t LEFT JOIN conteudos c ON c.topico_id = t.id
      LEFT JOIN conteudo_aluno ca ON ca.conteudo_id = c.id AND ca.aluno_id = p_aluno
     WHERE t.classe_id = p_classe GROUP BY t.id
    UNION ALL
    SELECT t.id, count(a.id)::bigint,
           count(a.id) FILTER (WHERE position('concl' IN lower(coalesce(aa.status::text, ''))) > 0
                                OR coalesce(aa.percentual_concluido, 0) >= 100)::bigint
      FROM topicos t LEFT JOIN atividades a ON a.topico_id = t.id
      LEFT JOIN atividade_aluno aa ON aa.atividade_id = a.id AND aa.aluno_id = p_aluno
     WHERE t.classe_id = p_classe GROUP BY t.id
  ), professor_por_topico AS (
    SELECT topico_id, sum(total)::bigint AS total, sum(feitos)::bigint AS feitos
      FROM professor GROUP BY topico_id
  ), personalizado AS (
    SELECT pip.topico_id, count(*)::bigint AS total,
           count(*) FILTER (WHERE position('concl' IN lower(coalesce(pip.status, ''))) > 0
                             OR coalesce(pip.percentual_concluido, 0) >= 100)::bigint AS feitos
      FROM personalizacao_item_progresso pip
      JOIN conteudo_personalizado cp ON cp.id = pip.personalizacao_id
      JOIN alunos al ON al.id = pip.aluno_id
     WHERE pip.aluno_id = p_aluno AND pip.classe_id = p_classe
       AND cp.aluno_id = p_aluno AND cp.classe_id = p_classe
       AND cp.brainhex_profile_key = al.perfil_ativo
       AND lower(coalesce(cp.status, '')) = 'pronto'
       AND left(coalesce(pip.item_key, ''), 6) <> 'slide:'
     GROUP BY pip.topico_id
  ), efetivo AS (
    SELECT t.id AS topico_id,
           CASE WHEN coalesce(p.total, 0) > 0 THEN p.total ELSE coalesce(pr.total, 0) END AS total,
           CASE WHEN coalesce(p.total, 0) > 0 THEN p.feitos ELSE coalesce(pr.feitos, 0) END AS feitos
      FROM topicos t LEFT JOIN professor_por_topico pr ON pr.topico_id = t.id
      LEFT JOIN personalizado p ON p.topico_id = t.id
     WHERE t.classe_id = p_classe
  )
  SELECT coalesce(sum(total), 0), coalesce(sum(feitos), 0) INTO v_total, v_feitos FROM efetivo;
  IF v_total > 0 THEN v_pct := round((v_feitos::numeric / v_total::numeric) * 100, 2); END IF;
  v_pct := greatest(0, least(100, v_pct));

  SELECT coalesce(round(sum(greatest(0, coalesce(ta.tempo_gasto_min, 0)))::numeric, 2), 0)
    INTO v_tempo FROM topicos t LEFT JOIN topico_aluno ta
      ON ta.topico_id = t.id AND ta.aluno_id = p_aluno WHERE t.classe_id = p_classe;
  SELECT column_name INTO v_col_pct FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'classe_aluno'
     AND column_name IN ('porcentagemConcluida', 'porcentagemconcluida') LIMIT 1;
  IF v_col_pct IS NULL THEN RETURN; END IF;
  SELECT column_name INTO v_col_done FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'classe_aluno'
     AND column_name IN ('isComplete', 'iscomplete') LIMIT 1;
  SELECT column_name INTO v_col_tempo FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'classe_aluno'
     AND column_name IN ('tempoGastoMin', 'tempogastomin') LIMIT 1;
  v_sql := 'UPDATE classe_aluno SET ' || quote_ident(v_col_pct) || ' = $1';
  IF v_col_done IS NOT NULL THEN v_sql := v_sql || ', ' || quote_ident(v_col_done) || ' = ($1 >= 100)'; END IF;
  IF v_col_tempo IS NOT NULL THEN v_sql := v_sql || ', ' || quote_ident(v_col_tempo) || ' = $4'; END IF;
  v_sql := v_sql || ' WHERE aluno_id = $2 AND classe_id = $3';
  EXECUTE v_sql USING v_pct, p_aluno, p_classe, v_tempo;
END;
$fn$;
"""


RECALCULAR = """
DO $fn$
DECLARE r record;
BEGIN
  FOR r IN SELECT aluno_id, topico_id FROM topico_aluno LOOP
    PERFORM public.trailup_recalcular_topico_aluno(r.aluno_id, r.topico_id);
  END LOOP;
  FOR r IN SELECT aluno_id, classe_id FROM classe_aluno LOOP
    PERFORM public.trailup_recalcular_classe_aluno(r.aluno_id, r.classe_id);
  END LOOP;
END
$fn$;
"""


def upgrade() -> None:
    op.execute(FUNCAO_TOPICO)
    op.execute(FUNCAO_CLASSE)
    op.execute(RECALCULAR)


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: manter percentual por perfil ativo")
