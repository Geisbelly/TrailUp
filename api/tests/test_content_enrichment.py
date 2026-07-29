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


def _settings(**overrides: Any) -> SimpleNamespace:
    base = dict(
        openai_api_key="openai-secret",
        openai_content_enrichment_model="gpt-5.4-mini",
        content_enrichment_batch_size=8,
        content_enrichment_max_attempts=3,
        openai_content_enrichment_max_output_tokens=32768,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _settings_with_gemini(**overrides: Any) -> SimpleNamespace:
    return _settings(
        gemini_api_key="gemini-secret",
        content_enrichment_gemini_model="gemini-2.5-flash",
        content_enrichment_gemini_quota_cooldown_sec=300,
        **overrides,
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
    assert result["metadata"]["lotes_gerados"] == 24
    assert result["metadata"]["chamadas_realizadas"] == 24
    assert all(
        len(payload["blocos_base"]) == 1 for payload in captured["payloads"]
    )
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

    assert len(captured["payloads"][0]["blocos_base"]) == 1
    assert len(captured["payloads"][1]["blocos_base"]) == 1
    assert (
        captured["payloads"][0]["blocos_base"][0]["id"]
        == captured["payloads"][1]["blocos_base"][0]["id"]
    )
    assert len(result["blocos"]) == result["metadata"]["blocos_gerados"]
    assert (
        result["metadata"]["chamadas_realizadas"]
        == result["metadata"]["blocos_gerados"] + 1
    )


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


class _QuotaExhaustedResponses:
    def __init__(self, captured: dict[str, Any]) -> None:
        self._captured = captured

    async def create(self, **kwargs: Any) -> Any:
        self._captured["calls"] = self._captured.get("calls", 0) + 1
        raise Exception(
            "Error code: 429 - {'error': {'message': 'You exceeded your current "
            "quota, please check your plan and billing details.', 'type': "
            "'insufficient_quota', 'param': None, 'code': 'insufficient_quota'}}"
        )


class _QuotaExhaustedClient:
    def __init__(self, captured: dict[str, Any]) -> None:
        self.responses = _QuotaExhaustedResponses(captured)


@pytest.mark.asyncio
async def test_enrichment_opens_circuit_on_insufficient_quota_and_fails_fast(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enrichment_module.reset_openai_enrichment_circuit()
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        lambda _api_key: _QuotaExhaustedClient(captured),
    )

    with pytest.raises(ContentEnrichmentError, match="insufficient_quota"):
        await enrich_content_blocks(context=_context(), settings=_settings())
    assert captured["calls"] == 1

    with pytest.raises(ContentEnrichmentError, match="circuito"):
        await enrich_content_blocks(context=_context(), settings=_settings())
    assert captured["calls"] == 1

    enrichment_module.reset_openai_enrichment_circuit()


@pytest.mark.asyncio
async def test_enrichment_circuit_does_not_open_for_other_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enrichment_module.reset_openai_enrichment_circuit()
    captured: dict[str, Any] = {}

    class _TimeoutResponses:
        async def create(self, **kwargs: Any) -> Any:
            captured["calls"] = captured.get("calls", 0) + 1
            raise Exception("Connection timed out")

    class _TimeoutClient:
        def __init__(self) -> None:
            self.responses = _TimeoutResponses()

    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        lambda _api_key: _TimeoutClient(),
    )

    with pytest.raises(ContentEnrichmentError, match="Connection timed out"):
        await enrich_content_blocks(context=_context(), settings=_settings())
    assert captured["calls"] == 1

    with pytest.raises(ContentEnrichmentError, match="Connection timed out"):
        await enrich_content_blocks(context=_context(), settings=_settings())
    assert captured["calls"] == 2

    enrichment_module.reset_openai_enrichment_circuit()


# ─── Fallback para Gemini quando a OpenAI falha ───────────────────────────────


class _GeminiStructuredClient:
    def __init__(self, response_factory: Any, captured: dict[str, Any]) -> None:
        self._response_factory = response_factory
        self._captured = captured

    async def ainvoke(self, messages: list[Any]) -> Any:
        input_text = str(messages[1].content)
        blocks_json = input_text.split("BLOCOS-BASE:\n", 1)[1].split(
            "\n\nCORREÇÕES OBRIGATÓRIAS",
            1,
        )[0]
        payload = {"blocos_base": json.loads(blocks_json)}
        self._captured.setdefault("calls", []).append(messages)
        self._captured.setdefault("payloads", []).append(payload)
        return self._response_factory(payload)


class _GeminiClient:
    def __init__(self, response_factory: Any, captured: dict[str, Any]) -> None:
        self._response_factory = response_factory
        self._captured = captured

    def with_structured_output(self, _schema: Any) -> _GeminiStructuredClient:
        return _GeminiStructuredClient(self._response_factory, self._captured)


class _FailingOpenAIResponses:
    def __init__(self, message: str) -> None:
        self._message = message

    async def create(self, **_kwargs: Any) -> Any:
        raise Exception(self._message)


class _FailingOpenAIClient:
    def __init__(self, message: str) -> None:
        self.responses = _FailingOpenAIResponses(message)


@pytest.mark.asyncio
async def test_gemini_fallback_used_when_openai_fails_and_gemini_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enrichment_module.reset_openai_enrichment_circuit()
    enrichment_module.reset_gemini_enrichment_circuit()
    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        lambda _api_key: _FailingOpenAIClient("OpenAI fora do ar"),
    )
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        lambda _api_key, _model: _GeminiClient(_rich_response, captured),
    )

    result = await enrich_content_blocks(
        context=_context(),
        settings=_settings_with_gemini(),
    )

    assert len(result["blocos"]) > 0
    assert result["metadata"]["provider"] == "openai"  # contrato de versão, inalterado
    assert result["metadata"]["enrichment_provider"] == "openai"
    assert result["metadata"]["enrichment_llm_provider"] == "gemini"
    assert result["metadata"]["openai_fallback_used"] is True
    assert "OpenAI fora do ar" in result["metadata"]["openai_fallback_reason"]
    assert result["metadata"]["provider_model"] == "gemini-2.5-flash"
    assert result["metadata"]["pipeline_order"] == [
        "content_decomposition",
        "gemini_enrichment",
        "brainhex_personalization",
    ]
    # batch_size do Gemini tambem e travado em 1 bloco por chamada (mesma
    # regra da OpenAI): uma chamada por bloco gerado.
    assert len(captured["calls"]) == len(result["blocos"])

    enrichment_module.reset_openai_enrichment_circuit()
    enrichment_module.reset_gemini_enrichment_circuit()


@pytest.mark.asyncio
async def test_gemini_nao_e_tentado_quando_nao_configurado(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enrichment_module.reset_openai_enrichment_circuit()
    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        lambda _api_key: _FailingOpenAIClient("OpenAI fora do ar"),
    )

    with pytest.raises(ContentEnrichmentError, match="OpenAI fora do ar"):
        await enrich_content_blocks(context=_context(), settings=_settings())

    enrichment_module.reset_openai_enrichment_circuit()


@pytest.mark.asyncio
async def test_openai_indisponivel_pula_direto_pro_gemini_quando_openai_sem_chave(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    called_openai = False

    def _fail_if_called(_api_key: str) -> Any:
        nonlocal called_openai
        called_openai = True
        raise AssertionError("nao deveria chamar a OpenAI sem chave configurada")

    monkeypatch.setattr(enrichment_module, "_openai_client", _fail_if_called)
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        lambda _api_key, _model: _GeminiClient(_rich_response, captured),
    )

    settings = _settings_with_gemini(openai_api_key="")
    result = await enrich_content_blocks(context=_context(), settings=settings)

    assert called_openai is False
    assert result["metadata"]["enrichment_llm_provider"] == "gemini"


@pytest.mark.asyncio
async def test_ambos_provedores_falham_gera_erro_combinado(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enrichment_module.reset_openai_enrichment_circuit()
    enrichment_module.reset_gemini_enrichment_circuit()
    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        lambda _api_key: _FailingOpenAIClient("OpenAI fora do ar"),
    )

    class _FailingGeminiStructuredClient:
        async def ainvoke(self, _messages: list[Any]) -> Any:
            raise Exception("Gemini tambem fora do ar")

    class _FailingGeminiClient:
        def with_structured_output(self, _schema: Any) -> Any:
            return _FailingGeminiStructuredClient()

    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        lambda _api_key, _model: _FailingGeminiClient(),
    )

    with pytest.raises(ContentEnrichmentError) as exc_info:
        await enrich_content_blocks(context=_context(), settings=_settings_with_gemini())
    assert "OpenAI fora do ar" in str(exc_info.value)
    assert "Gemini tambem fora do ar" in str(exc_info.value)

    enrichment_module.reset_openai_enrichment_circuit()
    enrichment_module.reset_gemini_enrichment_circuit()


@pytest.mark.asyncio
async def test_gemini_abre_circuito_em_erro_de_cota_e_falha_rapido(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enrichment_module.reset_openai_enrichment_circuit()
    enrichment_module.reset_gemini_enrichment_circuit()
    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        lambda _api_key: _FailingOpenAIClient("OpenAI fora do ar"),
    )
    gemini_calls = {"count": 0}

    class _QuotaExhaustedGeminiStructuredClient:
        async def ainvoke(self, _messages: list[Any]) -> Any:
            gemini_calls["count"] += 1
            raise Exception("429 RESOURCE_EXHAUSTED: quota exceeded")

    class _QuotaExhaustedGeminiClient:
        def with_structured_output(self, _schema: Any) -> Any:
            return _QuotaExhaustedGeminiStructuredClient()

    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        lambda _api_key, _model: _QuotaExhaustedGeminiClient(),
    )

    with pytest.raises(ContentEnrichmentError, match="RESOURCE_EXHAUSTED"):
        await enrich_content_blocks(context=_context(), settings=_settings_with_gemini())
    assert gemini_calls["count"] == 1

    with pytest.raises(ContentEnrichmentError, match="circuito"):
        await enrich_content_blocks(context=_context(), settings=_settings_with_gemini())
    assert gemini_calls["count"] == 1

    enrichment_module.reset_openai_enrichment_circuit()
    enrichment_module.reset_gemini_enrichment_circuit()
