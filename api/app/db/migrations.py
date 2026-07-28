import logging
from pathlib import Path

from alembic.config import Config

from alembic import command

logger = logging.getLogger(__name__)


def upgrade_database_to_head() -> None:
    """Aplica as migracoes pendentes antes de a API aceitar requisicoes."""
    api_root = Path(__file__).resolve().parents[2]
    config = Config(str(api_root / "alembic.ini"))
    config.set_main_option("script_location", str(api_root / "alembic"))
    try:
        command.upgrade(config, "head")
    except Exception:
        logger.exception("Falha ao aplicar migracoes do banco de dados.")
        raise
