BEGIN;

CREATE OR REPLACE FUNCTION public.social_presenca_aluno(p_aluno_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
  SELECT jsonb_build_object(
    'aluno_id', p_aluno_id,
    'online', EXISTS (
      SELECT 1 FROM public.aluno_sessoes_app s
       WHERE s.aluno_id=p_aluno_id AND s.encerrada_em IS NULL
         AND s.atualizado_em > now()-interval '3 minutes'
    )
  );
$fn$;

CREATE OR REPLACE FUNCTION public.social_chat_listar(p_destinatario_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
  IF auth.uid() IS NULL OR p_destinatario_id IS NULL OR p_destinatario_id = auth.uid() THEN
    RAISE EXCEPTION 'social_chat_destinatario_invalido';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.social_relacionamentos r
     WHERE r.aluno_a_id=LEAST(auth.uid(),p_destinatario_id)
       AND r.aluno_b_id=GREATEST(auth.uid(),p_destinatario_id)
       AND r.status='accepted'
  ) THEN RAISE EXCEPTION 'social_chat_sem_amizade'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',m.id,'remetente_id',m.remetente_id,'destinatario_id',m.destinatario_id,
    'texto',m.texto,'created_at',m.created_at,'remetente_nome',a.nome,
    'remetente_foto_url',a.foto_url
  ) ORDER BY m.created_at)
    FROM public.social_mensagens m
    JOIN public.alunos a ON a.id=m.remetente_id
   WHERE (m.remetente_id=auth.uid() AND m.destinatario_id=p_destinatario_id)
      OR (m.remetente_id=p_destinatario_id AND m.destinatario_id=auth.uid())), '[]'::jsonb);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.social_chat_enviar(p_destinatario_id uuid, p_texto text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_id uuid; v_texto text := btrim(COALESCE(p_texto,''));
BEGIN
  IF auth.uid() IS NULL OR p_destinatario_id IS NULL OR p_destinatario_id = auth.uid() THEN
    RAISE EXCEPTION 'social_chat_destinatario_invalido';
  END IF;
  IF char_length(v_texto) < 1 OR char_length(v_texto) > 500 THEN RAISE EXCEPTION 'social_chat_texto_invalido'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.social_relacionamentos r
     WHERE r.aluno_a_id=LEAST(auth.uid(),p_destinatario_id)
       AND r.aluno_b_id=GREATEST(auth.uid(),p_destinatario_id)
       AND r.status='accepted'
  ) THEN RAISE EXCEPTION 'social_chat_sem_amizade'; END IF;
  INSERT INTO public.social_mensagens(remetente_id,destinatario_id,texto)
  VALUES(auth.uid(),p_destinatario_id,v_texto) RETURNING id INTO v_id;
  RETURN jsonb_build_object('status','sent','id',v_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.social_presenca_aluno(uuid) TO authenticated;

COMMIT;
