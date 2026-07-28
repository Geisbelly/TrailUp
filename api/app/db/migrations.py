import logging
from pathlib import Path

from alembic.config import Config

from alembic import command

logger = logging.getLogger(__name__)


def upgrade_database_to_head(database_url: str | None = None) -> None:
    """Aplica as migracoes pendentes antes de a API aceitar requisicoes."""
    api_root = Path(__file__).resolve().parents[2]
    config = Config(str(api_root / "alembic.ini"))
    config.set_main_option("script_location", str(api_root / "alembic"))
    if database_url:
        # O startup deve migrar exatamente o banco usado pela API. Uma
        # ALEMBIC_DATABASE_URL antiga nao pode derrubar o deploy enquanto a
        # DATABASE_URL de runtime esta valida.
        config.attributes["database_url_override"] = database_url
    try:
        command.upgrade(config, "head")
    except Exception:
        logger.exception("Falha ao aplicar migracoes do banco de dados.")
        raise
