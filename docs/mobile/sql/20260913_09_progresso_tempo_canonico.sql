-- Mantém o Supabase alinhado ao Alembic 20260913_09.
-- active_sec é o tempo ativo de cada lote; não usar dwell_sec para o total.
BEGIN;

CREATE OR REPLACE FUNCTION public.trailup_tempo_telemetria_min(
  p_aluno uuid, p_scope text,
  p_topico bigint, p_conteudo bigint, p_atividade bigint
)
RETURNS numeric LANGUAGE sql STABLE
SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE(round(sum(e.active_sec)::numeric / 60.0, 2), 0)
    FROM public.telemetria_time_metric_entries e
   WHERE e.aluno_id = p_aluno AND e.scope = p_scope
     AND (p_topico IS NULL OR e.topico_id = p_topico)
     AND (p_conteudo IS NULL OR e.conteudo_id = p_conteudo)
     AND (p_atividade IS NULL OR e.atividade_id = p_atividade)
$fn$;

UPDATE public.topico_aluno ta
   SET tempo_gasto_min = public.trailup_tempo_telemetria_min(ta.aluno_id, 'topic', ta.topico_id, NULL, NULL), updated_at = now()
 WHERE EXISTS (SELECT 1 FROM public.telemetria_time_metric_entries e WHERE e.aluno_id=ta.aluno_id AND e.topico_id=ta.topico_id AND e.scope='topic');

UPDATE public.conteudo_aluno ca
   SET tempo_gasto_min = public.trailup_tempo_telemetria_min(ca.aluno_id, 'content', NULL, ca.conteudo_id, NULL), updated_at = now()
 WHERE EXISTS (SELECT 1 FROM public.telemetria_time_metric_entries e WHERE e.aluno_id=ca.aluno_id AND e.conteudo_id=ca.conteudo_id AND e.scope='content');

UPDATE public.atividade_aluno aa
   SET tempo_gasto_min = public.trailup_tempo_telemetria_min(aa.aluno_id, 'activity', NULL, NULL, aa.atividade_id), updated_at = now()
 WHERE EXISTS (SELECT 1 FROM public.telemetria_time_metric_entries e WHERE e.aluno_id=aa.aluno_id AND e.atividade_id=aa.atividade_id AND e.scope='activity');

COMMIT;
