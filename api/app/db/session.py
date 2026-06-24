from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.settings import Settings


def build_engine(settings: Settings) -> AsyncEngine:
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
        connect_args["statement_cache_size"] = 0
        engine_kwargs["poolclass"] = NullPool

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
) -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session
