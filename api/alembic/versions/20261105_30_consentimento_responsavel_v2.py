"""Version the updated responsible-adult camera/emotion consent text (#30, #195).

The copy now identifies the US transfer and clarifies that behavioral telemetry
is not used to infer emotion. Existing acceptance must not silently attest to
this changed text, so the current-version function advances and asks guardians
to review the new version.

Revision ID: 20261105_30
Revises: 20261105_29
Create Date: 2026-11-05
"""

from alembic import op

revision = "20261105_30"
down_revision = "20261105_29"
branch_labels = None
depends_on = None

VERSAO_ANTIGA = "2026-10-24-resp-v1"
VERSAO_NOVA = "2026-11-05-resp-v2"


def _sql(versao: str) -> str:
    return f"""
CREATE OR REPLACE FUNCTION public.consentimento_responsavel_versao_vigente()
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT '{versao}'::text $function$;
"""


def upgrade() -> None:
    op.execute(_sql(VERSAO_NOVA))


def downgrade() -> None:
    op.execute(_sql(VERSAO_ANTIGA))
