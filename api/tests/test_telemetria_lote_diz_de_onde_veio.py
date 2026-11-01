"""O lote diz de onde veio: build, ambiente e host da API (#96).

Medido em 30/10: tres lotes da conta de QA, um com `via = 'api'`, e nada no
payload separava um build EAS falando com a API do Dokploy de um build de
desenvolvimento com uma API local ligada ao banco de producao. O app passa a
mandar `cliente`; a API tem de guarda-lo no payload persistido e nunca recusar o
lote por causa dele.
"""

from datetime import UTC, datetime

from app.api.v1.telemetria import _sanitize_lote_payload
from app.schemas.telemetria import CLIENTE_CAMPO_MAX, TelemetriaLotePayload


def _lote(**over):
    agora = datetime.now(UTC)
    base = {
        "sessao_id": "11111111-1111-4111-8111-111111111111",
        "classe_id": 1,
        "screen_name": "trilha_topico",
        "route_name": "/(tabs)/trilha/[id]",
        "flush_reason": "interval",
        "captured_at": agora,
        "session_started_at": agora,
        "study_elapsed_sec": 60,
        "screen_dwell_sec": 60,
        "active_sec": 55,
        "idle_sec": 5,
        "touch_count": 3,
        "scroll_distance_px": 100,
        "max_depth_px": 200,
    }
    base.update(over)
    return TelemetriaLotePayload.model_validate(base)


CLIENTE_EAS = {
    "app_version": "1.0.4",
    "build_profile": "production",
    "ambiente": "standalone",
    "dev": False,
    "plataforma": "android",
    "api_host": "api.trailup.promora.dev.br",
}


def test_cliente_chega_inteiro_ao_payload_persistido():
    persistido = _sanitize_lote_payload(_lote(cliente=CLIENTE_EAS))
    assert persistido["cliente"] == CLIENTE_EAS


def test_build_antigo_sem_cliente_continua_valendo():
    lote = _lote()
    assert lote.cliente is None
    assert _sanitize_lote_payload(lote)["cliente"] is None


def test_cliente_invalido_vira_ausente_sem_custar_o_lote():
    lote = _lote(cliente="nao e objeto", active_sec=42)
    assert lote.cliente is None
    assert lote.active_sec == 42

    lote = _lote(cliente={**CLIENTE_EAS, "dev": {"x": 1}})
    assert lote.cliente is None


def test_texto_do_cliente_e_cortado_e_o_que_nao_e_texto_vira_nulo():
    lote = _lote(cliente={"app_version": "x" * 500, "build_profile": 7, "ambiente": "  ", "dev": True})
    assert lote.cliente is not None
    assert lote.cliente.app_version == "x" * CLIENTE_CAMPO_MAX
    assert lote.cliente.build_profile is None
    assert lote.cliente.ambiente is None
    assert lote.cliente.dev is True
    assert lote.cliente.api_host is None


def test_campo_desconhecido_no_cliente_e_ignorado():
    lote = _lote(cliente={**CLIENTE_EAS, "senha": "nao deveria vir"})
    assert "senha" not in _sanitize_lote_payload(lote)["cliente"]
