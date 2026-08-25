from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.repositories.aluno_topico_dominio import AlunoTopicoDominioRepository
from app.repositories.mental_state import MentalStateHistoryRepository
from app.services import analysis_runner
from app.services.analysis_runner import extract_mental_state


class MappingRows:
    def __init__(self, rows):
        self.rows = rows

    def __iter__(self):
        return iter(self.rows)


class MappingResult:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return MappingRows(self.rows)


class RecordingSession:
    def __init__(self, responses=None):
        self.responses = list(responses or [])
        self.calls = []

    async def execute(self, statement, params=None):
        self.calls.append((str(statement), params))
        if self.responses:
            return self.responses.pop(0)
        return MappingResult([])

    async def commit(self) -> None:
        return None

    async def rollback(self) -> None:
        return None


def test_extract_mental_state_from_ai_patch_camel() -> None:
    result = {
        "ai_patch": {
            "mentalState": {
                "kind": "anxious",
                "intensity": 0.81,
                "confidence": 0.74,
                "reason": "Baixo acerto.",
            }
        }
    }
    snapshot = extract_mental_state(result)
    assert snapshot is not None
    assert snapshot["kind"] == "anxious"
    assert snapshot["intensity"] == 0.81


def test_extract_mental_state_returns_none_when_absent() -> None:
    assert extract_mental_state({}) is None
    assert extract_mental_state({"ai_patch": {}}) is None
    assert extract_mental_state({"ai_patch": {"mentalState": {"kind": ""}}}) is None


@pytest.mark.asyncio
async def test_mental_state_repository_registrar_inserts() -> None:
    session = RecordingSession()
    repo = MentalStateHistoryRepository(session)

    await repo.registrar(
        aluno_id="aluno-1",
        ciclo_id="ciclo-9",
        kind="frustrated",
        intensity=0.67,
        confidence=0.63,
        reason="Tempo alto.",
    )

    assert len(session.calls) == 1
    sql, params = session.calls[0]
    assert "INSERT INTO aluno_mental_state_history" in sql
    assert params["aluno_id"] == "aluno-1"
    assert params["kind"] == "frustrated"
    assert params["intensity"] == 0.67


@pytest.mark.asyncio
async def test_mental_state_repository_listar_maps_rows() -> None:
    session = RecordingSession(
        [
            MappingResult(
                [
                    {
                        "id": 1,
                        "aluno_id": "aluno-1",
                        "ciclo_id": "ciclo-9",
                        "kind": "focused",
                        "intensity": 0.58,
                        "confidence": 0.62,
                        "reason": "Foco sustentado.",
                        "created_at": "2026-06-24T00:00:00Z",
                    }
                ]
            )
        ]
    )
    repo = MentalStateHistoryRepository(session)

    registros = await repo.listar_por_aluno(aluno_id="aluno-1", limit=10)

    assert len(registros) == 1
    assert registros[0]["kind"] == "focused"
    assert registros[0]["intensity"] == 0.58
    assert registros[0]["aluno_id"] == "aluno-1"


@pytest.mark.asyncio
async def test_run_analysis_persiste_dominio_por_topico_apos_o_ciclo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    upsert_mock = AsyncMock()
    monkeypatch.setattr(AlunoTopicoDominioRepository, "upsert", upsert_mock)
    monkeypatch.setattr(
        "app.repositories.evento.EventoRepository.log", AsyncMock()
    )
    monkeypatch.setattr(
        "app.repositories.mental_state.MentalStateHistoryRepository.registrar",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "app.repositories.ia_decision_logs.IADecisionLogRepository.log", AsyncMock()
    )

    async def fake_build_initial_state(session, aluno_id, payload, **kwargs):
        return {
            "ciclo_id": "ciclo-1",
            "aluno_id": aluno_id,
            "classe_id": payload.classe_id,
            "desempenho_recente": {"topico_recente_id": 10},
            "payload_topico_id": payload.topico_id,
        }

    class _FakeOrchestrator:
        async def run(self, **kwargs):
            state = kwargs["state"]
            state["ai_patch"] = {
                "mentalState": {"kind": "focused", "intensity": 0.5, "confidence": 0.6, "reason": "ok"}
            }
            state["pipeline_stage_outputs"] = {
                "performance": {"dominio_estimado": 0.81, "tendencia": "ascendente", "confianca": 0.7}
            }
            return state

    monkeypatch.setattr(analysis_runner, "build_initial_state", fake_build_initial_state)
    monkeypatch.setattr(
        analysis_runner, "build_linear_analysis_orchestrator", lambda _settings: _FakeOrchestrator()
    )

    session = RecordingSession()
    app = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(default_checkpoint_ns="test")))

    await analysis_runner.run_analysis(
        request=SimpleNamespace(app=app),
        session=session,
        aluno_id="aluno-1",
        classe_id=32,
        topico_id=None,
        atividade_id=None,
        frame_b64=None,
        eventos_novos=[],
        modo="estudo",
    )

    upsert_mock.assert_awaited_once_with(
        aluno_id="aluno-1",
        topico_id=10,
        dominio_estimado=0.81,
        tendencia="ascendente",
        confianca=0.7,
    )
