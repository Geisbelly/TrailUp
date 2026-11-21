import asyncio
from collections.abc import AsyncIterator
from typing import Awaitable, Callable, TypeVar

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError, OperationalError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.settings import Settings

T = TypeVar("T")


class DatabaseUnavailableError(RuntimeError):
    """Banco temporariamente indisponivel depois das tentativas configuradas."""


def _is_transient_database_error(exc: BaseException) -> bool:
    current: BaseException | None = exc
    while current is not None:
        if isinstance(current, (OSError, TimeoutError, OperationalError, DBAPIError)):
            return True
        current = current.__cause__ or current.__context__
    return isinstance(exc, DBAPIError) and bool(exc.connection_invalidated)


async def execute_with_database_retry(
    operation: Callable[[], Awaitable[T]],
    settings: Settings,
) -> T:
    attempts = max(1, int(settings.database_connect_retry_attempts))
    delay = max(0.0, float(settings.database_connect_retry_delay_sec))
    last_error: BaseException | None = None

    for attempt in range(attempts):
        try:
            return await operation()
        except Exception as exc:
            last_error = exc
            if not _is_transient_database_error(exc) or attempt == attempts - 1:
                break
            await asyncio.sleep(delay * (attempt + 1))

    raise DatabaseUnavailableError(
        f"Banco indisponivel apos {attempts} tentativa(s)."
    ) from last_error


def opcoes_do_engine(settings: Settings) -> tuple[dict[str, object], dict[str, object]]:
    """`connect_args` e os kwargs de `create_async_engine` para esta `database_url`."""
    url = make_url(settings.database_url)
    connect_args: dict[str, object] = {}
    engine_kwargs: dict[str, object] = {
        "future": True,
        "pool_pre_ping": True,
    }
    if url.drivername == "postgresql+asyncpg":
        # Evita conexoes presas em instabilidade de rede/DNS no startup e no worker loop.
        connect_args["timeout"] = max(5, int(getattr(settings, "database_connect_timeout_sec", 20) or 20))
        connect_args["command_timeout"] = max(10, int(getattr(settings, "database_command_timeout_sec", 60) or 60))

    if url.drivername == "postgresql+asyncpg" and (url.host or "").endswith("pooler.supabase.com"):
        # Supavisor: o backend do Postgres pode mudar a cada transacao, entao nenhum cache de
        # prepared statement atravessa transacoes (nem o do asyncpg nem o do SQLAlchemy).
        connect_args["statement_cache_size"] = 0
        connect_args["prepared_statement_cache_size"] = 0
        # Pool de verdade, nao NullPool. Com NullPool cada sessao abria uma conexao nova com o
        # pooler: handshake TLS, autenticacao e a introspeccao de tipos do asyncpg a cada vez.
        # Os lacos de fundo abrem sessao a cada poucos segundos, e isso dava ~68 mil conexoes e
        # ~230 MB de egress por dia com a API parada; em 20/11 estourou a cota do plano Free e o
        # Supabase restringiu todos os servicos (402). O pool reaproveita a conexao com o
        # Supavisor, que continua em modo transacao do lado do banco.
        engine_kwargs["pool_size"] = max(1, int(getattr(settings, "database_pool_size", 5) or 5))
        engine_kwargs["max_overflow"] = max(0, int(getattr(settings, "database_pool_max_overflow", 5) or 0))
        engine_kwargs["pool_recycle"] = max(30, int(getattr(settings, "database_pool_recycle_sec", 300) or 300))
        engine_kwargs["pool_timeout"] = max(1, int(getattr(settings, "database_pool_timeout_sec", 30) or 30))

    return connect_args, engine_kwargs


def build_engine(settings: Settings) -> AsyncEngine:
    connect_args, engine_kwargs = opcoes_do_engine(settings)
    return create_async_engine(
        settings.database_url,
        connect_args=connect_args,
        **engine_kwargs,
    )


def build_session_factory(settings: Settings) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    engine = build_engine(settings)
    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    return engine, session_factory


async def ping_database(session: AsyncSession) -> None:
    await session.execute(text("SELECT 1"))


async def session_dependency(
    session_factory: async_sessionmaker[AsyncSession],
    settings: Settings,
) -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        await execute_with_database_retry(
            lambda: session.execute(text("SELECT 1")),
            settings,
        )
        yield session
