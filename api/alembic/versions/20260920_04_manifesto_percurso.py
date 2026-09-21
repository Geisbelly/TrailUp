"""Count the current delivered journey, not historical generated versions."""
from pathlib import Path
from alembic import op

revision = '20260920_04'
down_revision = '20260920_03'
branch_labels = None
depends_on = None


def upgrade() -> None:
    path = Path(__file__).resolve().parents[3] / 'docs/mobile/sql/20260920_04_manifesto_percurso.sql'
    op.execute(path.read_text(encoding='utf-8'))


def downgrade() -> None:
    raise RuntimeError('Downgrade manual: preservar manifestos e histórico de progresso.')
