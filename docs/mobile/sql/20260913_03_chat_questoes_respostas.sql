BEGIN;

CREATE OR REPLACE FUNCTION public.guilda_chat_listar(p_guilda_id uuid, p_limite integer DEFAULT 100)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',m.id,'guilda_id',m.guilda_id,'autor_id',m.autor_id,'autor_nome',a.nome,'autor_foto_url',a.foto_url,'tipo',m.tipo,
    'texto',CASE WHEN m.tipo='questao' AND (q.id IS NULL OR NOT public.fn_questao_liberada(q.id)) THEN 'Questão bloqueada para você' ELSE m.texto END,
    'conteudo',CASE WHEN m.tipo='questao' AND (q.id IS NULL OR NOT public.fn_questao_liberada(q.id)) THEN jsonb_build_object('id',m.conteudo->>'id','bloqueada',true) ELSE m.conteudo || CASE WHEN q.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('enunciado',q.enunciado,'tipo',q.tipo,'alternativas',q.alternativas,'atividade_id',q.atividade_id) END END,
    'created_at',m.created_at) ORDER BY m.created_at), '[]'::jsonb)
  FROM (SELECT * FROM public.guilda_mensagens m WHERE m.guilda_id=p_guilda_id AND EXISTS (SELECT 1 FROM public.guilda_membros gm WHERE gm.guilda_id=m.guilda_id AND gm.aluno_id=auth.uid() AND gm.left_at IS NULL) ORDER BY m.created_at DESC LIMIT GREATEST(1,LEAST(p_limite,100))) m
  JOIN public.alunos a ON a.id=m.autor_id LEFT JOIN public.questoes q ON m.tipo='questao' AND q.id=CASE WHEN (m.conteudo->>'id') ~ '^[0-9]+$' THEN (m.conteudo->>'id')::bigint ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.guilda_chat_enviar(p_guilda_id uuid, p_tipo text DEFAULT 'text', p_texto text DEFAULT '', p_conteudo jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_g public.guildas%ROWTYPE; v_tipo text:=lower(btrim(p_tipo)); v_id bigint;
BEGIN
  SELECT * INTO v_g FROM public.guildas WHERE id=p_guilda_id AND ativa;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.guilda_membros WHERE guilda_id=p_guilda_id AND aluno_id=auth.uid() AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF v_tipo NOT IN ('text','desafio','questao') OR char_length(btrim(COALESCE(p_texto,''))) > 500 THEN RAISE EXCEPTION 'guilda_mensagem_invalida'; END IF;
  IF v_tipo='questao' THEN v_id:=NULLIF(p_conteudo->>'id','')::bigint; IF v_id IS NULL OR NOT public.fn_questao_liberada(v_id) THEN RAISE EXCEPTION 'guilda_questao_nao_liberada'; END IF; END IF;
  INSERT INTO public.guilda_mensagens(guilda_id,classe_id,autor_id,tipo,texto,conteudo) VALUES(p_guilda_id,v_g.classe_id,auth.uid(),v_tipo,btrim(p_texto),COALESCE(p_conteudo,'{}'::jsonb));
  RETURN jsonb_build_object('status','sent');
END $$;

CREATE OR REPLACE FUNCTION public.guilda_chat_questao_responder(p_mensagem_id uuid, p_resposta text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_q public.questoes%ROWTYPE; v_m public.guilda_mensagens%ROWTYPE; v_resposta text:=btrim(COALESCE(p_resposta,'')); v_correta boolean; v_tentativa integer;
BEGIN
  SELECT * INTO v_m FROM public.guilda_mensagens m WHERE m.id=p_mensagem_id AND m.tipo='questao' AND EXISTS (SELECT 1 FROM public.guilda_membros gm WHERE gm.guilda_id=m.guilda_id AND gm.aluno_id=auth.uid() AND gm.left_at IS NULL);
  IF NOT FOUND OR NOT public.fn_questao_liberada((v_m.conteudo->>'id')::bigint) THEN RAISE EXCEPTION 'guilda_questao_sem_permissao'; END IF;
  SELECT * INTO v_q FROM public.questoes WHERE id=(v_m.conteudo->>'id')::bigint;
  IF v_resposta='' THEN RAISE EXCEPTION 'guilda_resposta_invalida'; END IF;
  v_correta=lower(v_resposta)=lower(btrim(v_q.resposta_correta::text));
  SELECT COALESCE(max(tentativa),0)+1 INTO v_tentativa FROM public.questao_aluno WHERE aluno_id=auth.uid() AND questao_id=v_q.id;
  INSERT INTO public.questao_aluno(aluno_id,questao_id,atividade_id,tentativa,resposta,correta,acertos_percentual) VALUES(auth.uid(),v_q.id,v_q.atividade_id,v_tentativa,v_resposta,v_correta,CASE WHEN v_correta THEN 100 ELSE 0 END);
  RETURN jsonb_build_object('correta',v_correta,'tipo',v_q.tipo);
END $$;

GRANT EXECUTE ON FUNCTION public.guilda_chat_questao_responder(uuid,text) TO authenticated;
COMMIT;
