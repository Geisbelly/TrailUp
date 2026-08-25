from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.settings import Settings
from app.services.personalizacao import persist_personalizacao_record


async def persist_personalizacao(
    state: dict,
    session_factory: async_sessionmaker[AsyncSession],
    settings: Settings | None = None,
) -> dict:
    record = await persist_personalizacao_record(state, session_factory, settings=settings)
    return {
        "personalizacao_record": record,
        "completed_nodes": ["persist_personalizacao"],
        "acoes_aplicadas": ["personalizacao_persistida"],
        "messages": ["personalizacao persistida"],
    }
