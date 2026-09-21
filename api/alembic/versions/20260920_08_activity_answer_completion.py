"""Derive question-activity completion from persisted answers, not client callbacks."""
from alembic import op

revision = '20260920_08'
down_revision = '20260920_07'
branch_labels = None
depends_on = None

SQL = r"""
CREATE OR REPLACE FUNCTION public.trailup_recalcular_atividade_respostas(p_aluno uuid, p_atividade bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_total bigint; v_feitas bigint; v_pct numeric;
BEGIN
  -- Do not recreate progress during removal of a student or class.
  IF NOT EXISTS (
    SELECT 1 FROM public.atividades a JOIN public.topicos t ON t.id=a.topico_id
    JOIN public.classe_aluno ca ON ca.classe_id=t.classe_id AND ca.aluno_id=p_aluno
    WHERE a.id=p_atividade
  ) THEN RETURN; END IF;
  SELECT count(*), count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM public.questao_aluno qa
    WHERE qa.questao_id=q.id AND qa.atividade_id=q.atividade_id AND qa.aluno_id=p_aluno
      AND nullif(btrim(qa.resposta),'') IS NOT NULL
  )) INTO v_total,v_feitas FROM public.questoes q WHERE q.atividade_id=p_atividade;
  IF v_total=0 THEN RETURN; END IF;
  v_pct := round(100.0*v_feitas/v_total,2);
  INSERT INTO public.atividade_aluno(aluno_id,atividade_id,status,percentual_concluido)
  VALUES(p_aluno,p_atividade,
    CASE WHEN v_feitas=v_total THEN 'concluido'::public.status_atividade
         WHEN v_feitas>0 THEN 'em andamento'::public.status_atividade
         ELSE 'não iniciado'::public.status_atividade END,v_pct)
  ON CONFLICT(aluno_id,atividade_id) DO UPDATE SET
    status=EXCLUDED.status,percentual_concluido=EXCLUDED.percentual_concluido;
  -- Score, accuracy, time and answers are deliberately not overwritten.
END; $fn$;
REVOKE ALL ON FUNCTION public.trailup_recalcular_atividade_respostas(uuid,bigint) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.trailup_progresso_after_resposta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.trailup_recalcular_atividade_respostas(OLD.aluno_id,OLD.atividade_id);
  END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP='INSERT' OR
      (NEW.aluno_id,NEW.atividade_id) IS DISTINCT FROM (OLD.aluno_id,OLD.atividade_id)) THEN
    PERFORM public.trailup_recalcular_atividade_respostas(NEW.aluno_id,NEW.atividade_id);
  END IF;
  RETURN NULL;
END; $fn$;
REVOKE ALL ON FUNCTION public.trailup_progresso_after_resposta() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_questao_aluno_progresso AFTER INSERT OR UPDATE OR DELETE ON public.questao_aluno
FOR EACH ROW EXECUTE FUNCTION public.trailup_progresso_after_resposta();

CREATE FUNCTION public.trailup_progresso_after_perfil() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE r record;
BEGIN
  FOR r IN SELECT t.id FROM public.topicos t JOIN public.classe_aluno ca
    ON ca.classe_id=t.classe_id WHERE ca.aluno_id=NEW.id
  LOOP
    PERFORM public.trailup_recalcular_topico_aluno(NEW.id,r.id);
  END LOOP;
  FOR r IN SELECT classe_id FROM public.classe_aluno WHERE aluno_id=NEW.id LOOP
    PERFORM public.trailup_recalcular_classe_aluno(NEW.id,r.classe_id);
  END LOOP;
  RETURN NEW;
END; $fn$;
REVOKE ALL ON FUNCTION public.trailup_progresso_after_perfil() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_alunos_progresso_perfil AFTER UPDATE OF perfil_ativo ON public.alunos
FOR EACH ROW WHEN(OLD.perfil_ativo IS DISTINCT FROM NEW.perfil_ativo)
EXECUTE FUNCTION public.trailup_progresso_after_perfil();

-- Restore only conclusions evidenced by every question having a stored answer.
-- No activity without questions/answers is completed by this repair.
DO $repair$ DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT qa.aluno_id,qa.atividade_id FROM public.questao_aluno qa
    JOIN public.atividades a ON a.id=qa.atividade_id JOIN public.topicos t ON t.id=a.topico_id
    JOIN public.classe_aluno ca ON ca.classe_id=t.classe_id AND ca.aluno_id=qa.aluno_id
  LOOP
    PERFORM public.trailup_recalcular_atividade_respostas(r.aluno_id,r.atividade_id);
  END LOOP;
END; $repair$;
NOTIFY pgrst,'reload schema';
"""


def upgrade():
    op.execute(SQL)


def downgrade():
    op.execute('DROP TRIGGER IF EXISTS trg_alunos_progresso_perfil ON public.alunos')
    op.execute('DROP FUNCTION IF EXISTS public.trailup_progresso_after_perfil()')
    op.execute('DROP TRIGGER IF EXISTS trg_questao_aluno_progresso ON public.questao_aluno')
    op.execute('DROP FUNCTION IF EXISTS public.trailup_progresso_after_resposta()')
    op.execute('DROP FUNCTION IF EXISTS public.trailup_recalcular_atividade_respostas(uuid,bigint)')
