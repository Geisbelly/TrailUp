from fastapi.testclient import TestClient


def test_app_startup_compiles_default_graph(app) -> None:
    with TestClient(app) as client:
        health = client.get("/health")
        openapi = client.get("/openapi.json")

    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["checkpointer"] in {"memory", "postgres"}
    assert health.json()["details"]["graphs"] == ["personalizacao", "ephemeral"]
    assert health.json()["details"]["checkpointer_personalizacao"] in {"memory", "postgres"}
    assert health.json()["details"]["checkpointer_ephemeral"] == "memory"
    assert health.json()["details"]["checkpoint_retention_days"] == 3
    assert openapi.status_code == 200
    paths = openapi.json()["paths"]
    assert "/api/v1/admin/professores/{professor_id}/liberacao" not in paths
    assert "/api/v1/admin/professores/{professor_id}/alunos" not in paths
