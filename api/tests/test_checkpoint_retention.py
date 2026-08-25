import pytest

from app.services.checkpoint_retention import cleanup_persisted_checkpoints


class _FakeResult:
    def __init__(self, rows=None, rowcount: int | None = None) -> None:
        self._rows = rows or []
        self.rowcount = rowcount

    async def fetchall(self):
        return self._rows


class _FakeCursor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[object, ...] | None]] = []

    async def execute(self, sql, params=None):
        normalized = " ".join(str(sql).split())
        self.calls.append((normalized, tuple(params) if params is not None else None))
        if "SELECT thread_id, checkpoint_ns" in normalized:
            return _FakeResult(
                rows=[
                    {"thread_id": "aluno-1:ciclo-1", "checkpoint_ns": "personalizacao"},
                    {"thread_id": "aluno-2:ciclo-2", "checkpoint_ns": "personalizacao"},
                ]
            )
        if "DELETE FROM checkpoint_writes" in normalized:
            return _FakeResult(rowcount=4)
        if "DELETE FROM checkpoint_blobs" in normalized:
            return _FakeResult(rowcount=2)
        if "DELETE FROM checkpoints" in normalized:
            return _FakeResult(rowcount=1)
        return _FakeResult()


class _FakeCursorContext:
    def __init__(self, cursor: _FakeCursor) -> None:
        self.cursor = cursor

    async def __aenter__(self):
        return self.cursor

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeCheckpointer:
    def __init__(self) -> None:
        self.cursor = _FakeCursor()

    def _cursor(self, *, pipeline=False):
        return _FakeCursorContext(self.cursor)


@pytest.mark.asyncio
async def test_cleanup_persisted_checkpoints_deletes_in_expected_order():
    checkpointer = _FakeCheckpointer()

    result = await cleanup_persisted_checkpoints(
        checkpointer=checkpointer,
        backend="postgres",
        checkpoint_ns="personalizacao",
        retention_days=3,
    )

    assert result.namespaces == 2
    assert result.writes_deleted == 8
    assert result.blobs_deleted == 4
    assert result.checkpoints_deleted == 2

    delete_calls = [sql for sql, _ in checkpointer.cursor.calls if sql.startswith("DELETE FROM")]
    assert delete_calls == [
        "DELETE FROM checkpoint_writes WHERE thread_id = %s AND checkpoint_ns = %s",
        "DELETE FROM checkpoint_blobs WHERE thread_id = %s AND checkpoint_ns = %s",
        "DELETE FROM checkpoints WHERE thread_id = %s AND checkpoint_ns = %s",
        "DELETE FROM checkpoint_writes WHERE thread_id = %s AND checkpoint_ns = %s",
        "DELETE FROM checkpoint_blobs WHERE thread_id = %s AND checkpoint_ns = %s",
        "DELETE FROM checkpoints WHERE thread_id = %s AND checkpoint_ns = %s",
    ]

    select_sql, select_params = checkpointer.cursor.calls[0]
    assert "MAX((checkpoint ->> 'ts')::timestamptz)" in select_sql
    assert select_params == ("personalizacao", 3)
