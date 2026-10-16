"""aprovacoes_ultima(): quem foi liberado por último, para o estado vazio da tela

O estado vazio da tela Aprovações do protótipo V9 termina com "Última aprovação: <nome>,
em <data>". Depende de `professor.liberado_em` (20261013_01) e segue a mesma regra de
acesso de `aprovacoes_pendentes()` (20261013_02): só o dono, conferido no banco antes
de ler qualquer linha.

Considera só quem tem `liberado_em` preenchido — quem foi liberado antes da coluna
existir não tem data, e a tela mostra "sem data" em vez de inventar uma. Sem nenhum
liberado com data, a função devolve zero linhas.

Revision ID: 20261013_03
Revises: 20261013_02
Create Date: 2026-10-13
"""

from alembic import op

revision = "20261013_03"
down_revision = "20261013_02"
branch_labels = None
depends_on = None


SQL = r"""
CREATE OR REPLACE FUNCTION public.aprovacoes_ultima()
RETURNS TABLE (nome text, liberado_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Apenas o dono do sistema acessa a fila de aprovacoes.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.nome::text, p.liberado_em
    FROM public.professor p
   WHERE p.liberado IS TRUE AND p.liberado_em IS NOT NULL
   ORDER BY p.liberado_em DESC
   LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.aprovacoes_ultima() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovacoes_ultima() TO authenticated;

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.aprovacoes_ultima()")
    op.execute("NOTIFY pgrst, 'reload schema'")
