BEGIN;

ALTER TABLE public.guildas
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS modo_perfil text NOT NULL DEFAULT 'misto',
  ADD COLUMN IF NOT EXISTS perfil_alvo text;
ALTER TABLE public.guildas DROP CONSTRAINT IF EXISTS guildas_modo_perfil_check;
ALTER TABLE public.guildas ADD CONSTRAINT guildas_modo_perfil_check CHECK (modo_perfil IN ('misto','perfil'));
ALTER TABLE public.guildas ADD CONSTRAINT guildas_perfil_alvo_check CHECK (modo_perfil = 'misto' OR NULLIF(btrim(perfil_alvo),'') IS NOT NULL);

DROP FUNCTION IF EXISTS public.guilda_listar(bigint);
CREATE OR REPLACE FUNCTION public.guilda_listar(p_classe_id bigint)
RETURNS TABLE(guilda_id uuid, classe_id bigint, nome text, descricao text, emblema text,
  limite_membros integer, membros_ativos integer, sou_membro boolean, sou_criador boolean,
  membros jsonb, convites_recebidos jsonb, logo_url text, modo_perfil text, perfil_alvo text,
  convites_enviados jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT g.id, g.classe_id, g.nome, g.descricao, g.emblema, g.limite_membros,
    (SELECT count(*)::integer FROM public.guilda_membros m WHERE m.guilda_id=g.id AND m.left_at IS NULL),
    EXISTS (SELECT 1 FROM public.guilda_membros m WHERE m.guilda_id=g.id AND m.aluno_id=auth.uid() AND m.left_at IS NULL),
    g.criado_por=auth.uid(),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('aluno_id',m.aluno_id,'nome',a.nome,'foto_url',a.foto_url,'joined_at',m.joined_at) ORDER BY m.joined_at)
      FROM public.guilda_membros m JOIN public.alunos a ON a.id=m.aluno_id WHERE m.guilda_id=g.id AND m.left_at IS NULL),'[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'guilda_id',i.guilda_id,'guilda_nome',g.nome,'convidante_id',i.convidante_id,'status',i.status,'created_at',i.created_at))
      FROM public.guilda_convites i WHERE i.guilda_id=g.id AND i.convidado_id=auth.uid() AND i.status='pending'),'[]'::jsonb),
    g.logo_url, g.modo_perfil, g.perfil_alvo,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'convidado_id',i.convidado_id,'status',i.status,'created_at',i.created_at))
      FROM public.guilda_convites i WHERE i.guilda_id=g.id AND i.convidante_id=auth.uid() AND i.status='pending'),'[]'::jsonb)
  FROM public.guildas g
  WHERE g.classe_id=p_classe_id AND g.ativa AND public.guilda_e_colega(auth.uid(),p_classe_id);
$fn$;

CREATE OR REPLACE FUNCTION public.guilda_criar(
  p_classe_id bigint, p_nome text, p_descricao text DEFAULT NULL,
  p_emblema text DEFAULT 'constellation', p_logo_url text DEFAULT NULL,
  p_modo_perfil text DEFAULT 'misto', p_perfil_alvo text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_me uuid:=auth.uid(); v_class bigint; v_id uuid; v_limit integer; v_modo text:=lower(btrim(COALESCE(p_modo_perfil,'misto'))); v_perfil text:=NULLIF(btrim(p_perfil_alvo),'');
BEGIN
  v_class:=public.guilda_classe_atual(p_classe_id);
  IF v_class IS NULL OR NOT public.guilda_e_colega(v_me,v_class) THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF v_modo NOT IN ('misto','perfil') OR (v_modo='perfil' AND v_perfil IS NULL) THEN RAISE EXCEPTION 'guilda_configuracao_invalida'; END IF;
  IF NOT public.guilda_janela_aberta(v_class) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  IF EXISTS (SELECT 1 FROM public.guilda_membros WHERE classe_id=v_class AND aluno_id=v_me AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_membro_existente'; END IF;
  SELECT LEAST(COALESCE((SELECT tamanho_maximo FROM public.guilda_config_turma WHERE classe_id=v_class),10),10) INTO v_limit;
  INSERT INTO public.guildas(classe_id,nome,descricao,emblema,logo_url,modo_perfil,perfil_alvo,limite_membros,criado_por)
  VALUES(v_class,btrim(p_nome),NULLIF(btrim(p_descricao),''),COALESCE(NULLIF(btrim(p_emblema),''),'constellation'),NULLIF(btrim(p_logo_url),''),v_modo,v_perfil,v_limit,v_me) RETURNING id INTO v_id;
  INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(v_id,v_class,v_me);
  RETURN jsonb_build_object('guilda_id',v_id,'status','created');
END; $fn$;

CREATE OR REPLACE FUNCTION public.guilda_atualizar_config(
  p_guilda_id uuid, p_nome text, p_descricao text DEFAULT NULL,
  p_emblema text DEFAULT NULL, p_logo_url text DEFAULT NULL,
  p_modo_perfil text DEFAULT 'misto', p_perfil_alvo text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_modo text:=lower(btrim(COALESCE(p_modo_perfil,'misto'))); v_perfil text:=NULLIF(btrim(p_perfil_alvo),'');
BEGIN
  IF v_modo NOT IN ('misto','perfil') OR (v_modo='perfil' AND v_perfil IS NULL) THEN RAISE EXCEPTION 'guilda_configuracao_invalida'; END IF;
  UPDATE public.guildas SET nome=btrim(p_nome), descricao=NULLIF(btrim(p_descricao),''),
    emblema=COALESCE(NULLIF(btrim(p_emblema),''),emblema), logo_url=NULLIF(btrim(p_logo_url),''),
    modo_perfil=v_modo, perfil_alvo=v_perfil, updated_at=now()
   WHERE id=p_guilda_id AND ativa AND (criado_por=auth.uid() OR classe_id IN (SELECT public.app_classes_do_professor()));
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  RETURN jsonb_build_object('status','updated','guilda_id',p_guilda_id);
END; $fn$;

CREATE OR REPLACE FUNCTION public.guilda_convidar(p_guilda_id uuid, p_convidado_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_me uuid:=auth.uid(); v_g public.guildas%ROWTYPE; v_count integer; v_perfil text;
BEGIN
  SELECT * INTO v_g FROM public.guildas WHERE id=p_guilda_id AND ativa
    AND EXISTS (SELECT 1 FROM public.guilda_membros WHERE guilda_id=p_guilda_id AND aluno_id=v_me AND left_at IS NULL) FOR UPDATE;
  IF NOT FOUND OR p_convidado_id IS NULL OR p_convidado_id=v_me THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF NOT public.guilda_e_colega(p_convidado_id,v_g.classe_id) OR NOT public.guilda_janela_aberta(v_g.classe_id) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  SELECT count(*) INTO v_count FROM public.guilda_membros WHERE guilda_id=p_guilda_id AND left_at IS NULL;
  IF v_count >= v_g.limite_membros THEN RAISE EXCEPTION 'guilda_cheia'; END IF;
  IF public.guilda_bloqueio_ativo(v_me,p_convidado_id) THEN RAISE EXCEPTION 'social_bloqueio_impede_guilda'; END IF;
  IF v_g.modo_perfil='perfil' THEN
    SELECT perfil_ativo INTO v_perfil FROM public.alunos WHERE id=p_convidado_id;
    IF v_perfil IS DISTINCT FROM v_g.perfil_alvo THEN RAISE EXCEPTION 'guilda_perfil_incompativel'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.guilda_membros WHERE classe_id=v_g.classe_id AND aluno_id=p_convidado_id AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_membro_existente'; END IF;
  INSERT INTO public.guilda_convites(guilda_id,classe_id,convidante_id,convidado_id) VALUES(p_guilda_id,v_g.classe_id,v_me,p_convidado_id)
    ON CONFLICT (guilda_id,convidado_id) WHERE status='pending' DO NOTHING;
  RETURN jsonb_build_object('status','pending','guilda_id',p_guilda_id,'convidado_id',p_convidado_id);
END; $fn$;

GRANT EXECUTE ON FUNCTION public.guilda_listar(bigint), public.guilda_criar(bigint,text,text,text,text,text,text), public.guilda_atualizar_config(uuid,text,text,text,text,text,text), public.guilda_convidar(uuid,uuid) TO authenticated;

COMMIT;
