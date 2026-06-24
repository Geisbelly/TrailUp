import os

# Deve ser definido ANTES dos imports da aplicação, pois módulos como
# personalizacao.py chamam get_settings() no nível de módulo.
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret")
os.environ.setdefault("ADMIN_PANEL_PASSWORD", "secret-admin")

from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.auth import UserContext


class FakeSession:
    def __init__(self) -> None:
        self.executed: list[tuple[Any, dict | None]] = []
        self.commits = 0
        self.rollbacks = 0

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        return None

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1


class FakeGraph:
    def __init__(self, result: dict[str, Any], stream_events: list[dict[str, Any]] | None = None) -> None:
        self.result = result
        self.stream_events = stream_events or []
        self.invocations: list[tuple[Any, dict[str, Any]]] = []

    async def ainvoke(self, state, config):
        self.invocations.append((state, config))
        return self.result if state is not None else self.result

    async def astream(self, state, config, stream_mode=None):  # pragma: no cover
        self.invocations.append((state, config))
        for event in self.stream_events:
            yield event


@pytest.fixture
def settings() -> Settings:
    return Settings(
        app_env="test",
        app_debug=True,
        database_url="sqlite+aiosqlite:///:memory:",
        langgraph_db_url=None,
        supabase_jwt_secret="test-secret",
        supabase_jwt_audience="authenticated",
        admin_panel_username="admin",
        admin_panel_password="secret-admin",
    )


@pytest.fixture
def app(settings: Settings):
    return create_app(settings)


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def aluno_user() -> UserContext:
    return UserContext(user_id="aluno-1", role="aluno", aluno_id="aluno-1")


@pytest.fixture
def professor_user() -> UserContext:
    return UserContext(user_id="prof-1", role="professor", professor_id="prof-1")


async def override_session(fake_session: FakeSession) -> AsyncIterator[FakeSession]:
    yield fake_session
