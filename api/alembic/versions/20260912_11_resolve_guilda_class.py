"""Resolve the student's class inside guild RPCs, bypassing client RLS timing."""

from alembic import op

revision = "20260912_11"
down_revision = "20260912_10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE OR REPLACE FUNCTION public.guilda_classe_atual(p_classe_id bigint)
    RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
      SELECT COALESCE(
        (SELECT ca.classe_id FROM public.classe_aluno ca WHERE ca.aluno_id=auth.uid() AND ca.classe_id=p_classe_id LIMIT 1),
        (SELECT ca.classe_id FROM public.classe_aluno ca WHERE ca.aluno_id=auth.uid() ORDER BY ca.classe_id LIMIT 1)
      )
    $$;

    CREATE OR REPLACE FUNCTION public.guilda_listar(p_classe_id bigint)
    RETURNS TABLE(guilda_id uuid, classe_id bigint, nome text, descricao text, emblema text,
                  limite_membros integer, membros_ativos integer, sou_membro boolean,
                  sou_criador boolean, membros jsonb, convites_recebidos jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
      WITH turma AS (SELECT public.guilda_classe_atual(p_classe_id) AS id)
      SELECT g.id, g.classe_id, g.nome, g.descricao, g.emblema, g.limite_membros,
        (SELECT count(*)::integer FROM public.guilda_membros m WHERE m.guilda_id=g.id AND m.left_at IS NULL),
        EXISTS (SELECT 1 FROM public.guilda_membros m WHERE m.guilda_id=g.id AND m.aluno_id=auth.uid() AND m.left_at IS NULL),
        g.criado_por=auth.uid(),
        COALESCE((SELECT jsonb_agg(jsonb_build_object('aluno_id',m.aluno_id,'nome',m.aluno_nome,'foto_url',m.foto_url,'joined_at',m.joined_at) ORDER BY m.joined_at)
          FROM (SELECT gm.aluno_id,a.nome AS aluno_nome,a.foto_url,gm.joined_at FROM public.guilda_membros gm JOIN public.alunos a ON a.id=gm.aluno_id WHERE gm.guilda_id=g.id AND gm.left_at IS NULL) m),'[]'::jsonb),
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'guilda_id',i.guilda_id,'guilda_nome',g.nome,'convidante_id',i.convidante_id,'status',i.status,'created_at',i.created_at))
          FROM public.guilda_convites i WHERE i.classe_id=g.classe_id AND i.convidado_id=auth.uid() AND i.status='pending'),'[]'::jsonb)
      FROM public.guildas g CROSS JOIN turma t
      WHERE t.id IS NOT NULL AND g.classe_id=t.id AND g.ativa AND public.guilda_e_colega(auth.uid(),t.id);
    $$;

    CREATE OR REPLACE FUNCTION public.guilda_criar(p_classe_id bigint, p_nome text, p_descricao text DEFAULT NULL, p_emblema text DEFAULT 'constellation')
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    DECLARE v_me uuid := auth.uid(); v_id uuid; v_class bigint; v_limit integer;
    BEGIN
      v_class := public.guilda_classe_atual(p_classe_id);
      IF v_class IS NULL OR NOT public.guilda_e_colega(v_me,v_class) THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
      IF NOT public.guilda_janela_aberta(v_class) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
      IF EXISTS (SELECT 1 FROM public.guilda_membros WHERE classe_id=v_class AND aluno_id=v_me AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_membro_existente'; END IF;
      SELECT COALESCE((SELECT tamanho_maximo FROM public.guilda_config_turma WHERE classe_id=v_class),4) INTO v_limit;
      INSERT INTO public.guildas(classe_id,nome,descricao,emblema,limite_membros,criado_por) VALUES(v_class,btrim(p_nome),NULLIF(btrim(p_descricao),''),COALESCE(NULLIF(btrim(p_emblema),''),'constellation'),v_limit,v_me) RETURNING id INTO v_id;
      INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(v_id,v_class,v_me);
      RETURN jsonb_build_object('guilda_id',v_id,'status','created');
    END $$;
    GRANT EXECUTE ON FUNCTION public.guilda_classe_atual(bigint) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.guilda_listar(bigint) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.guilda_criar(bigint,text,text,text) TO authenticated;
    """)


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: manter resolução da turma nos RPCs")
