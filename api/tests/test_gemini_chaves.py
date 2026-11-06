"""Pool unico de chaves do Gemini (gemini_chaves + gemini_http.gemini_generate).

O defeito que motivou: as chamadas HTTP diretas (multimodal, TTS, imagem)
mandavam `GEMINI_API_KEY` cru no header. Com `k1,k2`, o header ia com a lista
inteira e o Gemini respondia 401 em todas.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from app.services import gemini_chaves, gemini_http


@pytest.fixture(autouse=True)
def _reset_pool():
    gemini_chaves.reset()
    yield
    gemini_chaves.reset()


def _settings(chaves: str = "k1,k2") -> SimpleNamespace:
    return SimpleNamespace(
        gemini_api_key=chaves,
        content_enrichment_gemini_quota_cooldown_sec=300,
        content_enrichment_gemini_daily_quota_cooldown_sec=6 * 3_600,
    )


def _resposta(status: int, corpo: Any) -> httpx.Response:
    request = httpx.Request("POST", "https://generativelanguage.googleapis.com/x")
    if isinstance(corpo, dict):
        return httpx.Response(status, json=corpo, request=request)
    return httpx.Response(status, text=str(corpo), request=request)


def _cliente_falso(monkeypatch, respostas_por_chave: dict[str, list[httpx.Response]]) -> list[str]:
    """Troca o httpx.AsyncClient; devolve a lista de chaves usadas, na ordem."""
    chaves_usadas: list[str] = []

    class _Cliente:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        async def __aenter__(self) -> "_Cliente":
            return self

        async def __aexit__(self, *args: Any) -> None:
            return None

        async def post(self, url: str, *, json: Any, headers: dict[str, str]) -> httpx.Response:
            chave = headers["x-goog-api-key"]
            chaves_usadas.append(chave)
            return respostas_por_chave[chave].pop(0)

    monkeypatch.setattr(gemini_http.httpx, "AsyncClient", _Cliente)
    return chaves_usadas


_OK = {"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}
_COTA_MINUTO = {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "PerMinute quota"}}
_COTA_DIA = {
    "error": {
        "code": 429,
        "status": "RESOURCE_EXHAUSTED",
        "message": "Quota exceeded: GenerateRequestsPerDayPerProjectPerModel-FreeTier",
    }
}


@pytest.mark.asyncio
async def test_header_leva_uma_chave_so_nunca_a_lista(monkeypatch) -> None:
    usadas = _cliente_falso(monkeypatch, {"k1": [_resposta(200, _OK)], "k2": []})

    payload = await gemini_http.gemini_generate(
        settings=_settings("k1, k2 ;k3"), model="m", body={}, timeout=5, origem="teste"
    )

    assert payload == _OK
    assert usadas == ["k1"]


@pytest.mark.asyncio
async def test_cota_numa_chave_passa_para_a_proxima_e_lembra_do_cooldown(monkeypatch) -> None:
    usadas = _cliente_falso(
        monkeypatch,
        {"k1": [_resposta(429, _COTA_MINUTO)], "k2": [_resposta(200, _OK), _resposta(200, _OK)]},
    )
    settings = _settings()

    await gemini_http.gemini_generate(settings=settings, model="m", body={}, timeout=5, origem="t")
    await gemini_http.gemini_generate(settings=settings, model="m", body={}, timeout=5, origem="t")

    # k1 ficou em cooldown: a segunda chamada nem tenta.
    assert usadas == ["k1", "k2", "k2"]


@pytest.mark.asyncio
async def test_cooldown_e_por_modelo(monkeypatch) -> None:
    _cliente_falso(
        monkeypatch, {"k1": [_resposta(429, _COTA_MINUTO)], "k2": [_resposta(200, _OK)]}
    )

    await gemini_http.gemini_generate(settings=_settings(), model="m1", body={}, timeout=5, origem="t")

    # k1 esgotou em m1, mas continua livre para m2 (a cota do free tier e por modelo).
    assert gemini_chaves.escolher_chave(["k1"], "m1") is None
    assert gemini_chaves.escolher_chave(["k1"], "m2") == "k1"


@pytest.mark.asyncio
async def test_cota_diaria_vem_do_corpo_e_usa_o_cooldown_longo(monkeypatch) -> None:
    _cliente_falso(monkeypatch, {"k1": [_resposta(429, _COTA_DIA)], "k2": [_resposta(200, _OK)]})
    agora = 1_000_000.0
    monkeypatch.setattr(gemini_chaves.time, "time", lambda: agora)

    await gemini_http.gemini_generate(settings=_settings(), model="m", body={}, timeout=5, origem="t")

    assert gemini_chaves._indisponivel_ate[("k1", "m")] == agora + 6 * 3_600


@pytest.mark.asyncio
async def test_erro_que_nao_e_de_cota_sobe_sem_gastar_outra_chave(monkeypatch) -> None:
    usadas = _cliente_falso(
        monkeypatch, {"k1": [_resposta(400, {"error": {"message": "bad request"}})], "k2": []}
    )

    with pytest.raises(httpx.HTTPStatusError):
        await gemini_http.gemini_generate(settings=_settings(), model="m", body={}, timeout=5, origem="t")

    assert usadas == ["k1"]


@pytest.mark.asyncio
async def test_todas_esgotadas_sobe_o_ultimo_erro_e_depois_sem_chave(monkeypatch) -> None:
    _cliente_falso(
        monkeypatch, {"k1": [_resposta(429, _COTA_MINUTO)], "k2": [_resposta(503, "overloaded")]}
    )
    settings = _settings()

    with pytest.raises(httpx.HTTPStatusError):
        await gemini_http.gemini_generate(settings=settings, model="m", body={}, timeout=5, origem="t")
    with pytest.raises(gemini_http.GeminiSemChaveDisponivel):
        await gemini_http.gemini_generate(settings=settings, model="m", body={}, timeout=5, origem="t")


@pytest.mark.asyncio
async def test_sem_chave_configurada(monkeypatch) -> None:
    with pytest.raises(gemini_http.GeminiSemChaveDisponivel):
        await gemini_http.gemini_generate(settings=_settings(""), model="m", body={}, timeout=5, origem="t")


@pytest.mark.asyncio
async def test_pool_e_o_mesmo_do_llm_e_do_enriquecimento(monkeypatch) -> None:
    """Uma chave que estourou a cota numa chamada direta nao e escolhida pelo
    JsonLLMService nem pelo enriquecimento para o mesmo modelo."""
    from app.services import content_enrichment, llm

    _cliente_falso(monkeypatch, {"k1": [_resposta(429, _COTA_DIA)], "k2": [_resposta(200, _OK)]})
    await gemini_http.gemini_generate(settings=_settings(), model="m", body={}, timeout=5, origem="t")

    assert gemini_chaves.escolher_chave(["k1", "k2"], "m") == "k2"
    llm.reset_gemini_llm_circuit()
    assert gemini_chaves.escolher_chave(["k1", "k2"], "m") == "k1"
    assert content_enrichment._parse_gemini_keys is gemini_chaves.parse_lista


def test_classificacao_le_status_e_corpo_do_httpx() -> None:
    erro_cota = httpx.HTTPStatusError(
        "429", request=httpx.Request("POST", "https://x"), response=_resposta(429, _COTA_DIA)
    )
    erro_modelo = httpx.HTTPStatusError(
        "404", request=httpx.Request("POST", "https://x"), response=_resposta(404, "not found")
    )

    assert gemini_chaves.is_quota_error(erro_cota)
    assert gemini_chaves.is_daily_quota_error(erro_cota)
    assert gemini_chaves.is_model_unavailable_error(erro_modelo)
    assert not gemini_chaves.is_quota_error(erro_modelo)


@pytest.mark.asyncio
async def test_tts_do_guardiao_com_varias_chaves_manda_uma_so(monkeypatch) -> None:
    """Regressao do defeito: antes ia `k1,k2` no header."""
    from app.services import media_agents

    usadas = _cliente_falso(monkeypatch, {"k1": [_resposta(200, {"candidates": []})], "k2": []})
    settings = SimpleNamespace(**vars(_settings()), gemini_model_tts="tts-model")

    resultado = await media_agents.gerar_audio_gemini_tts(
        settings=settings, texto="Ola, turma.", voz="Kore"
    )

    assert usadas == ["k1"]
    # Gemini sem audio nao vira voz generica: sai sem audio.
    assert resultado is None
