import logging
from pathlib import Path

from alembic.config import Config
from sqlalchemy.engine import make_url

from alembic import command

logger = logging.getLogger(__name__)


def normalize_database_url_for_alembic(raw_url: str) -> str:
    url = make_url(raw_url)
    if url.drivername == "postgresql+asyncpg":
        url = url.set(drivername="postgresql+psycopg")
    elif url.drivername == "postgresql":
        url = url.set(drivername="postgresql+psycopg")
    elif url.drivername == "sqlite+aiosqlite":
        url = url.set(drivername="sqlite")

    # ``str(URL)`` oculta a senha como "***" no SQLAlchemy 2. Essa string e
    # usada para abrir a conexao, portanto o Alembic acabava autenticando com
    # a senha mascarada. O valor integral fica somente na configuracao interna.
    return url.render_as_string(hide_password=False)


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
