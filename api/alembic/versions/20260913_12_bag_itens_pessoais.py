"""Add the student's personal Bag items and a unified read API."""

from alembic import op

revision = "20260913_12"
down_revision = "20260913_11"
branch_labels = None
depends_on = None


TABLE = """
CREATE TABLE IF NOT EXISTS public.bag_itens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aluno_id UUID NOT NULL REFERENCES public.alunos(id),
  classe_id BIGINT REFERENCES public.classe(id),
  topico_id BIGINT REFERENCES public.topicos(id),
  conteudo_id BIGINT REFERENCES public.conteudos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('resumo', 'anotacao', 'card')),
  titulo TEXT NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 160),
  conteudo TEXT,
  frente TEXT,
  verso TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  excluido_em TIMESTAMPTZ,
  CONSTRAINT bag_itens_formato_valido CHECK (
    (tipo IN ('resumo', 'anotacao')
      AND nullif(btrim(conteudo), '') IS NOT NULL
      AND frente IS NULL AND verso IS NULL)
    OR
    (tipo = 'card'
      AND nullif(btrim(frente), '') IS NOT NULL
      AND nullif(btrim(verso), '') IS NOT NULL
      AND conteudo IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_bag_itens_aluno_atualizado
  ON public.bag_itens (aluno_id, atualizado_em DESC)
  WHERE excluido_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_bag_itens_aluno_topico
  ON public.bag_itens (aluno_id, topico_id, tipo)
  WHERE excluido_em IS NULL;

ALTER TABLE public.bag_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bag_itens_select_owner ON public.bag_itens;
DROP POLICY IF EXISTS bag_itens_insert_owner ON public.bag_itens;
DROP POLICY IF EXISTS bag_itens_update_owner ON public.bag_itens;
CREATE POLICY bag_itens_select_owner ON public.bag_itens
  FOR SELECT USING (aluno_id = auth.uid());
CREATE POLICY bag_itens_insert_owner ON public.bag_itens
  FOR INSERT WITH CHECK (aluno_id = auth.uid());
CREATE POLICY bag_itens_update_owner ON public.bag_itens
  FOR UPDATE USING (aluno_id = auth.uid())
  WITH CHECK (aluno_id = auth.uid());
"""


VALIDAR_VINCULO = """
CREATE OR REPLACE FUNCTION public.bag_validar_vinculo(
  p_aluno UUID, p_classe BIGINT, p_topico BIGINT, p_conteudo BIGINT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_classe IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.classe_aluno
     WHERE aluno_id = p_aluno AND classe_id = p_classe
  ) THEN
    RAISE EXCEPTION 'bag_classe_nao_autorizada';
  END IF;
  IF p_topico IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.topicos
     WHERE id = p_topico AND (p_classe IS NULL OR classe_id = p_classe)
  ) THEN
    RAISE EXCEPTION 'bag_topico_invalido';
  END IF;
  IF p_conteudo IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.conteudos c
      JOIN public.topicos t ON t.id = c.topico_id
     WHERE c.id = p_conteudo
       AND (p_topico IS NULL OR c.topico_id = p_topico)
       AND (p_classe IS NULL OR t.classe_id = p_classe)
  ) THEN
    RAISE EXCEPTION 'bag_conteudo_invalido';
  END IF;
END;
$fn$;
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
       WHERE cp.aluno_id = auth.uid()
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
    ) itens;
$fn$;
"""


CRIAR = """
CREATE OR REPLACE FUNCTION public.bag_criar(
  p_tipo TEXT, p_titulo TEXT, p_conteudo TEXT DEFAULT NULL,
  p_frente TEXT DEFAULT NULL, p_verso TEXT DEFAULT NULL,
  p_classe_id BIGINT DEFAULT NULL, p_topico_id BIGINT DEFAULT NULL,
  p_conteudo_id BIGINT DEFAULT NULL, p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_id BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'bag_nao_autenticada'; END IF;
  PERFORM public.bag_validar_vinculo(auth.uid(), p_classe_id, p_topico_id, p_conteudo_id);
  INSERT INTO public.bag_itens(aluno_id, classe_id, topico_id, conteudo_id, tipo, titulo, conteudo, frente, verso, metadata)
  VALUES (auth.uid(), p_classe_id, p_topico_id, p_conteudo_id, lower(btrim(p_tipo)), btrim(p_titulo), nullif(btrim(p_conteudo), ''), nullif(btrim(p_frente), ''), nullif(btrim(p_verso), ''), coalesce(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', 'item:' || v_id::text);
END;
$fn$;
"""


ATUALIZAR = """
CREATE OR REPLACE FUNCTION public.bag_atualizar(
  p_id BIGINT, p_tipo TEXT, p_titulo TEXT, p_conteudo TEXT DEFAULT NULL,
  p_frente TEXT DEFAULT NULL, p_verso TEXT DEFAULT NULL,
  p_classe_id BIGINT DEFAULT NULL, p_topico_id BIGINT DEFAULT NULL,
  p_conteudo_id BIGINT DEFAULT NULL, p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'bag_nao_autenticada'; END IF;
  PERFORM public.bag_validar_vinculo(auth.uid(), p_classe_id, p_topico_id, p_conteudo_id);
  UPDATE public.bag_itens
     SET tipo = lower(btrim(p_tipo)), titulo = btrim(p_titulo),
         conteudo = nullif(btrim(p_conteudo), ''), frente = nullif(btrim(p_frente), ''), verso = nullif(btrim(p_verso), ''),
         classe_id = p_classe_id, topico_id = p_topico_id, conteudo_id = p_conteudo_id,
         metadata = coalesce(p_metadata, '{}'::jsonb), atualizado_em = now()
   WHERE id = p_id AND aluno_id = auth.uid() AND excluido_em IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'bag_item_nao_encontrado'; END IF;
  RETURN jsonb_build_object('id', 'item:' || p_id::text);
END;
$fn$;
"""


EXCLUIR = """
CREATE OR REPLACE FUNCTION public.bag_excluir(p_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  UPDATE public.bag_itens
     SET excluido_em = now(), atualizado_em = now()
   WHERE id = p_id AND aluno_id = auth.uid() AND excluido_em IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'bag_item_nao_encontrado'; END IF;
  RETURN jsonb_build_object('id', 'item:' || p_id::text, 'deleted', true);
END;
$fn$;
"""


def upgrade() -> None:
    op.execute(TABLE)
    op.execute(VALIDAR_VINCULO)
    op.execute(LISTAR)
    op.execute(CRIAR)
    op.execute(ATUALIZAR)
    op.execute(EXCLUIR)
    op.execute(
        "GRANT EXECUTE ON FUNCTION public.bag_listar(text,text,bigint,bigint,text), "
        "public.bag_criar(text,text,text,text,text,bigint,bigint,bigint,jsonb), "
        "public.bag_atualizar(bigint,text,text,text,text,text,bigint,bigint,bigint,jsonb), "
        "public.bag_excluir(bigint) TO authenticated"
    )


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: manter a Bag de itens pessoais")

