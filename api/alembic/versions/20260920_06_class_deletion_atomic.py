"""Atomic class deletion and enrollment cleanup, without an API round-trip."""
from alembic import op

revision = '20260920_06'
down_revision = '20260920_05'
branch_labels = None
depends_on = None


SQL = r"""
-- Preserve the canonical progress calculation, but do not recreate a child
-- while its topic is being removed by ON DELETE CASCADE.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.trailup_recalcular_topico_aluno(uuid,bigint)'::regprocedure)
    INTO definition;
  IF position('IF p_aluno IS NULL OR p_topico IS NULL THEN RETURN; END IF;' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected topic progress function; review migration';
  END IF;
  definition := replace(definition,
    'IF p_aluno IS NULL OR p_topico IS NULL THEN RETURN; END IF;',
    'IF p_aluno IS NULL OR p_topico IS NULL THEN RETURN; END IF;
     IF NOT EXISTS (SELECT 1 FROM public.topicos WHERE id=p_topico) THEN RETURN; END IF;');
  EXECUTE definition;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.trg_limpar_dados_aluno_classe()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
BEGIN
  -- Same scope as the old student-cleanup job: only this student's data.
  -- Shared/profile content and cards must survive enrollment removal.
  DELETE FROM public.personalizacao_percurso
    WHERE aluno_id=OLD.aluno_id AND classe_id=OLD.classe_id;
  DELETE FROM public.personalizacao_item_progresso
    WHERE aluno_id=OLD.aluno_id AND classe_id=OLD.classe_id;
  DELETE FROM public.trilha_checkpoint_navegacao
    WHERE aluno_id=OLD.aluno_id AND classe_id=OLD.classe_id;
  DELETE FROM public.materiais_gerados
    WHERE aluno_id=OLD.aluno_id AND conteudo_id IN (
      SELECT c.id FROM public.conteudos c JOIN public.topicos t ON t.id=c.topico_id
      WHERE t.classe_id=OLD.classe_id);
  DELETE FROM public.conteudo_aluno
    WHERE aluno_id=OLD.aluno_id AND conteudo_id IN (
      SELECT c.id FROM public.conteudos c JOIN public.topicos t ON t.id=c.topico_id
      WHERE t.classe_id=OLD.classe_id);
  DELETE FROM public.questao_aluno
    WHERE aluno_id=OLD.aluno_id AND atividade_id IN (
      SELECT a.id FROM public.atividades a JOIN public.topicos t ON t.id=a.topico_id
      WHERE t.classe_id=OLD.classe_id);
  DELETE FROM public.atividade_aluno
    WHERE aluno_id=OLD.aluno_id AND atividade_id IN (
      SELECT a.id FROM public.atividades a JOIN public.topicos t ON t.id=a.topico_id
      WHERE t.classe_id=OLD.classe_id);
  -- Last: deleting item progress above can recalculate the topic aggregate.
  DELETE FROM public.topico_aluno
    WHERE aluno_id=OLD.aluno_id AND topico_id IN (
      SELECT id FROM public.topicos WHERE classe_id=OLD.classe_id);
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_classe(p_classe_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_topicos bigint[];
  v_conteudos bigint[];
  v_atividades bigint[];
BEGIN
  -- Check ownership BEFORE touching any dependent row; no service key in UI.
  PERFORM 1 FROM public.classe
    WHERE id=p_classe_id AND professor_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Classe não encontrada ou sem permissão para excluir.' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(array_agg(id), ARRAY[]::bigint[]) INTO v_topicos
    FROM public.topicos WHERE classe_id=p_classe_id;
  SELECT coalesce(array_agg(id), ARRAY[]::bigint[]) INTO v_conteudos
    FROM public.conteudos WHERE topico_id=ANY(v_topicos);
  SELECT coalesce(array_agg(id), ARRAY[]::bigint[]) INTO v_atividades
    FROM public.atividades WHERE topico_id=ANY(v_topicos);

  DELETE FROM public.classe_aluno WHERE classe_id=p_classe_id;
  DELETE FROM public.personalizacao_percurso WHERE classe_id=p_classe_id;
  DELETE FROM public.personalizacao_item_progresso WHERE classe_id=p_classe_id;
  -- Keep saved bag copies; detach only references to this class's sources.
  UPDATE public.bag_itens SET
    classe_id=CASE WHEN classe_id=p_classe_id THEN NULL ELSE classe_id END,
    topico_id=CASE WHEN topico_id=ANY(v_topicos) THEN NULL ELSE topico_id END,
    conteudo_id=CASE WHEN conteudo_id=ANY(v_conteudos) THEN NULL ELSE conteudo_id END
    WHERE classe_id=p_classe_id OR topico_id=ANY(v_topicos) OR conteudo_id=ANY(v_conteudos);
  DELETE FROM public.guilda_evento_snapshot WHERE classe_id=p_classe_id;
  DELETE FROM public.classe_perfil_summary WHERE classe_id=p_classe_id;
  DELETE FROM public.cards_personalizados
    WHERE classe_id=p_classe_id OR topico_id=ANY(v_topicos) OR conteudo_id=ANY(v_conteudos);
  DELETE FROM public.fontes_personalizacao
    WHERE classe_id=p_classe_id OR topico_id=ANY(v_topicos) OR conteudo_id=ANY(v_conteudos);
  DELETE FROM public.materiais_gerados WHERE conteudo_id=ANY(v_conteudos);
  DELETE FROM public.conteudo_personalizado
    WHERE classe_id=p_classe_id OR topico_id=ANY(v_topicos) OR conteudo_id=ANY(v_conteudos);
  DELETE FROM public.atividade_conteudos WHERE atividade_id=ANY(v_atividades);
  DELETE FROM public.questao_aluno WHERE atividade_id=ANY(v_atividades);
  -- The remaining class-owned rows already have ON DELETE CASCADE/SET NULL.
  -- Storage files are deliberately untouched: never delete them before commit.
  DELETE FROM public.classe WHERE id=p_classe_id;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.excluir_classe(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_classe(bigint) TO authenticated;
NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    raise RuntimeError('Manual downgrade required: do not restore non-atomic deletion.')
