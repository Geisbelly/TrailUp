-- Reutiliza relações recusadas/desfeitas e serializa convites concorrentes.
-- Não apaga amizades nem altera as regras de elegibilidade ou bloqueio.
CREATE OR REPLACE FUNCTION public.social_enviar_convite(p_destinatario uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_me uuid := auth.uid();
  v_rel public.social_relacionamentos%ROWTYPE;
  v_a uuid;
  v_b uuid;
  v_nome text;
BEGIN
  IF v_me IS NULL OR p_destinatario IS NULL OR v_me = p_destinatario
     OR NOT public.social_sao_colegas(v_me, p_destinatario) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;
  SELECT * INTO v_a, v_b FROM public.social_par(v_me, p_destinatario);

  INSERT INTO public.social_relacionamentos(aluno_a_id, aluno_b_id, solicitante_id, status)
  VALUES (v_a, v_b, v_me, 'pending')
  ON CONFLICT (aluno_a_id, aluno_b_id) DO NOTHING
  RETURNING * INTO v_rel;

  IF NOT FOUND THEN
    SELECT * INTO STRICT v_rel FROM public.social_relacionamentos
      WHERE aluno_a_id = v_a AND aluno_b_id = v_b FOR UPDATE;
    IF v_rel.status = 'blocked' THEN
      RAISE EXCEPTION 'blocked';
    ELSIF v_rel.status = 'accepted' THEN
      RETURN jsonb_build_object('status', 'already_friends', 'relationship_id', v_rel.id);
    ELSIF v_rel.status = 'pending' AND v_rel.solicitante_id = v_me THEN
      RETURN jsonb_build_object('status', 'already_pending', 'relationship_id', v_rel.id);
    ELSIF v_rel.status = 'pending' THEN
      UPDATE public.social_relacionamentos
        SET status = 'accepted', responded_at = now(), updated_at = now()
        WHERE id = v_rel.id;
      SELECT COALESCE(apelido, nome) INTO v_nome FROM public.alunos WHERE id = v_me;
      PERFORM public.social_notificar_evento(
        v_rel.solicitante_id, 'Convite aceito', v_nome || ' aceitou seu convite de amizade.',
        'social_convite_aceito', 'amizade_aceita:' || v_rel.id::text,
        jsonb_build_object('relationship_id', v_rel.id, 'aluno_id', v_me)
      );
      RETURN jsonb_build_object('status', 'accepted', 'relationship_id', v_rel.id);
    END IF;

    -- declined inclui convite recusado, amizade desfeita e desbloqueio.
    UPDATE public.social_relacionamentos
      SET status = 'pending', solicitante_id = v_me, blocked_by_id = NULL,
          responded_at = NULL, updated_at = now()
      WHERE id = v_rel.id;
  END IF;

  SELECT COALESCE(apelido, nome) INTO v_nome FROM public.alunos WHERE id = v_me;
  PERFORM public.social_notificar_evento(
    p_destinatario, 'Novo convite de amizade', v_nome || ' enviou um convite de amizade.',
    'social_convite_recebido', 'amizade_pendente:' || v_rel.id::text || ':' || gen_random_uuid()::text,
    jsonb_build_object('relationship_id', v_rel.id, 'aluno_id', v_me)
  );
  RETURN jsonb_build_object('status', 'pending', 'relationship_id', v_rel.id);
END;
$fn$;
