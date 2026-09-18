BEGIN;

-- A associação agora é única por guilda e aluno; um aluno pode participar
-- de várias guildas da mesma turma.
DROP INDEX IF EXISTS public.guilda_membro_ativo_unico;
CREATE UNIQUE INDEX IF NOT EXISTS guilda_membro_ativo_por_guilda_uidx
  ON public.guilda_membros (guilda_id, aluno_id) WHERE left_at IS NULL;

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
  SELECT LEAST(COALESCE((SELECT tamanho_maximo FROM public.guilda_config_turma WHERE classe_id=v_class),10),10) INTO v_limit;
  INSERT INTO public.guildas(classe_id,nome,descricao,emblema,logo_url,modo_perfil,perfil_alvo,limite_membros,criado_por)
  VALUES(v_class,btrim(p_nome),NULLIF(btrim(p_descricao),''),COALESCE(NULLIF(btrim(p_emblema),''),'constellation'),NULLIF(btrim(p_logo_url),''),v_modo,v_perfil,v_limit,v_me) RETURNING id INTO v_id;
  INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(v_id,v_class,v_me);
  RETURN jsonb_build_object('guilda_id',v_id,'status','created');
END; $fn$;

CREATE OR REPLACE FUNCTION public.guilda_criar(p_classe_id bigint, p_nome text, p_descricao text DEFAULT NULL, p_emblema text DEFAULT 'constellation')
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT public.guilda_criar(p_classe_id,p_nome,p_descricao,p_emblema,NULL,'misto',NULL);
$fn$;

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
  IF EXISTS (SELECT 1 FROM public.guilda_membros WHERE guilda_id=p_guilda_id AND aluno_id=p_convidado_id AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_membro_existente'; END IF;
  INSERT INTO public.guilda_convites(guilda_id,classe_id,convidante_id,convidado_id) VALUES(p_guilda_id,v_g.classe_id,v_me,p_convidado_id)
    ON CONFLICT (guilda_id,convidado_id) WHERE status='pending' DO NOTHING;
  RETURN jsonb_build_object('status','pending','guilda_id',p_guilda_id,'convidado_id',p_convidado_id);
END; $fn$;

CREATE OR REPLACE FUNCTION public.guilda_aceitar_convite(p_convite_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_i public.guilda_convites%ROWTYPE; v_g public.guildas%ROWTYPE; v_count integer;
BEGIN
  SELECT * INTO v_i FROM public.guilda_convites WHERE id=p_convite_id AND convidado_id=auth.uid() AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_convite_nao_encontrado'; END IF;
  IF NOT public.guilda_janela_aberta(v_i.classe_id) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  SELECT * INTO v_g FROM public.guildas WHERE id=v_i.guilda_id AND ativa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_nao_encontrada'; END IF;
  SELECT count(*) INTO v_count FROM public.guilda_membros WHERE guilda_id=v_g.id AND left_at IS NULL;
  IF v_count >= v_g.limite_membros THEN RAISE EXCEPTION 'guilda_cheia'; END IF;
  INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(v_g.id,v_i.classe_id,auth.uid());
  UPDATE public.guilda_convites SET status='accepted',responded_at=now() WHERE id=v_i.id;
  RETURN jsonb_build_object('status','accepted','guilda_id',v_g.id);
END; $fn$;

CREATE OR REPLACE FUNCTION public.guilda_entrar(p_guilda_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_g public.guildas%ROWTYPE; v_count integer;
BEGIN
  SELECT * INTO v_g FROM public.guildas WHERE id=p_guilda_id AND ativa FOR UPDATE;
  IF NOT FOUND OR NOT public.guilda_e_colega(auth.uid(),v_g.classe_id) THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF NOT public.guilda_janela_aberta(v_g.classe_id) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  IF EXISTS (SELECT 1 FROM public.guilda_membros WHERE guilda_id=p_guilda_id AND aluno_id=auth.uid() AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_membro_existente'; END IF;
  SELECT count(*) INTO v_count FROM public.guilda_membros WHERE guilda_id=v_g.id AND left_at IS NULL;
  IF v_count >= v_g.limite_membros THEN RAISE EXCEPTION 'guilda_cheia'; END IF;
  INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(p_guilda_id,v_g.classe_id,auth.uid());
  RETURN jsonb_build_object('status','joined','guilda_id',p_guilda_id);
END; $fn$;

COMMIT;
