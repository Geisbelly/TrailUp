from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from app.core.settings import Settings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class CheckpointCleanupResult:
    namespaces: int = 0
    writes_deleted: int = 0
    blobs_deleted: int = 0
    checkpoints_deleted: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "namespaces": self.namespaces,
            "writes_deleted": self.writes_deleted,
            "blobs_deleted": self.blobs_deleted,
            "checkpoints_deleted": self.checkpoints_deleted,
        }


async def cleanup_persisted_checkpoints(
    *,
    checkpointer: Any,
    backend: str,
    checkpoint_ns: str,
    retention_days: int,
) -> CheckpointCleanupResult:
    if backend != "postgres" or retention_days <= 0 or not hasattr(checkpointer, "_cursor"):
        return CheckpointCleanupResult()

    result = CheckpointCleanupResult()

    async with checkpointer._cursor(pipeline=True) as cur:
        expired_query = """
            WITH expired_threads AS (
              SELECT
                thread_id,
                checkpoint_ns
              FROM checkpoints
              WHERE checkpoint_ns = %s
              GROUP BY thread_id, checkpoint_ns
              HAVING MAX((checkpoint ->> 'ts')::timestamptz) < (NOW() - (%s::text || ' days')::interval)
            )
            SELECT thread_id, checkpoint_ns
            FROM expired_threads
        """
        expired_rows = await (await cur.execute(expired_query, (checkpoint_ns, int(retention_days)))).fetchall()
        if not expired_rows:
            return result

        result.namespaces = len(expired_rows)

        for row in expired_rows:
            thread_id = row["thread_id"]
            namespace = row["checkpoint_ns"]

            delete_writes = await cur.execute(
                """
                DELETE FROM checkpoint_writes
                WHERE thread_id = %s
                  AND checkpoint_ns = %s
                """,
                (thread_id, namespace),
            )
            delete_blobs = await cur.execute(
                """
                DELETE FROM checkpoint_blobs
                WHERE thread_id = %s
                  AND checkpoint_ns = %s
                """,
                (thread_id, namespace),
            )
            delete_checkpoints = await cur.execute(
                """
                DELETE FROM checkpoints
                WHERE thread_id = %s
                  AND checkpoint_ns = %s
                """,
                (thread_id, namespace),
            )
            result.writes_deleted += max(0, delete_writes.rowcount or 0)
            result.blobs_deleted += max(0, delete_blobs.rowcount or 0)
            result.checkpoints_deleted += max(0, delete_checkpoints.rowcount or 0)

    logger.info(
        "checkpoint_retention.cleanup=%s",
        {
            "checkpoint_ns": checkpoint_ns,
            "retention_days": retention_days,
            **result.as_dict(),
        },
    )
    return result


async def run_checkpoint_retention_once(
    *,
    checkpointer: Any,
    backend: str,
    settings: Settings,
) -> CheckpointCleanupResult:
    return await cleanup_persisted_checkpoints(
        checkpointer=checkpointer,
        backend=backend,
        checkpoint_ns=settings.personalizacao_checkpoint_ns,
        retention_days=settings.checkpoint_retention_days,
    )


async def checkpoint_retention_loop(
    *,
    checkpointer: Any,
    backend: str,
    settings: Settings,
    sleep_fn: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    interval_hours = max(1, int(settings.checkpoint_retention_interval_hours))
    while True:
        try:
            await run_checkpoint_retention_once(
                checkpointer=checkpointer,
                backend=backend,
                settings=settings,
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("Falha ao executar retencao de checkpoints", exc_info=True)
        await sleep_fn(interval_hours * 3600)
