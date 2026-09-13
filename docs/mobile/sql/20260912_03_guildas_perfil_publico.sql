BEGIN;

CREATE TABLE IF NOT EXISTS public.guildas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classe_id bigint NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 40),
  descricao text CHECK (descricao IS NULL OR char_length(descricao) <= 180),
  emblema text NOT NULL DEFAULT 'constellation',
  limite_membros integer NOT NULL DEFAULT 4 CHECK (limite_membros BETWEEN 2 AND 12),
  criado_por uuid NOT NULL REFERENCES public.alunos(id) ON DELETE RESTRICT,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guilda_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guilda_id uuid NOT NULL REFERENCES public.guildas(id) ON DELETE CASCADE,
  classe_id bigint NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  aluno_id uuid REFERENCES public.alunos(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  CHECK (left_at IS NULL OR left_at >= joined_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS guilda_membro_ativo_unico
  ON public.guilda_membros (classe_id, aluno_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS guilda_membros_guilda_idx ON public.guilda_membros(guilda_id, left_at);

CREATE TABLE IF NOT EXISTS public.guilda_convites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guilda_id uuid NOT NULL REFERENCES public.guildas(id) ON DELETE CASCADE,
  classe_id bigint NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  convidante_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  convidado_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (convidante_id <> convidado_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS guilda_convite_pendente_unico
  ON public.guilda_convites(guilda_id, convidado_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.guilda_config_turma (
  classe_id bigint PRIMARY KEY REFERENCES public.classe(id) ON DELETE CASCADE,
  tamanho_maximo integer NOT NULL DEFAULT 4 CHECK (tamanho_maximo BETWEEN 2 AND 12),
  formacao_inicio timestamptz,
  formacao_fim timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (formacao_fim IS NULL OR formacao_inicio IS NULL OR formacao_fim > formacao_inicio)
);

CREATE TABLE IF NOT EXISTS public.guilda_evento_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id text NOT NULL,
  classe_id bigint NOT NULL REFERENCES public.classe(id) ON DELETE RESTRICT,
  guilda_id uuid NOT NULL REFERENCES public.guildas(id) ON DELETE RESTRICT,
  aluno_id uuid REFERENCES public.alunos(id) ON DELETE SET NULL,
  aluno_nome text NOT NULL,
  posicao integer NOT NULL CHECK (posicao > 0),
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evento_id, guilda_id, aluno_id)
);
CREATE INDEX IF NOT EXISTS guilda_snapshot_evento_idx ON public.guilda_evento_snapshot(evento_id, classe_id);

CREATE OR REPLACE FUNCTION public.guilda_e_colega(p_aluno uuid, p_classe bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.classe_aluno WHERE aluno_id = p_aluno AND classe_id = p_classe)
$$;

CREATE OR REPLACE FUNCTION public.guilda_janela_aberta(p_classe bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.guilda_config_turma c WHERE c.classe_id = p_classe AND
    ((c.formacao_inicio IS NOT NULL AND now() < c.formacao_inicio) OR
     (c.formacao_fim IS NOT NULL AND now() > c.formacao_fim)))
$$;

CREATE OR REPLACE FUNCTION public.guilda_bloqueio_ativo(p_one uuid, p_two uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.social_relacionamentos
    WHERE aluno_a_id = LEAST(p_one,p_two) AND aluno_b_id = GREATEST(p_one,p_two) AND status = 'blocked')
$$;

CREATE OR REPLACE FUNCTION public.guilda_listar(p_classe_id bigint)
RETURNS TABLE(guilda_id uuid, classe_id bigint, nome text, descricao text, emblema text,
              limite_membros integer, membros_ativos integer, sou_membro boolean,
              sou_criador boolean, membros jsonb, convites_recebidos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT g.id, g.classe_id, g.nome, g.descricao, g.emblema, g.limite_membros,
    (SELECT count(*)::integer FROM public.guilda_membros m WHERE m.guilda_id = g.id AND m.left_at IS NULL),
    EXISTS (SELECT 1 FROM public.guilda_membros m WHERE m.guilda_id = g.id AND m.aluno_id = auth.uid() AND m.left_at IS NULL),
    g.criado_por = auth.uid(),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('aluno_id',m.aluno_id,'nome',m.aluno_nome,'foto_url',m.foto_url,'joined_at',m.joined_at) ORDER BY m.joined_at)
      FROM (SELECT gm.aluno_id, a.nome AS aluno_nome, a.foto_url, gm.joined_at FROM public.guilda_membros gm JOIN public.alunos a ON a.id=gm.aluno_id WHERE gm.guilda_id=g.id AND gm.left_at IS NULL) m), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'guilda_id',i.guilda_id,'guilda_nome',g.nome,'convidante_id',i.convidante_id,'status',i.status,'created_at',i.created_at))
      FROM public.guilda_convites i WHERE i.classe_id=p_classe_id AND i.convidado_id=auth.uid() AND i.status='pending'), '[]'::jsonb)
  FROM public.guildas g
  WHERE g.classe_id=p_classe_id AND g.ativa
    AND public.guilda_e_colega(auth.uid(),p_classe_id);
$$;

CREATE OR REPLACE FUNCTION public.guilda_criar(p_classe_id bigint, p_nome text, p_descricao text DEFAULT NULL, p_emblema text DEFAULT 'constellation')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_me uuid := auth.uid(); v_id uuid; v_limit integer;
BEGIN
  IF NOT public.guilda_e_colega(v_me,p_classe_id) THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF NOT public.guilda_janela_aberta(p_classe_id) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  IF EXISTS (SELECT 1 FROM public.guilda_membros WHERE classe_id=p_classe_id AND aluno_id=v_me AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_membro_existente'; END IF;
  SELECT COALESCE((SELECT tamanho_maximo FROM public.guilda_config_turma WHERE classe_id=p_classe_id),4) INTO v_limit;
  INSERT INTO public.guildas(classe_id,nome,descricao,emblema,limite_membros,criado_por) VALUES(p_classe_id,btrim(p_nome),NULLIF(btrim(p_descricao),''),COALESCE(NULLIF(btrim(p_emblema),''),'constellation'),v_limit,v_me) RETURNING id INTO v_id;
  INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(v_id,p_classe_id,v_me);
  RETURN jsonb_build_object('guilda_id',v_id,'status','created');
END $$;

CREATE OR REPLACE FUNCTION public.guilda_atualizar(p_guilda_id uuid, p_nome text, p_descricao text DEFAULT NULL, p_emblema text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.guildas SET nome=btrim(p_nome), descricao=NULLIF(btrim(p_descricao),''), emblema=COALESCE(NULLIF(btrim(p_emblema),''),emblema), updated_at=now()
    WHERE id=p_guilda_id AND ativa AND (criado_por=auth.uid() OR classe_id IN (SELECT public.app_classes_do_professor()));
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  RETURN jsonb_build_object('status','updated','guilda_id',p_guilda_id);
END $$;

CREATE OR REPLACE FUNCTION public.guilda_convidar(p_guilda_id uuid, p_convidado_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_me uuid := auth.uid(); v_class bigint;
BEGIN
  SELECT classe_id INTO v_class FROM public.guildas WHERE id=p_guilda_id AND ativa AND criado_por=v_me;
  IF v_class IS NULL THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF NOT public.guilda_e_colega(p_convidado_id,v_class) OR NOT public.guilda_janela_aberta(v_class) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  IF public.guilda_bloqueio_ativo(v_me,p_convidado_id) THEN RAISE EXCEPTION 'social_bloqueio_impede_guilda'; END IF;
  IF EXISTS (SELECT 1 FROM public.guilda_membros WHERE classe_id=v_class AND aluno_id=p_convidado_id AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_membro_existente'; END IF;
  INSERT INTO public.guilda_convites(guilda_id,classe_id,convidante_id,convidado_id) VALUES(p_guilda_id,v_class,v_me,p_convidado_id)
    ON CONFLICT (guilda_id,convidado_id) WHERE status='pending' DO NOTHING;
  RETURN jsonb_build_object('status','pending','guilda_id',p_guilda_id);
END $$;

CREATE OR REPLACE FUNCTION public.guilda_aceitar_convite(p_convite_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_i public.guilda_convites%ROWTYPE; v_g public.guildas%ROWTYPE; v_count integer;
BEGIN
  SELECT * INTO v_i FROM public.guilda_convites WHERE id=p_convite_id AND convidado_id=auth.uid() AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_convite_nao_encontrado'; END IF;
  IF NOT public.guilda_janela_aberta(v_i.classe_id) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  IF EXISTS (SELECT 1 FROM public.guilda_membros WHERE classe_id=v_i.classe_id AND aluno_id=auth.uid() AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_membro_existente'; END IF;
  SELECT * INTO v_g FROM public.guildas WHERE id=v_i.guilda_id AND ativa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_nao_encontrada'; END IF;
  SELECT count(*) INTO v_count FROM public.guilda_membros WHERE guilda_id=v_g.id AND left_at IS NULL;
  IF v_count >= v_g.limite_membros THEN RAISE EXCEPTION 'guilda_cheia'; END IF;
  INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(v_g.id,v_i.classe_id,auth.uid());
  UPDATE public.guilda_convites SET status='accepted',responded_at=now() WHERE id=v_i.id;
  RETURN jsonb_build_object('status','accepted','guilda_id',v_g.id);
END $$;

CREATE OR REPLACE FUNCTION public.guilda_recusar_convite(p_convite_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.guilda_convites SET status='declined',responded_at=now() WHERE id=p_convite_id AND convidado_id=auth.uid() AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_convite_nao_encontrado'; END IF;
  RETURN jsonb_build_object('status','declined');
END $$;

CREATE OR REPLACE FUNCTION public.guilda_cancelar_convite(p_convite_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.guilda_convites SET status='cancelled',responded_at=now() WHERE id=p_convite_id AND convidante_id=auth.uid() AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_convite_nao_encontrado'; END IF;
  RETURN jsonb_build_object('status','cancelled');
END $$;

CREATE OR REPLACE FUNCTION public.guilda_entrar(p_guilda_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_g public.guildas%ROWTYPE; v_count integer;
BEGIN
  SELECT * INTO v_g FROM public.guildas WHERE id=p_guilda_id AND ativa FOR UPDATE;
  IF NOT FOUND OR NOT public.guilda_e_colega(auth.uid(),v_g.classe_id) THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF NOT public.guilda_janela_aberta(v_g.classe_id) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  IF EXISTS (SELECT 1 FROM public.guilda_membros WHERE classe_id=v_g.classe_id AND aluno_id=auth.uid() AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_membro_existente'; END IF;
  SELECT count(*) INTO v_count FROM public.guilda_membros WHERE guilda_id=v_g.id AND left_at IS NULL;
  IF v_count >= v_g.limite_membros THEN RAISE EXCEPTION 'guilda_cheia'; END IF;
  INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(p_guilda_id,v_g.classe_id,auth.uid());
  RETURN jsonb_build_object('status','joined','guilda_id',p_guilda_id);
END $$;

CREATE OR REPLACE FUNCTION public.guilda_sair(p_guilda_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.guilda_membros SET left_at=now() WHERE guilda_id=p_guilda_id AND aluno_id=auth.uid() AND left_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_membro_nao_encontrado'; END IF;
  RETURN jsonb_build_object('status','left','guilda_id',p_guilda_id);
END $$;

CREATE OR REPLACE FUNCTION public.guilda_dissolver(p_guilda_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.guildas SET ativa=false,updated_at=now() WHERE id=p_guilda_id AND (criado_por=auth.uid() OR classe_id IN (SELECT public.app_classes_do_professor()));
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  UPDATE public.guilda_membros SET left_at=COALESCE(left_at,now()) WHERE guilda_id=p_guilda_id AND left_at IS NULL;
  UPDATE public.guilda_convites SET status='cancelled',responded_at=now() WHERE guilda_id=p_guilda_id AND status='pending';
  RETURN jsonb_build_object('status','dissolved','guilda_id',p_guilda_id);
END $$;

CREATE OR REPLACE FUNCTION public.guilda_configurar_turma(p_classe_id bigint, p_tamanho_maximo integer, p_inicio timestamptz DEFAULT NULL, p_fim timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_classe_id NOT IN (SELECT public.app_classes_do_professor()) THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF p_tamanho_maximo NOT BETWEEN 2 AND 12 OR (p_fim IS NOT NULL AND p_inicio IS NOT NULL AND p_fim <= p_inicio) THEN RAISE EXCEPTION 'guilda_config_invalida'; END IF;
  INSERT INTO public.guilda_config_turma(classe_id,tamanho_maximo,formacao_inicio,formacao_fim,updated_at) VALUES(p_classe_id,p_tamanho_maximo,p_inicio,p_fim,now())
    ON CONFLICT (classe_id) DO UPDATE SET tamanho_maximo=EXCLUDED.tamanho_maximo,formacao_inicio=EXCLUDED.formacao_inicio,formacao_fim=EXCLUDED.formacao_fim,updated_at=now();
  UPDATE public.guildas SET limite_membros=p_tamanho_maximo,updated_at=now() WHERE classe_id=p_classe_id AND ativa AND limite_membros > p_tamanho_maximo;
  RETURN jsonb_build_object('status','updated','classe_id',p_classe_id);
END $$;

CREATE OR REPLACE FUNCTION public.guilda_congelar_composicao(p_evento_id text, p_classe_id bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count integer;
BEGIN
  IF p_classe_id NOT IN (SELECT public.app_classes_do_professor()) THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  INSERT INTO public.guilda_evento_snapshot(evento_id,classe_id,guilda_id,aluno_id,aluno_nome,posicao)
  SELECT p_evento_id,g.classe_id,g.id,m.aluno_id,a.nome,row_number() over (partition by g.id order by m.joined_at)::integer
    FROM public.guildas g JOIN public.guilda_membros m ON m.guilda_id=g.id AND m.left_at IS NULL JOIN public.alunos a ON a.id=m.aluno_id
   WHERE g.classe_id=p_classe_id AND g.ativa
  ON CONFLICT (evento_id,guilda_id,aluno_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.social_perfil_publico(p_aluno_id uuid, p_classe_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'aluno_id',a.id,'nome',a.nome,'apelido',a.apelido,'foto_url',a.foto_url,'banner_url',a.banner_url,
    'perfil_ativo',a.perfil_ativo,'descricao',a.descricao,'perfil_descricao',p.descricao,
    'guilda', (SELECT jsonb_build_object('id',g.id,'nome',g.nome,'emblema',g.emblema,'membros',g.limite_membros)
      FROM public.guilda_membros gm JOIN public.guildas g ON g.id=gm.guilda_id WHERE gm.aluno_id=a.id AND gm.classe_id=p_classe_id AND gm.left_at IS NULL AND g.ativa LIMIT 1),
    'conquistas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome,'descricao',c.descricao,'icone_url',c.icone_url,'categoria',c.categoria,'pontos_recompensa',c.pontos_recompensa,'data_conquista',ca.data_conquista) ORDER BY ca.data_conquista DESC)
      FROM public.conquistas_aluno ca JOIN public.conquistas c ON c.id=ca.conquista_id WHERE ca.aluno_id=a.id AND ca.concluida IS TRUE AND (c.escopo IS NULL OR c.escopo='comum' OR c.perfil_alvo=a.perfil_ativo)), '[]'::jsonb),
    'pontos_conquistas', COALESCE((SELECT sum(c.pontos_recompensa) FROM public.conquistas_aluno ca JOIN public.conquistas c ON c.id=ca.conquista_id WHERE ca.aluno_id=a.id AND ca.concluida IS TRUE),0)
  )
  FROM public.alunos a LEFT JOIN public.aluno_perfil ap ON ap.aluno_id=a.id AND a.perfil_ativo=(SELECT nome FROM public.perfil WHERE id=ap.perfil_id LIMIT 1)
  LEFT JOIN public.perfil p ON p.id=ap.perfil_id
  WHERE a.id=p_aluno_id AND public.guilda_e_colega(auth.uid(),p_classe_id) AND public.guilda_e_colega(a.id,p_classe_id);
$$;

ALTER TABLE public.guildas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guilda_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guilda_convites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guilda_config_turma ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guilda_evento_snapshot ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.guildas FROM anon, authenticated;
REVOKE ALL ON public.guilda_membros FROM anon, authenticated;
REVOKE ALL ON public.guilda_convites FROM anon, authenticated;
REVOKE ALL ON public.guilda_config_turma FROM anon, authenticated;
REVOKE ALL ON public.guilda_evento_snapshot FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guilda_listar(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guilda_criar(bigint,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guilda_atualizar(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guilda_convidar(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guilda_aceitar_convite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guilda_recusar_convite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guilda_cancelar_convite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guilda_entrar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guilda_sair(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guilda_dissolver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guilda_configurar_turma(bigint,integer,timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guilda_congelar_composicao(text,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.social_perfil_publico(uuid,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.social_listar_pessoas(p_classe_id bigint)
RETURNS TABLE(aluno_id uuid,nome text,apelido text,foto_url text,perfil_ativo text,status text,relationship_id uuid,guilda_id uuid,guilda_nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT CASE WHEN r.aluno_a_id=auth.uid() THEN r.aluno_b_id ELSE r.aluno_a_id END, a.nome,a.apelido,a.foto_url,a.perfil_ativo,
         CASE WHEN r.status='accepted' THEN 'friend' WHEN r.status='pending' AND r.solicitante_id=auth.uid() THEN 'outgoing' WHEN r.status='pending' THEN 'incoming' WHEN r.status='blocked' THEN 'blocked' END, r.id,
         gm.guilda_id, g.nome
    FROM public.social_relacionamentos r JOIN public.alunos a ON a.id = CASE WHEN r.aluno_a_id=auth.uid() THEN r.aluno_b_id ELSE r.aluno_a_id END
    LEFT JOIN public.guilda_membros gm ON gm.aluno_id=a.id AND gm.classe_id=p_classe_id AND gm.left_at IS NULL
    LEFT JOIN public.guildas g ON g.id=gm.guilda_id AND g.ativa
   WHERE (r.aluno_a_id=auth.uid() OR r.aluno_b_id=auth.uid()) AND public.guilda_e_colega(a.id,p_classe_id)
  UNION ALL
  SELECT a.id,a.nome,a.apelido,a.foto_url,a.perfil_ativo,'candidate',NULL,gm.guilda_id,g.nome
    FROM public.alunos a
    LEFT JOIN public.guilda_membros gm ON gm.aluno_id=a.id AND gm.classe_id=p_classe_id AND gm.left_at IS NULL
    LEFT JOIN public.guildas g ON g.id=gm.guilda_id AND g.ativa
   WHERE a.id IN (SELECT ca.aluno_id FROM public.classe_aluno ca WHERE ca.classe_id=p_classe_id AND ca.aluno_id <> auth.uid())
     AND public.guilda_e_colega(auth.uid(),p_classe_id)
     AND NOT EXISTS (SELECT 1 FROM public.social_relacionamentos r WHERE r.aluno_a_id=LEAST(auth.uid(),a.id) AND r.aluno_b_id=GREATEST(auth.uid(),a.id));
$fn$;
GRANT EXECUTE ON FUNCTION public.social_listar_pessoas(bigint) TO authenticated;

COMMIT;
