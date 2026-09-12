"""a posse dos itens, e a contagem que poe a dotacao antes da compra

Dotacao e compra moram na mesma tabela porque uma unidade dada e' uma posse
como outra qualquer -- so' que com `preco_pago = 0`. A distincao importa em
exatamente dois lugares:

  - preco: a escalada de `preco_fator` conta so' `origem = 'compra'`. Ganhar
    unidade nao encarece a seguinte;
  - teto: o teto do professor conta TODAS as posses. Ele e' decisao pedagogica
    sobre quanto prazo e' aceitavel, nao sobre quanto o aluno pagou.

A concessao da dotacao e' derivada, nao materializada na matricula:
`dotacao - usadas + compradas`. Materializar criaria a pergunta insoluvel do
que fazer quando o professor mudar a dotacao depois -- quem entrou antes fica
com a antiga? Derivando, mudar o numero vale para todos na hora.

Revision ID: 20260912_04
Revises: 20260912_03
Create Date: 2026-09-12
"""

from alembic import op

revision = "20260912_04"
down_revision = "20260912_03"
branch_labels = None
depends_on = None


TABELA = """
CREATE TABLE IF NOT EXISTS public.loja_compras (
  id               bigserial PRIMARY KEY,
  aluno_id         uuid    NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  classe_id        bigint  NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  item_codigo      text    NOT NULL REFERENCES public.loja_itens(codigo),
  origem           text    NOT NULL DEFAULT 'compra'
                     CHECK (origem IN ('compra','dotacao','concessao')),
  preco_pago       numeric NOT NULL DEFAULT 0 CHECK (preco_pago >= 0),
  alvo_tipo        text    NULL CHECK (alvo_tipo IN ('atividade','topico','questao')),
  alvo_id          bigint  NULL,
  status           text    NOT NULL DEFAULT 'ativa'
                     CHECK (status IN ('ativa','consumida','estornada')),
  idempotency_key  text    NOT NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  consumido_em     timestamptz NULL,
  UNIQUE (aluno_id, idempotency_key)
);

COMMENT ON COLUMN public.loja_compras.origem IS
  'compra | dotacao | concessao. So importa em dois lugares: a escalada de
   preco conta apenas compra, e o teto do professor conta todas.';

CREATE INDEX IF NOT EXISTS loja_compras_aluno_item_idx
  ON public.loja_compras (aluno_id, classe_id, item_codigo);

ALTER TABLE public.loja_compras ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.loja_compras FROM anon, authenticated;

DROP POLICY IF EXISTS loja_compras_sel_proprio ON public.loja_compras;
CREATE POLICY loja_compras_sel_proprio ON public.loja_compras
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid());

DROP POLICY IF EXISTS loja_compras_sel_professor ON public.loja_compras;
CREATE POLICY loja_compras_sel_professor ON public.loja_compras
  FOR SELECT TO authenticated
  USING (aluno_id IN (SELECT public.app_alunos_do_professor()));
"""

SALDO_ITEM = """
CREATE OR REPLACE FUNCTION public.loja_saldo_item(
  p_classe_id bigint,
  p_item      text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_dotacao integer;
  v_usadas  integer;
BEGIN
  SELECT COALESCE(quantidade, 0) INTO v_dotacao
    FROM public.loja_dotacao
   WHERE classe_id = p_classe_id AND item_codigo = p_item;

  v_dotacao := COALESCE(v_dotacao, 0);

  SELECT count(*) INTO v_usadas
    FROM public.loja_compras
   WHERE aluno_id = auth.uid()
     AND classe_id = p_classe_id
     AND item_codigo = p_item
     AND origem = 'dotacao'
     AND status <> 'estornada';

  RETURN GREATEST(0, v_dotacao - COALESCE(v_usadas, 0));
END;
$fn$;

-- Quantas unidades o aluno ja COMPROU deste item, para a escalada de preco.
-- Conta so' origem = 'compra': ganhar unidade nao encarece a seguinte.
CREATE OR REPLACE FUNCTION public.loja_compradas_do_item(
  p_classe_id bigint,
  p_item      text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT COALESCE(count(*), 0)::integer
    FROM public.loja_compras
   WHERE aluno_id = auth.uid()
     AND classe_id = p_classe_id
     AND item_codigo = p_item
     AND origem = 'compra'
     AND status <> 'estornada';
$fn$;

GRANT EXECUTE ON FUNCTION public.loja_saldo_item(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.loja_compradas_do_item(bigint, text) TO authenticated;
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(SALDO_ITEM)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.loja_compras CASCADE;")
