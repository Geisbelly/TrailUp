from __future__ import annotations

import json
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
        openai_api_key="openai-secret",
        openai_content_enrichment_model="gpt-5.4-mini",
        content_enrichment_batch_size=8,
        content_enrichment_max_attempts=3,
        openai_content_enrichment_max_output_tokens=32768,
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


class _OpenAIResponse:
    def __init__(self, payload: Any) -> None:
        self.output_text = json.dumps(payload, ensure_ascii=False)
        self.model = "gpt-5.4-mini"


class _Responses:
    def __init__(self, response_factory: Any, captured: dict[str, Any]) -> None:
        self._response_factory = response_factory
        self._captured = captured

    async def create(self, **kwargs: Any) -> _OpenAIResponse:
        input_text = str(kwargs["input"])
        blocks_json = input_text.split("BLOCOS-BASE:\n", 1)[1].split(
            "\n\nCORREÇÕES OBRIGATÓRIAS",
            1,
        )[0]
        payload = {"blocos_base": json.loads(blocks_json)}
        self._captured.setdefault("calls", []).append(kwargs)
        self._captured.setdefault("payloads", []).append(payload)
        self._captured["payload"] = payload
        return _OpenAIResponse(self._response_factory(payload))


class _Client:
    def __init__(self, response_factory: Any, captured: dict[str, Any]) -> None:
        self.responses = _Responses(response_factory, captured)


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
    return {"blocos": blocks}


@pytest.mark.asyncio
async def test_enrichment_groups_every_source_segment_without_truncation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        lambda _api_key: _Client(_rich_response, captured),
    )

    result = await enrich_content_blocks(
        context=_context(paragraphs=30),
        settings=_settings(),
    )

    assert result["schema_version"] == "trailup.content-blocks.v2"
    assert result["source_hash"] == "hash-9"
    assert len(result["blocos"]) == 24
    assert [block["ordem"] for block in result["blocos"]] == list(range(1, 25))
    assert result["metadata"]["fallback"] is False
    assert result["metadata"]["provider"] == "openai"
    assert result["metadata"]["division_provider"] == "api-deterministic"
    assert result["metadata"]["enrichment_provider"] == "openai"
    assert result["metadata"]["personalization_applied"] is False
    assert result["metadata"]["pipeline_order"] == [
        "content_decomposition",
        "openai_enrichment",
        "brainhex_personalization",
    ]
    assert result["metadata"]["provider_model"] == "gpt-5.4-mini"
    assert result["metadata"]["lotes_gerados"] == 3
    assert result["metadata"]["chamadas_realizadas"] == 3
    assert all(call["model"] == "gpt-5.4-mini" for call in captured["calls"])
    assert "brainhex" not in json.dumps(captured["payloads"]).lower()

    submitted_blocks = [
        block
        for payload in captured["payloads"]
        for block in payload["blocos_base"]
    ]
    submitted_base = "\n".join(block["conteudo_base"] for block in submitted_blocks)
    for index in range(1, 31):
        assert f"MARCADOR-{index:02d}" in submitted_base
    submitted_segments = {
        segment_id for block in submitted_blocks for segment_id in block["segment_ids"]
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
        enrichment_module,
        "_openai_client",
        lambda _api_key: _Client(shallow, {}),
    )

    with pytest.raises(ContentEnrichmentError, match="apenas repetiu"):
        await enrich_content_blocks(context=_context(), settings=_settings())


@pytest.mark.asyncio
async def test_enrichment_retries_only_the_rejected_block(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    response_calls = 0

    def shallow_once(payload: dict[str, Any]) -> dict[str, Any]:
        nonlocal response_calls
        response_calls += 1
        response = _rich_response(payload)
        if response_calls == 1:
            response["blocos"][-1]["conteudo_aprofundado"] = response["blocos"][-1][
                "conteudo_base"
            ]
        return response

    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        lambda _api_key: _Client(shallow_once, captured),
    )

    result = await enrich_content_blocks(context=_context(), settings=_settings())

    assert len(captured["payloads"][0]["blocos_base"]) > 1
    assert len(captured["payloads"][1]["blocos_base"]) == 1
    assert len(result["blocos"]) == len(captured["payloads"][0]["blocos_base"])
    assert result["metadata"]["chamadas_realizadas"] == 2


@pytest.mark.asyncio
async def test_enrichment_ignores_global_provider_and_always_uses_openai(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        lambda api_key: captured.update({"api_key": api_key})
        or _Client(_rich_response, captured),
    )

    result = await enrich_content_blocks(context=_context(), settings=_settings())

    assert captured["api_key"] == "openai-secret"
    assert result["metadata"]["provider"] == "openai"


@pytest.mark.asyncio
async def test_enrichment_fails_explicitly_when_openai_is_not_configured() -> None:
    settings = SimpleNamespace(
        openai_api_key="",
    )

    with pytest.raises(ContentEnrichmentError, match="OPENAI_API_KEY"):
        await enrich_content_blocks(context=_context(), settings=settings)
