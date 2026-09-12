"""Create the Social store schema and secure purchase RPC.

The canonical SQL is shared with the direct Supabase migration so both deploy
paths execute the same contract.
"""

from pathlib import Path

from alembic import op

revision = "20260912_01"
down_revision = "20260909_05"
branch_labels = None
depends_on = None


def _sql_path() -> Path:
    return Path(__file__).resolve().parents[3] / "docs" / "mobile" / "sql" / "20260912_01_loja_modal_social.sql"


def upgrade() -> None:
    op.execute(_sql_path().read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        """
        DROP FUNCTION IF EXISTS public.trailup_comprar_loja_item(bigint, uuid);
        DROP FUNCTION IF EXISTS public.trailup_loja_catalogo(text);
        DROP FUNCTION IF EXISTS public.trailup_loja_gate_ok(uuid, jsonb);
        DROP TABLE IF EXISTS public.loja_posses;
        DROP TABLE IF EXISTS public.loja_movimentos;
        DROP TABLE IF EXISTS public.loja_saldos;
        DROP TABLE IF EXISTS public.loja_itens;
        DROP TABLE IF EXISTS public.loja_perfis;
        """
    )
