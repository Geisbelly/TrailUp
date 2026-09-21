"""A camera do aluno nao pode vazar para `ia_decision_logs`.

Achado A2 da revisao de telemetria de ponta a ponta. O endpoint sanitizava o
payload antes de gravar em `telemetria_lotes` e, catorze linhas abaixo, passava o
payload BRUTO para `run_analysis` -- que o grava inteiro em
`ia_decision_logs.input_summary`. Eram ate 30 JPEGs do rosto do aluno por lote,
numa coluna JSONB, exatamente o que a sanitizacao existe para evitar.
"""

from datetime import UTC, datetime
from typing import Any

from app.api.v1 import telemetria as rota
from app.schemas.telemetria import TelemetriaLotePayload


def _payload_com_frames(quantos: int = 3) -> TelemetriaLotePayload:
    agora = datetime.now(UTC)
    return TelemetriaLotePayload(
        sessao_id="11111111-1111-4111-8111-111111111111",
        classe_id=1,
        topico_id=10,
        screen_name="trilha_topico",
        route_name="/(tabs)/trilha/[id]",
        flush_reason="interval",
        captured_at=agora,
        session_started_at=agora,
        study_elapsed_sec=60,
        screen_dwell_sec=60,
        active_sec=55,
        idle_sec=5,
        touch_count=3,
        scroll_distance_px=100,
        max_depth_px=200,
        camera={
            "enabled": True,
            "frame_mime": "image/jpeg",
            "frame_b64": "TOPO-BASE64",
            "frames": [
                {
                    "captured_at": agora,
                    "frame_mime": "image/jpeg",
                    "frame_b64": f"BYTES-DA-FOTO-{indice}",
                }
                for indice in range(quantos)
            ],
        },
    )


def _sem_bytes(valor: Any) -> bool:
    """Nenhum `frame_b64` em qualquer profundidade da estrutura."""
    if isinstance(valor, dict):
        if "frame_b64" in valor:
            return False
        return all(_sem_bytes(item) for item in valor.values())
    if isinstance(valor, list):
        return all(_sem_bytes(item) for item in valor)
    return True


def test_sanitize_remove_os_bytes_e_preserva_a_forma():
    limpo = rota._sanitize_lote_payload(_payload_com_frames(3))

    assert _sem_bytes(limpo), "nenhum frame_b64 pode sobreviver"
    # A forma tem de ficar: quantos frames houve, de quando, em que formato. E o
    # que o pipeline e o professor podem querer olhar depois.
    assert limpo["camera"]["frames_count"] == 3
    assert len(limpo["camera"]["frames"]) == 3
    assert limpo["camera"]["enabled"] is True
    assert all(frame.get("captured_at") for frame in limpo["camera"]["frames"])


def test_sanitize_aguenta_lote_sem_camera():
    payload = _payload_com_frames(0)
    payload.camera.enabled = False
    payload.camera.frame_b64 = None

    limpo = rota._sanitize_lote_payload(payload)

    assert _sem_bytes(limpo)
    assert limpo["camera"]["frames_count"] == 0


async def test_endpoint_manda_o_payload_sanitizado_para_a_analise(monkeypatch):
    """O teste que fecha A2: o que chega em `run_analysis` nao tem os bytes.

    `run_analysis` repassa esse dict para `ia_decision_logs.input_summary`, entao
    e aqui que o vazamento acontecia.
    """
    payload = _payload_com_frames(3)
    capturado: dict[str, Any] = {}

    class FakeRepo:
        def __init__(self, _session):
            pass

        async def upsert_sessao(self, **_kwargs):
            return {"id": payload.sessao_id}

        async def insert_or_get_lote(self, **_kwargs):
            return {"id": "22222222-2222-4222-8222-222222222222"}, True

        async def insert_eventos_app(self, **_kwargs):
            return None

        async def insert_time_metric_entries(self, **_kwargs):
            return None

        async def update_lote_analysis(self, **_kwargs):
            return None

    class FakeEventoRepo:
        def __init__(self, _session):
            pass

        async def log(self, **_kwargs):
            return None

    class FakeSession:
        async def commit(self):
            return None

        async def rollback(self):
            return None

    async def fake_run_analysis(**kwargs):
        capturado.update(kwargs)
        return None

    monkeypatch.setattr(rota, "TelemetriaRepository", FakeRepo)
    monkeypatch.setattr(rota, "EventoRepository", FakeEventoRepo)
    monkeypatch.setattr(rota, "run_analysis", fake_run_analysis)

    class FakeUser:
        aluno_id = "33333333-3333-4333-8333-333333333333"
        user_id = "33333333-3333-4333-8333-333333333333"

    await rota.registrar_lote_telemetria(
        payload=payload,
        request=object(),  # nao usado: run_analysis esta dublado
        user=FakeUser(),
        session=FakeSession(),
    )

    enviado = capturado.get("telemetry_payload")
    assert enviado is not None, "run_analysis precisa receber o payload"
    assert _sem_bytes(enviado), (
        "o payload que vai para ia_decision_logs nao pode carregar frame_b64"
    )
    # O contexto que a analise de fato usa continua inteiro.
    assert enviado["study_elapsed_sec"] == 60
    assert enviado["camera"]["frames_count"] == 3


async def test_os_frames_continuam_chegando_ao_pipeline(monkeypatch):
    """Sanitizar o payload nao pode cegar a analise de emocao.

    Os bytes viajam por `frames_b64`/`frame_b64`, que sao os parametros feitos
    para isso -- nenhum no do grafo le a camera pelo `telemetry_payload`.
    """
    payload = _payload_com_frames(2)
    capturado: dict[str, Any] = {}

    class FakeRepo:
        def __init__(self, _session):
            pass

        async def upsert_sessao(self, **_kwargs):
            return {"id": payload.sessao_id}

        async def insert_or_get_lote(self, **_kwargs):
            return {"id": "22222222-2222-4222-8222-222222222222"}, True

        async def insert_eventos_app(self, **_kwargs):
            return None

        async def insert_time_metric_entries(self, **_kwargs):
            return None

        async def update_lote_analysis(self, **_kwargs):
            return None

    class FakeEventoRepo:
        def __init__(self, _session):
            pass

        async def log(self, **_kwargs):
            return None

    class FakeSession:
        async def commit(self):
            return None

        async def rollback(self):
            return None

    async def fake_run_analysis(**kwargs):
        capturado.update(kwargs)
        return None

    monkeypatch.setattr(rota, "TelemetriaRepository", FakeRepo)
    monkeypatch.setattr(rota, "EventoRepository", FakeEventoRepo)
    monkeypatch.setattr(rota, "run_analysis", fake_run_analysis)

    class FakeUser:
        aluno_id = "33333333-3333-4333-8333-333333333333"
        user_id = "33333333-3333-4333-8333-333333333333"

    await rota.registrar_lote_telemetria(
        payload=payload,
        request=object(),
        user=FakeUser(),
        session=FakeSession(),
    )

    assert capturado.get("frames_b64") == ["BYTES-DA-FOTO-0", "BYTES-DA-FOTO-1"]
    assert capturado.get("frame_b64") == "BYTES-DA-FOTO-0"
