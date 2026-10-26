import pytest
from fastapi.testclient import TestClient

from app.services.media_contract import (
    CONTENT_ENRICHMENT_PROVIDER,
    MEDIA_PIPELINE_VERSION,
    PRESENTATION_DESIGN_VERSION,
    PRESENTATION_ENGINE_VERSION,
)


@pytest.mark.parametrize("value, expected", [
    (None, None), ("", None), ("main", None), ("abcdef1", None),
    ("private-value", None), ("A" * 40 + "a", None), (" A" + "a" * 39 + " ", "a" * 40),
])
def test_health_reports_only_explicit_full_build_commit(app, monkeypatch, value, expected):
    if value is None:
        monkeypatch.delenv("TRAILUP_BUILD_COMMIT", raising=False)
    else:
        monkeypatch.setenv("TRAILUP_BUILD_COMMIT", value)
    with TestClient(app) as client:
        assert client.get("/health").json()["details"]["build_commit"] == expected


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
    assert (
        health.json()["details"]["media_pipeline_version"]
        == MEDIA_PIPELINE_VERSION
    )
    assert (
        health.json()["details"]["presentation_engine_version"]
        == PRESENTATION_ENGINE_VERSION
    )
    assert (
        health.json()["details"]["presentation_design_version"]
        == PRESENTATION_DESIGN_VERSION
    )
    assert (
        health.json()["details"]["content_enrichment_provider"]
        == CONTENT_ENRICHMENT_PROVIDER
    )
    assert openapi.status_code == 200
    paths = openapi.json()["paths"]
    assert "/api/v1/admin/professores/{professor_id}/liberacao" not in paths
    assert "/api/v1/admin/professores/{professor_id}/alunos" not in paths
