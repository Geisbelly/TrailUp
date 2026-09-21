"""Keep non-telemetry time separate and make interval delivery idempotent."""
from alembic import op

revision = '20260920_09'
down_revision = '20260920_08'
branch_labels = None
depends_on = None

SQL = r"""
ALTER TABLE public.topico_aluno ADD COLUMN tempo_direto_min numeric NOT NULL DEFAULT 0;
ALTER TABLE public.conteudo_aluno ADD COLUMN tempo_direto_min numeric NOT NULL DEFAULT 0;
ALTER TABLE public.atividade_aluno ADD COLUMN tempo_direto_min numeric NOT NULL DEFAULT 0;
-- Preserve existing time not represented by telemetry; never invent historical
-- intervals or sum the inclusive topic/content/activity scopes together.
UPDATE public.topico_aluno SET tempo_direto_min=greatest(0,round(tempo_gasto_min::numeric,4)-
  public.trailup_tempo_telemetria_min(aluno_id,'topic',topico_id,NULL,NULL));
UPDATE public.conteudo_aluno SET tempo_direto_min=greatest(0,tempo_gasto_min-
  public.trailup_tempo_telemetria_min(aluno_id,'content',NULL,conteudo_id,NULL));
UPDATE public.atividade_aluno SET tempo_direto_min=greatest(0,tempo_gasto_min-
  public.trailup_tempo_telemetria_min(aluno_id,'activity',NULL,NULL,atividade_id));

CREATE TABLE public.estudo_intervalos (
  id uuid PRIMARY KEY,
  aluno_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  classe_id bigint NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  topico_id bigint NOT NULL REFERENCES public.topicos(id) ON DELETE CASCADE,
  tempo_min numeric NOT NULL CHECK(tempo_min>0 AND tempo_min<=1440),
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.estudo_intervalos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.estudo_intervalos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.estudo_intervalos TO authenticated;
CREATE POLICY estudo_intervalos_sel ON public.estudo_intervalos FOR SELECT TO authenticated
USING(aluno_id=auth.uid());

CREATE OR REPLACE FUNCTION public.trailup_registrar_intervalo_estudo(
  p_intervalo uuid,p_aluno uuid,p_topico bigint,p_conteudo bigint,p_atividade bigint,p_tempo_min numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_classe bigint; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_aluno IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'aluno_invalido' USING ERRCODE='42501';
  END IF;
  SELECT t.classe_id INTO v_classe FROM public.topicos t
    JOIN public.classe_aluno ca ON ca.classe_id=t.classe_id AND ca.aluno_id=p_aluno
    WHERE t.id=p_topico;
  IF v_classe IS NULL THEN RAISE EXCEPTION 'matricula_invalida' USING ERRCODE='42501'; END IF;
  IF p_intervalo IS NULL OR p_tempo_min IS NULL OR p_tempo_min<=0 OR p_tempo_min>1440 THEN
    RAISE EXCEPTION 'intervalo_invalido';
  END IF;
  IF p_conteudo IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.conteudos WHERE id=p_conteudo AND topico_id=p_topico) THEN
    RAISE EXCEPTION 'conteudo_invalido';
  END IF;
  IF p_atividade IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.atividades WHERE id=p_atividade AND topico_id=p_topico) THEN
    RAISE EXCEPTION 'atividade_invalida';
  END IF;
  INSERT INTO public.estudo_intervalos(id,aluno_id,classe_id,topico_id,tempo_min)
    VALUES(p_intervalo,p_aluno,v_classe,p_topico,p_tempo_min)
    ON CONFLICT(id) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.topico_aluno(aluno_id,topico_id,tempo_direto_min,tempo_gasto_min)
    VALUES(p_aluno,p_topico,p_tempo_min,p_tempo_min+public.trailup_tempo_telemetria_min(p_aluno,'topic',p_topico,NULL,NULL))
    ON CONFLICT(aluno_id,topico_id) DO UPDATE SET
      tempo_direto_min=topico_aluno.tempo_direto_min+p_tempo_min,
      tempo_gasto_min=topico_aluno.tempo_direto_min+p_tempo_min+public.trailup_tempo_telemetria_min(p_aluno,'topic',p_topico,NULL,NULL),
      ultima_visualizacao=now();
  IF p_conteudo IS NOT NULL THEN
    INSERT INTO public.conteudo_aluno(aluno_id,conteudo_id,tempo_direto_min,tempo_gasto_min)
      VALUES(p_aluno,p_conteudo,p_tempo_min,p_tempo_min+public.trailup_tempo_telemetria_min(p_aluno,'content',NULL,p_conteudo,NULL))
      ON CONFLICT(aluno_id,conteudo_id) DO UPDATE SET
        tempo_direto_min=conteudo_aluno.tempo_direto_min+p_tempo_min,
        tempo_gasto_min=conteudo_aluno.tempo_direto_min+p_tempo_min+public.trailup_tempo_telemetria_min(p_aluno,'content',NULL,p_conteudo,NULL),
        ultima_visualizacao=now();
  END IF;
  IF p_atividade IS NOT NULL THEN
    INSERT INTO public.atividade_aluno(aluno_id,atividade_id,tempo_direto_min,tempo_gasto_min)
      VALUES(p_aluno,p_atividade,p_tempo_min,p_tempo_min+public.trailup_tempo_telemetria_min(p_aluno,'activity',NULL,NULL,p_atividade))
      ON CONFLICT(aluno_id,atividade_id) DO UPDATE SET
        tempo_direto_min=atividade_aluno.tempo_direto_min+p_tempo_min,
        tempo_gasto_min=atividade_aluno.tempo_direto_min+p_tempo_min+public.trailup_tempo_telemetria_min(p_aluno,'activity',NULL,NULL,p_atividade),
        ultima_visualizacao=now();
  END IF;
  PERFORM public.trailup_recalcular_topico_aluno(p_aluno,p_topico);
  PERFORM public.trailup_recalcular_classe_aluno(p_aluno,v_classe);
END; $fn$;
REVOKE ALL ON FUNCTION public.trailup_registrar_intervalo_estudo(uuid,uuid,bigint,bigint,bigint,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.trailup_registrar_intervalo_estudo(uuid,uuid,bigint,bigint,bigint,numeric) TO authenticated;

-- Old clients still use this signature. Keep them on the same source accounting.
CREATE OR REPLACE FUNCTION public.trailup_registrar_tempo_estudo(
  p_aluno uuid,p_topico bigint,p_conteudo bigint,p_atividade bigint,p_tempo_min numeric
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
BEGIN
  PERFORM public.trailup_registrar_intervalo_estudo(gen_random_uuid(),p_aluno,p_topico,p_conteudo,p_atividade,p_tempo_min);
END; $fn$;
REVOKE ALL ON FUNCTION public.trailup_registrar_tempo_estudo(uuid,bigint,bigint,bigint,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.trailup_registrar_tempo_estudo(uuid,bigint,bigint,bigint,numeric) TO authenticated;

DO $patch$ DECLARE d text;
BEGIN
  d:=pg_get_functiondef('public.trailup_tempo_after_telemetria()'::regprocedure);
  IF position('SET tempo_gasto_min = public.trailup_tempo_telemetria_min(' IN d)=0 THEN
    RAISE EXCEPTION 'Unexpected time trigger definition';
  END IF;
  d:=replace(d,'SET tempo_gasto_min = public.trailup_tempo_telemetria_min(',
    'SET tempo_gasto_min = tempo_direto_min + public.trailup_tempo_telemetria_min(');
  EXECUTE d;
END; $patch$;

CREATE FUNCTION public.trailup_limpar_intervalos_classe() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
  DELETE FROM public.estudo_intervalos WHERE aluno_id=OLD.aluno_id AND classe_id=OLD.classe_id;
  RETURN OLD;
END; $fn$;
REVOKE ALL ON FUNCTION public.trailup_limpar_intervalos_classe() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_limpar_intervalos_classe AFTER DELETE ON public.classe_aluno
FOR EACH ROW EXECUTE FUNCTION public.trailup_limpar_intervalos_classe();
NOTIFY pgrst,'reload schema';
"""


def upgrade():
    op.execute(SQL)


def downgrade():
    raise RuntimeError('Manual downgrade required: preserve recorded study intervals')
