from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app.services import content_enrichment as enrichment_module
from app.services.content_enrichment import (
    ContentEnrichmentError,
    enrich_content_blocks,
)


def _settings() -> SimpleNamespace:
    return SimpleNamespace(
        brainhex_api_url="https://brainhex.example",
        brainhex_api_secret="shared-secret",
        brainhex_api_wait_timeout_sec=120,
    )


def _context(*, paragraphs: int = 2) -> dict[str, Any]:
    body = "\n\n".join(
        f"MARCADOR-{index:02d}: conteúdo técnico da seção {index}." for index in range(1, paragraphs + 1)
    )
    return {
        "topico_id": 9,
        "source_hash": "hash-9",
        "conteudo_classe": {
            "topico": {
                "nome": "Redes",
                "descricao": "Comunicação entre computadores.",
                "objetivo": "Compreender comunicação distribuída.",
            },
            "conteudos": [
                {"id": 1, "titulo": "DNS e HTTP", "conteudo": body},
            ],
            "atividades": [],
        },
        "fontes_contexto": [],
    }


class _Response:
    def __init__(self, status_code: int, payload: Any) -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)

    def json(self) -> Any:
        return self._payload


class _Client:
    def __init__(self, response_factory: Any, captured: dict[str, Any]) -> None:
        self._response_factory = response_factory
        self._captured = captured

    async def __aenter__(self) -> "_Client":
        return self

    async def __aexit__(self, *_args: Any) -> None:
        return None

    async def post(self, url: str, *, json: Any, headers: Any) -> _Response:
        self._captured.update({"url": url, "json": json, "headers": headers})
        return _Response(200, self._response_factory(json))


def _rich_response(payload: dict[str, Any]) -> dict[str, Any]:
    blocks = []
    for base in payload["blocos_base"]:
        base_text = enrichment_module._text(base["conteudo_base"])
        expansion = (
            " Este aprofundamento define os termos técnicos, explica suas relações "
            "causais e conecta o conceito à arquitetura de redes. Na prática, um "
            "estudante pode observar esse processo ao abrir um endereço no navegador, "
            "comparar a resolução do nome e acompanhar a requisição até o servidor."
        )
        blocks.append(
            {
                "id": base["id"],
                "tema": base["tema"],
                "topico": base["topico"],
                "objetivos": ["Explicar e aplicar o conceito em uma situação real."],
                "conteudo_base": base_text,
                "conteudo_aprofundado": base_text + expansion,
                "conceitos_chave": ["resolução de nomes", "comunicação distribuída"],
                "exemplos_contextos": ["Abertura de um site no navegador."],
                "ponte_proximo_bloco": "O resultado prepara o próximo conceito.",
                "source_ids": base["source_ids"],
            }
        )
    return {
        "schema_version": "trailup.content-blocks.v2",
        "source_hash": payload["source_hash"],
        "tema": payload["tema"]["titulo"],
        "blocos": blocks,
        "metadata": {
            "provider": "openai",
            "model": "gpt-5.6-sol",
            "fallback": False,
            "lotes_gerados": 6,
            "chamadas_realizadas": 7,
        },
    }


@pytest.mark.asyncio
async def test_enrichment_groups_every_source_segment_without_truncation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module.httpx,
        "AsyncClient",
        lambda **_kwargs: _Client(_rich_response, captured),
    )

    result = await enrich_content_blocks(
        context=_context(paragraphs=30),
        settings=_settings(),
    )

    assert result["schema_version"] == "trailup.content-blocks.v2"
    assert result["source_hash"] == "hash-9"
    assert len(result["blocos"]) == 24
    assert result["metadata"]["fallback"] is False
    assert result["metadata"]["provider"] == "brainhex-openai"
    assert result["metadata"]["provider_model"] == "gpt-5.6-sol"
    assert result["metadata"]["lotes_gerados"] == 6
    assert result["metadata"]["chamadas_realizadas"] == 7
    assert captured["url"] == "https://brainhex.example/api/enrich-content"
    assert captured["headers"] == {"x-api-secret": "shared-secret"}

    submitted_base = "\n".join(block["conteudo_base"] for block in captured["json"]["blocos_base"])
    for index in range(1, 31):
        assert f"MARCADOR-{index:02d}" in submitted_base
    submitted_segments = {
        segment_id for block in captured["json"]["blocos_base"] for segment_id in block["segment_ids"]
    }
    assert len(submitted_segments) == result["metadata"]["segmentos_origem"]


def test_source_segmentation_splits_large_text_without_losing_its_tail() -> None:
    context = _context(paragraphs=1)
    long_text = "INICIO-" + ("x" * 9_000) + "-FIM"
    context["conteudo_classe"]["conteudos"][0]["conteudo"] = long_text

    segments = [
        segment for segment in enrichment_module._source_segments(context) if segment["source_id"] == "conteudo:1"
    ]

    assert len(segments) == 3
    rebuilt = "".join(segment["text"] for segment in segments)
    assert rebuilt.endswith(long_text)
    assert rebuilt.count("x") == 9_000


@pytest.mark.asyncio
async def test_enrichment_rejects_shallow_response_and_never_uses_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def shallow(payload: dict[str, Any]) -> dict[str, Any]:
        response = _rich_response(payload)
        for block in response["blocos"]:
            block["conteudo_aprofundado"] = block["conteudo_base"]
        return response

    monkeypatch.setattr(
        enrichment_module.httpx,
        "AsyncClient",
        lambda **_kwargs: _Client(shallow, {}),
    )

    with pytest.raises(ContentEnrichmentError, match="apenas repetiu"):
        await enrich_content_blocks(context=_context(), settings=_settings())


@pytest.mark.asyncio
async def test_enrichment_rejects_provider_other_than_openai(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def gemini_response(payload: dict[str, Any]) -> dict[str, Any]:
        response = _rich_response(payload)
        response["metadata"]["provider"] = "gemini"
        return response

    monkeypatch.setattr(
        enrichment_module.httpx,
        "AsyncClient",
        lambda **_kwargs: _Client(gemini_response, {}),
    )

    with pytest.raises(ContentEnrichmentError, match="esperado o provedor OpenAI"):
        await enrich_content_blocks(context=_context(), settings=_settings())


@pytest.mark.asyncio
async def test_enrichment_fails_explicitly_when_microservice_is_not_configured() -> None:
    settings = SimpleNamespace(
        brainhex_api_url="",
        brainhex_api_secret="",
        brainhex_api_wait_timeout_sec=120,
    )

    with pytest.raises(ContentEnrichmentError, match="BRAINHEX_API_URL"):
        await enrich_content_blocks(context=_context(), settings=settings)
