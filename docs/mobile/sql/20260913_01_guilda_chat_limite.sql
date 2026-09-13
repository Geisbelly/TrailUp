BEGIN;

ALTER TABLE public.guildas ALTER COLUMN limite_membros SET DEFAULT 10;
ALTER TABLE public.guildas DROP CONSTRAINT IF EXISTS guildas_limite_membros_check;
ALTER TABLE public.guildas ADD CONSTRAINT guildas_limite_membros_check CHECK (limite_membros BETWEEN 2 AND 10);
UPDATE public.guildas SET limite_membros = LEAST(limite_membros, 10) WHERE limite_membros > 10;

ALTER TABLE public.guilda_config_turma ALTER COLUMN tamanho_maximo SET DEFAULT 10;
ALTER TABLE public.guilda_config_turma DROP CONSTRAINT IF EXISTS guilda_config_turma_tamanho_maximo_check;
ALTER TABLE public.guilda_config_turma ADD CONSTRAINT guilda_config_turma_tamanho_maximo_check CHECK (tamanho_maximo BETWEEN 2 AND 10);
UPDATE public.guilda_config_turma SET tamanho_maximo = LEAST(tamanho_maximo, 10) WHERE tamanho_maximo > 10;

CREATE TABLE IF NOT EXISTS public.guilda_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guilda_id uuid NOT NULL REFERENCES public.guildas(id) ON DELETE CASCADE,
  classe_id bigint NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'text' CHECK (tipo IN ('text', 'desafio', 'questao')),
  texto text NOT NULL DEFAULT '' CHECK (char_length(texto) <= 500),
  conteudo jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guilda_mensagens_feed_idx ON public.guilda_mensagens(guilda_id, created_at);
ALTER TABLE public.guilda_mensagens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guilda_mensagens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.guilda_criar(p_classe_id bigint, p_nome text, p_descricao text DEFAULT NULL, p_emblema text DEFAULT 'constellation')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_me uuid := auth.uid(); v_id uuid; v_class bigint; v_limit integer;
BEGIN
  v_class := public.guilda_classe_atual(p_classe_id);
  IF v_class IS NULL OR NOT public.guilda_e_colega(v_me,v_class) THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF NOT public.guilda_janela_aberta(v_class) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  IF EXISTS (SELECT 1 FROM public.guilda_membros WHERE classe_id=v_class AND aluno_id=v_me AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_membro_existente'; END IF;
  SELECT LEAST(COALESCE((SELECT tamanho_maximo FROM public.guilda_config_turma WHERE classe_id=v_class),10),10) INTO v_limit;
  INSERT INTO public.guildas(classe_id,nome,descricao,emblema,limite_membros,criado_por) VALUES(v_class,btrim(p_nome),NULLIF(btrim(p_descricao),''),COALESCE(NULLIF(btrim(p_emblema),''),'constellation'),v_limit,v_me) RETURNING id INTO v_id;
  INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(v_id,v_class,v_me);
  RETURN jsonb_build_object('guilda_id',v_id,'status','created');
END $$;

CREATE OR REPLACE FUNCTION public.guilda_configurar_turma(p_classe_id bigint, p_tamanho_maximo integer, p_inicio timestamptz DEFAULT NULL, p_fim timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_classe_id NOT IN (SELECT public.app_classes_do_professor()) OR p_tamanho_maximo NOT BETWEEN 2 AND 10 OR (p_fim IS NOT NULL AND p_inicio IS NOT NULL AND p_fim <= p_inicio) THEN RAISE EXCEPTION 'guilda_config_invalida'; END IF;
  INSERT INTO public.guilda_config_turma(classe_id,tamanho_maximo,formacao_inicio,formacao_fim,updated_at) VALUES(p_classe_id,p_tamanho_maximo,p_inicio,p_fim,now())
  ON CONFLICT (classe_id) DO UPDATE SET tamanho_maximo=EXCLUDED.tamanho_maximo,formacao_inicio=EXCLUDED.formacao_inicio,formacao_fim=EXCLUDED.formacao_fim,updated_at=now();
  UPDATE public.guildas SET limite_membros=p_tamanho_maximo,updated_at=now() WHERE classe_id=p_classe_id AND ativa;
  RETURN jsonb_build_object('status','updated','classe_id',p_classe_id);
END $$;

CREATE OR REPLACE FUNCTION public.guilda_chat_listar(p_guilda_id uuid, p_limite integer DEFAULT 100)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id, 'guilda_id', m.guilda_id, 'autor_id', m.autor_id,
    'autor_nome', a.nome, 'autor_foto_url', a.foto_url, 'tipo', m.tipo,
    'texto', m.texto, 'conteudo', m.conteudo, 'created_at', m.created_at
  ) ORDER BY m.created_at), '[]'::jsonb)
  FROM (SELECT * FROM public.guilda_mensagens m
    WHERE m.guilda_id=p_guilda_id AND EXISTS (SELECT 1 FROM public.guilda_membros gm WHERE gm.guilda_id=m.guilda_id AND gm.aluno_id=auth.uid() AND gm.left_at IS NULL)
    ORDER BY m.created_at DESC LIMIT GREATEST(1,LEAST(p_limite,100))) m
  JOIN public.alunos a ON a.id=m.autor_id;
$$;

CREATE OR REPLACE FUNCTION public.guilda_chat_enviar(p_guilda_id uuid, p_tipo text DEFAULT 'text', p_texto text DEFAULT '', p_conteudo jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_g public.guildas%ROWTYPE; v_id uuid; v_tipo text := lower(btrim(p_tipo)); v_texto text := btrim(COALESCE(p_texto,'')); v_conteudo jsonb := COALESCE(p_conteudo,'{}'::jsonb);
BEGIN
  SELECT * INTO v_g FROM public.guildas WHERE id=p_guilda_id AND ativa;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.guilda_membros WHERE guilda_id=p_guilda_id AND aluno_id=auth.uid() AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF v_tipo NOT IN ('text','desafio','questao') OR char_length(v_texto) > 500 THEN RAISE EXCEPTION 'guilda_mensagem_invalida'; END IF;
  IF v_tipo <> 'text' AND (COALESCE((v_conteudo->>'id'),'') !~ '^[0-9]+$' OR btrim(COALESCE(v_conteudo->>'titulo','')) = '') THEN RAISE EXCEPTION 'guilda_compartilhamento_invalido'; END IF;
  INSERT INTO public.guilda_mensagens(guilda_id,classe_id,autor_id,tipo,texto,conteudo) VALUES(p_guilda_id,v_g.classe_id,auth.uid(),v_tipo,v_texto,v_conteudo) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'status','sent');
END $$;

GRANT EXECUTE ON FUNCTION public.guilda_chat_listar(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guilda_chat_enviar(uuid,text,text,jsonb) TO authenticated;

COMMIT;
