# main.py

> 65 nodes

## Key Concepts

- **main.py** (21 connections) — `api/app/main.py`
- **create_app()** (14 connections) — `api/app/main.py`
- **graph_invocation.py** (13 connections) — `api/app/services/graph_invocation.py`
- **build_graph()** (10 connections) — `api/app/agent/graph/builder.py`
- **ainvoke_personalizacao_graph()** (10 connections) — `api/app/services/graph_invocation.py`
- **test_graph_invocation.py** (9 connections) — `api/tests/test_graph_invocation.py`
- **checkpointer.py** (8 connections) — `api/app/agent/graph/checkpointer.py`
- **get_persistent_checkpointer()** (8 connections) — `api/app/agent/graph/checkpointer.py`
- **checkpoint_retention.py** (8 connections) — `api/app/services/checkpoint_retention.py`
- **run_checkpoint_retention_once()** (8 connections) — `api/app/services/checkpoint_retention.py`
- **close_checkpointer()** (7 connections) — `api/app/agent/graph/checkpointer.py`
- **cleanup_persisted_checkpoints()** (7 connections) — `api/app/services/checkpoint_retention.py`
- **_try_recover_persistent_graph()** (7 connections) — `api/app/services/graph_invocation.py`
- **test_checkpoint_retention.py** (7 connections) — `api/tests/test_checkpoint_retention.py`
- **checkpoint_retention_loop()** (6 connections) — `api/app/services/checkpoint_retention.py`
- **_GraphOK** (6 connections) — `api/tests/test_graph_invocation.py`
- **_GraphFail** (6 connections) — `api/tests/test_graph_invocation.py`
- **test_ainvoke_personalizacao_graph_falls_back_to_ephemeral_when_postgres_drops()** (6 connections) — `api/tests/test_graph_invocation.py`
- **test_ainvoke_personalizacao_graph_uses_ephemeral_when_already_degraded()** (6 connections) — `api/tests/test_graph_invocation.py`
- **test_ainvoke_personalizacao_graph_re_raises_non_checkpointer_errors()** (6 connections) — `api/tests/test_graph_invocation.py`
- **CheckpointCleanupResult** (5 connections) — `api/app/services/checkpoint_retention.py`
- **FastAPI** (5 connections)
- **_FakeCursor** (5 connections) — `api/tests/test_checkpoint_retention.py`
- **_FakeCursorContext** (5 connections) — `api/tests/test_checkpoint_retention.py`
- **_build_app_with_state()** (5 connections) — `api/tests/test_graph_invocation.py`
- *... and 40 more nodes in this community*

## Relationships

- [Settings](Settings.md) (10 shared connections)
- [settings.py](settings.py.md) (5 shared connections)
- [test_graph_nodes.py](test_graph_nodes.py.md) (4 shared connections)
- [UserContext](UserContext.md) (4 shared connections)
- [services/personalizacao_jobs.py](services-personalizacao_jobs.py.md) (4 shared connections)
- [test_api.py](test_api.py.md) (3 shared connections)
- [test_personalizacao_service.py](test_personalizacao_service.py.md) (1 shared connections)

## Source Files

- `api/app/agent/graph/builder.py`
- `api/app/agent/graph/checkpointer.py`
- `api/app/main.py`
- `api/app/services/__init__.py`
- `api/app/services/checkpoint_retention.py`
- `api/app/services/graph_invocation.py`
- `api/tests/test_checkpoint_retention.py`
- `api/tests/test_graph_invocation.py`

## Audit Trail

- EXTRACTED: 280 (100%)
- INFERRED: 1 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*