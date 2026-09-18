"""Use active telemetry batches and repair the canonical progress totals.

The mobile collector sends one batch at a time.  ``active_sec`` is therefore
the authoritative study time for topic, content and activity metrics.  This
revision also replays the database progress functions so the ranking, trail
and profile metrics start from the same values after older client writes.
"""

import sqlalchemy as sa

from alembic import op

revision = "20260913_09"
down_revision = "20260913_08"
branch_labels = None
depends_on = None


TEMPO_ATIVO = """
CREATE OR REPLACE FUNCTION public.trailup_tempo_telemetria_min(
  p_aluno uuid, p_scope text,
  p_topico bigint, p_conteudo bigint, p_atividade bigint
)
RETURNS numeric LANGUAGE sql STABLE
SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE(round(sum(e.active_sec)::numeric / 60.0, 2), 0)
    FROM public.telemetria_time_metric_entries e
   WHERE e.aluno_id = p_aluno
     AND e.scope = p_scope
     AND (p_topico IS NULL OR e.topico_id = p_topico)
     AND (p_conteudo IS NULL OR e.conteudo_id = p_conteudo)
     AND (p_atividade IS NULL OR e.atividade_id = p_atividade)
$fn$;
"""


RECALCULAR = """
DO $fn$
DECLARE
  item RECORD;
  classe RECORD;
BEGIN
  -- O trigger já contém a fórmula única de conclusão (professor + itens
  -- personalizados). Reexecutá-la corrige linhas antigas sem inventar
  -- percentuais no cliente.
  FOR item IN
    SELECT DISTINCT aluno_id, topico_id
      FROM (
        SELECT aluno_id, topico_id FROM public.topico_aluno
        UNION ALL
        SELECT aluno_id, topico_id FROM public.personalizacao_item_progresso
      ) itens
     WHERE aluno_id IS NOT NULL AND topico_id IS NOT NULL
  LOOP
    PERFORM public.trailup_recalcular_topico_aluno(item.aluno_id, item.topico_id);
  END LOOP;

  FOR classe IN
    SELECT DISTINCT ca.aluno_id, ca.classe_id
      FROM public.classe_aluno ca
      JOIN public.topicos t ON t.classe_id = ca.classe_id
  LOOP
    PERFORM public.trailup_recalcular_classe_aluno(classe.aluno_id, classe.classe_id);
  END LOOP;
END
$fn$;
"""


REBACKFILL_TEMPO = """
UPDATE public.topico_aluno ta
   SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
         ta.aluno_id, 'topic', ta.topico_id, NULL, NULL),
       updated_at = now()
 WHERE EXISTS (
   SELECT 1 FROM public.telemetria_time_metric_entries e
    WHERE e.aluno_id = ta.aluno_id AND e.topico_id = ta.topico_id
      AND e.scope = 'topic'
 );

UPDATE public.conteudo_aluno ca
   SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
         ca.aluno_id, 'content', NULL, ca.conteudo_id, NULL),
       updated_at = now()
 WHERE EXISTS (
   SELECT 1 FROM public.telemetria_time_metric_entries e
    WHERE e.aluno_id = ca.aluno_id AND e.conteudo_id = ca.conteudo_id
      AND e.scope = 'content'
 );

UPDATE public.atividade_aluno aa
   SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
         aa.aluno_id, 'activity', NULL, NULL, aa.atividade_id),
       updated_at = now()
 WHERE EXISTS (
   SELECT 1 FROM public.telemetria_time_metric_entries e
    WHERE e.aluno_id = aa.aluno_id AND e.atividade_id = aa.atividade_id
      AND e.scope = 'activity'
 );

-- Cards e outros materiais personalizados não têm uma tabela de item físico;
-- seu livro-caixa é personalizacao_item_progresso. Só substitui quando existe
-- uma medição correspondente, preservando dados anteriores sem telemetria.
UPDATE public.personalizacao_item_progresso pip
   SET tempo_gasto_min = x.tempo_min,
       updated_at = now()
  FROM (
    SELECT pip2.id,
           round(sum(e.active_sec)::numeric / 60.0, 2) AS tempo_min
      FROM public.personalizacao_item_progresso pip2
      JOIN public.telemetria_time_metric_entries e
        ON e.aluno_id = pip2.aluno_id
       AND e.topico_id = pip2.topico_id
       AND e.scope IN ('material', 'card', 'cards')
       AND (
         e.material_key = pip2.item_key OR
         e.item_key = pip2.item_key OR
         e.entry_key = pip2.item_key
       )
     GROUP BY pip2.id
  ) x
 WHERE pip.id = x.id;
"""


def upgrade() -> None:
    op.execute(sa.text(TEMPO_ATIVO))
    op.execute(sa.text(REBACKFILL_TEMPO))
    op.execute(sa.text(RECALCULAR))


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: active_sec é a fonte canônica de tempo")
