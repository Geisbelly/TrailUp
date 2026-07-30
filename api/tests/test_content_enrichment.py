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


def _reset_circuits() -> None:
    enrichment_module.reset_openai_enrichment_circuit()
    enrichment_module.reset_gemini_enrichment_circuit()
    enrichment_module.reset_openai_spend_guard()


@pytest.fixture(autouse=True)
def _clean_circuits():
    _reset_circuits()
    yield
    _reset_circuits()


def _settings(**overrides: Any) -> SimpleNamespace:
    # Gemini e o provedor PRINCIPAL (gratuito no tier atual) — configurado por
    # padrao em todo teste. OpenAI so entra quando o teste adiciona
    # openai_api_key explicitamente (via _settings_with_openai).
    base = dict(
        gemini_api_key="gemini-secret",
        content_enrichment_gemini_model="gemini-3.6-flash",
        content_enrichment_gemini_quota_cooldown_sec=300,
        content_enrichment_batch_size=8,
        content_enrichment_max_attempts=3,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _settings_with_openai(**overrides: Any) -> SimpleNamespace:
    base = dict(
        openai_api_key="openai-secret",
        openai_content_enrichment_model="gpt-4o-mini",
        openai_content_enrichment_max_output_tokens=32768,
        content_enrichment_quota_cooldown_sec=300,
        openai_spend_cap_usd=1.0,
    )
    base.update(overrides)
    return _settings(**base)


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


def _extract_blocks_payload(input_text: str) -> dict[str, Any]:
    blocks_json = input_text.split("BLOCOS-BASE:\n", 1)[1].split(
        "\n\nCORREÇÕES OBRIGATÓRIAS",
        1,
    )[0]
    return {"blocos_base": json.loads(blocks_json)}


# ─── Fakes: Gemini (provedor principal) ───────────────────────────────────────


class _GeminiStructuredClient:
    def __init__(self, response_factory: Any, captured: dict[str, Any]) -> None:
        self._response_factory = response_factory
        self._captured = captured

    async def ainvoke(self, messages: list[Any]) -> Any:
        payload = _extract_blocks_payload(str(messages[1].content))
        self._captured.setdefault("calls", []).append(messages)
        self._captured.setdefault("payloads", []).append(payload)
        return self._response_factory(payload)


class _GeminiClient:
    def __init__(self, response_factory: Any, captured: dict[str, Any]) -> None:
        self._response_factory = response_factory
        self._captured = captured

    def with_structured_output(self, _schema: Any) -> _GeminiStructuredClient:
        return _GeminiStructuredClient(self._response_factory, self._captured)


def _gemini_factory(response_factory: Any, captured: dict[str, Any]):
    def factory(api_key: str, model: str) -> _GeminiClient:
        captured["api_key"] = api_key
        captured["model"] = model
        return _GeminiClient(response_factory, captured)

    return factory


class _FailingGeminiStructuredClient:
    def __init__(self, message: str, captured: dict[str, Any]) -> None:
        self._message = message
        self._captured = captured

    async def ainvoke(self, _messages: list[Any]) -> Any:
        self._captured["calls"] = self._captured.get("calls", 0) + 1
        raise Exception(self._message)


class _FailingGeminiClient:
    def __init__(self, message: str, captured: dict[str, Any]) -> None:
        self._message = message
        self._captured = captured

    def with_structured_output(self, _schema: Any) -> Any:
        return _FailingGeminiStructuredClient(self._message, self._captured)


def _failing_gemini_factory(message: str, captured: dict[str, Any] | None = None):
    shared = captured if captured is not None else {}

    def factory(_api_key: str, _model: str) -> _FailingGeminiClient:
        return _FailingGeminiClient(message, shared)

    return factory


# ─── Fakes: OpenAI (reserva secundária) ────────────────────────────────────────


class _Usage:
    def __init__(self, input_tokens: int, output_tokens: int) -> None:
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class _OpenAIResponse:
    def __init__(self, payload: Any, *, usage: _Usage | None = None) -> None:
        self.output_text = json.dumps(payload, ensure_ascii=False)
        self.model = "gpt-4o-mini"
        self.usage = usage


class _Responses:
    def __init__(self, response_factory: Any, captured: dict[str, Any], *, usage: _Usage | None = None) -> None:
        self._response_factory = response_factory
        self._captured = captured
        self._usage = usage

    async def create(self, **kwargs: Any) -> _OpenAIResponse:
        payload = _extract_blocks_payload(str(kwargs["input"]))
        self._captured.setdefault("calls", []).append(kwargs)
        self._captured.setdefault("payloads", []).append(payload)
        self._captured["payload"] = payload
        return _OpenAIResponse(self._response_factory(payload), usage=self._usage)


class _Client:
    def __init__(self, response_factory: Any, captured: dict[str, Any], *, usage: _Usage | None = None) -> None:
        self.responses = _Responses(response_factory, captured, usage=usage)


def _openai_factory(response_factory: Any, captured: dict[str, Any], *, usage: _Usage | None = None):
    def factory(api_key: str) -> _Client:
        captured["api_key"] = api_key
        return _Client(response_factory, captured, usage=usage)

    return factory


class _FailingOpenAIResponses:
    def __init__(self, message: str, captured: dict[str, Any]) -> None:
        self._message = message
        self._captured = captured

    async def create(self, **_kwargs: Any) -> Any:
        self._captured["calls"] = self._captured.get("calls", 0) + 1
        raise Exception(self._message)


class _FailingOpenAIClient:
    def __init__(self, message: str, captured: dict[str, Any]) -> None:
        self.responses = _FailingOpenAIResponses(message, captured)


def _failing_openai_factory(message: str, captured: dict[str, Any] | None = None):
    shared = captured if captured is not None else {}

    def factory(_api_key: str) -> _FailingOpenAIClient:
        return _FailingOpenAIClient(message, shared)

    return factory


class _IncompleteDetails:
    def __init__(self, reason: str) -> None:
        self.reason = reason


class _IncompleteOpenAIResponse:
    def __init__(self, reason: str) -> None:
        self.status = "incomplete"
        self.incomplete_details = _IncompleteDetails(reason)
        self.output_text = ""
        self.usage = None


class _IncompleteOpenAIResponses:
    def __init__(self, reason: str) -> None:
        self._reason = reason

    async def create(self, **_kwargs: Any) -> Any:
        return _IncompleteOpenAIResponse(self._reason)


class _IncompleteOpenAIClient:
    def __init__(self, reason: str) -> None:
        self.responses = _IncompleteOpenAIResponses(reason)


def _incomplete_openai_factory(reason: str):
    def factory(_api_key: str) -> _IncompleteOpenAIClient:
        return _IncompleteOpenAIClient(reason)

    return factory


# ─── Gemini como provedor principal — comportamento núcleo ────────────────────


@pytest.mark.asyncio
async def test_enrichment_groups_every_source_segment_without_truncation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _gemini_factory(_rich_response, captured),
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
    assert result["metadata"]["provider"] == "openai"  # contrato de versão fixo
    assert result["metadata"]["division_provider"] == "api-deterministic"
    assert result["metadata"]["enrichment_provider"] == "openai"  # idem
    assert result["metadata"]["enrichment_llm_provider"] == "gemini"
    assert result["metadata"]["openai_fallback_used"] is False
    assert result["metadata"]["personalization_applied"] is False
    assert result["metadata"]["pipeline_order"] == [
        "content_decomposition",
        "gemini_enrichment",
        "brainhex_personalization",
    ]
    assert result["metadata"]["provider_model"] == "gemini-3.6-flash"
    assert result["metadata"]["lotes_gerados"] == 24
    assert result["metadata"]["chamadas_realizadas"] == 24
    assert all(
        len(payload["blocos_base"]) == 1 for payload in captured["payloads"]
    )
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
async def test_enrichment_rejects_shallow_response_and_reraises_when_no_openai_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def shallow(payload: dict[str, Any]) -> dict[str, Any]:
        response = _rich_response(payload)
        for block in response["blocos"]:
            block["conteudo_aprofundado"] = block["conteudo_base"]
        return response

    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _gemini_factory(shallow, {}),
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
        "_gemini_client",
        _gemini_factory(shallow_once, captured),
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
async def test_enrichment_ignores_global_llm_provider_and_uses_gemini(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _gemini_factory(_rich_response, captured),
    )

    result = await enrich_content_blocks(
        context=_context(),
        settings=_settings(llm_provider="openai"),
    )

    assert captured["api_key"] == "gemini-secret"
    assert result["metadata"]["enrichment_llm_provider"] == "gemini"


@pytest.mark.asyncio
async def test_enrichment_fails_explicitly_when_no_provider_is_configured() -> None:
    settings = SimpleNamespace(gemini_api_key="", openai_api_key="")

    with pytest.raises(ContentEnrichmentError, match="GEMINI_API_KEY"):
        await enrich_content_blocks(context=_context(), settings=settings)


# ─── Circuito de indisponibilidade do Gemini ──────────────────────────────────


@pytest.mark.asyncio
async def test_gemini_abre_circuito_em_erro_de_cota_e_falha_rapido(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _failing_gemini_factory("429 RESOURCE_EXHAUSTED: quota exceeded", calls),
    )

    with pytest.raises(ContentEnrichmentError, match="RESOURCE_EXHAUSTED"):
        await enrich_content_blocks(context=_context(), settings=_settings())
    assert calls["calls"] == 1

    with pytest.raises(ContentEnrichmentError, match="circuito"):
        await enrich_content_blocks(context=_context(), settings=_settings())
    # o circuito bloqueia antes de instanciar o client de novo
    assert calls["calls"] == 1


@pytest.mark.asyncio
async def test_gemini_circuito_nao_abre_para_erros_genericos(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _failing_gemini_factory("Connection timed out", calls),
    )

    with pytest.raises(ContentEnrichmentError, match="Connection timed out"):
        await enrich_content_blocks(context=_context(), settings=_settings())
    assert calls["calls"] == 1

    with pytest.raises(ContentEnrichmentError, match="Connection timed out"):
        await enrich_content_blocks(context=_context(), settings=_settings())
    assert calls["calls"] == 2


# ─── OpenAI como reserva secundária (só quando o Gemini falha) ────────────────


@pytest.mark.asyncio
async def test_openai_fallback_used_when_gemini_fails_and_openai_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _failing_gemini_factory("Gemini fora do ar"),
    )
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        _openai_factory(_rich_response, captured),
    )

    result = await enrich_content_blocks(
        context=_context(),
        settings=_settings_with_openai(),
    )

    assert len(result["blocos"]) > 0
    assert result["metadata"]["provider"] == "openai"  # contrato de versão, inalterado
    assert result["metadata"]["enrichment_provider"] == "openai"
    assert result["metadata"]["enrichment_llm_provider"] == "openai"
    assert result["metadata"]["openai_fallback_used"] is True
    assert "Gemini fora do ar" in result["metadata"]["gemini_failure_reason"]
    assert result["metadata"]["provider_model"] == "gpt-4o-mini"
    assert result["metadata"]["pipeline_order"] == [
        "content_decomposition",
        "openai_enrichment",
        "brainhex_personalization",
    ]
    assert len(captured["calls"]) == len(result["blocos"])
    # gpt-4o-mini rejeita reasoning.effort e verbosity="high" com 400 —
    # regressao real que aconteceu em producao ao trocar o default de
    # gpt-5.4-mini pra gpt-4o-mini.
    assert "reasoning" not in captured["calls"][0]
    assert captured["calls"][0]["text"]["verbosity"] == "medium"


@pytest.mark.asyncio
async def test_openai_inclui_reasoning_effort_so_para_modelos_de_raciocinio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _failing_gemini_factory("Gemini fora do ar"),
    )
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        _openai_factory(_rich_response, captured),
    )

    await enrich_content_blocks(
        context=_context(),
        settings=_settings_with_openai(openai_content_enrichment_model="gpt-5.4-mini"),
    )

    assert captured["calls"][0]["reasoning"] == {"effort": "medium"}
    assert captured["calls"][0]["text"]["verbosity"] == "high"


@pytest.mark.asyncio
async def test_openai_nao_e_tentado_quando_nao_configurado(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _failing_gemini_factory("Gemini fora do ar"),
    )

    with pytest.raises(ContentEnrichmentError, match="Gemini fora do ar"):
        await enrich_content_blocks(context=_context(), settings=_settings())


@pytest.mark.asyncio
async def test_gemini_indisponivel_pula_direto_pro_openai_quando_gemini_sem_chave(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    called_gemini = False

    def _fail_if_called(_api_key: str, _model: str) -> Any:
        nonlocal called_gemini
        called_gemini = True
        raise AssertionError("nao deveria chamar o Gemini sem chave configurada")

    monkeypatch.setattr(enrichment_module, "_gemini_client", _fail_if_called)
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        _openai_factory(_rich_response, captured),
    )

    settings = _settings_with_openai(gemini_api_key="")
    result = await enrich_content_blocks(context=_context(), settings=settings)

    assert called_gemini is False
    assert result["metadata"]["enrichment_llm_provider"] == "openai"


@pytest.mark.asyncio
async def test_ambos_provedores_falham_gera_erro_combinado(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _failing_gemini_factory("Gemini fora do ar"),
    )
    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        _failing_openai_factory("OpenAI tambem fora do ar"),
    )

    with pytest.raises(ContentEnrichmentError) as exc_info:
        await enrich_content_blocks(context=_context(), settings=_settings_with_openai())
    assert "Gemini fora do ar" in str(exc_info.value)
    assert "OpenAI tambem fora do ar" in str(exc_info.value)


@pytest.mark.asyncio
async def test_openai_resposta_incompleta_gera_erro_diagnosticavel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _failing_gemini_factory("Gemini fora do ar"),
    )
    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        _incomplete_openai_factory("max_output_tokens"),
    )

    with pytest.raises(ContentEnrichmentError, match="incompleta.*max_output_tokens"):
        await enrich_content_blocks(context=_context(), settings=_settings_with_openai())


# ─── Circuito de indisponibilidade da OpenAI (reserva) ────────────────────────


@pytest.mark.asyncio
async def test_openai_abre_circuito_em_insufficient_quota_e_falha_rapido(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Gemini nao configurado: OpenAI e o unico provedor, exercitando o
    # circuito dela diretamente atraves do enrich_content_blocks.
    calls: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        _failing_openai_factory(
            "Error code: 429 - {'error': {'message': 'You exceeded your current "
            "quota, please check your plan and billing details.', 'type': "
            "'insufficient_quota', 'param': None, 'code': 'insufficient_quota'}}",
            calls,
        ),
    )
    settings = _settings_with_openai(gemini_api_key="")

    with pytest.raises(ContentEnrichmentError, match="insufficient_quota"):
        await enrich_content_blocks(context=_context(), settings=settings)
    assert calls["calls"] == 1

    with pytest.raises(ContentEnrichmentError, match="circuito"):
        await enrich_content_blocks(context=_context(), settings=settings)
    assert calls["calls"] == 1


# ─── Trava de gasto estimado da OpenAI (defesa extra — não substitui o hard
# limit de billing configurado no dashboard da OpenAI) ────────────────────────


@pytest.mark.asyncio
async def test_openai_spend_guard_acumula_estimativa_a_partir_do_usage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _failing_gemini_factory("Gemini fora do ar"),
    )
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        _openai_factory(
            _rich_response,
            captured,
            usage=_Usage(input_tokens=1_000, output_tokens=500),
        ),
    )

    assert enrichment_module.openai_estimated_spend_usd() == 0.0
    await enrich_content_blocks(context=_context(), settings=_settings_with_openai())
    assert enrichment_module.openai_estimated_spend_usd() > 0.0


@pytest.mark.asyncio
async def test_openai_spend_guard_bloqueia_chamadas_acima_do_teto(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Simula gasto ja acumulado (ex.: de chamadas anteriores neste processo)
    # acima do teto configurado, isolando o teste da contagem de blocos que
    # o contexto de teste padrao produz.
    enrichment_module._record_openai_spend(
        _Usage(input_tokens=1_000_000, output_tokens=1_000_000)
    )
    assert enrichment_module.openai_estimated_spend_usd() >= 0.01

    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _failing_gemini_factory("Gemini fora do ar"),
    )
    calls: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_openai_client",
        _openai_factory(_rich_response, calls),
    )
    settings = _settings_with_openai(openai_spend_cap_usd=0.01)

    with pytest.raises(ContentEnrichmentError, match="teto"):
        await enrich_content_blocks(context=_context(), settings=settings)
    assert calls.get("calls") is None
