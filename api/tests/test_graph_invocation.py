from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI

from app.services import graph_invocation


class _GraphOK:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload
        self.calls = 0

    async def ainvoke(self, state, config):
        self.calls += 1
        return self.payload


class _GraphFail:
    def __init__(self, error: Exception) -> None:
        self.error = error
        self.calls = 0

    async def ainvoke(self, state, config):
        self.calls += 1
        raise self.error


def _build_app_with_state(**kwargs) -> FastAPI:
    app = FastAPI()
    app.state.settings = SimpleNamespace()
    app.state.session_factory = None
    for key, value in kwargs.items():
        setattr(app.state, key, value)
    return app


@pytest.mark.asyncio
async def test_ainvoke_personalizacao_graph_falls_back_to_ephemeral_when_postgres_drops(monkeypatch) -> None:
    persistent_graph = _GraphFail(
        RuntimeError("consuming input failed: server closed the connection unexpectedly")
    )
    ephemeral_graph = _GraphOK({"source": "ephemeral"})
    old_checkpointer = object()
    ephemeral_checkpointer = object()

    app = _build_app_with_state(
        graph_personalizacao=persistent_graph,
        graph_ephemeral=ephemeral_graph,
        graph_personalizacao_degraded=False,
        checkpointer_personalizacao=old_checkpointer,
        checkpointer_manager_personalizacao="old-manager",
        checkpointer_backend_personalizacao="postgres",
        checkpointer_ephemeral=ephemeral_checkpointer,
        checkpointer_manager_ephemeral="ephemeral-manager",
        checkpointer_backend_ephemeral="memory",
    )

    close_mock = AsyncMock()
    monkeypatch.setattr(graph_invocation, "close_checkpointer", close_mock)

    result = await graph_invocation.ainvoke_personalizacao_graph(
        app=app,
        state={"foo": "bar"},
        config={"configurable": {"thread_id": "t-1"}},
    )

    assert result == {"source": "ephemeral"}
    assert persistent_graph.calls == 1
    assert ephemeral_graph.calls == 1
    assert app.state.graph_personalizacao_degraded is True
    assert app.state.graph_personalizacao is ephemeral_graph
    assert app.state.checkpointer_personalizacao is ephemeral_checkpointer
    close_mock.assert_awaited_once_with(old_checkpointer, "old-manager")


@pytest.mark.asyncio
async def test_ainvoke_personalizacao_graph_uses_ephemeral_when_already_degraded(monkeypatch) -> None:
    persistent_graph = _GraphFail(RuntimeError("should not call persistent"))
    ephemeral_graph = _GraphOK({"source": "degraded-ephemeral"})
    app = _build_app_with_state(
        graph_personalizacao=persistent_graph,
        graph_ephemeral=ephemeral_graph,
        graph_personalizacao_degraded=True,
        graph_personalizacao_last_recovery_attempt=0.0,
    )

    recover_mock = AsyncMock(return_value=False)
    monkeypatch.setattr(graph_invocation, "_try_recover_persistent_graph", recover_mock)

    result = await graph_invocation.ainvoke_personalizacao_graph(
        app=app,
        state={},
        config={},
    )

    assert result == {"source": "degraded-ephemeral"}
    assert persistent_graph.calls == 0
    assert ephemeral_graph.calls == 1
    recover_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_ainvoke_personalizacao_graph_re_raises_non_checkpointer_errors() -> None:
    app = _build_app_with_state(
        graph_personalizacao=_GraphFail(ValueError("erro de domínio")),
        graph_ephemeral=_GraphOK({"source": "ephemeral"}),
        graph_personalizacao_degraded=False,
    )

    with pytest.raises(ValueError):
        await graph_invocation.ainvoke_personalizacao_graph(
            app=app,
            state={},
            config={},
        )
