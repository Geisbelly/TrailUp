"""Read study presence from saved evidence, independently of reward events."""
from alembic import op

revision = '20260920_10'
down_revision = '20260920_09'
branch_labels = None
depends_on = None

SQL = r"""
CREATE FUNCTION public.trailup_resumo_presenca(p_timezone text DEFAULT 'America/Sao_Paulo')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'autenticacao_necessaria' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN
    RAISE EXCEPTION 'fuso_invalido';
  END IF;
  WITH evidence AS (
    SELECT criado_em AT TIME ZONE 'UTC' AS happened_at FROM public.eventos_aluno
      WHERE aluno_id=auth.uid() AND tipo ~ '^(topico_|conteudo_|atividade_|presenca_aula$|participacao_aula$)'
    UNION SELECT criado_em FROM public.questao_aluno
      WHERE aluno_id=auth.uid() AND nullif(btrim(resposta),'') IS NOT NULL
    UNION SELECT ultima_visualizacao AT TIME ZONE 'UTC' FROM public.topico_aluno WHERE aluno_id=auth.uid()
    UNION SELECT ultima_visualizacao AT TIME ZONE 'UTC' FROM public.conteudo_aluno WHERE aluno_id=auth.uid()
    UNION SELECT ultima_visualizacao AT TIME ZONE 'UTC' FROM public.atividade_aluno WHERE aluno_id=auth.uid()
    UNION SELECT updated_at FROM public.personalizacao_item_progresso
      WHERE aluno_id=auth.uid() AND (percentual_concluido>0 OR tempo_gasto_min>0)
    UNION SELECT captured_at FROM public.telemetria_time_metric_entries
      WHERE aluno_id=auth.uid() AND scope='topic' AND active_sec>0
    UNION SELECT criado_em FROM public.estudo_intervalos WHERE aluno_id=auth.uid()
  ), valid AS (
    SELECT happened_at,(happened_at AT TIME ZONE p_timezone)::date AS day
      FROM evidence WHERE happened_at IS NOT NULL AND happened_at<=now()
  ), days AS (
    SELECT (now() AT TIME ZONE p_timezone)::date-6+i AS day FROM generate_series(0,6) i
  ), daily AS (
    SELECT days.day,count(valid.happened_at) AS records FROM days LEFT JOIN valid USING(day) GROUP BY days.day
  ) SELECT jsonb_build_object(
    'dias_ativos',(SELECT count(*) FROM daily WHERE records>0),
    'registros_recentes',(SELECT coalesce(sum(records),0) FROM daily),
    'semana_diaria',(SELECT jsonb_agg(records ORDER BY day) FROM daily),
    'ultimo_registro',(SELECT max(happened_at) FROM valid)
  ) INTO result;
  RETURN result;
END; $fn$;
REVOKE ALL ON FUNCTION public.trailup_resumo_presenca(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.trailup_resumo_presenca(text) TO authenticated;
NOTIFY pgrst,'reload schema';
"""


def upgrade():
    op.execute(SQL)


def downgrade():
    op.execute('DROP FUNCTION public.trailup_resumo_presenca(text)')
