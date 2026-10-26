"""Modo restrito na API (#195): mentor, frames, inferencia e telemetria param;
o resto segue igual.

A regra e do banco (`aluno_finalidade_permitida`, migracao 20261024_02, provada no
e2e). Aqui se prova que a API obedece a resposta, e que sem resposta ela fecha.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_session, require_aluno
from app.api.v1 import telemetria as telemetria_module
from app.repositories.access import AccessRepository
from app.repositories.evento import EventoRepository
from app.repositories.telemetria import TelemetriaRepository
from app.schemas.api import AnalisarResponse
from app.services import modo_restrito
from app.services.auth import UserContext
from tests.conftest import FakeSession
from tests.test_api import _telemetria_payload

pytestmark = pytest.mark.modo_restrito_real

ALUNO = UserContext(user_id="aluno-1", role="aluno", roles=("aluno",), aluno_id="aluno-1")
TUDO = dict.fromkeys(modo_restrito.FINALIDADES, True)
NADA = dict.fromkeys(modo_restrito.FINALIDADES, False)

CHAT = {
    "classe_id": 1,
    "topico_id": None,
    "conteudo_id": None,
    "escopo": "trilha_home",
    "mensagem": "MARCA-SINTETICA pergunta",
    "historico": [],
}


def _responde(monkeypatch, permitidas: dict[str, bool]) -> list:
    chamadas: list = []

    async def fake(session, aluno_id):
        chamadas.append(aluno_id)
        return dict(permitidas)

    monkeypatch.setattr(modo_restrito, "finalidades_permitidas", fake)
    return chamadas


def _sessao(app) -> FakeSession:
    fake = FakeSession()

    async def override():
        yield fake

    app.dependency_overrides[get_session] = override
    return fake


# ------------------------------------------------------------------ o servico


class _Resultado:
    def __init__(self, linha):
        self._linha = linha

    def mappings(self):
        return self

    def first(self):
        return self._linha


async def test_sem_resposta_do_banco_tudo_fechado() -> None:
    assert await modo_restrito.finalidades_permitidas(FakeSession(), "aluno-1") == NADA


async def test_erro_do_banco_fecha_e_faz_rollback() -> None:
    sessao = FakeSession()
    sessao.execute = AsyncMock(side_effect=RuntimeError("funcao ausente"))
    assert await modo_restrito.finalidades_permitidas(sessao, "aluno-1") == NADA
    assert sessao.rollbacks == 1


async def test_sem_aluno_tudo_fechado() -> None:
    assert await modo_restrito.finalidades_permitidas(FakeSession(), None) == NADA


async def test_le_as_cinco_respostas_numa_ida_so() -> None:
    sessao = FakeSession()
    linha = {"camera": False, "telemetria": True, "emocional": None, "mentor": True, "pesquisa": False}
    sessao.execute = AsyncMock(return_value=_Resultado(linha))
    r = await modo_restrito.finalidades_permitidas(sessao, "aluno-1")
    assert r == {"camera": False, "telemetria": True, "emocional": False, "mentor": True, "pesquisa": False}
    assert sessao.execute.await_count == 1
    sql = str(sessao.execute.await_args.args[0])
    assert sql.count("aluno_finalidade_permitida") == 5


# ------------------------------------------------------------------ mentor de IA


def test_mentor_bloqueado_no_modo_restrito_com_mensagem_clara(app, monkeypatch) -> None:
    app.dependency_overrides[get_current_user] = lambda: ALUNO
    _sessao(app)
    _responde(monkeypatch, NADA)
    acesso = AsyncMock(return_value=True)
    monkeypatch.setattr(AccessRepository, "aluno_belongs_to_classe", acesso)

    with TestClient(app) as client:
        r = client.post("/api/v1/personalizar/chat", json=CHAT)

    assert r.status_code == 403
    assert r.json()["detail"]["codigo"] == "modo_restrito"
    assert "mentor de IA" in r.json()["detail"]["mensagem"]
    acesso.assert_not_awaited()  # nem chega a ler contexto do aluno


def test_mentor_fora_do_modo_restrito_segue_o_caminho_de_sempre(app, monkeypatch) -> None:
    app.dependency_overrides[get_current_user] = lambda: ALUNO
    _sessao(app)
    _responde(monkeypatch, TUDO)
    acesso = AsyncMock(return_value=False)
    monkeypatch.setattr(AccessRepository, "aluno_belongs_to_classe", acesso)

    with TestClient(app) as client:
        r = client.post("/api/v1/personalizar/chat", json=CHAT)

    assert r.status_code == 403
    assert r.json()["detail"] == "Aluno sem acesso a esta classe."
    acesso.assert_awaited_once()


def test_mentor_desmarcado_pelo_responsavel_tambem_bloqueia(app, monkeypatch) -> None:
    app.dependency_overrides[get_current_user] = lambda: ALUNO
    _sessao(app)
    _responde(monkeypatch, {**TUDO, "mentor": False})
    with TestClient(app) as client:
        r = client.post("/api/v1/personalizar/chat", json=CHAT)
    assert r.status_code == 403
    assert r.json()["detail"]["codigo"] == "modo_restrito"


# ------------------------------------------------------------------ telemetria e frames


def _repos(monkeypatch) -> dict[str, AsyncMock]:
    mocks = {
        "upsert_sessao": AsyncMock(return_value={"id": "s"}),
        "insert_or_get_lote": AsyncMock(return_value=({"id": "lote-1", "analysis_ciclo_id": None}, True)),
        "insert_eventos_app": AsyncMock(return_value=None),
        "insert_time_metric_entries": AsyncMock(return_value=None),
        "update_lote_analysis": AsyncMock(return_value=None),
    }
    for nome, mock in mocks.items():
        monkeypatch.setattr(TelemetriaRepository, nome, mock)
    mocks["log"] = AsyncMock(return_value=None)
    monkeypatch.setattr(EventoRepository, "log", mocks["log"])
    mocks["run_analysis"] = AsyncMock(return_value=AnalisarResponse(ciclo_id="ciclo-1"))
    monkeypatch.setattr(telemetria_module, "run_analysis", mocks["run_analysis"])
    return mocks


def test_telemetria_no_modo_restrito_descarta_tudo_e_responde_200(app, monkeypatch) -> None:
    app.dependency_overrides[require_aluno] = lambda: ALUNO
    _sessao(app)
    _responde(monkeypatch, NADA)
    mocks = _repos(monkeypatch)

    with TestClient(app) as client:
        r = client.post("/api/v1/telemetria/lotes", json=_telemetria_payload())

    # 200, nao 4xx: um erro faria o mobile tentar gravar direto no Supabase.
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["persisted"] is False
    assert corpo["analysis"]["erros"] == ["modo_restrito"]
    for nome in ("upsert_sessao", "insert_or_get_lote", "insert_eventos_app",
                 "insert_time_metric_entries", "log", "run_analysis"):
        mocks[nome].assert_not_awaited()


def test_telemetria_sem_camera_nem_emocional_guarda_lote_sem_frame_e_sem_inferencia(app, monkeypatch) -> None:
    app.dependency_overrides[require_aluno] = lambda: ALUNO
    _sessao(app)
    _responde(monkeypatch, {**TUDO, "camera": False, "emocional": False})
    mocks = _repos(monkeypatch)

    with TestClient(app) as client:
        r = client.post("/api/v1/telemetria/lotes", json=_telemetria_payload())

    assert r.status_code == 200
    assert r.json()["persisted"] is True
    assert r.json()["analysis"]["erros"] == ["modo_restrito"]
    assert mocks["insert_or_get_lote"].await_args.kwargs["frame_sent"] is False
    assert mocks["upsert_sessao"].await_args.kwargs["camera_opt_in"] is False
    mocks["run_analysis"].assert_not_awaited()


def test_telemetria_sem_camera_roda_inferencia_sem_frames(app, monkeypatch) -> None:
    app.dependency_overrides[require_aluno] = lambda: ALUNO
    _sessao(app)
    _responde(monkeypatch, {**TUDO, "camera": False})
    mocks = _repos(monkeypatch)

    with TestClient(app) as client:
        r = client.post("/api/v1/telemetria/lotes", json=_telemetria_payload())

    assert r.status_code == 200
    kwargs = mocks["run_analysis"].await_args.kwargs
    assert kwargs["frames_b64"] == [] and kwargs["frame_b64"] is None


def test_telemetria_fora_do_modo_restrito_continua_igual(app, monkeypatch) -> None:
    app.dependency_overrides[require_aluno] = lambda: ALUNO
    _sessao(app)
    _responde(monkeypatch, TUDO)
    mocks = _repos(monkeypatch)

    with TestClient(app) as client:
        r = client.post("/api/v1/telemetria/lotes", json=_telemetria_payload())

    assert r.status_code == 200
    assert r.json()["persisted"] is True
    assert r.json()["analysis"]["ciclo_id"] == "ciclo-1"
    kwargs = mocks["run_analysis"].await_args.kwargs
    assert kwargs["frames_b64"] == ["raw-frame-1", "raw-frame-2"]
    assert mocks["insert_or_get_lote"].await_args.kwargs["frame_sent"] is True


# ------------------------------------------------------------------ /emocoes


@pytest.mark.parametrize("rota", ["/api/v1/emocoes/analisar", "/api/v1/emocoes/analisar-stream"])
def test_emocoes_bloqueadas_no_modo_restrito(app, monkeypatch, rota) -> None:
    app.dependency_overrides[require_aluno] = lambda: ALUNO
    _sessao(app)
    _responde(monkeypatch, NADA)

    with TestClient(app) as client:
        r = client.post(rota, json={"classe_id": 1, "frame_b64": "raw-frame", "eventos_novos": []})

    assert r.status_code == 403
    assert r.json()["detail"]["codigo"] == "modo_restrito"
