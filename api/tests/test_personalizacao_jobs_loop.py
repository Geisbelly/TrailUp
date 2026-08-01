import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import personalizacao_jobs as jobs_module
from app.services.personalizacao_jobs import (
    _assert_brainhex_media_completed,
    _build_targets,
    _compact_exception_text,
    _compute_failure_backoff_sec,
    _content_enrichment_cache_key,
    _effective_stale_processing_min,
    _exception_signature,
    _falha_streak_excedido,
    _get_app_shared_content_enrichment,
    _get_job_content_enrichment,
    _get_runtime_cached_dict,
    _has_completed_current_generation,
    _is_transient_db_connection_error,
    _mark_failed_unless_generation_completed,
    _mark_pending_media_failed,
    _pending_media_formats,
    _prewarm_shared_content_enrichments,
    _process_media_render_target,
    _profile_render_targets_ready_now,
    process_personalizacao_job_once,
)


@pytest.fixture(autouse=True)
def _brainhex_contract_is_ready(monkeypatch):
    monkeypatch.setattr(
        jobs_module,
        "brainhex_contract_ready",
        AsyncMock(return_value=True),
    )


def test_assert_brainhex_media_completed_requires_all_formats() -> None:
    generation_key = "ciclo-1:hash-1"
    completed = {"metadata": {"status": "completed", "generation_key": generation_key}}
    completed_presentation = {
        "metadata": {
            "status": "completed",
            "generation_key": generation_key,
            "engine": jobs_module.PRESENTATION_ENGINE_VERSION,
            "design_system": jobs_module.PRESENTATION_DESIGN_VERSION,
            "media_pipeline_version": jobs_module.MEDIA_PIPELINE_VERSION,
        }
    }
    _assert_brainhex_media_completed(
        {
            "ciclo_id": "ciclo-1",
            "source_hash": "hash-1",
            "status": "pronto",
            "materiais": {
                "audio": completed,
                "markdown": completed,
                "apresentacao": completed_presentation,
            },
        },
        ciclo_id="ciclo-1",
        source_hash="hash-1",
        generation_key=generation_key,
    )

    with pytest.raises(RuntimeError, match="apresentacao"):
        _assert_brainhex_media_completed(
            {
                "ciclo_id": "ciclo-1",
                "source_hash": "hash-1",
                "status": "pronto",
                "materiais": {
                    "audio": completed,
                    "markdown": completed,
                    "apresentacao": {
                        "metadata": {
                            "status": "failed",
                            "generation_key": generation_key,
                        }
                    },
                },
            },
            ciclo_id="ciclo-1",
            source_hash="hash-1",
            generation_key=generation_key,
        )


def test_current_generation_completion_ignores_materials_from_old_generation() -> None:
    current = {
        "ciclo_id": "ciclo-2",
        "source_hash": "hash-2",
        "materiais": {
            formato: {
                "metadata": {
                    "status": "completed",
                    "generation_key": "ciclo-1:hash-1",
                }
            }
            for formato in ("audio", "markdown", "apresentacao")
        },
    }

    assert (
        _has_completed_current_generation(
            current,
            ciclo_id="ciclo-2",
            source_hash="hash-2",
            generation_key="ciclo-2:hash-2",
        )
        is False
    )


def test_current_generation_completion_rejects_legacy_presentation_engine() -> None:
    generation_key = "ciclo-2:hash-2"
    completed = {
        "metadata": {
            "status": "completed",
            "generation_key": generation_key,
        }
    }
    record = {
        "ciclo_id": "ciclo-2",
        "source_hash": "hash-2",
        "materiais": {
            "audio": completed,
            "markdown": completed,
            "apresentacao": completed,
        },
    }

    assert not _has_completed_current_generation(
        record,
        ciclo_id="ciclo-2",
        source_hash="hash-2",
        generation_key=generation_key,
    )


def test_effective_stale_processing_exceeds_wait_timeout() -> None:
    settings = SimpleNamespace(
        personalizacao_job_stale_processing_min=15,
        brainhex_api_wait_timeout_sec=1980,
    )

    assert _effective_stale_processing_min(settings) == 53


@pytest.mark.asyncio
async def test_failure_marker_preserves_generation_that_finished_during_timeout() -> None:
    completed = _completed_record(_existing_record())
    repo = SimpleNamespace(
        atualizar_status=AsyncMock(return_value=False),
        buscar_por_id=AsyncMock(return_value=completed),
    )

    recovered = await _mark_failed_unless_generation_completed(
        repo=repo,
        record_id=249,
        ciclo_id="ciclo-249",
        source_hash="hash-249",
        generation_key="ciclo-249:hash-249",
    )

    assert recovered == completed
    assert (
        repo.atualizar_status.await_args.kwargs["preserve_completed_generation_key"]
        == "ciclo-249:hash-249"
    )


@pytest.mark.asyncio
async def test_runtime_cache_is_single_flight() -> None:
    calls = 0

    async def factory() -> dict:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.01)
        return {"blocos": [1]}

    job: dict = {}
    results = await asyncio.gather(
        *(
            _get_runtime_cached_dict(
                job=job,
                cache_name="_cache",
                locks_name="_locks",
                key="topic-121",
                factory=factory,
            )
            for _ in range(7)
        )
    )

    assert calls == 1
    assert all(result == {"blocos": [1]} for result in results)


@pytest.mark.asyncio
async def test_runtime_cache_shares_failure_without_provider_storm() -> None:
    calls = 0

    async def factory() -> dict:
        nonlocal calls
        calls += 1
        raise RuntimeError("enriquecimento indisponivel")

    job: dict = {}
    results = await asyncio.gather(
        *(
            _get_runtime_cached_dict(
                job=job,
                cache_name="_cache",
                locks_name="_locks",
                key="conteudo-125",
                factory=factory,
            )
            for _ in range(7)
        ),
        return_exceptions=True,
    )

    assert calls == 1
    assert all(
        isinstance(result, RuntimeError)
        and str(result) == "enriquecimento indisponivel"
        for result in results
    )


@pytest.mark.asyncio
async def test_app_content_enrichment_cache_is_shared_across_jobs() -> None:
    calls = 0

    async def factory() -> dict:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.01)
        return {"blocos": [{"id": "bloco-01"}]}

    app = SimpleNamespace(
        state=SimpleNamespace(
            settings=SimpleNamespace(
                personalizacao_content_enrichment_concurrency=1,
                personalizacao_content_enrichment_cache_max_entries=8,
            )
        )
    )
    results = await asyncio.gather(
        *(
            _get_job_content_enrichment(
                app=app,
                job={},
                key="121:125:hash-1",
                factory=factory,
            )
            for _ in range(7)
        )
    )

    assert calls == 1
    assert all(result == {"blocos": [{"id": "bloco-01"}]} for result in results)
    results[0]["blocos"][0]["id"] = "alterado"
    cached = await _get_app_shared_content_enrichment(
        app=app,
        key="121:125:hash-1",
        factory=factory,
    )
    assert cached["blocos"][0]["id"] == "bloco-01"
    assert calls == 1


@pytest.mark.asyncio
async def test_app_content_enrichment_does_not_cache_failures_between_jobs() -> None:
    calls = 0

    async def factory() -> dict:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("falha temporaria")
        return {"blocos": [{"id": "bloco-01"}]}

    app = SimpleNamespace(
        state=SimpleNamespace(
            settings=SimpleNamespace(
                personalizacao_content_enrichment_concurrency=1,
                personalizacao_content_enrichment_cache_max_entries=8,
            )
        )
    )

    with pytest.raises(RuntimeError, match="falha temporaria"):
        await _get_job_content_enrichment(
            app=app,
            job={},
            key="121:125:hash-1",
            factory=factory,
        )
    recovered = await _get_job_content_enrichment(
        app=app,
        job={},
        key="121:125:hash-1",
        factory=factory,
    )

    assert recovered == {"blocos": [{"id": "bloco-01"}]}
    assert calls == 2


@pytest.mark.asyncio
async def test_prewarm_completes_shared_enrichment_before_profile_fanout(
    monkeypatch,
) -> None:
    calls = 0

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, _exc_type, _exc, _tb):
            return None

        async def commit(self):
            return None

    async def fetch_context(**_kwargs):
        return {"source_hash": "hash-1", "conteudo_classe": {}, "fontes": []}

    async def enrich(*, context, settings):
        del settings
        nonlocal calls
        calls += 1
        assert context["source_hash"] == "hash-1"
        return {"source_hash": "hash-1", "blocos": [{"id": "bloco-01"}]}

    monkeypatch.setattr(jobs_module, "fetch_personalizacao_context", fetch_context)
    monkeypatch.setattr(jobs_module, "enrich_content_blocks", enrich)

    app = SimpleNamespace(
        state=SimpleNamespace(
            session_factory=Session,
            settings=SimpleNamespace(
                personalizacao_content_enrichment_concurrency=1,
                personalizacao_content_enrichment_cache_max_entries=8,
            ),
        )
    )
    job = {"id": "job-1", "kind": "class_delta_sync", "classe_id": 32}
    targets = [
        {
            "id": index,
            "aluno_id": f"aluno-{index}",
            "topico_id": 121,
            "conteudo_id": 125,
            "brainhex_profile_key": profile,
            "status": "pending",
        }
        for index, profile in enumerate(
            (
                "seeker",
                "survivor",
                "daredevil",
                "mastermind",
                "conqueror",
                "socializer",
                "achiever",
            ),
            start=1,
        )
    ]

    await _prewarm_shared_content_enrichments(
        app=app,
        job=job,
        targets=targets,
    )

    assert calls == 1
    assert job["_runtime_content_enrichment"]["121:125:hash-1"]["blocos"] == [
        {"id": "bloco-01"}
    ]


def test_content_enrichment_cache_is_shared_across_profiles_for_same_content() -> None:
    seeker_key = _content_enrichment_cache_key(
        topico_id=121,
        conteudo_id=125,
        source_hash="hash-1",
    )
    survivor_key = _content_enrichment_cache_key(
        topico_id=121,
        conteudo_id=125,
        source_hash="hash-1",
    )

    assert seeker_key == survivor_key
    assert seeker_key != _content_enrichment_cache_key(
        topico_id=121,
        conteudo_id=126,
        source_hash="hash-1",
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
async def test_build_targets_generates_all_seven_profiles_with_one_student(monkeypatch) -> None:
    student_id = "b49f2e21-a6f9-4c8d-9533-5a32bb219754"
    monkeypatch.setattr(
        "app.repositories.conteudo_classe.ConteudoClasseRepository.listar_alunos_classe_com_perfil_dominante",
        AsyncMock(return_value=[{"aluno_id": student_id, "perfil_dominante": "seeker"}]),
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_classe.ConteudoClasseRepository.mapear_todos_conteudos_por_topicos",
        AsyncMock(return_value={117: [125]}),
    )

    targets, topics, profile_map = await _build_targets(
        session=object(),
        kind="full_class_sync",
        classe_id=32,
        topico_ids=[117],
    )

    assert topics == [117]
    assert len(targets) == 7
    assert {item["brainhex_profile_key"] for item in targets} == {
        "seeker",
        "survivor",
        "daredevil",
        "mastermind",
        "conqueror",
        "socializer",
        "achiever",
    }
    assert {item["aluno_id"] for item in targets} == {student_id}
    assert {item["conteudo_id"] for item in targets} == {125}
    assert sum(not item["is_profile_template"] for item in targets) == 1
    assert sum(item["is_profile_template"] for item in targets) == 6
    assert len(profile_map) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("conteudo_ids", [[125], [125, 126]])
async def test_build_targets_generates_seven_profiles_for_each_content(
    monkeypatch,
    conteudo_ids,
) -> None:
    student_id = "b49f2e21-a6f9-4c8d-9533-5a32bb219754"
    monkeypatch.setattr(
        "app.repositories.conteudo_classe.ConteudoClasseRepository.listar_alunos_classe_com_perfil_dominante",
        AsyncMock(return_value=[{"aluno_id": student_id, "perfil_dominante": "seeker"}]),
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_classe.ConteudoClasseRepository.mapear_conteudos_por_topico",
        AsyncMock(return_value={117: conteudo_ids}),
    )

    targets, topics, _profile_map = await _build_targets(
        session=object(),
        kind="class_delta_sync",
        classe_id=32,
        topico_ids=[117],
        conteudo_ids=conteudo_ids,
    )

    assert topics == [117]
    assert len(targets) == 7 * len(conteudo_ids)
    assert {target["conteudo_id"] for target in targets} == set(conteudo_ids)
    assert len(
        {
            (
                target["aluno_id"],
                target["topico_id"],
                target["conteudo_id"],
                target["brainhex_profile_key"],
            )
            for target in targets
        }
    ) == 7 * len(conteudo_ids)


@pytest.mark.asyncio
async def test_enqueue_job_creates_job_and_targets_atomically(monkeypatch) -> None:
    target = {
        "aluno_id": "b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        "topico_id": 117,
        "conteudo_id": None,
        "brainhex_profile_key": "seeker",
        "is_profile_template": False,
    }
    create_mock = AsyncMock(return_value={"id": "job-atomic"})
    monkeypatch.setattr(
        jobs_module,
        "_build_targets",
        AsyncMock(return_value=([target], [117], {target["aluno_id"]: "seeker"})),
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.find_open_job_by_payload",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.criar_job_com_targets",
        create_mock,
    )
    monkeypatch.setattr(
        jobs_module,
        "get_job_detail",
        AsyncMock(return_value={"job": {"id": "job-atomic"}, "targets": [target]}),
    )

    result = await jobs_module.enqueue_personalizacao_job(
        session=object(),
        kind="full_class_sync",
        classe_id=32,
        trigger_source="test",
        topico_ids=[117],
    )

    assert result["job"]["id"] == "job-atomic"
    assert create_mock.await_count == 1
    assert create_mock.await_args.kwargs["targets"] == [target]
    assert create_mock.await_args.kwargs["topico_id"] == 117


@pytest.mark.asyncio
async def test_enqueue_job_reuses_existing_open_job_instead_of_duplicating(
    monkeypatch,
) -> None:
    """Reproduz o bug real: duplo-clique no console criava 2 jobs class_delta_sync
    identicos para a mesma classe, cada um martelando a OpenAI de forma independente."""
    build_targets_mock = AsyncMock()
    create_mock = AsyncMock()
    monkeypatch.setattr(jobs_module, "_build_targets", build_targets_mock)
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.find_open_job_by_payload",
        AsyncMock(
            return_value={
                "id": "job-existing",
                "kind": "class_delta_sync",
                "status": "processing",
            }
        ),
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.criar_job_com_targets",
        create_mock,
    )
    monkeypatch.setattr(
        jobs_module,
        "get_job_detail",
        AsyncMock(return_value={"job": {"id": "job-existing"}, "targets": []}),
    )

    result = await jobs_module.enqueue_personalizacao_job(
        session=object(),
        kind="class_delta_sync",
        classe_id=32,
        trigger_source="web_console",
        topico_ids=[122],
    )

    assert result["job"]["id"] == "job-existing"
    assert create_mock.await_count == 0
    assert build_targets_mock.await_count == 0


@pytest.mark.asyncio
async def test_enqueue_job_dedup_scopes_by_aluno_id_for_cleanup_kind(
    monkeypatch,
) -> None:
    """Cleanup e por aluno: um job aberto para outro aluno na mesma classe
    nao deve impedir a criacao de um novo job para este aluno."""
    find_open_mock = AsyncMock(return_value=None)
    create_mock = AsyncMock(return_value={"id": "job-new"})
    monkeypatch.setattr(
        jobs_module,
        "_build_targets",
        AsyncMock(return_value=([], [], {})),
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.find_open_job_by_payload",
        find_open_mock,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.criar_job_com_targets",
        create_mock,
    )
    monkeypatch.setattr(
        jobs_module,
        "get_job_detail",
        AsyncMock(return_value={"job": {"id": "job-new"}, "targets": []}),
    )

    await jobs_module.enqueue_personalizacao_job(
        session=object(),
        kind="student_cleanup",
        classe_id=32,
        aluno_id="aluno-2",
        trigger_source="web_console",
    )

    assert find_open_mock.await_args.kwargs["aluno_id"] == "aluno-2"
    assert create_mock.await_count == 1


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


class _FakeScalarResult:
    def __init__(self, value: bool) -> None:
        self._value = value

    def scalar(self) -> bool:
        return self._value


class _FakeSession:
    """Sessao minima: so precisa responder ao SELECT de staleness (session.execute)."""

    def __init__(self, is_stuck: bool) -> None:
        self._is_stuck = is_stuck
        self.executed_params: list[dict] = []

    async def execute(self, _stmt, params=None):
        self.executed_params.append(params or {})
        return _FakeScalarResult(self._is_stuck)

    async def commit(self) -> None:
        return None


def _existing_record(status: str = "processando_midias") -> dict:
    return {
        "id": 249,
        "aluno_id": "b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        "classe_id": 32,
        "topico_id": 117,
        "conteudo_id": 117,
        "ciclo_id": "ciclo-249",
        "status": status,
        "materiais": {},
        "source_hash": "hash-249",
    }


@pytest.mark.asyncio
async def test_target_defers_before_db_mutation_when_media_contract_is_unavailable(
    monkeypatch,
) -> None:
    readiness = AsyncMock(return_value=False)
    lookup = AsyncMock()
    dispatch = AsyncMock()
    monkeypatch.setattr(jobs_module, "brainhex_contract_ready", readiness)
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_mais_recente_por_perfil",
        lookup,
    )
    monkeypatch.setattr(jobs_module, "disparar_brainhex_async", dispatch)

    app = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace()))
    job = {
        "id": "job-contract",
        "classe_id": 32,
        "kind": "class_delta_sync",
        "payload": {},
    }
    target = {
        "id": 590,
        "aluno_id": "b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        "topico_id": 121,
        "conteudo_id": None,
    }

    result = await _process_media_render_target(
        app=app,
        session=_FakeSession(is_stuck=False),
        job=job,
        target=target,
    )

    assert result == {
        "deferred": True,
        "reason": "microservice_midia_incompativel_ou_indisponivel",
    }
    readiness.assert_awaited_once_with(settings=app.state.settings)
    lookup.assert_not_awaited()
    dispatch.assert_not_awaited()


def _completed_record(existing: dict) -> dict:
    generation_key = f"{existing['ciclo_id']}:{existing['source_hash']}"
    completed_material = {
        "metadata": {
            "status": "completed",
            "generation_key": generation_key,
        }
    }
    completed_presentation = {
        "metadata": {
            **completed_material["metadata"],
            "engine": jobs_module.PRESENTATION_ENGINE_VERSION,
            "design_system": jobs_module.PRESENTATION_DESIGN_VERSION,
            "media_pipeline_version": jobs_module.MEDIA_PIPELINE_VERSION,
        }
    }
    return {
        **existing,
        "status": "pronto",
        "materiais": {
            "audio": completed_material,
            "markdown": completed_material,
            "apresentacao": completed_presentation,
        },
    }


@pytest.mark.asyncio
async def test_process_media_render_target_defers_fresh_incomplete_generation(monkeypatch) -> None:
    """Geracao fresca incompleta continua pendente; nunca vira skipped."""
    existing = _existing_record()

    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_mais_recente_por_perfil",
        AsyncMock(return_value=existing),
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_por_id",
        AsyncMock(return_value=existing),
    )
    claim_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.claim_retry_incomplete_generation",
        claim_mock,
    )
    monkeypatch.setattr(
        jobs_module,
        "fetch_personalizacao_context",
        AsyncMock(return_value={"source_hash": "hash-249", "fontes": []}),
    )
    dispatch_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(jobs_module, "disparar_brainhex_async", dispatch_mock)
    monkeypatch.setattr(
        jobs_module,
        "enrich_content_blocks",
        AsyncMock(return_value={"blocos": [{"id": "bloco-01"}]}),
    )

    app = SimpleNamespace(
        state=SimpleNamespace(settings=SimpleNamespace(personalizacao_job_stale_processing_min=15))
    )
    job = {"id": "job-1", "classe_id": 32, "kind": "class_delta_sync", "payload": {}}
    target = {"id": 579, "aluno_id": existing["aluno_id"], "topico_id": 117, "conteudo_id": None}

    result = await _process_media_render_target(
        app=app, session=_FakeSession(is_stuck=False), job=job, target=target
    )

    assert result["deferred"] is True
    assert result["record"] == existing
    assert claim_mock.await_args.kwargs["generation_key"] == "ciclo-249:hash-249"
    assert dispatch_mock.await_count == 0


@pytest.mark.asyncio
async def test_process_media_render_target_defers_when_new_generation_race_lost(monkeypatch) -> None:
    """Quando nao existe registro ainda e outro worker ja reservou o mesmo
    alvo (ex.: class-delta e full-sync quase simultaneos), o target fica
    pendente/deferido sem gerar conteudo duplicado nem gravar por cima."""
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_mais_recente_por_perfil",
        AsyncMock(return_value=None),
    )
    claim_new_mock = AsyncMock(return_value=False)
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.claim_new_generation",
        claim_new_mock,
    )
    monkeypatch.setattr(
        jobs_module,
        "fetch_personalizacao_context",
        AsyncMock(
            return_value={
                "source_hash": "hash-579",
                "ciclo_id": "ciclo-579",
                "fontes": [],
                "perfil_dominante": "Seeker",
                "perfil_brainhex": [],
            }
        ),
    )
    enrich_mock = AsyncMock(return_value={"blocos": []})
    monkeypatch.setattr(jobs_module, "enrich_content_blocks", enrich_mock)
    cards_mock = AsyncMock(return_value=[])
    monkeypatch.setattr(jobs_module, "gerar_cards_direto", cards_mock)
    dispatch_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(jobs_module, "disparar_brainhex_async", dispatch_mock)
    salvar_mock = AsyncMock(return_value=999)
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.salvar",
        salvar_mock,
    )

    app = SimpleNamespace(
        state=SimpleNamespace(settings=SimpleNamespace(personalizacao_job_stale_processing_min=15))
    )
    job = {"id": "job-1", "classe_id": 32, "kind": "class_delta_sync", "payload": {}}
    target = {
        "id": 579,
        "aluno_id": "b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        "topico_id": 117,
        "conteudo_id": None,
        "brainhex_profile_key": "seeker",
    }

    result = await _process_media_render_target(
        app=app, session=_FakeSession(is_stuck=False), job=job, target=target
    )

    assert result["deferred"] is True
    assert claim_new_mock.await_count == 1
    assert claim_new_mock.await_args.kwargs["ciclo_id"] == "ciclo-579"
    assert enrich_mock.await_count == 0
    assert cards_mock.await_count == 0
    assert dispatch_mock.await_count == 0
    assert salvar_mock.await_count == 0


@pytest.mark.asyncio
async def test_process_media_render_target_skips_only_completed_current_generation(
    monkeypatch,
) -> None:
    existing = _completed_record(_existing_record(status="failed"))
    existing["status"] = "failed"
    normalized = {**existing, "status": "pronto"}
    claim_mock = AsyncMock()
    normalize_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_mais_recente_por_perfil",
        AsyncMock(return_value=existing),
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.atualizar_status",
        normalize_mock,
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_por_id",
        AsyncMock(return_value=normalized),
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.claim_retry_incomplete_generation",
        claim_mock,
    )
    monkeypatch.setattr(
        jobs_module,
        "fetch_personalizacao_context",
        AsyncMock(return_value={"source_hash": "hash-249", "fontes": []}),
    )
    dispatch_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(jobs_module, "disparar_brainhex_async", dispatch_mock)

    app = SimpleNamespace(
        state=SimpleNamespace(settings=SimpleNamespace(personalizacao_job_stale_processing_min=15))
    )
    job = {"id": "job-complete", "classe_id": 32, "kind": "class_delta_sync", "payload": {}}
    target = {"id": 580, "aluno_id": existing["aluno_id"], "topico_id": 117}

    result = await _process_media_render_target(
        app=app,
        session=_FakeSession(is_stuck=False),
        job=job,
        target=target,
    )

    assert result == {"skipped": True, "record": normalized}
    assert normalize_mock.await_args.kwargs["status"] == "pronto"
    claim_mock.assert_not_awaited()
    dispatch_mock.assert_not_awaited()


def _target(
    id_: int,
    *,
    status: str = "pending",
    attempts: int = 0,
    updated_at: datetime | None = None,
) -> dict:
    return {
        "id": id_,
        "status": status,
        "attempts": attempts,
        "updated_at": updated_at,
    }


def test_profile_render_targets_ready_now_primeira_rodada_libera_so_um_perfil() -> None:
    now = datetime(2026, 7, 30, 12, 0, 0, tzinfo=timezone.utc)
    targets = [_target(1), _target(2), _target(3)]

    ready = _profile_render_targets_ready_now(targets, pace_sec=300, now=now)

    assert [t["id"] for t in ready] == [1]


def test_profile_render_targets_ready_now_aguarda_intervalo_entre_perfis() -> None:
    now = datetime(2026, 7, 30, 12, 0, 0, tzinfo=timezone.utc)
    targets = [
        _target(1, status="completed", attempts=1, updated_at=now - timedelta(seconds=60)),
        _target(2),
        _target(3),
    ]

    ready = _profile_render_targets_ready_now(targets, pace_sec=300, now=now)

    assert ready == []


def test_profile_render_targets_ready_now_libera_proximo_apos_intervalo() -> None:
    now = datetime(2026, 7, 30, 12, 0, 0, tzinfo=timezone.utc)
    targets = [
        _target(1, status="completed", attempts=1, updated_at=now - timedelta(seconds=301)),
        _target(2),
        _target(3),
    ]

    ready = _profile_render_targets_ready_now(targets, pace_sec=300, now=now)

    assert [t["id"] for t in ready] == [2]


def test_profile_render_targets_ready_now_pace_zero_desativa_o_espacamento() -> None:
    now = datetime(2026, 7, 30, 12, 0, 0, tzinfo=timezone.utc)
    targets = [
        _target(1, status="completed", attempts=1, updated_at=now - timedelta(seconds=1)),
        _target(2),
        _target(3),
    ]

    ready = _profile_render_targets_ready_now(targets, pace_sec=0, now=now)

    assert [t["id"] for t in ready] == [2, 3]


def test_profile_render_targets_ready_now_sem_pendentes() -> None:
    now = datetime(2026, 7, 30, 12, 0, 0, tzinfo=timezone.utc)
    targets = [_target(1, status="completed", attempts=1, updated_at=now)]

    assert _profile_render_targets_ready_now(targets, pace_sec=300, now=now) == []


def test_profile_render_targets_ready_now_pula_alvo_deferido_repetidamente() -> None:
    """Um alvo "deferido" (geracao_atual_em_processamento) volta a pending sem
    consumir tentativa (attempts continua 0) e so tem seu updated_at tocado.
    Sem isso, esse mesmo alvo (menor id) seria escolhido para sempre, e os
    demais perfis do job nunca chegariam a ser tentados.
    """
    created_at = datetime(2026, 8, 1, 1, 22, 45, tzinfo=timezone.utc)
    now = datetime(2026, 8, 1, 11, 52, 44, tzinfo=timezone.utc)
    targets = [
        _target(1, attempts=0, updated_at=now - timedelta(seconds=9)),
        _target(2, attempts=0, updated_at=created_at),
        _target(3, attempts=0, updated_at=created_at),
    ]

    ready = _profile_render_targets_ready_now(targets, pace_sec=300, now=now)

    assert [t["id"] for t in ready] == [2]


def test_falha_streak_excedido() -> None:
    record = {"materiais": {"_geracao_falhas": {"generation_key": "ciclo-1:hash-1", "streak": 3}}}
    assert _falha_streak_excedido(record, generation_key="ciclo-1:hash-1", max_streak=3) is True
    assert _falha_streak_excedido(record, generation_key="ciclo-1:hash-1", max_streak=4) is False
    # generation_key diferente (professor editou o conteudo) zera o efeito do streak antigo.
    assert _falha_streak_excedido(record, generation_key="ciclo-2:hash-2", max_streak=1) is False
    assert _falha_streak_excedido({"materiais": {}}, generation_key="ciclo-1:hash-1", max_streak=1) is False
    assert _falha_streak_excedido({}, generation_key="ciclo-1:hash-1", max_streak=1) is False


@pytest.mark.asyncio
async def test_process_media_render_target_stops_redispatch_after_falha_streak_excedido(
    monkeypatch,
) -> None:
    """Mesma geracao (mesmo ciclo_id/source_hash) ja falhou o maximo de vezes
    configurado: para de reclamar/redisparar em vez de queimar cota de IA
    infinitamente na mesma geracao quebrada."""
    existing = _existing_record()
    existing["materiais"] = {
        "_geracao_falhas": {"generation_key": "ciclo-249:hash-249", "streak": 2}
    }

    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_mais_recente_por_perfil",
        AsyncMock(return_value=existing),
    )
    claim_mock = AsyncMock()
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.claim_retry_incomplete_generation",
        claim_mock,
    )
    monkeypatch.setattr(
        jobs_module,
        "fetch_personalizacao_context",
        AsyncMock(return_value={"source_hash": "hash-249", "fontes": []}),
    )
    dispatch_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(jobs_module, "disparar_brainhex_async", dispatch_mock)

    app = SimpleNamespace(
        state=SimpleNamespace(
            settings=SimpleNamespace(
                personalizacao_job_stale_processing_min=15,
                personalizacao_falha_streak_max=2,
            )
        )
    )
    job = {"id": "job-1", "classe_id": 32, "kind": "class_delta_sync", "payload": {}}
    target = {"id": 579, "aluno_id": existing["aluno_id"], "topico_id": 117, "conteudo_id": None}

    result = await _process_media_render_target(
        app=app, session=_FakeSession(is_stuck=False), job=job, target=target
    )

    assert result == {
        "skipped": True,
        "record": existing,
        "reason": "falha_streak_excedido",
    }
    claim_mock.assert_not_awaited()
    dispatch_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_process_media_render_target_increments_falha_streak_when_dispatch_fails(
    monkeypatch,
) -> None:
    existing = _existing_record()

    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_mais_recente_por_perfil",
        AsyncMock(return_value=existing),
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.claim_retry_incomplete_generation",
        AsyncMock(return_value=existing),
    )
    incrementar_mock = AsyncMock(return_value=1)
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.incrementar_falha_streak",
        incrementar_mock,
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.atualizar_status",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_por_id",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        jobs_module,
        "fetch_personalizacao_context",
        AsyncMock(return_value={"source_hash": "hash-249", "fontes": []}),
    )
    monkeypatch.setattr(
        jobs_module,
        "enrich_content_blocks",
        AsyncMock(return_value={"blocos": [{"id": "bloco-01"}]}),
    )
    dispatch_mock = AsyncMock(return_value=False)
    monkeypatch.setattr(jobs_module, "disparar_brainhex_async", dispatch_mock)

    app = SimpleNamespace(
        state=SimpleNamespace(
            settings=SimpleNamespace(
                personalizacao_job_stale_processing_min=15,
                personalizacao_falha_streak_max=3,
            )
        )
    )
    job = {"id": "job-1", "classe_id": 32, "kind": "class_delta_sync", "payload": {}}
    target = {"id": 579, "aluno_id": existing["aluno_id"], "topico_id": 117, "conteudo_id": None}

    with pytest.raises(RuntimeError, match="Microservico BrainHex nao concluiu a geracao."):
        await _process_media_render_target(
            app=app, session=_FakeSession(is_stuck=False), job=job, target=target
        )

    assert incrementar_mock.await_args.kwargs["generation_key"] == "ciclo-249:hash-249"


@pytest.mark.asyncio
async def test_process_media_render_target_retries_when_existing_record_is_stuck(monkeypatch) -> None:
    """Processando stale com material parcial e incompleto pode ser reservado."""
    existing = _existing_record()
    existing["materiais"] = {
        "audio": {
            "arquivo_url": "https://cdn.example/audio.mp3",
            "metadata": {
                "status": "completed",
                "generation_key": "ciclo-249:hash-249",
            },
        }
    }

    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_mais_recente_por_perfil",
        AsyncMock(return_value=existing),
    )
    claim_mock = AsyncMock(return_value=existing)
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.claim_retry_incomplete_generation",
        claim_mock,
    )
    completed = _completed_record(existing)
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_por_id",
        AsyncMock(return_value=completed),
    )
    monkeypatch.setattr(
        jobs_module,
        "fetch_personalizacao_context",
        AsyncMock(return_value={"source_hash": "hash-249", "fontes": [{"url": "https://x/y.pptx", "mime_type": "application/vnd.openxmlformats-officedocument.presentationml.presentation", "tipo": "documento"}]}),
    )
    dispatch_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(jobs_module, "disparar_brainhex_async", dispatch_mock)
    monkeypatch.setattr(
        jobs_module,
        "enrich_content_blocks",
        AsyncMock(return_value={"blocos": [{"id": "bloco-01"}]}),
    )

    app = SimpleNamespace(
        state=SimpleNamespace(settings=SimpleNamespace(personalizacao_job_stale_processing_min=15))
    )
    job = {"id": "job-2", "classe_id": 32, "kind": "class_delta_sync", "payload": {}}
    target = {"id": 582, "aluno_id": existing["aluno_id"], "topico_id": 117, "conteudo_id": None}

    result = await _process_media_render_target(
        app=app, session=_FakeSession(is_stuck=True), job=job, target=target
    )

    assert result["retried_stuck"] is True
    assert result["retried_failed"] is False
    assert result["record"] == completed
    assert dispatch_mock.await_count == 1
    assert dispatch_mock.await_args.kwargs["personalizacao_id"] == existing["id"]
    assert dispatch_mock.await_args.kwargs["content_blocks"] == [{"id": "bloco-01"}]
    assert dispatch_mock.await_args.kwargs["wait_for_completion"] is True
    assert dispatch_mock.await_args.kwargs["contract_prechecked"] is True
    assert claim_mock.await_args.kwargs["stale_processing_min"] >= 53


@pytest.mark.asyncio
async def test_process_media_render_target_replaces_legacy_presentation_metadata(
    monkeypatch,
) -> None:
    """Um PDF legado completed da mesma geracao deve ser reservado e regenerado."""
    existing = _completed_record(_existing_record(status="pronto"))
    existing["materiais"]["apresentacao"]["metadata"].pop("engine")
    existing["materiais"]["apresentacao"]["metadata"].pop("design_system")
    existing["materiais"]["apresentacao"]["metadata"].pop("media_pipeline_version")
    claimed = {**existing, "status": "processando_midias"}
    completed = _completed_record(claimed)

    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_mais_recente_por_perfil",
        AsyncMock(return_value=existing),
    )
    claim_mock = AsyncMock(return_value=claimed)
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.claim_retry_incomplete_generation",
        claim_mock,
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_por_id",
        AsyncMock(return_value=completed),
    )
    monkeypatch.setattr(
        jobs_module,
        "fetch_personalizacao_context",
        AsyncMock(return_value={"source_hash": "hash-249", "fontes": []}),
    )
    monkeypatch.setattr(
        jobs_module,
        "enrich_content_blocks",
        AsyncMock(return_value={"blocos": [{"id": "bloco-01"}]}),
    )
    dispatch_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(jobs_module, "disparar_brainhex_async", dispatch_mock)

    app = SimpleNamespace(
        state=SimpleNamespace(settings=SimpleNamespace(personalizacao_job_stale_processing_min=15))
    )
    job = {
        "id": "job-legacy-presentation",
        "classe_id": 32,
        "kind": "class_delta_sync",
        "payload": {},
    }
    target = {
        "id": 583,
        "aluno_id": existing["aluno_id"],
        "topico_id": 117,
        "conteudo_id": None,
    }

    result = await _process_media_render_target(
        app=app,
        session=_FakeSession(is_stuck=False),
        job=job,
        target=target,
    )

    assert result["record"] == completed
    assert result["retried_stuck"] is False
    assert result["retried_failed"] is False
    claim_mock.assert_awaited_once()
    dispatch_mock.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("failed_status", ["failed", "falha", "failed_quality", "partial"])
async def test_process_media_render_target_retries_incomplete_terminal_record_without_overwrite(
    monkeypatch,
    failed_status,
) -> None:
    existing = _existing_record(status=failed_status)
    existing["materiais"] = {
        "audio": {
            "arquivo_url": "https://cdn.example/audio.mp3",
            "metadata": {
                "status": "completed",
                "generation_key": "ciclo-249:hash-249",
            },
        },
        "markdown": {
            "metadata": {
                "status": "failed_quality",
                "generation_key": "ciclo-249:hash-249",
            }
        },
    }
    processing = {**existing, "status": "processando_midias"}
    completed = _completed_record(processing)

    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_mais_recente_por_perfil",
        AsyncMock(return_value=existing),
    )
    claim_mock = AsyncMock(return_value=processing)
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.claim_retry_incomplete_generation",
        claim_mock,
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_por_id",
        AsyncMock(return_value=completed),
    )
    monkeypatch.setattr(
        jobs_module,
        "fetch_personalizacao_context",
        AsyncMock(return_value={"source_hash": "hash-249", "fontes": []}),
    )
    dispatch_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(jobs_module, "disparar_brainhex_async", dispatch_mock)
    monkeypatch.setattr(
        jobs_module,
        "enrich_content_blocks",
        AsyncMock(return_value={"blocos": [{"id": "bloco-01"}]}),
    )

    app = SimpleNamespace(
        state=SimpleNamespace(settings=SimpleNamespace(personalizacao_job_stale_processing_min=15))
    )
    job = {"id": "job-3", "classe_id": 32, "kind": "class_delta_sync", "payload": {}}
    target = {"id": 583, "aluno_id": existing["aluno_id"], "topico_id": 117, "conteudo_id": None}

    result = await _process_media_render_target(
        app=app, session=_FakeSession(is_stuck=False), job=job, target=target
    )

    assert result["retried_failed"] is (failed_status in {"failed", "falha"})
    assert result["retried_stuck"] is False
    assert result["record"] == completed
    assert processing["materiais"] == existing["materiais"]
    assert claim_mock.await_args.kwargs == {
        "record_id": existing["id"],
        "ciclo_id": "ciclo-249",
        "source_hash": "hash-249",
        "generation_key": "ciclo-249:hash-249",
        "stale_processing_min": 53,
    }
    assert dispatch_mock.await_args.kwargs["wait_for_completion"] is True


class _WorkerSession:
    def __init__(self, session_id: int) -> None:
        self.session_id = session_id

    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _tb):
        return None

    async def rollback(self) -> None:
        return None


class _WorkerSessionFactory:
    def __init__(self) -> None:
        self.sessions: list[_WorkerSession] = []

    def __call__(self) -> _WorkerSession:
        session = _WorkerSession(len(self.sessions) + 1)
        self.sessions.append(session)
        return session


@pytest.mark.asyncio
async def test_job_processes_targets_with_bounded_concurrency_and_distinct_sessions(
    monkeypatch,
) -> None:
    job = {
        "id": "job-concurrent",
        "classe_id": 32,
        "kind": "class_delta_sync",
        "payload": {},
    }
    targets = [
        {
            "id": index,
            "aluno_id": f"aluno-{index}",
            "topico_id": 121,
            "conteudo_id": 125,
            "status": "pending",
            "attempts": 0,
        }
        for index in range(1, 8)
    ]
    by_id = {target["id"]: dict(target) for target in targets}
    claimed = False
    peak = 0
    running = 0
    target_session_ids: set[int] = set()
    finalized: list[str] = []

    async def claim_next_job(
        _self,
        *,
        stale_processing_min,
        partial_retry_delay_sec,
    ):
        nonlocal claimed
        assert stale_processing_min >= 53
        assert partial_retry_delay_sec == 15
        if claimed:
            return None
        claimed = True
        return job

    async def get_targets(_self, _job_id):
        return [dict(target) for target in by_id.values()]

    async def update_target_status(
        _self,
        *,
        target_id,
        status,
        attempts,
        last_error,
        personalizacao_id=None,
    ):
        by_id[target_id].update(
            {
                "status": status,
                "attempts": attempts,
                "last_error": last_error,
                "personalizacao_id": personalizacao_id,
            }
        )

    async def process_target(*, app, session, job, target):
        del app, job
        nonlocal peak, running
        target_session_ids.add(session.session_id)
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.01)
        running -= 1
        return {"record": {"id": target["id"]}}

    async def refresh_job_counters(_self, _job_id):
        completed = sum(1 for target in by_id.values() if target["status"] == "completed")
        failed = sum(1 for target in by_id.values() if target["status"] == "failed")
        return {"processed_targets": completed + failed, "error_count": failed}

    async def finalize_job(_self, *, job_id, status, last_error):
        del job_id, last_error
        finalized.append(status)

    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.claim_next_job",
        claim_next_job,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.get_targets",
        get_targets,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.update_target_status",
        update_target_status,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.refresh_job_counters",
        refresh_job_counters,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.finalize_job",
        finalize_job,
    )
    monkeypatch.setattr(jobs_module, "_process_media_render_target", process_target)

    session_factory = _WorkerSessionFactory()
    app = SimpleNamespace(
        state=SimpleNamespace(
            session_factory=session_factory,
            settings=SimpleNamespace(
                personalizacao_job_stale_processing_min=40,
                brainhex_api_wait_timeout_sec=1980,
                personalizacao_job_max_retries=3,
                personalizacao_media_render_concurrency=2,
                # Este teste cobre concorrencia/sessoes distintas isoladamente;
                # o espacamento entre perfis (_profile_render_targets_ready_now)
                # tem cobertura propria e por padrao so libera 1 alvo por vez.
                personalizacao_media_render_profile_pace_sec=0,
            ),
        )
    )

    processed = await process_personalizacao_job_once(app)

    assert processed is True
    assert peak == 2
    assert len(target_session_ids) == 7
    assert all(target["status"] == "completed" for target in by_id.values())
    assert finalized == ["completed"]


@pytest.mark.asyncio
async def test_job_processes_one_profile_per_tick_by_default(monkeypatch) -> None:
    """Sem pace_sec explicito (default 300s), uma rodada fresca so libera 1
    dos N perfis pendentes — os outros ficam pendentes pro proximo poll."""
    job = {"id": "job-paced", "classe_id": 32, "kind": "class_delta_sync", "payload": {}}
    targets = [
        {
            "id": index,
            "aluno_id": f"aluno-{index}",
            "topico_id": 121,
            "conteudo_id": 125,
            "status": "pending",
            "attempts": 0,
            "updated_at": None,
        }
        for index in range(1, 4)
    ]
    by_id = {target["id"]: dict(target) for target in targets}
    claimed = False
    processed_ids: list[int] = []

    async def claim_next_job(_self, *, stale_processing_min, partial_retry_delay_sec):
        nonlocal claimed
        if claimed:
            return None
        claimed = True
        return job

    async def get_targets(_self, _job_id):
        return [dict(target) for target in by_id.values()]

    async def update_target_status(
        _self, *, target_id, status, attempts, last_error, personalizacao_id=None,
    ):
        by_id[target_id].update({"status": status, "attempts": attempts, "last_error": last_error})

    async def process_target(*, app, session, job, target):
        del app, session, job
        processed_ids.append(target["id"])
        return {"record": {"id": target["id"]}}

    async def refresh_job_counters(_self, _job_id):
        completed = sum(1 for target in by_id.values() if target["status"] == "completed")
        return {"processed_targets": completed, "error_count": 0}

    finalized: list[str] = []

    async def finalize_job(_self, *, job_id, status, last_error):
        del job_id, last_error
        finalized.append(status)

    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.claim_next_job",
        claim_next_job,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.get_targets",
        get_targets,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.update_target_status",
        update_target_status,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.refresh_job_counters",
        refresh_job_counters,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.finalize_job",
        finalize_job,
    )
    monkeypatch.setattr(jobs_module, "_process_media_render_target", process_target)

    app = SimpleNamespace(
        state=SimpleNamespace(
            session_factory=_WorkerSessionFactory(),
            settings=SimpleNamespace(
                personalizacao_job_stale_processing_min=40,
                personalizacao_job_max_retries=3,
                personalizacao_media_render_concurrency=2,
            ),
        )
    )

    processed = await process_personalizacao_job_once(app)

    assert processed is True
    assert processed_ids == [1]
    assert by_id[1]["status"] == "completed"
    assert by_id[2]["status"] == "pending"
    assert by_id[3]["status"] == "pending"
    assert finalized == ["partial"]


@pytest.mark.asyncio
async def test_job_keeps_deferred_target_pending_without_consuming_retry(
    monkeypatch,
) -> None:
    job = {
        "id": "job-deferred",
        "classe_id": 32,
        "kind": "class_delta_sync",
        "payload": {},
    }
    target = {
        "id": 91,
        "aluno_id": "aluno-1",
        "topico_id": 121,
        "conteudo_id": 125,
        "status": "pending",
        "attempts": 2,
    }
    status_history: list[tuple[str, int, str | None]] = []
    finalized: list[str] = []

    async def claim_next_job(
        _self,
        *,
        stale_processing_min,
        partial_retry_delay_sec,
    ):
        assert stale_processing_min >= 53
        assert partial_retry_delay_sec == 15
        return job

    async def get_targets(_self, _job_id):
        return [dict(target)]

    async def update_target_status(
        _self,
        *,
        target_id,
        status,
        attempts,
        last_error,
        personalizacao_id=None,
    ):
        assert target_id == target["id"]
        target.update(
            {
                "status": status,
                "attempts": attempts,
                "last_error": last_error,
                "personalizacao_id": personalizacao_id,
            }
        )
        status_history.append((status, attempts, last_error))

    async def process_target(**_kwargs):
        return {
            "deferred": True,
            "record": {"id": 249},
            "reason": "geracao_atual_em_processamento",
        }

    async def refresh_job_counters(_self, _job_id):
        return {"processed_targets": 0, "error_count": 0}

    async def finalize_job(_self, *, job_id, status, last_error):
        assert job_id == job["id"]
        assert last_error is None
        finalized.append(status)

    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.claim_next_job",
        claim_next_job,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.get_targets",
        get_targets,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.update_target_status",
        update_target_status,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.refresh_job_counters",
        refresh_job_counters,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.finalize_job",
        finalize_job,
    )
    monkeypatch.setattr(jobs_module, "_process_media_render_target", process_target)

    app = SimpleNamespace(
        state=SimpleNamespace(
            session_factory=_WorkerSessionFactory(),
            settings=SimpleNamespace(
                personalizacao_job_stale_processing_min=40,
                brainhex_api_wait_timeout_sec=1980,
                personalizacao_job_max_retries=3,
                personalizacao_media_render_concurrency=2,
            ),
        )
    )

    processed = await process_personalizacao_job_once(app)

    assert processed is True
    assert status_history == [
        ("processing", 3, None),
        ("pending", 2, "geracao_atual_em_processamento"),
    ]
    assert target["status"] == "pending"
    assert target["attempts"] == 2
    assert target["personalizacao_id"] == 249
    assert finalized == ["partial"]
