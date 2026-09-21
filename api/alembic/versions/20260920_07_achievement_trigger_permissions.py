"""Allow server-derived achievement rewards without opening client reward writes."""
from alembic import op

revision = '20260920_07'
down_revision = '20260920_06'
branch_labels = None
depends_on = None

SQL = """
-- The originating event is still checked by eventos_aluno_posse_ins.
-- Only the attached AFTER trigger can grant achievements derived from DB data.
-- Running it as the student rejected conquista_desbloqueada and rolled back
-- the original topico_iniciado event as well.
ALTER FUNCTION public.trg_eventos_aluno_after_iud() SECURITY DEFINER;
ALTER FUNCTION public.trg_eventos_aluno_after_iud() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.trg_eventos_aluno_after_iud() FROM PUBLIC, anon, authenticated;
"""


def upgrade():
    op.execute(SQL)


def downgrade():
    op.execute('ALTER FUNCTION public.trg_eventos_aluno_after_iud() SECURITY INVOKER')
    op.execute('GRANT EXECUTE ON FUNCTION public.trg_eventos_aluno_after_iud() TO PUBLIC')
