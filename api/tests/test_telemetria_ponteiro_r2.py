"""O ponteiro do R2 no payload do lote leva o `cliente` junto (#76).

`metricas_estudo_coortes` (20261102_03) le `payload -> 'cliente'` (plataforma e
versao do app). Sem o `cliente` no ponteiro, todo lote que passasse pelo R2
viraria `sem_cliente` no estudo de efetividade.
"""

from types import SimpleNamespace

import pytest

from app.repositories.telemetria import TelemetriaRepository

R2 = SimpleNamespace(supabase_url="https://projeto.supabase.co", supabase_service_key="chave")
CLIENTE = {"app_version": "1.0.6", "build_profile": "production", "plataforma": "android"}


@pytest.fixture
def no_r2(monkeypatch):
    enviados: list[str] = []

    async def _enviar(cfg, key, corpo, content_type, **kwargs):
        enviados.append(key)
        return "trailup"  # o bucket vem da resposta da storage-upload-url (#76)

    monkeypatch.setattr("app.repositories.telemetria.get_settings", lambda: R2)
    monkeypatch.setattr("app.repositories.telemetria.enviar_para_r2", _enviar)
    return enviados


@pytest.mark.asyncio
async def test_ponteiro_preserva_o_cliente(no_r2) -> None:
    repo = TelemetriaRepository(session=None)  # type: ignore[arg-type]

    gravado = await repo._payload_para_gravar("lote-1", {"cliente": CLIENTE, "eventos": [1, 2, 3]})

    assert gravado["_r2"] == no_r2[0]
    assert gravado["_bucket"] == "trailup"
    assert gravado["cliente"] == CLIENTE
    assert "eventos" not in gravado


@pytest.mark.asyncio
async def test_lote_sem_cliente_fica_so_com_o_ponteiro(no_r2) -> None:
    repo = TelemetriaRepository(session=None)  # type: ignore[arg-type]

    gravado = await repo._payload_para_gravar("lote-2", {"eventos": [], "cliente": "invalido"})

    assert set(gravado) == {"_r2", "_bucket"}
