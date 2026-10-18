"""professor.liberado_em: guarda quando o acesso foi liberado

A tela Aprovações do protótipo V9 mostra "Última aprovação: <nome>, em <data>" no
estado vazio (docs/frontend/redesign-fase-2, Aprovações). Não havia de onde tirar a
data: `professor` só tem `created_at` (quando a pessoa se cadastrou), e a liberação
é um `UPDATE liberado = true` que não deixava rastro.

A coluna é preenchida por um gatilho, não pelo console: assim vale também para uma
liberação feita direto no painel do Supabase, e o cliente não decide a própria data.
- liberado passa a TRUE (INSERT já liberado, ou UPDATE de false/NULL para true): grava now();
- liberado volta a FALSE/NULL: limpa (a pessoa deixou de estar liberada).
Quem já estava liberado antes desta migration fica com `liberado_em` NULL — a data
real não existe e inventar uma (ex.: created_at) mostraria uma "última aprovação"
falsa. A tela trata NULL como "sem data".

A função de gatilho tem EXECUTE revogado de PUBLIC/anon/authenticated, como as demais
(20261003_05); o gatilho dispara do mesmo jeito.

Revision ID: 20261013_01
Revises: 20261011_04
Create Date: 2026-10-13
"""

from alembic import op

revision = "20261013_01"
down_revision = "20261011_04"
branch_labels = None
depends_on = None


SQL = r"""
ALTER TABLE public.professor ADD COLUMN IF NOT EXISTS liberado_em timestamptz;

COMMENT ON COLUMN public.professor.liberado_em IS
  'Quando o acesso foi liberado. NULL = nunca liberado ou liberado antes desta coluna existir.';

CREATE OR REPLACE FUNCTION public.trg_professor_liberado_em()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.liberado IS TRUE THEN
    IF TG_OP = 'INSERT' OR OLD.liberado IS DISTINCT FROM TRUE THEN
      NEW.liberado_em := now();
    END IF;
  ELSE
    NEW.liberado_em := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_professor_liberado_em() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_professor_liberado_em ON public.professor;
CREATE TRIGGER trg_professor_liberado_em
  BEFORE INSERT OR UPDATE OF liberado ON public.professor
  FOR EACH ROW EXECUTE FUNCTION public.trg_professor_liberado_em();

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_professor_liberado_em ON public.professor")
    op.execute("DROP FUNCTION IF EXISTS public.trg_professor_liberado_em()")
    op.execute("ALTER TABLE public.professor DROP COLUMN IF EXISTS liberado_em")
    op.execute("NOTIFY pgrst, 'reload schema'")
