from typing import Any

from app.core.settings import Settings

try:
    from langgraph.checkpoint.memory import MemorySaver
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    from psycopg import AsyncConnection
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    AsyncConnection = None
    AsyncPostgresSaver = None
    MemorySaver = None
    dict_row = None


async def get_checkpointer(settings: Settings) -> tuple[Any, str, Any | None]:
    if settings.langgraph_db_url and AsyncPostgresSaver is not None and AsyncConnection is not None and dict_row is not None:
        connection = await AsyncConnection.connect(
            settings.langgraph_db_url,
            autocommit=True,
            prepare_threshold=None,
            row_factory=dict_row,
        )
        checkpointer = AsyncPostgresSaver(connection)
        if hasattr(checkpointer, "setup"):
            await checkpointer.setup()
        return checkpointer, "postgres", connection

    if MemorySaver is None:  # pragma: no cover
        raise RuntimeError("LangGraph nao disponivel.")
    return MemorySaver(), "memory", None


async def get_persistent_checkpointer(settings: Settings) -> tuple[Any, str, Any | None]:
    return await get_checkpointer(settings)


async def get_ephemeral_checkpointer() -> tuple[Any, str, Any | None]:
    if MemorySaver is None:  # pragma: no cover
        raise RuntimeError("LangGraph nao disponivel.")
    return MemorySaver(), "memory", None


async def close_checkpointer(
    checkpointer: Any,
    manager: Any | None = None,
) -> None:
    if manager is not None and hasattr(manager, "close"):
        await manager.close()
        return
    if hasattr(checkpointer, "aclose"):
        await checkpointer.aclose()
