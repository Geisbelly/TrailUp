"""o saldo de moedas sai de um razao append-only

XP mede, moeda gasta. O rank soma `eventos_aluno.valor`; se gastar reduzisse
XP, o placar se mexeria quando alguem comprasse uma dica, e a posicao deixaria
de significar esforco acumulado. Por isso a moeda e' uma tabela propria, e
nenhuma escrita daqui chega perto de `eventos_aluno`.

Saldo e' `SUM(delta)`, nunca uma coluna. Coluna de saldo perde o historico --
e sem historico nao ha como auditar de onde veio a moeda. Com 20 alunos num
piloto o custo do SUM e' irrelevante; se crescer vira indice ou vista
materializada sem mudar a interface publica.

O indice unico e' PARCIAL de proposito. Ganho e' idempotente: o mesmo acerto na
mesma questao paga uma vez na vida, senao reabrir a mesma atividade vira a
melhor fonte de renda do sistema (sao 86 eventos de revisao num unico aluno de
demonstracao). Compra nao entra na regra: comprar duas vezes o mesmo item e'
legitimo.

Revision ID: 20260912_01
Revises: 20260909_05
Create Date: 2026-09-12
"""

from alembic import op

revision = "20260912_01"
down_revision = "20260909_05"
branch_labels = None
depends_on = None


TABELA = """
CREATE TABLE IF NOT EXISTS public.moedas_ledger (
  id           bigserial   PRIMARY KEY,
  aluno_id     uuid        NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  delta        numeric     NOT NULL CHECK (delta <> 0),
  motivo       text        NOT NULL CHECK (motivo IN
                 ('evento','dotacao','compra','estorno','concessao')),
  evento_tipo  text        NULL,
  referencia   text        NULL,
  classe_id    bigint      NULL REFERENCES public.classe(id) ON DELETE SET NULL,
  compra_id    bigint      NULL,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.moedas_ledger IS
  'Livro-razao append-only das moedas. Saldo e SUM(delta); nunca materializar.';

COMMENT ON COLUMN public.moedas_ledger.classe_id IS
  'De qual turma veio a moeda. Serve a metrica; nao participa do saldo.';

CREATE INDEX IF NOT EXISTS moedas_ledger_aluno_idx
  ON public.moedas_ledger (aluno_id, criado_em DESC);

CREATE UNIQUE INDEX IF NOT EXISTS moedas_ledger_ganho_unico
  ON public.moedas_ledger (aluno_id, evento_tipo, referencia)
  WHERE motivo = 'evento';
"""

RLS = """
ALTER TABLE public.moedas_ledger ENABLE ROW LEVEL SECURITY;

-- Escrita so' por RPC SECURITY DEFINER. Se o cliente pudesse inserir aqui, a
-- moeda seria digitavel -- o mesmo defeito que o #164 corrigiu no rank.
REVOKE INSERT, UPDATE, DELETE ON public.moedas_ledger FROM anon, authenticated;

DROP POLICY IF EXISTS moedas_ledger_sel_proprio ON public.moedas_ledger;
CREATE POLICY moedas_ledger_sel_proprio ON public.moedas_ledger
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid());

DROP POLICY IF EXISTS moedas_ledger_sel_professor ON public.moedas_ledger;
CREATE POLICY moedas_ledger_sel_professor ON public.moedas_ledger
  FOR SELECT TO authenticated
  USING (aluno_id IN (SELECT public.app_alunos_do_professor()));
"""


FUNCOES = """
-- SECURITY INVOKER de proposito: a RPC le o razao do proprio chamador, e as
-- policies de SELECT ja fazem o recorte. Definer aqui seria privilegio a mais
-- sem necessidade.
CREATE OR REPLACE FUNCTION public.loja_saldo()
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT COALESCE(SUM(delta), 0)
    FROM public.moedas_ledger
   WHERE aluno_id = auth.uid();
$fn$;

CREATE OR REPLACE FUNCTION public.loja_extrato(p_limite integer DEFAULT 50)
RETURNS TABLE (
  criado_em   timestamptz,
  delta       numeric,
  motivo      text,
  evento_tipo text,
  classe_id   bigint
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT criado_em, delta, motivo, evento_tipo, classe_id
    FROM public.moedas_ledger
   WHERE aluno_id = auth.uid()
   ORDER BY criado_em DESC, id DESC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 50), 200));
$fn$;

GRANT EXECUTE ON FUNCTION public.loja_saldo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.loja_extrato(integer) TO authenticated;
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(RLS)
    op.execute(FUNCOES)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.moedas_ledger CASCADE;")
