"""Worker da fila de análise de lote (F3, Task 2): unidade, com `run_analysis` substituído.

O ponta a ponta contra o Postgres local fica em `test_e2e_analise_fila.py`.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest

from app.schemas.api import AnalisarResponse
from app.schemas.telemetria import TelemetriaLotePayload
from app.services import analise_fila as af
from app.services import modo_restrito
from app.services.telemetria_eventos_legados import normalizar_eventos_legados

LOTE_ID = "5b0c1f9e-0000-4000-8000-000000000001"
ALUNO = "aluno-1"


def _payload(signals: list[dict[str, Any]] | None = None, **extra: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "sessao_id": "7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b",
        "classe_id": 1,
        "topico_id": 10,
        "atividade_id": 20,
        "screen_name": "trilha_topico",
        "route_name": "/(tabs)/trilha/[id]",
        "flush_reason": "interval",
        "captured_at": "2026-04-06T15:10:00Z",
        "session_started_at": "2026-04-06T15:00:00Z",
        "study_elapsed_sec": 60,
        "screen_dwell_sec": 60,
        "active_sec": 50,
        "idle_sec": 10,
        "touch_count": 3,
        "scroll_distance_px": 0,
        "max_depth_px": 0,
        "signals": signals
        if signals is not None
        else [{"type": "topic_open", "timestamp": 1, "topico_id": 10, "item_key": "topic:10"}],
    }
    base.update(extra)
    return base


def _lote(**extra: Any) -> dict[str, Any]:
    lote = {
        "id": LOTE_ID,
        "aluno_id": ALUNO,
        "classe_id": 1,
        "topico_id": 10,
        "atividade_id": 20,
        "sessao_id": "7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b",
        "payload": _payload(),
        "analysis_ciclo_id": None,
        "analysis_error": None,
    }
    lote.update(extra)
    return lote


class _Sessao:
    def __init__(self, registro: dict[str, list]) -> None:
        self.registro = registro

    async def __aenter__(self) -> _Sessao:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def execute(self, statement, params=None):  # pragma: no cover - cada teste troca as idas ao banco
        return None

    async def commit(self) -> None:
        self.registro["commits"].append(self)

    async def rollback(self) -> None:
        self.registro["rollbacks"].append(self)


def _app(**settings: Any) -> SimpleNamespace:
    valores = {
        "telemetria_analise_fila_enabled": True,
        "telemetria_analise_fila_interval_seconds": 30,
        "telemetria_analise_fila_lote": 5,
        "telemetria_analise_fila_trava_seconds": 600,
        "telemetria_analise_fila_classe_ids": [],
        "telemetria_analise_fila_concorrencia": 1,
        "personalizacao_jobs_classe_ids": [],
    }
    valores.update(settings)
    registro: dict[str, list] = {"commits": [], "rollbacks": [], "sessoes": []}

    def fabrica() -> _Sessao:
        sessao = _Sessao(registro)
        registro["sessoes"].append(sessao)
        return sessao

    return SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(**valores), session_factory=fabrica), registro=registro)


@pytest.fixture
def banco(monkeypatch):
    """Troca as idas ao banco do worker: ler o lote e o item, gravar a análise e registrar a falha."""
    estado: dict[str, Any] = {"lote": _lote(), "gravado": [], "falhas": [], "ultimo_erro": None}

    async def ler(session, lote_id):
        assert lote_id == LOTE_ID
        return estado["lote"]

    async def ultimo_erro(session, lote_id):
        assert lote_id == LOTE_ID
        return estado["ultimo_erro"]

    async def gravar(self, *, batch_id, analysis_ciclo_id, analysis_error=None):
        estado["gravado"].append(
            {"batch_id": batch_id, "analysis_ciclo_id": analysis_ciclo_id, "analysis_error": analysis_error}
        )

    async def falhou(self, *, batch_id, erro, respeitar_trava=False, trava_seg=600):
        assert respeitar_trava is False, "o worker é o dono da trava: não a respeita"
        estado["falhas"].append({"batch_id": batch_id, "erro": erro})

    monkeypatch.setattr(af, "_ler_lote", ler)
    monkeypatch.setattr(af, "_ultimo_erro", ultimo_erro)
    monkeypatch.setattr(af.TelemetriaRepository, "update_lote_analysis", gravar)
    monkeypatch.setattr(af.TelemetriaRepository, "registrar_falha_analise", falhou)
    return estado


def _run_analysis_que_nao_pode_rodar(**_kwargs):
    raise AssertionError("run_analysis não devia ser chamado")


async def test_lote_analisado_grava_ciclo(banco, monkeypatch):
    chamadas: list[dict[str, Any]] = []

    async def falso(**kwargs):
        chamadas.append(kwargs)
        return AnalisarResponse(ciclo_id="c-1", erros=["aviso-1", "aviso-2"])

    monkeypatch.setattr(af, "run_analysis", falso)
    app = _app()

    assert await af.analisar_lote_da_fila(app, LOTE_ID) == "analisado"
    assert banco["gravado"] == [{"batch_id": LOTE_ID, "analysis_ciclo_id": "c-1", "analysis_error": "aviso-1"}]
    assert banco["falhas"] == []
    kwargs = chamadas[0]
    assert kwargs["request"] == af.RequisicaoInterna(app)
    assert kwargs["aluno_id"] == ALUNO
    assert (kwargs["classe_id"], kwargs["topico_id"], kwargs["atividade_id"]) == (1, 10, 20)
    assert kwargs["frame_b64"] is None
    assert kwargs["frames_b64"] == []
    assert kwargs["modo"] == "telemetria"
    assert kwargs["telemetry_payload"] == banco["lote"]["payload"]
    assert kwargs["batch_id"] == LOTE_ID
    assert kwargs["sessao_id"] == "7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b"
    esperados = normalizar_eventos_legados(TelemetriaLotePayload.model_validate(banco["lote"]["payload"]))
    assert kwargs["eventos_novos"] == esperados
    assert [e.tipo for e in kwargs["eventos_novos"]] == ["topico_aberto"]


@pytest.mark.modo_restrito_real
@pytest.mark.parametrize("negada", ["telemetria", "emocional"])
async def test_modo_restrito_nao_chama_o_pipeline(banco, monkeypatch, negada):
    async def permitidas(session, aluno_id, *, levantar=False):
        assert aluno_id == ALUNO
        assert levantar is True
        return {f: f != negada for f in modo_restrito.FINALIDADES}

    monkeypatch.setattr(modo_restrito, "finalidades_permitidas", permitidas)
    monkeypatch.setattr(af, "run_analysis", _run_analysis_que_nao_pode_rodar)

    assert await af.analisar_lote_da_fila(_app(), LOTE_ID) == "modo_restrito"
    assert banco["gravado"] == [
        {"batch_id": LOTE_ID, "analysis_ciclo_id": None, "analysis_error": modo_restrito.CODIGO}
    ]
    assert banco["falhas"] == []


@pytest.mark.parametrize("payload", [None, "{", "[1, 2]", '"texto"', ["lista"]])
async def test_payload_invalido_nao_volta_para_a_fila(banco, monkeypatch, payload):
    """`payload_invalido` é só o que nem objeto JSON é: não há o que o pipeline ler."""
    banco["lote"] = _lote(payload=payload)
    monkeypatch.setattr(af, "run_analysis", _run_analysis_que_nao_pode_rodar)

    assert await af.analisar_lote_da_fila(_app(), LOTE_ID) == "payload_invalido"
    assert banco["gravado"] == [{"batch_id": LOTE_ID, "analysis_ciclo_id": None, "analysis_error": "payload_invalido"}]
    assert banco["falhas"] == []


@pytest.mark.parametrize("payload", [{}, {"camera": {"frames": []}}, {**_payload(), "classe_id": "x"}])
async def test_payload_fora_do_schema_e_analisado_sem_eventos(banco, monkeypatch, caplog, payload):
    """O modelo só serve a `normalizar_eventos_legados`; o pipeline lê o `telemetry_payload` cru. Lote que
    não passa no `TelemetriaLotePayload` é analisado do mesmo jeito, sem eventos legados, e fica no log."""
    banco["lote"] = _lote(payload=payload)
    recebidos: list[dict[str, Any]] = []

    async def falso(**kwargs):
        recebidos.append(kwargs)
        return AnalisarResponse(ciclo_id="c-fora")

    monkeypatch.setattr(af, "run_analysis", falso)
    with caplog.at_level("WARNING", logger=af.logger.name):
        assert await af.analisar_lote_da_fila(_app(), LOTE_ID) == "analisado"
    assert recebidos[0]["eventos_novos"] == []
    assert recebidos[0]["telemetry_payload"] == payload
    assert banco["gravado"] == [{"batch_id": LOTE_ID, "analysis_ciclo_id": "c-fora", "analysis_error": None}]
    assert any("fora do schema" in r.getMessage() for r in caplog.records)


async def test_payload_em_texto_json_e_lido(banco, monkeypatch):
    """Sem codec de JSON no asyncpg, o `jsonb` chega como texto."""
    import json

    banco["lote"] = _lote(payload=json.dumps(_payload()))

    async def falso(**kwargs):
        assert kwargs["telemetry_payload"] == _payload()
        return AnalisarResponse(ciclo_id="c-2")

    monkeypatch.setattr(af, "run_analysis", falso)
    assert await af.analisar_lote_da_fila(_app(), LOTE_ID) == "analisado"


async def test_excecao_chama_falhou_com_o_tipo_do_erro(banco, monkeypatch):
    async def falso(**_kwargs):
        raise RuntimeError("llm fora")

    monkeypatch.setattr(af, "run_analysis", falso)
    app = _app()

    assert await af.analisar_lote_da_fila(app, LOTE_ID) == "falhou"
    assert banco["falhas"] == [{"batch_id": LOTE_ID, "erro": "RuntimeError: llm fora"}]
    assert banco["gravado"] == []
    assert app.registro["rollbacks"], "a sessão da análise tem de ser desfeita antes de registrar a falha"


async def test_analise_que_estoura_o_tempo_e_falha(banco, monkeypatch):
    """R4: a análise tem no máximo metade da trava; passou disso, é falha como qualquer exceção."""

    async def lento(**_kwargs):
        await asyncio.sleep(30)
        return AnalisarResponse(ciclo_id="tarde")

    monkeypatch.setattr(af, "run_analysis", lento)
    app = _app(telemetria_analise_fila_trava_seconds=2)

    inicio = asyncio.get_running_loop().time()
    assert await af.analisar_lote_da_fila(app, LOTE_ID) == "falhou"
    assert asyncio.get_running_loop().time() - inicio < 5
    assert banco["gravado"] == []
    assert len(banco["falhas"]) == 1
    assert banco["falhas"][0]["erro"].startswith("TimeoutError")
    assert app.registro["rollbacks"]


def test_tempo_maximo_da_analise_e_metade_da_trava():
    assert af._tempo_maximo_da_analise(SimpleNamespace(telemetria_analise_fila_trava_seconds=600)) == 300
    assert af._tempo_maximo_da_analise(SimpleNamespace(telemetria_analise_fila_trava_seconds=1)) == 1


async def test_analise_sem_ciclo_com_erro_volta_para_a_fila(banco, monkeypatch):
    """Sem ciclo, o erro é transitório (o pipeline não chegou ao fim): tenta de novo em vez de gravar."""

    async def falso(**_kwargs):
        return AnalisarResponse(ciclo_id="", erros=["grafo indisponivel"])

    monkeypatch.setattr(af, "run_analysis", falso)

    assert await af.analisar_lote_da_fila(_app(), LOTE_ID) == "falhou"
    assert banco["gravado"] == []
    assert banco["falhas"] == [{"batch_id": LOTE_ID, "erro": "grafo indisponivel"}]


@pytest.mark.parametrize("coluna", ["analysis_ciclo_id", "analysis_error"])
async def test_lote_que_o_pedido_ja_analisou_nao_roda_de_novo(banco, monkeypatch, coluna):
    """Reivindicado, mas o pedido terminou no meio: o gatilho de saída já tirou (ou vai tirar) o item."""
    banco["lote"] = _lote(**{coluna: "c-do-pedido"})
    monkeypatch.setattr(af, "run_analysis", _run_analysis_que_nao_pode_rodar)

    assert await af.analisar_lote_da_fila(_app(), LOTE_ID) == "sumiu"
    assert banco["gravado"] == []
    assert banco["falhas"] == []


async def test_lote_apagado_sumiu(banco, monkeypatch):
    banco["lote"] = None
    monkeypatch.setattr(af, "run_analysis", _run_analysis_que_nao_pode_rodar)
    assert await af.analisar_lote_da_fila(_app(), LOTE_ID) == "sumiu"
    assert banco["gravado"] == []
    assert banco["falhas"] == []


def test_requisicao_interna_expoe_app_state():
    app = _app()
    assert af.RequisicaoInterna(app).app.state.settings is app.state.settings
    assert af.RequisicaoInterna(app).app.state.session_factory is app.state.session_factory


async def test_processar_uma_vez_reivindica_um_por_vez_e_conta(monkeypatch):
    """Cada item é reivindicado na hora de ser analisado: a trava (600 s) cobre a análise dele (300 s) e
    não o tempo que ele passaria esperando os outros do mesmo lote."""
    fila = ["l1", "l2", "l3"]
    pedidos: list[tuple[int, int]] = []
    ordem: list[str] = []

    async def reivindicar(session, *, limite, trava_seg, classe_ids):
        pedidos.append((limite, trava_seg))
        assert classe_ids is None
        return [fila.pop(0)] if fila else []

    resultados = {"l1": "analisado", "l2": "falhou", "l3": "modo_restrito"}

    async def analisar(app, lote_id):
        ordem.append(lote_id)
        return resultados[lote_id]

    monkeypatch.setattr(af, "_reivindicar", reivindicar)
    monkeypatch.setattr(af, "analisar_lote_da_fila", analisar)

    contagem = await af.processar_fila_analise_uma_vez(_app(telemetria_analise_fila_lote=5))
    assert ordem == ["l1", "l2", "l3"]
    assert pedidos == [(1, 600)] * 4  # o quarto pedido volta vazio e encerra a passada
    assert contagem == {
        "analisado": 1,
        "modo_restrito": 1,
        "payload_invalido": 0,
        "payload_no_r2": 0,
        "sumiu": 0,
        "falhou": 1,
    }


async def test_processar_uma_vez_para_no_limite_do_lote(monkeypatch):
    async def reivindicar(session, *, limite, trava_seg, classe_ids):
        return ["x"]

    async def analisar(app, lote_id):
        return "analisado"

    monkeypatch.setattr(af, "_reivindicar", reivindicar)
    monkeypatch.setattr(af, "analisar_lote_da_fila", analisar)
    contagem = await af.processar_fila_analise_uma_vez(_app(telemetria_analise_fila_lote=2))
    assert contagem["analisado"] == 2


async def test_processar_uma_vez_conta_falha_inesperada_e_segue(monkeypatch):
    fila = ["l1", "l2"]

    async def reivindicar(session, *, limite, trava_seg, classe_ids):
        return [fila.pop(0)] if fila else []

    async def analisar(app, lote_id):
        if lote_id == "l1":
            raise OSError("banco caiu no meio")
        return "analisado"

    monkeypatch.setattr(af, "_reivindicar", reivindicar)
    monkeypatch.setattr(af, "analisar_lote_da_fila", analisar)
    contagem = await af.processar_fila_analise_uma_vez(_app())
    assert contagem["falhou"] == 1
    assert contagem["analisado"] == 1


async def test_laco_nunca_morre_e_cancela_limpo(monkeypatch, caplog):
    passadas: list[int] = []

    async def processar(app):
        passadas.append(1)
        if len(passadas) == 1:
            raise RuntimeError("primeira passada quebrou")
        return {"analisado": 0, "modo_restrito": 0, "payload_invalido": 0, "sumiu": 0, "falhou": 0}

    dormidas: list[float] = []
    dormir_de_verdade = asyncio.sleep

    async def dormir(segundos):
        dormidas.append(segundos)
        if len(dormidas) >= 3:
            raise asyncio.CancelledError
        await dormir_de_verdade(0)

    monkeypatch.setattr(af, "processar_fila_analise_uma_vez", processar)
    monkeypatch.setattr(af.asyncio, "sleep", dormir)

    with caplog.at_level("INFO", logger=af.logger.name):
        with pytest.raises(asyncio.CancelledError):
            await af.analise_fila_loop(
                _app(telemetria_analise_fila_interval_seconds=30, telemetria_analise_fila_concorrencia=1)
            )
    assert len(passadas) == 3
    assert dormidas == [30, 30, 30]
    mensagens = [r.getMessage() for r in caplog.records]
    assert any("RuntimeError" in m for m in mensagens)
    # contagem zerada não gera log
    assert not any("analisado" in m for m in mensagens)


def test_eventos_legados_movidos_sem_mudar():
    """Saída capturada da `_normalize_eventos_legados` do endpoint antes da mudança."""

    def payload(signals, **extra):
        return TelemetriaLotePayload.model_validate(_payload(signals, **extra))

    sem_conclusao = payload(
        [
            {"type": "activity_start", "timestamp": 2, "atividade_id": 20, "item_key": "activity:20"},
            {"type": "timer_timeout", "timestamp": 3, "atividade_id": 20, "item_key": "activity:20"},
            {"type": "topic_open", "timestamp": 1, "topico_id": 10},
        ],
        topico_id=10,
        idle_sec=70,
    )
    assert [e.model_dump() for e in normalizar_eventos_legados(sem_conclusao)] == [
        {"tipo": "topico_aberto", "referencia": "topico:10", "valor": None, "criado_em": None},
        {"tipo": "atividade_iniciada", "referencia": "atividade:20", "valor": None, "criado_em": None},
        {"tipo": "inatividade", "referencia": "10", "valor": 70.0, "criado_em": None},
        {"tipo": "abandono_atividade", "referencia": "atividade:20", "valor": None, "criado_em": None},
    ]

    com_conclusao = payload(
        [
            {"type": "timer_timeout", "timestamp": 3, "item_key": "activity:20"},
            {"type": "activity_complete", "timestamp": 4, "item_key": "activity:20"},
            {"type": "idle_detected", "timestamp": 5},
        ],
        topico_id=None,
        atividade_id=None,
        item_key="atividade:7",
        idle_sec=0,
    )
    assert [e.model_dump() for e in normalizar_eventos_legados(com_conclusao)] == [
        {"tipo": "atividade_concluida", "referencia": "activity:20", "valor": None, "criado_em": None},
        {"tipo": "inatividade", "referencia": "7", "valor": 0.0, "criado_em": None},
    ]


def test_endpoint_usa_a_funcao_movida():
    from app.api.v1 import telemetria as telemetria_module

    assert telemetria_module.normalizar_eventos_legados is normalizar_eventos_legados
    assert not hasattr(telemetria_module, "_normalize_eventos_legados")


def test_settings_da_fila():
    from app.core.settings import Settings

    s = Settings(supabase_jwt_secret="x", admin_panel_password="x")
    assert s.telemetria_analise_fila_enabled is True
    assert s.telemetria_analise_fila_interval_seconds == 30
    assert s.telemetria_analise_fila_lote == 5
    assert s.telemetria_analise_fila_trava_seconds == 600
    assert s.telemetria_analise_fila_classe_ids == []


def test_lifespan_sem_postgres_nao_sobe_o_laco(app):
    from fastapi.testclient import TestClient

    with TestClient(app):
        assert app.state.analise_fila_task is None


def test_lifespan_com_postgres_sobe_e_cancela_o_laco(monkeypatch):
    """Postgres de mentira: só o que o lifespan toca antes do `yield` é trocado."""
    from fastapi.testclient import TestClient

    from app import main as main_module
    from app.core.settings import Settings

    voltas: list[str] = []

    async def laco(app):
        voltas.append("subiu")
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            voltas.append("cancelado")
            raise

    async def checkpointer(_settings):
        return None, "memory", None

    async def efemero():
        return None, "memory", None

    async def nada(*_a, **_k):
        return None

    async def jobs(_app):
        await asyncio.Event().wait()

    monkeypatch.setattr(main_module, "analise_fila_loop", laco)
    monkeypatch.setattr(main_module, "personalizacao_jobs_loop", jobs)
    monkeypatch.setattr(main_module, "get_persistent_checkpointer", checkpointer)
    monkeypatch.setattr(main_module, "get_ephemeral_checkpointer", efemero)
    monkeypatch.setattr(main_module, "close_checkpointer", nada)
    monkeypatch.setattr(main_module, "build_graph", lambda *a, **k: None)
    settings = Settings(
        app_env="test",
        database_url="postgresql+asyncpg://u:p@127.0.0.1:1/nada",
        database_migrations_on_startup=False,
        checkpoint_retention_enabled=False,
        supabase_jwt_secret="x",
        admin_panel_password="x",
    )
    app = main_module.create_app(settings)
    with TestClient(app):
        assert app.state.analise_fila_task is not None
    assert voltas == ["subiu", "cancelado"]


# ------------------------------------------------------------------------------------- fix round 1


def _payload_com_frames() -> dict[str, Any]:
    return _payload(
        camera={
            "enabled": True,
            "frame_mime": "image/jpeg",
            "frame_b64": "AAAA",
            "frames": [
                {"captured_at": "2026-04-06T15:09:00Z", "frame_mime": "image/jpeg", "frame_b64": "BBBB"},
                {"captured_at": "2026-04-06T15:09:30Z", "frame_mime": "image/jpeg", "frame_b64": "CCCC"},
            ],
        }
    )


def _gravado_pela_api() -> dict[str, Any]:
    """O que `POST /telemetria/lotes` grava em `telemetria_lotes.payload`: sem nenhum `frame_b64`."""
    from app.api.v1.telemetria import _sanitize_lote_payload

    return _sanitize_lote_payload(TelemetriaLotePayload.model_validate(_payload_com_frames()))


def _gravado_pelo_app() -> dict[str, Any]:
    """O que `sanitizarCameraParaBanco` (mobile/src/services/telemetriaPayload.ts) grava pelo caminho
    direto: a câmera sem `frame_b64`, cada frame sem `frame_b64` e `frames_count` acrescentado."""
    payload = _payload_com_frames()
    camera = {k: v for k, v in payload["camera"].items() if k not in ("frame_b64", "frames")}
    frames = [{k: v for k, v in f.items() if k != "frame_b64"} for f in payload["camera"]["frames"]]
    return {**payload, "camera": {**camera, "frames": frames, "frames_count": len(frames)}}


@pytest.mark.parametrize("gravado", [_gravado_pela_api, _gravado_pelo_app], ids=["api", "app"])
async def test_lote_com_camera_gravado_sem_bytes_e_analisado(banco, monkeypatch, gravado):
    """Os dois gravadores tiram o `frame_b64` (obrigatório no esquema): validar o gravado cru dava
    `payload_invalido` para todo lote com câmera. Valida-se uma cópia sem frames (D-4: não há frame)."""
    payload = gravado()
    assert payload["camera"]["frames"] and all("frame_b64" not in f for f in payload["camera"]["frames"])
    banco["lote"] = _lote(payload=payload)
    recebidos: list[dict[str, Any]] = []

    async def falso(**kwargs):
        recebidos.append(kwargs)
        return AnalisarResponse(ciclo_id="c-cam")

    monkeypatch.setattr(af, "run_analysis", falso)

    assert await af.analisar_lote_da_fila(_app(), LOTE_ID) == "analisado"
    assert recebidos[0]["telemetry_payload"] == payload  # o gravado, intacto
    assert recebidos[0]["frame_b64"] is None
    assert recebidos[0]["frames_b64"] == []
    assert len(payload["camera"]["frames"]) == 2  # a cópia de validação não mexeu no gravado


async def test_payload_no_r2_fica_rotulado_com_o_ultimo_erro(banco, monkeypatch):
    """Ponteiro para o R2 (o repositório não lê de volta): rótulo próprio, com o erro que o deixou na fila."""
    banco["lote"] = _lote(payload={"_r2": "telemetria/lotes/x.json", "_bucket": "b"})
    banco["ultimo_erro"] = "RuntimeError: llm fora"
    monkeypatch.setattr(af, "run_analysis", _run_analysis_que_nao_pode_rodar)

    assert await af.analisar_lote_da_fila(_app(), LOTE_ID) == "payload_no_r2"
    assert banco["gravado"] == [
        {"batch_id": LOTE_ID, "analysis_ciclo_id": None, "analysis_error": "payload_no_r2: RuntimeError: llm fora"}
    ]
    assert banco["falhas"] == []


async def test_payload_no_r2_com_ultimo_erro_longo_corta_em_500(banco, monkeypatch):
    banco["lote"] = _lote(payload={"_r2": "telemetria/lotes/x.json", "_bucket": "b"})
    banco["ultimo_erro"] = "x" * 600
    monkeypatch.setattr(af, "run_analysis", _run_analysis_que_nao_pode_rodar)
    assert await af.analisar_lote_da_fila(_app(), LOTE_ID) == "payload_no_r2"
    erro = banco["gravado"][0]["analysis_error"]
    assert len(erro) == 500
    assert erro.startswith("payload_no_r2: xxx")


@pytest.mark.modo_restrito_real
async def test_consulta_do_modo_restrito_que_falha_vai_para_a_fila(banco, monkeypatch):
    """Banco fora na consulta não é "negado": falha, e a fila tenta de novo (não grava `modo_restrito`)."""

    async def quebra(session, aluno_id, *, levantar=False):
        assert levantar is True
        raise OSError("conexao caiu")

    monkeypatch.setattr(modo_restrito, "finalidades_permitidas", quebra)
    monkeypatch.setattr(af, "run_analysis", _run_analysis_que_nao_pode_rodar)

    assert await af.analisar_lote_da_fila(_app(), LOTE_ID) == "falhou"
    assert banco["gravado"] == []
    assert banco["falhas"] == [{"batch_id": LOTE_ID, "erro": "OSError: conexao caiu"}]


class _SessaoQueQuebra:
    def __init__(self) -> None:
        self.rollbacks = 0

    async def execute(self, *_a, **_k):
        raise OSError("conexao caiu")

    async def rollback(self) -> None:
        self.rollbacks += 1


@pytest.mark.modo_restrito_real
async def test_finalidades_permitidas_levantar():
    """`levantar=False` (padrão, todos os chamadores antigos) continua fail-closed; `True` propaga."""
    sessao = _SessaoQueQuebra()
    assert await modo_restrito.finalidades_permitidas(sessao, "a") == modo_restrito.NADA_PERMITIDO
    with pytest.raises(OSError):
        await modo_restrito.finalidades_permitidas(sessao, "a", levantar=True)
    assert sessao.rollbacks == 2


def test_turmas_da_fila():
    """A guarda do #652: a lista própria vence; vazia, vale a dos jobs; as duas vazias, todas (NULL)."""
    s = SimpleNamespace(telemetria_analise_fila_classe_ids=[7], personalizacao_jobs_classe_ids=[66])
    assert af._turmas_da_fila(s) == [7]
    s = SimpleNamespace(telemetria_analise_fila_classe_ids=[], personalizacao_jobs_classe_ids=[66])
    assert af._turmas_da_fila(s) == [66]
    s = SimpleNamespace(telemetria_analise_fila_classe_ids=[], personalizacao_jobs_classe_ids=[])
    assert af._turmas_da_fila(s) is None


async def test_processar_uma_vez_passa_as_turmas(monkeypatch):
    vistos: list[Any] = []

    async def reivindicar(session, *, limite, trava_seg, classe_ids):
        vistos.append(classe_ids)
        return []

    monkeypatch.setattr(af, "_reivindicar", reivindicar)
    await af.processar_fila_analise_uma_vez(_app(personalizacao_jobs_classe_ids=[66]))
    assert vistos == [[66]]


# ------------------------------------------------------------------------------- vazão (revisão final)


async def test_laco_drena_sem_dormir_enquanto_a_passada_enche_o_lote(monkeypatch):
    """Passada que usou o limite inteiro: a fila pode ter mais, e dormir 30 s a cada 5 lotes não acompanha
    uma turma. Só dorme quando a passada voltou com menos (a reivindicação veio vazia)."""
    passadas: list[int] = []
    cheias = 3

    async def processar(app):
        passadas.append(1)
        n = 5 if len(passadas) <= cheias else 2
        return {**dict.fromkeys(af.RESULTADOS, 0), "analisado": n}

    dormidas: list[float] = []

    async def dormir(segundos):
        dormidas.append(segundos)
        raise asyncio.CancelledError

    monkeypatch.setattr(af, "processar_fila_analise_uma_vez", processar)
    monkeypatch.setattr(af.asyncio, "sleep", dormir)

    with pytest.raises(asyncio.CancelledError):
        await af.analise_fila_loop(_app(telemetria_analise_fila_lote=5, telemetria_analise_fila_concorrencia=1))
    assert len(passadas) == cheias + 1
    assert dormidas == [30]


async def test_passada_que_falha_dorme(monkeypatch):
    """Banco fora: não drena em laço apertado."""
    passadas: list[int] = []

    async def processar(app):
        passadas.append(1)
        raise OSError("banco fora")

    dormidas: list[float] = []

    async def dormir(segundos):
        dormidas.append(segundos)
        raise asyncio.CancelledError

    monkeypatch.setattr(af, "processar_fila_analise_uma_vez", processar)
    monkeypatch.setattr(af.asyncio, "sleep", dormir)
    with pytest.raises(asyncio.CancelledError):
        await af.analise_fila_loop(_app(telemetria_analise_fila_concorrencia=1))
    assert passadas == [1]
    assert dormidas == [30]


async def test_laco_sobe_um_consumidor_por_concorrencia(monkeypatch):
    em_voo = 0
    maximo = 0
    todos = asyncio.Event()

    async def processar(app):
        nonlocal em_voo, maximo
        em_voo += 1
        maximo = max(maximo, em_voo)
        if em_voo == 3:
            todos.set()
        await asyncio.wait_for(todos.wait(), timeout=2)
        em_voo -= 1
        return dict.fromkeys(af.RESULTADOS, 0)

    async def dormir(segundos):
        raise asyncio.CancelledError

    monkeypatch.setattr(af, "processar_fila_analise_uma_vez", processar)
    monkeypatch.setattr(af.asyncio, "sleep", dormir)
    with pytest.raises(asyncio.CancelledError):
        await af.analise_fila_loop(_app(telemetria_analise_fila_concorrencia=3))
    assert maximo == 3


def test_settings_de_concorrencia():
    from app.core.settings import Settings

    assert Settings(supabase_jwt_secret="x", admin_panel_password="x").telemetria_analise_fila_concorrencia == 2
