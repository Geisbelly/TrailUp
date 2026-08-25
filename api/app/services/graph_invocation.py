from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from fastapi import FastAPI

from app.agent.graph.builder import build_graph
from app.agent.graph.checkpointer import close_checkpointer, get_persistent_checkpointer

logger = logging.getLogger(__name__)

_CHECKPOINTER_ERROR_MARKERS = (
    "operationalerror",
    "connection is closed",
    "server closed the connection unexpectedly",
    "consuming input failed",
    "terminating connection",
    "connection does not exist",
    "broken pipe",
)
_RECOVERY_RETRY_INTERVAL_SEC = 30.0


def _is_checkpointer_connection_error(exc: Exception) -> bool:
    current: BaseException | None = exc
    while current is not None:
        message = f"{type(current).__name__}: {current}".lower()
        if any(marker in message for marker in _CHECKPOINTER_ERROR_MARKERS):
            return True
        current = current.__cause__ or current.__context__
    return False


def _compact_exception_text(exc: BaseException) -> str:
    text = str(exc or "").strip()
    if not text:
        return type(exc).__name__
    first_line = text.splitlines()[0].strip()
    return first_line or type(exc).__name__


def _get_recovery_lock(app: FastAPI) -> asyncio.Lock:
    lock = getattr(app.state, "graph_personalizacao_recovery_lock", None)
    if isinstance(lock, asyncio.Lock):
        return lock
    lock = asyncio.Lock()
    app.state.graph_personalizacao_recovery_lock = lock
    return lock


async def _switch_to_ephemeral_graph(app: FastAPI) -> None:
    ephemeral_graph = getattr(app.state, "graph_ephemeral", None)
    ephemeral_checkpointer = getattr(app.state, "checkpointer_ephemeral", None)
    ephemeral_backend = getattr(app.state, "checkpointer_backend_ephemeral", "memory")
    ephemeral_manager = getattr(app.state, "checkpointer_manager_ephemeral", None)

    old_checkpointer = getattr(app.state, "checkpointer_personalizacao", None)
    old_manager = getattr(app.state, "checkpointer_manager_personalizacao", None)

    app.state.graph_personalizacao_degraded = True
    if ephemeral_graph is not None:
        app.state.graph_personalizacao = ephemeral_graph
        app.state.graph = ephemeral_graph
    if ephemeral_checkpointer is not None:
        app.state.checkpointer_personalizacao = ephemeral_checkpointer
        app.state.checkpointer_backend_personalizacao = ephemeral_backend
        app.state.checkpointer_manager_personalizacao = ephemeral_manager
        app.state.checkpointer = ephemeral_checkpointer
        app.state.checkpointer_backend = ephemeral_backend
        app.state.checkpointer_manager = ephemeral_manager

    # Fecha explicitamente o checkpointer persistente quebrado para evitar
    # novas tentativas em conexões inválidas no mesmo processo.
    if (
        old_checkpointer is not None
        and old_checkpointer is not ephemeral_checkpointer
    ):
        try:
            await close_checkpointer(old_checkpointer, old_manager)
        except Exception:
            logger.warning("Falha ao fechar checkpointer quebrado após fallback", exc_info=True)


async def _try_recover_persistent_graph(app: FastAPI) -> bool:
    lock = _get_recovery_lock(app)
    now = time.monotonic()
    last_attempt = float(getattr(app.state, "graph_personalizacao_last_recovery_attempt", 0.0) or 0.0)
    if now - last_attempt < _RECOVERY_RETRY_INTERVAL_SEC:
        return False

    app.state.graph_personalizacao_last_recovery_attempt = now
    async with lock:
        if not bool(getattr(app.state, "graph_personalizacao_degraded", False)):
            return True

        try:
            new_checkpointer, new_backend, new_manager = await get_persistent_checkpointer(app.state.settings)
            new_graph = build_graph(app.state.settings, app.state.session_factory, new_checkpointer)
        except Exception:
            logger.exception("Falha ao tentar recuperar checkpointer persistente")
            return False

        old_checkpointer = getattr(app.state, "checkpointer_personalizacao", None)
        old_manager = getattr(app.state, "checkpointer_manager_personalizacao", None)

        app.state.checkpointer_personalizacao = new_checkpointer
        app.state.checkpointer_backend_personalizacao = new_backend
        app.state.checkpointer_manager_personalizacao = new_manager
        app.state.graph_personalizacao = new_graph
        app.state.checkpointer = new_checkpointer
        app.state.checkpointer_backend = new_backend
        app.state.checkpointer_manager = new_manager
        app.state.graph_personalizacao_degraded = new_backend != "postgres"

        if old_checkpointer is not None and old_checkpointer is not new_checkpointer:
            try:
                await close_checkpointer(old_checkpointer, old_manager)
            except Exception:
                logger.warning("Falha ao fechar checkpointer antigo durante recuperacao", exc_info=True)

        if app.state.graph_personalizacao_degraded:
            logger.warning("Recuperacao tentou backend nao persistente (%s); mantendo modo degradado", new_backend)
            return False

        logger.info("Checkpointer persistente recuperado com sucesso; retomando grafo principal")
        return True


async def ainvoke_personalizacao_graph(
    *,
    app: FastAPI,
    state: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    degraded = bool(getattr(app.state, "graph_personalizacao_degraded", False))
    if degraded:
        await _try_recover_persistent_graph(app)
        if not bool(getattr(app.state, "graph_personalizacao_degraded", False)):
            return await app.state.graph_personalizacao.ainvoke(state, config)
        return await app.state.graph_ephemeral.ainvoke(state, config)

    try:
        return await app.state.graph_personalizacao.ainvoke(state, config)
    except Exception as exc:
        if not _is_checkpointer_connection_error(exc):
            raise
        logger.warning(
            "Checkpointer PostgreSQL indisponível; fallback para grafo efêmero nesta instância: %s",
            _compact_exception_text(exc),
        )
        await _switch_to_ephemeral_graph(app)
        return await app.state.graph_ephemeral.ainvoke(state, config)
