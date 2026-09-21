"""Project non-estorned store purchases into the student's Bag."""

from alembic import op


revision = "20260913_21"
down_revision = "20260913_20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.bag_listar(
          p_origem TEXT DEFAULT NULL,
          p_tipo TEXT DEFAULT NULL,
          p_classe_id BIGINT DEFAULT NULL,
          p_topico_id BIGINT DEFAULT NULL,
          p_busca TEXT DEFAULT NULL
        ) RETURNS JSONB
        LANGUAGE sql SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $fn$
          SELECT COALESCE(jsonb_agg(item ORDER BY item->>'atualizado_em' DESC), '[]'::jsonb)
            FROM (
              SELECT jsonb_build_object(
                'id', 'card:' || cp.id::text,
                'source_id', cp.id,
                'origem', 'plataforma',
                'editavel', false,
                'tipo', 'card',
                'titulo', cp.titulo,
                'conteudo', NULL,
                'frente', cp.titulo,
                'verso', cp.descricao,
                'classe_id', cp.classe_id,
                'topico_id', cp.topico_id,
                'conteudo_id', cp.conteudo_id,
                'criado_em', cp.criado_em,
                'atualizado_em', cp.atualizado_em
              ) AS item
                FROM public.cards_personalizados cp
               WHERE (
                 cp.aluno_id = auth.uid()
                 OR (
                   cp.aluno_id IS NULL
                   AND cp.classe_id IN (SELECT public.app_classes_do_aluno())
                 )
               )
                 AND cp.ativo = TRUE
                 AND cp.obsoleto_em IS NULL
                 AND (p_origem IS NULL OR p_origem = 'plataforma')
                 AND (p_tipo IS NULL OR p_tipo = 'card')
                 AND (p_classe_id IS NULL OR cp.classe_id = p_classe_id)
                 AND (p_topico_id IS NULL OR cp.topico_id = p_topico_id)
                 AND (p_busca IS NULL OR (cp.titulo || ' ' || coalesce(cp.descricao, '')) ILIKE '%' || p_busca || '%')
              UNION ALL
              SELECT jsonb_build_object(
                'id', 'item:' || bi.id::text,
                'source_id', bi.id,
                'origem', 'aluno',
                'editavel', true,
                'tipo', bi.tipo,
                'titulo', bi.titulo,
                'conteudo', bi.conteudo,
                'frente', bi.frente,
                'verso', bi.verso,
                'classe_id', bi.classe_id,
                'topico_id', bi.topico_id,
                'conteudo_id', bi.conteudo_id,
                'criado_em', bi.criado_em,
                'atualizado_em', bi.atualizado_em
              ) AS item
                FROM public.bag_itens bi
               WHERE bi.aluno_id = auth.uid()
                 AND bi.excluido_em IS NULL
                 AND (p_origem IS NULL OR p_origem = 'aluno')
                 AND (p_tipo IS NULL OR bi.tipo = p_tipo)
                 AND (p_classe_id IS NULL OR bi.classe_id = p_classe_id)
                 AND (p_topico_id IS NULL OR bi.topico_id = p_topico_id)
                 AND (p_busca IS NULL OR (bi.titulo || ' ' || coalesce(bi.conteudo, '') || ' ' || coalesce(bi.frente, '') || ' ' || coalesce(bi.verso, '')) ILIKE '%' || p_busca || '%')
              UNION ALL
              SELECT jsonb_build_object(
                'id', 'loja:' || lc.id::text,
                'source_id', lc.id,
                'origem', 'loja',
                'editavel', false,
                'tipo', 'loja',
                'titulo', li.nome,
                'conteudo', li.descricao,
                'frente', NULL,
                'verso', NULL,
                'classe_id', lc.classe_id,
                'topico_id', NULL,
                'conteudo_id', NULL,
                'criado_em', lc.criado_em,
                'atualizado_em', coalesce(lc.consumido_em, lc.criado_em),
                'metadata', jsonb_build_object(
                  'item_codigo', lc.item_codigo,
                  'efeito', li.efeito,
                  'preco_pago', lc.preco_pago,
                  'origem_compra', lc.origem,
                  'status', lc.status
                )
              ) AS item
                FROM public.loja_compras lc
                JOIN public.loja_itens li ON li.codigo = lc.item_codigo
               WHERE lc.aluno_id = auth.uid()
                 AND lc.origem = 'compra'
                 AND lc.status <> 'estornada'
                 AND (p_origem IS NULL OR p_origem = 'loja')
                 AND (p_tipo IS NULL OR p_tipo = 'loja')
                 AND (p_classe_id IS NULL OR lc.classe_id = p_classe_id)
                 AND (p_busca IS NULL OR (li.nome || ' ' || li.descricao) ILIKE '%' || p_busca || '%')
            ) itens;
        $fn$;
        GRANT EXECUTE ON FUNCTION public.bag_listar(text,text,bigint,bigint,text) TO authenticated;
        """
    )


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: manter compras na Bag")
