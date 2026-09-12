"""Create the private, mutual Social relationships after the store chain.

Guilds are intentionally not created here: issue #153 is still a design
contract for future event mechanics. Keeping this migration scoped to private
friendships prevents guild membership from becoming an accidental bypass of
the friendship block/RLS rules.
"""

from pathlib import Path

from alembic import op

revision = "20260912_06"
down_revision = "20260912_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    path = Path(__file__).resolve().parents[3] / "docs" / "mobile" / "sql" / "20260912_02_social_amizades.sql"
    op.execute(path.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("""
      DROP FUNCTION IF EXISTS public.social_listar_pessoas();
      DROP FUNCTION IF EXISTS public.social_desbloquear(uuid);
      DROP FUNCTION IF EXISTS public.social_bloquear(uuid);
      DROP FUNCTION IF EXISTS public.social_desfazer_amizade(uuid);
      DROP FUNCTION IF EXISTS public.social_recusar_convite(uuid);
      DROP FUNCTION IF EXISTS public.social_aceitar_convite(uuid);
      DROP FUNCTION IF EXISTS public.social_enviar_convite(uuid);
      DROP FUNCTION IF EXISTS public.social_sao_colegas(uuid,uuid);
      DROP FUNCTION IF EXISTS public.social_par(uuid,uuid);
      DROP TABLE IF EXISTS public.social_relacionamentos;
    """)
