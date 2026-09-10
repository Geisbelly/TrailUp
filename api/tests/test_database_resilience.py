import pytest

from app.core.settings import Settings
from app.db.session import DatabaseUnavailableError, execute_with_database_retry


def settings(**overrides) -> Settings:
    values = {
        "app_env": "test",
        "database_url": "sqlite+aiosqlite:///:memory:",
        "supabase_jwt_secret": "test-secret",
        "admin_panel_password": "secret-admin",
    }
    values.update(overrides)
    return Settings(**values)


@pytest.mark.asyncio
async def test_database_retry_recovers_from_transient_dns_failure():
    calls = 0

    async def operation():
        nonlocal calls
        calls += 1
        if calls < 3:
            raise OSError("getaddrinfo failed")
        return "ok"

    result = await execute_with_database_retry(
        operation,
        settings(database_connect_retry_attempts=3, database_connect_retry_delay_sec=0),
    )

    assert result == "ok"
    assert calls == 3


@pytest.mark.asyncio
async def test_database_retry_fails_with_explicit_unavailable_error():
    calls = 0

    async def operation():
        nonlocal calls
        calls += 1
        raise OSError("getaddrinfo failed")

    with pytest.raises(DatabaseUnavailableError):
        await execute_with_database_retry(
            operation,
            settings(database_connect_retry_attempts=2, database_connect_retry_delay_sec=0),
        )

    assert calls == 2


def test_database_urls_are_validated():
    with pytest.raises(ValueError, match="database_url"):
        settings(database_url="not-a-database-url")
