BEGIN;

CREATE OR REPLACE FUNCTION public.fn_questao_liberada(p_questao_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.questoes q
      JOIN public.atividades a ON a.id=q.atividade_id
      JOIN public.topicos t ON t.id=a.topico_id
     WHERE q.id=p_questao_id
       AND EXISTS (SELECT 1 FROM public.classe_aluno ca WHERE ca.aluno_id=auth.uid() AND ca.classe_id=t.classe_id)
       AND (
         EXISTS (SELECT 1 FROM public.questao_aluno qa WHERE qa.aluno_id=auth.uid() AND qa.questao_id=q.id)
         OR EXISTS (SELECT 1 FROM public.atividade_aluno aa WHERE aa.aluno_id=auth.uid() AND aa.atividade_id=a.id AND (COALESCE(aa.percentual_concluido,0)>0 OR lower(COALESCE(aa.status::text,'')) IN ('em andamento','concluido','concluida')))
         OR EXISTS (SELECT 1 FROM public.topico_aluno ta WHERE ta.aluno_id=auth.uid() AND ta.topico_id=t.id AND (COALESCE(ta.percentual_concluido,0)>0 OR lower(COALESCE(ta.status::text,'')) IN ('em andamento','concluido','concluida')))
       )
  );
$$;

CREATE TABLE IF NOT EXISTS public.social_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remetente_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  destinatario_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  texto text NOT NULL CHECK (char_length(btrim(texto)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (remetente_id <> destinatario_id)
);
CREATE INDEX IF NOT EXISTS social_mensagens_par_idx ON public.social_mensagens(remetente_id, destinatario_id, created_at);

CREATE TABLE IF NOT EXISTS public.guilda_desafios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), guilda_id uuid NOT NULL REFERENCES public.guildas(id) ON DELETE CASCADE,
  classe_id bigint NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE, criado_por uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  modo text NOT NULL CHECK (modo IN ('todos','velocidade','precisao','duelo','duplo')), status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','encerrado')),
  titulo text NOT NULL DEFAULT 'Desafio da guilda', configuracao jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.guilda_desafio_questoes (
  desafio_id uuid NOT NULL REFERENCES public.guilda_desafios(id) ON DELETE CASCADE, questao_id bigint NOT NULL REFERENCES public.questoes(id) ON DELETE CASCADE,
  ordem integer NOT NULL CHECK (ordem > 0), PRIMARY KEY (desafio_id, questao_id)
);
CREATE TABLE IF NOT EXISTS public.guilda_desafio_respostas (
  desafio_id uuid NOT NULL REFERENCES public.guilda_desafios(id) ON DELETE CASCADE, questao_id bigint NOT NULL REFERENCES public.questoes(id) ON DELETE CASCADE,
  aluno_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE, resposta text NOT NULL, correta boolean NOT NULL, respondida_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (desafio_id, questao_id, aluno_id)
);
ALTER TABLE public.social_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guilda_desafios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guilda_desafio_questoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guilda_desafio_respostas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_mensagens, public.guilda_desafios, public.guilda_desafio_questoes, public.guilda_desafio_respostas FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.social_presenca_turma(p_classe_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('aluno_id', ca.aluno_id, 'online', EXISTS (
    SELECT 1 FROM public.aluno_sessoes_app s WHERE s.aluno_id=ca.aluno_id AND s.encerrada_em IS NULL AND s.atualizado_em > now()-interval '3 minutes'
  ))), '[]'::jsonb) FROM public.classe_aluno ca WHERE ca.classe_id=p_classe_id;
$$;

CREATE OR REPLACE FUNCTION public.social_chat_listar(p_destinatario_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'remetente_id',m.remetente_id,'destinatario_id',m.destinatario_id,'texto',m.texto,'created_at',m.created_at,'remetente_nome',a.nome,'remetente_foto_url',a.foto_url,'online',EXISTS (SELECT 1 FROM public.aluno_sessoes_app s WHERE s.aluno_id=m.remetente_id AND s.encerrada_em IS NULL AND s.atualizado_em > now()-interval '3 minutes')) ORDER BY m.created_at), '[]'::jsonb)
  FROM public.social_mensagens m JOIN public.alunos a ON a.id=m.remetente_id
  WHERE ((m.remetente_id=auth.uid() AND m.destinatario_id=p_destinatario_id) OR (m.remetente_id=p_destinatario_id AND m.destinatario_id=auth.uid()))
    AND EXISTS (SELECT 1 FROM public.social_relacionamentos r WHERE r.aluno_a_id=LEAST(auth.uid(),p_destinatario_id) AND r.aluno_b_id=GREATEST(auth.uid(),p_destinatario_id) AND r.status='accepted');
$$;

CREATE OR REPLACE FUNCTION public.social_chat_enviar(p_destinatario_id uuid, p_texto text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.social_relacionamentos r WHERE r.aluno_a_id=LEAST(auth.uid(),p_destinatario_id) AND r.aluno_b_id=GREATEST(auth.uid(),p_destinatario_id) AND r.status='accepted') THEN RAISE EXCEPTION 'social_chat_sem_amizade'; END IF;
  INSERT INTO public.social_mensagens(remetente_id,destinatario_id,texto) VALUES(auth.uid(),p_destinatario_id,btrim(p_texto));
  RETURN jsonb_build_object('status','sent');
END $$;

CREATE OR REPLACE FUNCTION public.guilda_chat_listar(p_guilda_id uuid, p_limite integer DEFAULT 100)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'guilda_id',m.guilda_id,'autor_id',m.autor_id,'autor_nome',a.nome,'autor_foto_url',a.foto_url,'tipo',m.tipo,'texto',CASE WHEN m.tipo='questao' AND NOT public.fn_questao_liberada((m.conteudo->>'id')::bigint) THEN 'Questão bloqueada para você' ELSE m.texto END,'conteudo',CASE WHEN m.tipo='questao' AND NOT public.fn_questao_liberada((m.conteudo->>'id')::bigint) THEN jsonb_build_object('id',m.conteudo->>'id','bloqueada',true) ELSE m.conteudo END,'created_at',m.created_at) ORDER BY m.created_at), '[]'::jsonb)
  FROM (SELECT * FROM public.guilda_mensagens m WHERE m.guilda_id=p_guilda_id AND EXISTS (SELECT 1 FROM public.guilda_membros gm WHERE gm.guilda_id=m.guilda_id AND gm.aluno_id=auth.uid() AND gm.left_at IS NULL) ORDER BY m.created_at DESC LIMIT GREATEST(1,LEAST(p_limite,100))) m JOIN public.alunos a ON a.id=m.autor_id;
$$;

CREATE OR REPLACE FUNCTION public.guilda_chat_enviar(p_guilda_id uuid, p_tipo text DEFAULT 'text', p_texto text DEFAULT '', p_conteudo jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_g public.guildas%ROWTYPE; v_tipo text:=lower(btrim(p_tipo)); v_id bigint;
BEGIN
  SELECT * INTO v_g FROM public.guildas WHERE id=p_guilda_id AND ativa;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.guilda_membros WHERE guilda_id=p_guilda_id AND aluno_id=auth.uid() AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF v_tipo='questao' THEN v_id:=NULLIF((p_conteudo->>'id'),'')::bigint; IF v_id IS NULL OR NOT public.fn_questao_liberada(v_id) THEN RAISE EXCEPTION 'guilda_questao_nao_liberada'; END IF; END IF;
  INSERT INTO public.guilda_mensagens(guilda_id,classe_id,autor_id,tipo,texto,conteudo) VALUES(p_guilda_id,v_g.classe_id,auth.uid(),v_tipo,btrim(p_texto),COALESCE(p_conteudo,'{}'::jsonb));
  RETURN jsonb_build_object('status','sent');
END $$;

CREATE OR REPLACE FUNCTION public.guilda_desafio_criar(p_guilda_id uuid, p_modo text DEFAULT 'todos', p_quantidade integer DEFAULT 3)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_g public.guildas%ROWTYPE; v_id uuid; v_qids bigint[]; v_q bigint; v_i integer:=0;
BEGIN
  SELECT * INTO v_g FROM public.guildas WHERE id=p_guilda_id AND ativa AND EXISTS (SELECT 1 FROM public.guilda_membros WHERE guilda_id=p_guilda_id AND aluno_id=auth.uid() AND left_at IS NULL);
  IF NOT FOUND OR p_modo NOT IN ('todos','velocidade','precisao','duelo','duplo') THEN RAISE EXCEPTION 'guilda_desafio_invalido'; END IF;
  SELECT array_agg(id ORDER BY random()) INTO v_qids FROM (SELECT q.id FROM public.questoes q JOIN public.atividades a ON a.id=q.atividade_id JOIN public.topicos t ON t.id=a.topico_id WHERE t.classe_id=v_g.classe_id AND public.fn_questao_liberada(q.id) LIMIT 30) s;
  IF COALESCE(array_length(v_qids,1),0)=0 THEN RAISE EXCEPTION 'guilda_sem_questoes_liberadas'; END IF;
  v_qids:=v_qids[1:GREATEST(1,LEAST(p_quantidade,10))];
  INSERT INTO public.guilda_desafios(guilda_id,classe_id,criado_por,modo,titulo,configuracao) VALUES(p_guilda_id,v_g.classe_id,auth.uid(),p_modo,'Desafio da guilda',jsonb_build_object('quantidade',array_length(v_qids,1))) RETURNING id INTO v_id;
  FOREACH v_q IN ARRAY v_qids LOOP v_i:=v_i+1; INSERT INTO public.guilda_desafio_questoes(desafio_id,questao_id,ordem) VALUES(v_id,v_q,v_i); END LOOP;
  INSERT INTO public.guilda_mensagens(guilda_id,classe_id,autor_id,tipo,texto,conteudo) VALUES(p_guilda_id,v_g.classe_id,auth.uid(),'desafio','Um novo desafio foi lançado!',jsonb_build_object('id',v_id,'modo',p_modo,'quantidade',array_length(v_qids,1)));
  RETURN jsonb_build_object('id',v_id,'modo',p_modo,'quantidade',array_length(v_qids,1));
END $$;

CREATE OR REPLACE FUNCTION public.guilda_desafio_responder(p_desafio_id uuid, p_questao_id bigint, p_resposta text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_q public.questoes%ROWTYPE; v_tipo text; v_correta boolean; v_g uuid;
BEGIN
  SELECT d.guilda_id INTO v_g FROM public.guilda_desafios d JOIN public.guilda_desafio_questoes dq ON dq.desafio_id=d.id WHERE d.id=p_desafio_id AND dq.questao_id=p_questao_id AND EXISTS (SELECT 1 FROM public.guilda_membros gm WHERE gm.guilda_id=d.guilda_id AND gm.aluno_id=auth.uid() AND gm.left_at IS NULL);
  IF v_g IS NULL THEN RAISE EXCEPTION 'guilda_desafio_sem_permissao'; END IF;
  SELECT * INTO v_q FROM public.questoes WHERE id=p_questao_id; v_tipo:=lower(btrim(COALESCE(v_q.tipo::text,'')));
  v_correta:=CASE WHEN v_tipo IN ('true_false','true or false','true_or_false','truefalse','verdadeiro_falso','verdadeiro ou falso','verdadeiro/falso','booleano') THEN lower(btrim(p_resposta))=lower(btrim(v_q.resposta_correta::text)) ELSE lower(btrim(p_resposta))=lower(btrim(v_q.resposta_correta::text)) END;
  INSERT INTO public.guilda_desafio_respostas(desafio_id,questao_id,aluno_id,resposta,correta) VALUES(p_desafio_id,p_questao_id,auth.uid(),p_resposta,v_correta) ON CONFLICT (desafio_id,questao_id,aluno_id) DO UPDATE SET resposta=EXCLUDED.resposta,correta=EXCLUDED.correta,respondida_em=now();
  RETURN jsonb_build_object('correta',v_correta);
END $$;

GRANT EXECUTE ON FUNCTION public.fn_questao_liberada(bigint), public.social_presenca_turma(bigint), public.social_chat_listar(uuid), public.social_chat_enviar(uuid,text), public.guilda_chat_listar(uuid,integer), public.guilda_chat_enviar(uuid,text,text,jsonb), public.guilda_desafio_criar(uuid,text,integer), public.guilda_desafio_responder(uuid,bigint,text) TO authenticated;
COMMIT;
