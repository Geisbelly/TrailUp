"""Count delivered personalized items even when another format failed generation."""
from pathlib import Path

from alembic import op

revision = '20260920_02'
down_revision = '20260920_01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    path = Path(__file__).resolve().parents[3] / 'docs/mobile/sql/20260920_02_progresso_material_disponivel.sql'
    op.execute(path.read_text(encoding='utf-8'))


def downgrade() -> None:
    op.execute("""
    DO $migration$
    DECLARE nome text; definicao text;
    BEGIN
      FOREACH nome IN ARRAY ARRAY['trailup_recalcular_topico_aluno', 'trailup_recalcular_classe_aluno'] LOOP
        SELECT pg_get_functiondef(p.oid) INTO STRICT definicao
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname=nome;
        EXECUTE replace(definicao, 'AND cp.brainhex_profile_key = al.perfil_ativo',
          'AND cp.brainhex_profile_key = al.perfil_ativo AND lower(coalesce(cp.status, '''')) = ''pronto''');
      END LOOP;
    END $migration$;
    """)
