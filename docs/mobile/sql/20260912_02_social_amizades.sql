BEGIN;

CREATE TABLE IF NOT EXISTS public.social_relacionamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_a_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  aluno_b_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  solicitante_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','accepted','declined','blocked')),
  blocked_by_id uuid REFERENCES public.alunos(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT social_par_distinto CHECK (aluno_a_id <> aluno_b_id),
  CONSTRAINT social_solicitante_do_par CHECK (solicitante_id IN (aluno_a_id, aluno_b_id)),
  CONSTRAINT social_bloqueador_do_par CHECK (blocked_by_id IS NULL OR blocked_by_id IN (aluno_a_id, aluno_b_id)),
  CONSTRAINT social_bloqueio_consistente CHECK ((status = 'blocked') = (blocked_by_id IS NOT NULL)),
  UNIQUE (aluno_a_id, aluno_b_id)
);

CREATE INDEX IF NOT EXISTS social_rel_status_a_idx ON public.social_relacionamentos(aluno_a_id, status);
CREATE INDEX IF NOT EXISTS social_rel_status_b_idx ON public.social_relacionamentos(aluno_b_id, status);

CREATE OR REPLACE FUNCTION public.social_par(p_one uuid, p_two uuid)
RETURNS TABLE(aluno_a_id uuid, aluno_b_id uuid)
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT LEAST(p_one,p_two), GREATEST(p_one,p_two);
$fn$;

CREATE OR REPLACE FUNCTION public.social_sao_colegas(p_one uuid, p_two uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
  SELECT p_one <> p_two AND EXISTS (
    SELECT 1 FROM classe_aluno a
    JOIN classe_aluno b ON b.classe_id = a.classe_id
    WHERE a.aluno_id = p_one AND b.aluno_id = p_two
  );
$fn$;

CREATE OR REPLACE FUNCTION public.social_enviar_convite(p_destinatario uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
DECLARE v_me uuid := auth.uid(); v_rel public.social_relacionamentos%ROWTYPE; v_a uuid; v_b uuid;
BEGIN
  IF v_me IS NULL OR NOT public.social_sao_colegas(v_me,p_destinatario) THEN RAISE EXCEPTION 'not_eligible'; END IF;
  SELECT * INTO v_rel FROM public.social_relacionamentos WHERE aluno_a_id=LEAST(v_me,p_destinatario) AND aluno_b_id=GREATEST(v_me,p_destinatario) FOR UPDATE;
  IF FOUND AND v_rel.status='blocked' THEN RAISE EXCEPTION 'blocked';
  ELSIF FOUND AND v_rel.status='accepted' THEN RETURN jsonb_build_object('status','already_friends','relationship_id',v_rel.id);
  ELSIF FOUND AND v_rel.status='pending' AND v_rel.solicitante_id=v_me THEN RETURN jsonb_build_object('status','already_pending','relationship_id',v_rel.id);
  ELSIF FOUND AND v_rel.status='pending' THEN
    UPDATE public.social_relacionamentos SET status='accepted', responded_at=now(), updated_at=now() WHERE id=v_rel.id;
    RETURN jsonb_build_object('status','accepted','relationship_id',v_rel.id);
  END IF;
  SELECT * INTO v_a,v_b FROM public.social_par(v_me,p_destinatario);
  INSERT INTO public.social_relacionamentos(aluno_a_id,aluno_b_id,solicitante_id,status)
  VALUES(v_a,v_b,v_me,'pending');
  RETURN jsonb_build_object('status','pending');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.social_aceitar_convite(p_relationship_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
BEGIN
  UPDATE public.social_relacionamentos SET status='accepted', responded_at=now(), updated_at=now()
   WHERE id=p_relationship_id
     AND (aluno_a_id=auth.uid() OR aluno_b_id=auth.uid())
     AND status='pending' AND solicitante_id <> auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  RETURN jsonb_build_object('status','accepted','relationship_id',p_relationship_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.social_recusar_convite(p_relationship_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
BEGIN
  UPDATE public.social_relacionamentos SET status='declined', responded_at=now(), updated_at=now()
   WHERE id=p_relationship_id AND (aluno_a_id=auth.uid() OR aluno_b_id=auth.uid())
     AND status='pending' AND solicitante_id <> auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  RETURN jsonb_build_object('status','declined');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.social_desfazer_amizade(p_relationship_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
BEGIN
  UPDATE public.social_relacionamentos SET status='declined', responded_at=now(), updated_at=now()
   WHERE id=p_relationship_id AND (aluno_a_id=auth.uid() OR aluno_b_id=auth.uid()) AND status='accepted';
  IF NOT FOUND THEN RAISE EXCEPTION 'friendship_not_found'; END IF;
  RETURN jsonb_build_object('status','declined');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.social_bloquear(p_alvo uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
DECLARE v_me uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_me IS NULL OR NOT public.social_sao_colegas(v_me,p_alvo) THEN RAISE EXCEPTION 'not_eligible'; END IF;
  INSERT INTO public.social_relacionamentos(aluno_a_id,aluno_b_id,solicitante_id,status,blocked_by_id,responded_at)
  VALUES(LEAST(v_me,p_alvo),GREATEST(v_me,p_alvo),v_me,'blocked',v_me,now())
  ON CONFLICT (aluno_a_id,aluno_b_id) DO UPDATE SET status='blocked',blocked_by_id=v_me,updated_at=now(),responded_at=now()
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('status','blocked','relationship_id',v_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.social_desbloquear(p_relationship_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
BEGIN
  UPDATE public.social_relacionamentos SET status='declined',blocked_by_id=NULL,responded_at=now(),updated_at=now()
   WHERE id=p_relationship_id AND blocked_by_id=auth.uid() AND status='blocked';
  IF NOT FOUND THEN RAISE EXCEPTION 'block_not_found'; END IF;
  RETURN jsonb_build_object('status','declined');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.social_listar_pessoas()
RETURNS TABLE(aluno_id uuid,nome text,apelido text,foto_url text,perfil_ativo text,status text,relationship_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
  SELECT CASE WHEN r.aluno_a_id=auth.uid() THEN r.aluno_b_id ELSE r.aluno_a_id END,
         a.nome,a.apelido,a.foto_url,a.perfil_ativo,
         CASE WHEN r.status='accepted' THEN 'friend'
              WHEN r.status='pending' AND r.solicitante_id=auth.uid() THEN 'outgoing'
              WHEN r.status='pending' THEN 'incoming'
              WHEN r.status='blocked' THEN 'blocked' END, r.id
    FROM social_relacionamentos r
    JOIN alunos a ON a.id = CASE WHEN r.aluno_a_id=auth.uid() THEN r.aluno_b_id ELSE r.aluno_a_id END
   WHERE (r.aluno_a_id=auth.uid() OR r.aluno_b_id=auth.uid())
  UNION ALL
  SELECT a.id,a.nome,a.apelido,a.foto_url,a.perfil_ativo,'candidate',NULL
    FROM alunos a
   WHERE a.id IN (SELECT public.app_colegas_de_turma())
     AND a.id <> auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM social_relacionamentos r
        WHERE r.aluno_a_id=LEAST(auth.uid(),a.id) AND r.aluno_b_id=GREATEST(auth.uid(),a.id)
     );
$fn$;

ALTER TABLE public.social_relacionamentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_relacionamentos FROM authenticated;
GRANT EXECUTE ON FUNCTION public.social_listar_pessoas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.social_enviar_convite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.social_aceitar_convite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.social_recusar_convite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.social_desfazer_amizade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.social_bloquear(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.social_desbloquear(uuid) TO authenticated;

COMMIT;
