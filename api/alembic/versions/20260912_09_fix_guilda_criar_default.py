"""Fix guild creation when a class has no explicit configuration."""

from alembic import op

revision = "20260912_09"
down_revision = "20260912_08"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
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
    GRANT EXECUTE ON FUNCTION public.guilda_criar(bigint,text,text,text) TO authenticated;
    """)


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: manter o default seguro do RPC guilda_criar")
