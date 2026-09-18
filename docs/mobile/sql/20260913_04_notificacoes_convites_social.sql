BEGIN;

-- Eventos sociais entram diretamente na caixa de entrada e no push do SO.
-- A chave no contexto torna a operação idempotente em retries do app.
CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_social_evento_uidx
  ON public.notificacoes (aluno_id, origem, ((contexto ->> 'dedupe_key')))
  WHERE origem = 'social';

CREATE OR REPLACE FUNCTION public.social_notificar_evento(
  p_aluno_id uuid,
  p_titulo text,
  p_corpo text,
  p_tipo text,
  p_dedupe_key text,
  p_dados jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.notificacoes (
    aluno_id, titulo, corpo, tipo, horario_envio, status, read,
    origem, contexto
  ) VALUES (
    p_aluno_id, p_titulo, p_corpo, p_tipo, now(), 'enviada', false,
    'social', COALESCE(p_dados, '{}'::jsonb) || jsonb_build_object('dedupe_key', p_dedupe_key)
  )
  ON CONFLICT (aluno_id, origem, ((contexto ->> 'dedupe_key')))
    WHERE origem = 'social' DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    PERFORM public.notificacoes_enviar_push(
      p_aluno_id, v_id, p_titulo, p_corpo,
      COALESCE(p_dados, '{}'::jsonb) || jsonb_build_object('tipo', p_tipo), 1
    );
  END IF;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.social_enviar_convite(p_destinatario uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_me uuid := auth.uid(); v_rel public.social_relacionamentos%ROWTYPE; v_a uuid; v_b uuid;
  v_nome text;
BEGIN
  IF v_me IS NULL OR NOT public.social_sao_colegas(v_me,p_destinatario) THEN RAISE EXCEPTION 'not_eligible'; END IF;
  SELECT * INTO v_rel FROM public.social_relacionamentos
   WHERE aluno_a_id=LEAST(v_me,p_destinatario) AND aluno_b_id=GREATEST(v_me,p_destinatario) FOR UPDATE;
  IF FOUND AND v_rel.status='blocked' THEN RAISE EXCEPTION 'blocked';
  ELSIF FOUND AND v_rel.status='accepted' THEN RETURN jsonb_build_object('status','already_friends','relationship_id',v_rel.id);
  ELSIF FOUND AND v_rel.status='pending' AND v_rel.solicitante_id=v_me THEN RETURN jsonb_build_object('status','already_pending','relationship_id',v_rel.id);
  ELSIF FOUND AND v_rel.status='pending' THEN
    UPDATE public.social_relacionamentos SET status='accepted', responded_at=now(), updated_at=now() WHERE id=v_rel.id;
    SELECT COALESCE(apelido, nome) INTO v_nome FROM public.alunos WHERE id = v_me;
    PERFORM public.social_notificar_evento(
      v_rel.solicitante_id, 'Convite aceito', v_nome || ' aceitou seu convite de amizade.',
      'social_convite_aceito', 'amizade_aceita:' || v_rel.id::text,
      jsonb_build_object('relationship_id', v_rel.id, 'aluno_id', v_me)
    );
    RETURN jsonb_build_object('status','accepted','relationship_id',v_rel.id);
  END IF;
  SELECT * INTO v_a,v_b FROM public.social_par(v_me,p_destinatario);
  INSERT INTO public.social_relacionamentos(aluno_a_id,aluno_b_id,solicitante_id,status) VALUES(v_a,v_b,v_me,'pending');
  SELECT COALESCE(apelido, nome) INTO v_nome FROM public.alunos WHERE id = v_me;
  PERFORM public.social_notificar_evento(
    p_destinatario, 'Novo convite de amizade', v_nome || ' enviou um convite de amizade.',
    'social_convite_recebido', 'amizade_pendente:' || v_me::text || ':' || p_destinatario::text,
    jsonb_build_object('aluno_id', v_me)
  );
  RETURN jsonb_build_object('status','pending');
END; $fn$;

CREATE OR REPLACE FUNCTION public.social_aceitar_convite(p_relationship_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_solicitante uuid; v_nome text; v_me uuid := auth.uid();
BEGIN
  SELECT solicitante_id INTO v_solicitante FROM public.social_relacionamentos
   WHERE id=p_relationship_id AND (aluno_a_id=v_me OR aluno_b_id=v_me) AND status='pending' AND solicitante_id <> v_me FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  UPDATE public.social_relacionamentos SET status='accepted', responded_at=now(), updated_at=now() WHERE id=p_relationship_id;
  SELECT COALESCE(apelido, nome) INTO v_nome FROM public.alunos WHERE id = v_me;
  PERFORM public.social_notificar_evento(
    v_solicitante, 'Convite aceito', v_nome || ' aceitou seu convite de amizade.',
    'social_convite_aceito', 'amizade_aceita:' || p_relationship_id::text,
    jsonb_build_object('relationship_id', p_relationship_id, 'aluno_id', v_me)
  );
  RETURN jsonb_build_object('status','accepted','relationship_id',p_relationship_id);
END; $fn$;

COMMIT;
