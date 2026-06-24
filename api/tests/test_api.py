import json
from datetime import datetime
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.api.deps import get_current_user, get_session, require_aluno
from app.api.v1 import admin as admin_module
from app.api.v1 import emocoes as emocoes_module
from app.api.v1 import personalizacao as personalizacao_module
from app.api.v1 import telemetria as telemetria_module
from app.repositories.access import AccessRepository
from app.repositories.conteudo_classe import ConteudoClasseRepository
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.evento import EventoRepository
from app.repositories.fontes_personalizacao import FontesPersonalizacaoRepository
from app.repositories.materiais import MateriaisRepository
from app.repositories.personalizacao_jobs import PersonalizacaoJobsRepository
from app.repositories.telemetria import TelemetriaRepository
from app.schemas.api import AnalisarResponse
from app.schemas.telemetria import TelemetriaLotePayload
from app.services.auth import UserContext
from app.services.storage import SupabaseStorage
from tests.conftest import FakeGraph, FakeSession


async def _noop(*args, **kwargs):
    return None


def test_analisar_route_returns_graph_result(app, aluno_user, monkeypatch) -> None:
    fake_session = FakeSession()
    app.dependency_overrides[require_aluno] = lambda: aluno_user

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    monkeypatch.setattr(
        emocoes_module,
        "run_analysis",
        AsyncMock(
            return_value=AnalisarResponse(
                ciclo_id="ciclo-1",
                ui_config={
                    "tema": "focus",
                    "ritmo_conteudo": "lento",
                    "complexidade_visual": "minima",
                    "elementos_gamificacao": "sutis",
                    "tom_feedbacks": "suporte",
                    "precisa_texto": True,
                    "tipo_modal": "suporte",
                    "contexto_texto": {},
                },
                acoes_aplicadas=["perfil_atualizado"],
                erros=[],
            )
        ),
    )

    with TestClient(app) as client:
        response = client.post("/api/v1/emocoes/analisar", json={"classe_id": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["ciclo_id"] == "ciclo-1"
    assert body["ui_config"]["tema"] == "focus"
    assert body["acoes_aplicadas"] == ["perfil_atualizado"]


def test_stream_route_emits_sse_events(app, aluno_user, monkeypatch) -> None:
    fake_session = FakeSession()
    app.dependency_overrides[require_aluno] = lambda: aluno_user

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    monkeypatch.setattr(
        emocoes_module,
        "build_initial_state",
        AsyncMock(
            return_value={
                "ciclo_id": "ciclo-2",
                "classe_id": 1,
                "aluno_id": "aluno-1",
                "eventos_novos": [],
            }
        ),
    )
    monkeypatch.setattr(EventoRepository, "log", _noop)

    with TestClient(app) as client:
        client.app.state.graph_ephemeral = FakeGraph(
            {"ciclo_id": "ciclo-2"},
            stream_events=[
                {"agente_emocao": {"emocao_atual": {"emocao_primaria": "animado"}}},
                {"agente_ui": {"ui_config": {"tema": "energetic"}}},
            ],
        )
        response = client.post("/api/v1/emocoes/analisar-stream", json={"classe_id": 1})

    assert response.status_code == 200
    assert '"node": "DONE"' in response.text
    assert '"agente_ui"' in response.text


def test_admin_page_and_posts_manage_professors(app, monkeypatch) -> None:
    fake_session = FakeSession()

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    monkeypatch.setattr(
        AccessRepository,
        "list_admin_professors",
        AsyncMock(
            return_value=[
                {
                    "professor_id": "prof-1",
                    "nome": "Professor 1",
                    "descricao": None,
                    "instituicao": "TrailUp",
                    "disciplina": "Matematica",
                    "liberado": True,
                }
            ]
        ),
    )
    monkeypatch.setattr(
        AccessRepository,
        "list_admin_students",
        AsyncMock(
            return_value=[
                {
                    "aluno_id": "aluno-1",
                    "nome": "Aluno 1",
                    "email": "aluno1@example.com",
                }
            ]
        ),
    )
    monkeypatch.setattr(
        AccessRepository,
        "list_direct_professor_assignments",
        AsyncMock(
            return_value=[
                {
                    "professor_id": "prof-1",
                    "aluno_id": "aluno-1",
                    "nome": "Aluno 1",
                    "email": "aluno1@example.com",
                }
            ]
        ),
    )
    monkeypatch.setattr(AccessRepository, "professor_exists", AsyncMock(return_value=True))
    monkeypatch.setattr(AccessRepository, "aluno_exists", AsyncMock(return_value=True))
    monkeypatch.setattr(AccessRepository, "set_professor_liberado", AsyncMock(return_value=None))
    monkeypatch.setattr(AccessRepository, "set_professor_student_access", AsyncMock(return_value=None))

    with TestClient(app) as client:
        page = client.get("/admin/professores", auth=("admin", "secret-admin"))
        liberar = client.post(
            "/api/v1/admin/professores/prof-1/liberacao",
            auth=("admin", "secret-admin"),
            json={"liberado": False},
        )
        atribuir = client.post(
            "/api/v1/admin/professores/prof-1/alunos",
            auth=("admin", "secret-admin"),
            json={"aluno_id": "aluno-1", "has_acesso": True},
        )
        legado = client.get("/api/v1/professor/me")

    assert page.status_code == 200
    assert "Painel Admin" in page.text
    assert "Professor 1" in page.text
    assert liberar.status_code == 200
    assert liberar.json() == {"professor_id": "prof-1", "liberado": False}
    assert atribuir.status_code == 200
    assert atribuir.json() == {"professor_id": "prof-1", "aluno_id": "aluno-1", "has_acesso": True}
    assert legado.status_code == 404


def test_admin_routes_require_basic_auth(app) -> None:
    with TestClient(app) as client:
        page = client.get("/admin/professores")
        post = client.post("/api/v1/admin/professores/prof-1/liberacao", json={"liberado": True})

    assert page.status_code == 401
    assert post.status_code == 401


def test_admin_page_returns_503_when_schema_is_missing(app, monkeypatch) -> None:
    fake_session = FakeSession()

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    monkeypatch.setattr(
        AccessRepository,
        "list_admin_professors",
        AsyncMock(side_effect=OperationalError("SELECT * FROM professor", None, Exception("no such table"))),
    )

    with TestClient(app) as client:
        response = client.get("/admin/professores", auth=("admin", "secret-admin"))

    assert response.status_code == 503
    assert "schema principal do TrailUp" in response.text


def test_admin_post_returns_503_when_schema_is_missing(app, monkeypatch) -> None:
    fake_session = FakeSession()

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    monkeypatch.setattr(
        AccessRepository,
        "professor_exists",
        AsyncMock(side_effect=OperationalError("SELECT * FROM professor", None, Exception("no such table"))),
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/admin/professores/prof-1/liberacao",
            auth=("admin", "secret-admin"),
            json={"liberado": True},
        )

    assert response.status_code == 503
    assert "Schema TrailUp indisponivel" in response.json()["detail"]


def test_admin_media_backfill_route_supports_dry_run_and_effective_mode(app, monkeypatch) -> None:
    fake_session = FakeSession()

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    run_mock = AsyncMock(
        side_effect=[
            {
                "scanned": 4,
                "eligible": 3,
                "enqueued": 0,
                "already_open_job": 1,
                "linked_materials": 2,
                "errors": 0,
                "dry_run": True,
            },
            {
                "scanned": 4,
                "eligible": 3,
                "enqueued": 3,
                "already_open_job": 1,
                "linked_materials": 2,
                "errors": 0,
                "dry_run": False,
            },
        ]
    )
    monkeypatch.setattr(admin_module, "backfill_media_render_jobs", run_mock)

    with TestClient(app) as client:
        dry_run_response = client.post(
            "/api/v1/admin/personalizacao/media/backfill",
            auth=("admin", "secret-admin"),
            json={"classe_id": 30, "limit": 50, "dry_run": True},
        )
        run_response = client.post(
            "/api/v1/admin/personalizacao/media/backfill",
            auth=("admin", "secret-admin"),
            json={"classe_id": 30, "limit": 50, "dry_run": False},
        )

    assert dry_run_response.status_code == 200
    assert dry_run_response.json()["enqueued"] == 0
    assert dry_run_response.json()["dry_run"] is True
    assert run_response.status_code == 200
    assert run_response.json()["enqueued"] == 3
    assert run_response.json()["dry_run"] is False
    assert run_mock.await_count == 2


def test_admin_media_backfill_route_requires_auth(app) -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/admin/personalizacao/media/backfill",
            json={"dry_run": True},
        )

    assert response.status_code == 401


def test_materiais_endpoint_returns_student_materials(app, aluno_user, monkeypatch) -> None:
    fake_session = FakeSession()

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: aluno_user
    monkeypatch.setattr(
        MateriaisRepository,
        "listar_por_aluno",
        AsyncMock(
            return_value=[
                {
                    "id": 1,
                    "aluno_id": "aluno-1",
                    "conteudo_id": 10,
                    "tipo": "quiz",
                    "payload": [{"pergunta": "Q1"}],
                    "arquivo_url": None,
                    "criado_em": "2026-04-05T12:00:00Z",
                }
            ]
        ),
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/materiais/aluno-1")

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["materiais"][0]["tipo"] == "quiz"


def test_personalizar_route_creates_personalizacao_record(app, aluno_user, monkeypatch) -> None:
    fake_session = FakeSession()

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: aluno_user

    fake_ctx = {
        "aluno_id": "aluno-1",
        "classe_id": 1,
        "topico_id": 5,
        "conteudo_id": None,
        "ciclo_id": "ciclo-personalizado",
        "source_hash": "abc123",
        "perfil_dominante": "mastermind",
        "perfil_brainhex": [{"perfil": "mastermind", "afinidade": 1.0}],
        "conteudo_classe": {"titulo": "Título"},
        "contexto_aluno": {"nome": "Aluno"},
        "fontes": [],
    }
    fake_record = {
        "id": 7,
        "aluno_id": "aluno-1",
        "classe_id": 1,
        "conteudo_id": None,
        "topico_id": 5,
        "ciclo_id": "ciclo-personalizado",
        "status": "processando_midias",
        "materiais": {},
        "ai_patch": None,
        "plano": {},
        "source_hash": "abc123",
        "formato_prioritario": "cards",
        "formatos_gerados": ["cards"],
        "gerado_em": "2026-06-24T12:00:00Z",
    }

    monkeypatch.setattr(personalizacao_module, "fetch_personalizacao_context", AsyncMock(return_value=fake_ctx))
    monkeypatch.setattr(personalizacao_module, "gerar_cards_direto", AsyncMock(return_value=[]))
    monkeypatch.setattr(personalizacao_module, "disparar_brainhex_async", AsyncMock(return_value=None))
    monkeypatch.setattr(
        "app.repositories.artefatos_personalizados.ArtefatosPersonalizadosRepository.marcar_ciclos_anteriores_obsoletos",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "app.repositories.artefatos_personalizados.ArtefatosPersonalizadosRepository.salvar_cards",
        AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(
        ConteudoPersonalizadoRepository,
        "salvar",
        AsyncMock(return_value=7),
    )
    monkeypatch.setattr(
        ConteudoPersonalizadoRepository,
        "buscar_por_ciclo_id",
        AsyncMock(return_value=fake_record),
    )

    with TestClient(app) as client:
        response = client.post("/api/v1/personalizar", json={"classe_id": 1, "topico_id": 5})

    assert response.status_code == 201
    body = response.json()
    assert body["id"] == 7
    assert body["status"] == "processando_midias"
    assert body["media_status"] == "ready"
    assert body["media_job_id"] is None
    assert body["aiPatch"] is None


def test_personalizacao_media_status_route_returns_pending_media(app, aluno_user, monkeypatch) -> None:
    fake_session = FakeSession()

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: aluno_user
    monkeypatch.setattr(
        ConteudoPersonalizadoRepository,
        "buscar_por_id",
        AsyncMock(
            return_value={
                "id": 7,
                "aluno_id": "aluno-1",
                "status": "processando_midias",
                "materiais": {
                    "pdf": {
                        "payload": {"titulo": "Guia"},
                        "metadata": {"status": "pending"},
                        "arquivo_url": None,
                    }
                },
            }
        ),
    )
    monkeypatch.setattr(
        MateriaisRepository,
        "listar_por_personalizacao",
        AsyncMock(
            return_value=[
                {
                    "id": 101,
                    "tipo": "pdf",
                    "arquivo_url": None,
                    "storage_path": None,
                    "metadata": {"status": "pending"},
                },
                {
                    "id": 102,
                    "tipo": "audio",
                    "arquivo_url": "https://cdn.example.com/audio.mp3",
                    "storage_path": "path/audio.mp3",
                    "metadata": {"status": "completed"},
                },
            ]
        ),
    )
    monkeypatch.setattr(
        PersonalizacaoJobsRepository,
        "get_latest_media_render_job",
        AsyncMock(return_value={"id": "job-media-1"}),
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/personalizar/7/media-status")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "pending"
    assert body["job_id"] == "job-media-1"
    assert body["materiais"][0]["tipo"] == "pdf"
    assert body["materiais"][0]["status"] == "pending"
    assert body["materiais"][1]["tipo"] == "audio"
    assert body["materiais"][1]["status"] == "ready"


def test_normalize_media_status_marks_quality_rejected_as_failed() -> None:
    failed = personalizacao_module._normalize_media_status(
        {
            "arquivo_url": "https://cdn.example.com/material.pdf",
            "metadata": {
                "status": "completed",
                "scores_validacao": {"aprovado": False, "score": 0.61},
            },
        }
    )
    pending = personalizacao_module._normalize_media_status(
        {
            "arquivo_url": None,
            "metadata": {
                "status": "pending",
                "scores_validacao": {"aprovado": False, "score": 0.55},
            },
        }
    )

    assert failed == "failed"
    assert pending == "pending"


def test_upload_fontes_route_accepts_professor_file_and_link(app, monkeypatch) -> None:
    fake_session = FakeSession()
    professor_user = UserContext(
        user_id="prof-1",
        role="professor",
        roles=("professor",),
        professor_id="prof-1",
        professor_liberado=True,
    )
    saved_calls: list[dict[str, object]] = []

    async def override_session():
        yield fake_session

    async def save_stub(self, **kwargs):
        saved_calls.append(kwargs)
        return {
            "id": len(saved_calls),
            "criado_em": "2026-04-08T12:00:00Z",
            **kwargs,
        }

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: professor_user
    monkeypatch.setattr(AccessRepository, "professor_owns_classe", AsyncMock(return_value=True))
    monkeypatch.setattr(ConteudoClasseRepository, "buscar_classe_id_por_topico", AsyncMock(return_value=1))
    monkeypatch.setattr(
        SupabaseStorage,
        "upload",
        AsyncMock(return_value="https://cdn.example.com/fontes/base.pdf"),
    )
    monkeypatch.setattr(FontesPersonalizacaoRepository, "salvar", save_stub)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/personalizar/fontes",
            data={
                "classe_id": "1",
                "topico_id": "5",
                "visibilidade": "classe",
                "descricao": "Fontes da turma",
                "links_json": json.dumps([{"url": "https://youtu.be/demo", "titulo": "Video base"}]),
            },
            files=[("files", ("base.pdf", b"%PDF-1.4", "application/pdf"))],
        )

    assert response.status_code == 201
    body = response.json()
    assert body["total"] == 2
    assert body["itens"][0]["tipo"] == "pdf"
    assert body["itens"][1]["tipo"] == "video"
    assert saved_calls[0]["professor_id"] == "prof-1"
    assert saved_calls[0]["visibilidade"] == "classe"


def test_upload_fontes_route_rejects_student_class_visibility(app, aluno_user) -> None:
    app.dependency_overrides[get_current_user] = lambda: aluno_user

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/personalizar/fontes",
            data={"classe_id": "1", "visibilidade": "classe"},
            files=[("files", ("base.pdf", b"%PDF-1.4", "application/pdf"))],
        )

    assert response.status_code == 403
    assert "professores" in response.json()["detail"]


def test_upload_fontes_route_requires_file_or_link(app, aluno_user) -> None:
    app.dependency_overrides[get_current_user] = lambda: aluno_user

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/personalizar/fontes",
            data={"classe_id": "1"},
        )

    assert response.status_code == 422
    assert "arquivo ou um link" in response.json()["detail"]


def test_personalizacao_contexto_route_accepts_cors_preflight(app) -> None:
    with TestClient(app) as client:
        response = client.options(
            "/api/v1/personalizar/contexto/aluno-1?classe_id=10",
            headers={
                "Origin": "http://localhost:8080",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"


def _telemetria_payload() -> dict:
    return {
        "sessao_id": "7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b",
        "classe_id": 1,
        "topico_id": 10,
        "atividade_id": 20,
        "conteudo_id": 33,
        "item_key": "activity:20",
        "screen_name": "trilha_topico",
        "route_name": "/(tabs)/trilha/[id]",
        "flush_reason": "activity_complete",
        "captured_at": "2026-04-06T15:10:00Z",
        "session_started_at": "2026-04-06T15:00:00Z",
        "study_elapsed_sec": 600,
        "screen_dwell_sec": 180,
        "active_sec": 147,
        "idle_sec": 65,
        "touch_count": 27,
        "scroll_distance_px": 1820,
        "max_depth_px": 2480,
        "time_metrics": {
            "general": {
                "session_elapsed_sec": 600,
                "batch_dwell_sec": 180,
                "batch_active_sec": 147,
                "batch_idle_sec": 65,
                "touch_count": 27,
                "scroll_distance_px": 1820,
                "max_depth_px": 2480,
            },
            "topics": [
                {
                    "key": "topic:10",
                    "topico_id": 10,
                    "visits": 1,
                    "dwell_sec": 180,
                    "active_sec": 147,
                    "idle_sec": 33,
                    "touch_count": 27,
                    "scroll_distance_px": 1820,
                    "max_depth_px": 2480,
                }
            ],
            "contents": [
                {
                    "key": "content:33",
                    "topico_id": 10,
                    "conteudo_id": 33,
                    "item_key": "content:33",
                    "visits": 1,
                    "dwell_sec": 74,
                    "active_sec": 61,
                    "idle_sec": 13,
                    "touch_count": 11,
                    "scroll_distance_px": 860,
                    "max_depth_px": 1200,
                }
            ],
            "activities": [
                {
                    "key": "activity:20",
                    "topico_id": 10,
                    "conteudo_id": 33,
                    "atividade_id": 20,
                    "item_key": "activity:20",
                    "visits": 1,
                    "dwell_sec": 106,
                    "active_sec": 86,
                    "idle_sec": 20,
                    "touch_count": 16,
                    "scroll_distance_px": 960,
                    "max_depth_px": 2480,
                }
            ],
            "materials": [
                {
                    "key": "material:content:33:pdf:m-33",
                    "topico_id": 10,
                    "conteudo_id": 33,
                    "item_key": "content:33",
                    "material_key": "material:content:33:pdf:m-33",
                    "material_tipo": "pdf",
                    "visits": 1,
                    "dwell_sec": 74,
                    "active_sec": 61,
                    "idle_sec": 13,
                    "touch_count": 11,
                    "scroll_distance_px": 860,
                    "max_depth_px": 1200,
                }
            ],
        },
        "signals": [
            {"type": "topic_open", "timestamp": 1, "topico_id": 10, "atividade_id": None, "conteudo_id": None, "item_key": "topic:10", "meta": {}},
            {"type": "content_open", "timestamp": 2, "topico_id": 10, "atividade_id": None, "conteudo_id": 33, "item_key": "content:33", "meta": {}},
            {"type": "content_complete", "timestamp": 3, "topico_id": 10, "atividade_id": None, "conteudo_id": 33, "item_key": "content:33", "meta": {}},
            {"type": "activity_start", "timestamp": 4, "topico_id": 10, "atividade_id": 20, "conteudo_id": None, "item_key": "activity:20", "meta": {}},
            {"type": "activity_wrong", "timestamp": 5, "topico_id": 10, "atividade_id": 20, "conteudo_id": None, "item_key": "activity:20", "meta": {}},
            {"type": "wrong_streak", "timestamp": 6, "topico_id": 10, "atividade_id": 20, "conteudo_id": None, "item_key": "activity:20", "meta": {}},
            {"type": "timer_timeout", "timestamp": 7, "topico_id": 10, "atividade_id": 20, "conteudo_id": None, "item_key": "activity:20", "meta": {}},
        ],
        "eventos_app": [
            {
                "client_event_id": "evt-1",
                "event_group": "session",
                "event_name": "session_start",
                "occurred_at": "2026-04-06T15:00:00Z",
                "topico_id": 10,
                "payload": {"screen_name": "trilha_topico"},
            },
            {
                "client_event_id": "evt-2",
                "event_group": "navigation",
                "event_name": "content_open",
                "occurred_at": "2026-04-06T15:01:00Z",
                "topico_id": 10,
                "conteudo_id": 33,
                "item_key": "content:33",
                "time_since_prev_sec": 60,
                "payload": {},
            },
            {
                "client_event_id": "evt-3",
                "event_group": "chat",
                "event_name": "chat_message",
                "occurred_at": "2026-04-06T15:02:00Z",
                "topico_id": 10,
                "chat_role": "user",
                "trigger_context": "on_demand",
                "time_since_prev_sec": 60,
                "payload": {"message_length": 24},
            },
        ],
        "touch_samples": [
            {"t_offset_ms": 1200, "x_pct": 0.42, "y_pct": 0.81, "target": "activity"}
        ],
        "camera": {
            "enabled": True,
            "frame_mime": "image/jpeg",
            "frames": [
                {
                    "captured_at": "2026-04-06T15:04:00Z",
                    "frame_mime": "image/jpeg",
                    "frame_b64": "raw-frame-1",
                },
                {
                    "captured_at": "2026-04-06T15:04:06Z",
                    "frame_mime": "image/jpeg",
                    "frame_b64": "raw-frame-2",
                },
            ],
        },
    }


def test_telemetria_route_requires_auth(app) -> None:
    with TestClient(app) as client:
        response = client.post("/api/v1/telemetria/lotes", json=_telemetria_payload())

    assert response.status_code == 401


def test_telemetria_route_rejects_invalid_payload(app, aluno_user) -> None:
    app.dependency_overrides[require_aluno] = lambda: aluno_user

    with TestClient(app) as client:
        response = client.post("/api/v1/telemetria/lotes", json={"classe_id": 1})

    assert response.status_code == 422


def test_telemetria_route_accepts_null_signal_meta(app, aluno_user, monkeypatch) -> None:
    fake_session = FakeSession()
    captured_insert_args: dict[str, object] = {}
    app.dependency_overrides[require_aluno] = lambda: aluno_user

    async def override_session():
        yield fake_session

    async def capture_insert(self, **kwargs):
        captured_insert_args.update(kwargs)
        return {"id": "batch-null-meta", "sessao_id": kwargs["sessao_id"], "analysis_ciclo_id": None}, True

    app.dependency_overrides[get_session] = override_session
    monkeypatch.setattr(
        TelemetriaRepository,
        "upsert_sessao",
        AsyncMock(return_value={"id": "7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b"}),
    )
    monkeypatch.setattr(TelemetriaRepository, "insert_or_get_lote", capture_insert)
    monkeypatch.setattr(TelemetriaRepository, "insert_eventos_app", AsyncMock(return_value=None))
    monkeypatch.setattr(TelemetriaRepository, "update_lote_analysis", AsyncMock(return_value=None))
    monkeypatch.setattr(EventoRepository, "log", AsyncMock(return_value=None))
    monkeypatch.setattr(
        telemetria_module,
        "run_analysis",
        AsyncMock(return_value=AnalisarResponse(ciclo_id="ciclo-null-meta")),
    )

    payload = _telemetria_payload()
    payload["signals"][0]["meta"] = None

    with TestClient(app) as client:
        response = client.post("/api/v1/telemetria/lotes", json=payload)

    assert response.status_code == 200
    assert response.json()["analysis"]["ciclo_id"] == "ciclo-null-meta"
    assert captured_insert_args["payload"]["signals"][0]["meta"] is None  # type: ignore[index]


def test_normalize_eventos_legados_prefixes_entity_references() -> None:
    payload = TelemetriaLotePayload(**_telemetria_payload())

    eventos = telemetria_module._normalize_eventos_legados(payload)

    refs_by_tipo = {evento.tipo: evento.referencia for evento in eventos}
    assert refs_by_tipo["topico_aberto"] == "topico:10"
    assert refs_by_tipo["conteudo_aberto"] == "conteudo:33"
    assert refs_by_tipo["atividade_iniciada"] == "atividade:20"


def test_telemetria_route_persists_sanitized_batch_and_runs_analysis(app, aluno_user, monkeypatch) -> None:
    fake_session = FakeSession()
    captured_insert_args: dict[str, object] = {}
    captured_session_args: dict[str, object] = {}
    insert_eventos_mock = AsyncMock(return_value=None)
    insert_time_metrics_mock = AsyncMock(return_value=None)
    app.dependency_overrides[require_aluno] = lambda: aluno_user

    async def override_session():
        yield fake_session

    async def capture_session(self, **kwargs):
        captured_session_args.update(kwargs)
        return {"id": kwargs["sessao_id"]}

    async def capture_insert(self, **kwargs):
        captured_insert_args.update(kwargs)
        return {"id": "batch-1", "sessao_id": kwargs["sessao_id"], "analysis_ciclo_id": None}, True

    app.dependency_overrides[get_session] = override_session
    monkeypatch.setattr(TelemetriaRepository, "upsert_sessao", capture_session)
    monkeypatch.setattr(TelemetriaRepository, "insert_or_get_lote", capture_insert)
    monkeypatch.setattr(TelemetriaRepository, "insert_eventos_app", insert_eventos_mock)
    monkeypatch.setattr(TelemetriaRepository, "insert_time_metric_entries", insert_time_metrics_mock)
    monkeypatch.setattr(TelemetriaRepository, "update_lote_analysis", AsyncMock(return_value=None))
    monkeypatch.setattr(EventoRepository, "log", AsyncMock(return_value=None))
    monkeypatch.setattr(
        telemetria_module,
        "run_analysis",
        AsyncMock(
            return_value=AnalisarResponse(
                ciclo_id="ciclo-tele-1",
                emocao_atual={
                    "emocao_primaria": "foco",
                    "valencia": 0.5,
                    "confianca": 0.8,
                    "origem": "telemetria",
                },
                ui_config={"tema": "focus"},
                acoes_aplicadas=["telemetria_processada"],
                erros=[],
            )
        ),
    )

    with TestClient(app) as client:
        response = client.post("/api/v1/telemetria/lotes", json=_telemetria_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["batch_id"] == "batch-1"
    assert body["analysis"]["ciclo_id"] == "ciclo-tele-1"
    assert "topico_aberto" in body["normalized_events"]
    assert "conteudo_concluido" in body["normalized_events"]
    assert "atividade_iniciada" in body["normalized_events"]
    assert "atividade_errada" in body["normalized_events"]
    assert "erro_recorrente" in body["normalized_events"]
    assert "inatividade" in body["normalized_events"]
    assert "abandono_atividade" in body["normalized_events"]
    assert isinstance(captured_session_args["started_at"], datetime)
    assert isinstance(captured_insert_args["captured_at"], datetime)
    assert captured_insert_args["payload"]["time_metrics"]["materials"][0]["material_tipo"] == "pdf"  # type: ignore[index]
    assert captured_insert_args["payload"]["camera"]["frames_count"] == 2  # type: ignore[index]
    assert len(captured_insert_args["payload"]["eventos_app"]) == 3  # type: ignore[index]
    assert insert_eventos_mock.await_count == 1
    assert insert_eventos_mock.await_args.kwargs["eventos"][0]["event_name"] == "session_start"
    assert insert_time_metrics_mock.await_count == 1
    assert insert_time_metrics_mock.await_args.kwargs["time_metrics"]["materials"][0]["material_tipo"] == "pdf"
    assert "frame_b64" not in (captured_insert_args["payload"]["camera"])  # type: ignore[index]
    assert "frame_b64" not in (captured_insert_args["payload"]["camera"]["frames"][0])  # type: ignore[index]


def test_telemetria_route_dedupes_existing_batch(app, aluno_user, monkeypatch) -> None:
    fake_session = FakeSession()
    run_analysis_mock = AsyncMock(return_value=AnalisarResponse(ciclo_id="should-not-run"))
    app.dependency_overrides[require_aluno] = lambda: aluno_user

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    monkeypatch.setattr(
        TelemetriaRepository,
        "upsert_sessao",
        AsyncMock(return_value={"id": "7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b"}),
    )
    monkeypatch.setattr(
        TelemetriaRepository,
        "insert_or_get_lote",
        AsyncMock(
            return_value=(
                {"id": "batch-duplicado", "sessao_id": "7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b", "analysis_ciclo_id": "ciclo-existente"},
                False,
            )
        ),
    )
    monkeypatch.setattr(TelemetriaRepository, "insert_eventos_app", AsyncMock(return_value=None))
    monkeypatch.setattr(telemetria_module, "run_analysis", run_analysis_mock)
    evento_log_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(EventoRepository, "log", evento_log_mock)

    with TestClient(app) as client:
        response = client.post("/api/v1/telemetria/lotes", json=_telemetria_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["batch_id"] == "batch-duplicado"
    assert body["analysis"]["ciclo_id"] == "ciclo-existente"
    assert run_analysis_mock.await_count == 0
    assert evento_log_mock.await_count == 0


def test_telemetria_route_returns_partial_success_when_analysis_fails(app, aluno_user, monkeypatch) -> None:
    fake_session = FakeSession()
    app.dependency_overrides[require_aluno] = lambda: aluno_user

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    monkeypatch.setattr(
        TelemetriaRepository,
        "upsert_sessao",
        AsyncMock(return_value={"id": "7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b"}),
    )
    monkeypatch.setattr(
        TelemetriaRepository,
        "insert_or_get_lote",
        AsyncMock(return_value=({"id": "batch-erro", "sessao_id": "7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b", "analysis_ciclo_id": None}, True)),
    )
    monkeypatch.setattr(TelemetriaRepository, "insert_eventos_app", AsyncMock(return_value=None))
    monkeypatch.setattr(TelemetriaRepository, "update_lote_analysis", AsyncMock(return_value=None))
    monkeypatch.setattr(EventoRepository, "log", AsyncMock(return_value=None))
    monkeypatch.setattr(telemetria_module, "run_analysis", AsyncMock(side_effect=RuntimeError("falha-analise")))

    with TestClient(app) as client:
        response = client.post("/api/v1/telemetria/lotes", json=_telemetria_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["persisted"] is True
    assert body["analysis"]["ciclo_id"] is None
    assert "falha-analise" in body["analysis"]["erros"][0]


def test_telemetria_route_ignores_legacy_event_log_failures(app, aluno_user, monkeypatch) -> None:
    fake_session = FakeSession()
    app.dependency_overrides[require_aluno] = lambda: aluno_user

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    monkeypatch.setattr(
        TelemetriaRepository,
        "upsert_sessao",
        AsyncMock(return_value={"id": "7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b"}),
    )
    monkeypatch.setattr(
        TelemetriaRepository,
        "insert_or_get_lote",
        AsyncMock(return_value=({"id": "batch-ok", "sessao_id": "7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b", "analysis_ciclo_id": None}, True)),
    )
    monkeypatch.setattr(TelemetriaRepository, "insert_eventos_app", AsyncMock(return_value=None))
    monkeypatch.setattr(TelemetriaRepository, "update_lote_analysis", AsyncMock(return_value=None))
    monkeypatch.setattr(EventoRepository, "log", AsyncMock(side_effect=RuntimeError("evento-legado-falhou")))
    monkeypatch.setattr(
        telemetria_module,
        "run_analysis",
        AsyncMock(return_value=AnalisarResponse(ciclo_id="ciclo-telemetria-ok")),
    )

    with TestClient(app) as client:
        response = client.post("/api/v1/telemetria/lotes", json=_telemetria_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["persisted"] is True
    assert body["analysis"]["ciclo_id"] == "ciclo-telemetria-ok"
    assert fake_session.rollbacks >= 1

