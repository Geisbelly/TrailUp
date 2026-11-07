"""A Bag guarda material de estudo (áudio, apresentação, texto) além de anotação, resumo e card.

## O que muda

- `bag_itens.tipo` aceita `material`. O item é um ATALHO para o material do tópico, não uma cópia:
  `metadata` leva `formato` (audio, apresentacao, markdown, pdf, video, documento, imagem) e
  `bloco` (a chave do bloco na tela do tópico); `topico_id` diz onde ele mora.
- **Sem URL no item.** O link do material é assinado e expira (#195), e `bag_itens` fica fora de
  `trailup_turmas_que_usam_conteudo` de propósito (`20261024_11`): citar um caminho na Bag não pode
  abrir o arquivo para a turma. Abrir o item leva o aluno ao tópico, onde o app assina o link.
- `bag_listar` passa a devolver `metadata` dos itens do aluno (antes só o ramo da loja devolvia).
  O resto da função é o da `20260913_23`, sem outra mudança: mesmo escopo de turma, perfil e
  visualização.

## Constraint

`bag_itens_formato_valido` ganha o ramo `material`: sem `frente`/`verso`, com `formato` conhecido e
`topico_id` preenchido. `conteudo` é opcional (o rótulo do bloco). O CHECK de `tipo` era inline e
não tem nome fixo; a migração procura qualquer CHECK de `bag_itens` que cite `tipo` e o refaz.

Sem tabela nova, sem policy nova: a RLS de `bag_itens` (dono) já cobre.
"""

from alembic import op

revision = "20261106_05"
down_revision = "20261106_01"
branch_labels = None
depends_on = None


FORMATOS = ("audio", "apresentacao", "markdown", "pdf", "video", "documento", "imagem")


def _formatos_sql() -> str:
    return ", ".join(f"'{f}'" for f in FORMATOS)


CONSTRAINTS = f"""
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.bag_itens'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.bag_itens DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$do$;

ALTER TABLE public.bag_itens
  ADD CONSTRAINT bag_itens_tipo_check
  CHECK (tipo IN ('resumo', 'anotacao', 'card', 'material'));

ALTER TABLE public.bag_itens
  ADD CONSTRAINT bag_itens_formato_valido CHECK (
    (tipo IN ('resumo', 'anotacao')
      AND nullif(btrim(conteudo), '') IS NOT NULL
      AND frente IS NULL AND verso IS NULL)
    OR
    (tipo = 'card'
      AND nullif(btrim(frente), '') IS NOT NULL
      AND nullif(btrim(verso), '') IS NOT NULL
      AND conteudo IS NULL)
    OR
    (tipo = 'material'
      AND frente IS NULL AND verso IS NULL
      AND topico_id IS NOT NULL
      AND (metadata ->> 'formato') IN ({_formatos_sql()}))
  );
"""


LISTAR = """
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
       WHERE p_classe_id IS NOT NULL
         AND cp.classe_id = p_classe_id
         AND cp.classe_id IN (SELECT public.app_classes_do_aluno())
         AND cp.ativo = TRUE
         AND cp.obsoleto_em IS NULL
         AND EXISTS (
           SELECT 1
             FROM public.alunos a
            WHERE a.id = auth.uid()
              AND NULLIF(btrim(a.perfil_ativo), '') IS NOT NULL
              AND lower(btrim(COALESCE(
                cp.metadata ->> 'brainhex_profile_key',
                cp.metadata ->> 'perfil_dominante',
                cp.metadata ->> 'profile_key'
              ))) = lower(btrim(a.perfil_ativo))
         )
         AND (
           (cp.conteudo_id IS NOT NULL AND EXISTS (
             SELECT 1
               FROM public.conteudo_aluno ca
              WHERE ca.aluno_id = auth.uid()
                AND ca.conteudo_id = cp.conteudo_id
                AND ca.ultima_visualizacao IS NOT NULL
           ))
           OR
           (cp.conteudo_id IS NULL AND EXISTS (
             SELECT 1
               FROM public.topico_aluno ta
              WHERE ta.aluno_id = auth.uid()
                AND ta.topico_id = cp.topico_id
                AND ta.ultima_visualizacao IS NOT NULL
           ))
         )
         AND (p_origem IS NULL OR p_origem = 'plataforma')
         AND (p_tipo IS NULL OR p_tipo = 'card')
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
        'atualizado_em', bi.atualizado_em,
        'metadata', bi.metadata
      ) AS item
        FROM public.bag_itens bi
       WHERE p_classe_id IS NOT NULL
         AND bi.aluno_id = auth.uid()
         AND bi.classe_id = p_classe_id
         AND bi.classe_id IN (SELECT public.app_classes_do_aluno())
         AND bi.excluido_em IS NULL
         AND (
           (bi.conteudo_id IS NOT NULL AND EXISTS (
             SELECT 1
               FROM public.conteudo_aluno ca
              WHERE ca.aluno_id = auth.uid()
                AND ca.conteudo_id = bi.conteudo_id
                AND ca.ultima_visualizacao IS NOT NULL
           ))
           OR
           (bi.conteudo_id IS NULL AND bi.topico_id IS NOT NULL AND EXISTS (
             SELECT 1
               FROM public.topico_aluno ta
              WHERE ta.aluno_id = auth.uid()
                AND ta.topico_id = bi.topico_id
                AND ta.ultima_visualizacao IS NOT NULL
           ))
         )
         AND (p_origem IS NULL OR p_origem = 'aluno')
         AND (p_tipo IS NULL OR bi.tipo = p_tipo)
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
       WHERE p_classe_id IS NOT NULL
         AND lc.aluno_id = auth.uid()
         AND lc.classe_id = p_classe_id
         AND lc.classe_id IN (SELECT public.app_classes_do_aluno())
         AND lc.origem = 'compra'
         AND lc.status <> 'estornada'
         AND (p_origem IS NULL OR p_origem = 'loja')
         AND (p_tipo IS NULL OR p_tipo = 'loja')
         AND (p_busca IS NULL OR (li.nome || ' ' || li.descricao) ILIKE '%' || p_busca || '%')
    ) itens;
$fn$;
GRANT EXECUTE ON FUNCTION public.bag_listar(text,text,bigint,bigint,text) TO authenticated;
"""


def upgrade() -> None:
    op.execute(CONSTRAINTS)
    op.execute(LISTAR)


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: a Bag passou a guardar material; apagar os itens antes de voltar o CHECK")
