from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context
from app.core.settings import get_settings
from app.db.migrations import normalize_database_url_for_alembic

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = None


def _configure_database_url() -> str:
    settings = get_settings()
    raw_url = config.attributes.get("database_url_override")
    if not isinstance(raw_url, str) or not raw_url.strip():
        raw_url = settings.alembic_database_url or settings.database_url
    url = normalize_database_url_for_alembic(raw_url)
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return url


def run_migrations_offline() -> None:
    url = _configure_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    _configure_database_url()
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
