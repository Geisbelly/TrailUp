from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import personalizacao_jobs as jobs_module
from app.services.personalizacao_jobs import (
    _compact_exception_text,
    _exception_signature,
    _process_media_render_target,
    _compute_failure_backoff_sec,
    _is_transient_db_connection_error,
    _mark_pending_media_failed,
    _pending_media_formats,
)


def test_is_transient_db_connection_error_detects_connection_reset() -> None:
    assert _is_transient_db_connection_error(ConnectionResetError("connection reset by peer")) is True


def test_is_transient_db_connection_error_detects_nested_dns_error() -> None:
    root = OSError("getaddrinfo failed")
    wrapped = RuntimeError("db unavailable")
    wrapped.__cause__ = root
    assert _is_transient_db_connection_error(wrapped) is True


def test_is_transient_db_connection_error_ignores_business_error() -> None:
    assert _is_transient_db_connection_error(ValueError("campo obrigatorio ausente")) is False


def test_compute_failure_backoff_sec_grows_and_caps() -> None:
    assert _compute_failure_backoff_sec(poll_sec=5, failure_streak=1) == 5
    assert _compute_failure_backoff_sec(poll_sec=5, failure_streak=2) == 10
    assert _compute_failure_backoff_sec(poll_sec=5, failure_streak=3) == 20
    assert _compute_failure_backoff_sec(poll_sec=5, failure_streak=10) == 60
    assert _compute_failure_backoff_sec(poll_sec=5, failure_streak=10, max_backoff_sec=120) == 120


def test_compact_exception_text_uses_first_line_only() -> None:
    exc = RuntimeError("getaddrinfo failed\nextra detail line")
    assert _compact_exception_text(exc) == "getaddrinfo failed"


def test_exception_signature_is_stable_for_same_error() -> None:
    first = _exception_signature(ConnectionResetError("connection reset by peer"))
    second = _exception_signature(ConnectionResetError("connection reset by peer"))
    assert first == second


def test_pending_media_formats_detects_only_pending_items() -> None:
    materiais = {
        "cards": {"metadata": {"status": "completed"}},
        "audio": {"metadata": {"status": "pending"}},
        "apresentacao": {"metadata": {"status": "failed"}},
        "markdown": {"metadata": {"status": "pending"}},
    }
    assert sorted(_pending_media_formats(materiais)) == ["audio", "markdown"]


def test_mark_pending_media_failed_updates_only_pending_media() -> None:
    materiais = {
        "cards": {"metadata": {"status": "completed"}},
        "audio": {"metadata": {"status": "pending"}},
        "markdown": {"metadata": {"status": "pending"}},
        "apresentacao": {"metadata": {"status": "failed"}},
    }
    updated = _mark_pending_media_failed(materiais, error="timeout:1800s")

    assert updated["cards"]["metadata"]["status"] == "completed"
    assert updated["audio"]["metadata"]["status"] == "failed"
    assert updated["markdown"]["metadata"]["status"] == "failed"
    assert updated["apresentacao"]["metadata"]["status"] == "failed"
    assert updated["audio"]["metadata"]["error"] == "timeout:1800s"


@pytest.mark.asyncio
async def test_process_media_render_target_reconciles_material_ids_fallback(monkeypatch) -> None:
    record = {
        "id": 106,
        "aluno_id": "b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        "classe_id": 30,
        "topico_id": 114,
        "conteudo_id": 107,
        "ciclo_id": "ciclo-1",
        "status": "processando_midias",
        "materiais": {
            "audio": {
                "payload": {"roteiro": "Roteiro de áudio"},
                "metadata": {"status": "pending"},
                "arquivo_url": None,
                "storage_path": None,
            }
        },
    }

    async def _fake_materialize(**kwargs):
        del kwargs
        return (
            {
                "audio": {
                    "payload": {"roteiro": "Roteiro de áudio"},
                    "metadata": {"status": "completed", "bucket": "conteudo_aluno"},
                    "arquivo_url": "https://cdn.example.com/aluno/audio.wav",
                    "storage_path": "aluno/audio.wav",
                }
            },
            [],
        )

    monkeypatch.setattr(jobs_module, "_materialize_and_upload_media_assets", _fake_materialize)
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_por_id",
        AsyncMock(return_value=record),
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.atualizar_materiais_e_status",
        AsyncMock(return_value={**record, "status": "pronto"}),
    )
    monkeypatch.setattr(
        "app.repositories.materiais.MateriaisRepository.listar_por_personalizacao",
        AsyncMock(return_value=[]),
    )
    resolver_mock = AsyncMock(return_value={"audio": 77})
    monkeypatch.setattr(
        "app.repositories.materiais.MateriaisRepository.resolver_ids_por_tipo_recente",
        resolver_mock,
    )
    patch_mock = AsyncMock(return_value={"id": 77, "tipo": "audio"})
    monkeypatch.setattr(
        "app.repositories.materiais.MateriaisRepository.patch_materiais_media",
        patch_mock,
    )
    update_snapshot_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.update_job_media_snapshot",
        update_snapshot_mock,
    )
    monkeypatch.setattr(
        "app.repositories.materiais.MateriaisRepository.vincular_personalizacao",
        AsyncMock(return_value=None),
    )

    app = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(media_render_timeout_seconds=120)))
    job = {
        "id": "job-123",
        "classe_id": 30,
        "payload": {"ciclo_id": "ciclo-1"},
        "media_snapshot": {"slow_payload": {"audio": {"payload": {"roteiro": "Roteiro de áudio"}}}, "material_ids_by_tipo": {}},
    }
    target = {
        "id": 1,
        "aluno_id": "b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        "topico_id": 114,
        "conteudo_id": 107,
        "personalizacao_id": 106,
    }

    result = await _process_media_render_target(app=app, session=object(), job=job, target=target)

    assert result["record"]["status"] == "pronto"
    assert resolver_mock.await_count == 1
    assert patch_mock.await_count == 1
    assert patch_mock.await_args.kwargs["material_id"] == 77
    assert update_snapshot_mock.await_count == 1


@pytest.mark.asyncio
async def test_process_media_render_target_no_pending_keeps_failed_status(monkeypatch) -> None:
    record = {
        "id": 207,
        "aluno_id": "aluno-1",
        "classe_id": 30,
        "topico_id": 114,
        "conteudo_id": 107,
        "ciclo_id": "ciclo-2",
        "status": "processando_midias",
        "materiais": {
            "pdf": {
                "payload": {"titulo": "Guia"},
                "metadata": {"status": "failed_quality", "error": "quality_gate_rejected"},
                "arquivo_url": None,
                "storage_path": None,
            }
        },
    }

    update_mock = AsyncMock(return_value={**record, "status": "failed"})
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_por_id",
        AsyncMock(return_value=record),
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.atualizar_materiais_e_status",
        update_mock,
    )

    app = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(media_render_timeout_seconds=120)))
    job = {
        "id": "job-555",
        "classe_id": 30,
        "payload": {"ciclo_id": "ciclo-2"},
        "media_snapshot": {"slow_payload": {}},
    }
    target = {
        "id": 1,
        "aluno_id": "aluno-1",
        "topico_id": 114,
        "conteudo_id": 107,
        "personalizacao_id": 207,
    }

    result = await _process_media_render_target(app=app, session=object(), job=job, target=target)

    assert result["record"]["status"] == "failed"
    assert update_mock.await_count == 1
    assert update_mock.await_args.kwargs["status"] == "failed"


@pytest.mark.asyncio
async def test_process_media_render_target_reuses_shared_rendered_media_without_regeneration(monkeypatch) -> None:
    record = {
        "id": 306,
        "aluno_id": "aluno-1",
        "classe_id": 30,
        "topico_id": 114,
        "conteudo_id": 107,
        "ciclo_id": "ciclo-3",
        "status": "processando_midias",
        "materiais": {
            "audio": {
                "payload": {"roteiro": "Roteiro de áudio"},
                "metadata": {"status": "pending"},
                "arquivo_url": None,
                "storage_path": None,
            }
        },
    }

    materialize_mock = AsyncMock(return_value=({}, []))
    monkeypatch.setattr(jobs_module, "_materialize_and_upload_media_assets", materialize_mock)
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_por_id",
        AsyncMock(return_value=record),
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.atualizar_materiais_e_status",
        AsyncMock(return_value={**record, "status": "pronto"}),
    )
    monkeypatch.setattr(
        "app.repositories.materiais.MateriaisRepository.listar_por_personalizacao",
        AsyncMock(return_value=[{"id": 99, "tipo": "audio"}]),
    )
    patch_mock = AsyncMock(return_value={"id": 99, "tipo": "audio"})
    monkeypatch.setattr(
        "app.repositories.materiais.MateriaisRepository.patch_materiais_media",
        patch_mock,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.update_job_media_snapshot",
        AsyncMock(return_value=None),
    )

    app = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(media_render_timeout_seconds=120)))
    shared_pdf = {
        "payload": {"roteiro": "Roteiro de áudio"},
        "metadata": {"status": "completed", "bucket": "conteudo_aluno"},
        "arquivo_url": "https://cdn.example.com/shared/audio.wav",
        "storage_path": "brainhex/achiever/classe-30/topico-114/audio/audio.wav",
    }
    job = {
        "id": "job-shared-1",
        "classe_id": 30,
        "payload": {"ciclo_id": "ciclo-3"},
        "media_snapshot": {
            "slow_payload": {"audio": {"payload": {"roteiro": "Roteiro de áudio"}}},
            "shared_rendered_media": {"audio": shared_pdf},
        },
    }
    target = {
        "id": 1,
        "aluno_id": "aluno-1",
        "topico_id": 114,
        "conteudo_id": 107,
        "personalizacao_id": 306,
    }

    result = await _process_media_render_target(app=app, session=object(), job=job, target=target)

    assert result["record"]["status"] == "pronto"
    assert materialize_mock.await_count == 0
    assert patch_mock.await_count == 1
    assert patch_mock.await_args.kwargs["arquivo_url"] == shared_pdf["arquivo_url"]
