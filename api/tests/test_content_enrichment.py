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
    # batch_size=8 (ver _settings()): 24 blocos / 8 = 3 lotes, exatamente
    # divisivel - sem retries (_rich_response sempre passa na validacao).
    assert result["metadata"]["lotes_gerados"] == 3
    assert result["metadata"]["chamadas_realizadas"] == 3
    assert all(
        len(payload["blocos_base"]) == 8 for payload in captured["payloads"]
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


def test_group_segments_scales_block_count_for_large_source_content() -> None:
    # 40 segmentos de ~3.7k chars cada (~150k chars no total) nao cabem em
    # 24 blocos sem que cada bloco fique grande demais - depois do
    # enriquecimento (que so tem piso minimo de expansao, sem teto), um
    # bloco assim reproduziu estouro de max_output_tokens no fallback OpenAI
    # em producao. _group_segments deve abrir mao do teto fixo de 24 quando
    # o conteudo de origem exige mais granularidade.
    context = {"conteudo_classe": {"topico": {"nome": "Redes"}}}
    segments = [
        {
            "segment_id": f"segmento-{index:04d}",
            "source_id": "conteudo:1",
            "source_title": "Aula",
            "source_order": index,
            "text": f"MARCADOR-{index:03d}: " + ("conteudo tecnico denso. " * 150),
        }
        for index in range(1, 41)
    ]

    groups = enrichment_module._group_segments(context, segments)

    assert len(groups) > 24
    assert sum(len(block["segment_ids"]) for block in groups) == len(segments)
    all_segment_ids = {
        segment_id for block in groups for segment_id in block["segment_ids"]
    }
    assert all_segment_ids == {segment["segment_id"] for segment in segments}


def test_source_segmentation_splits_large_text_without_losing_its_tail() -> None:
    context = _context(paragraphs=1)
    long_text = "INICIO-" + ("x" * 9_000) + "-FIM"
    context["conteudo_classe"]["conteudos"][0]["conteudo"] = long_text

    segments = [
        segment for segment in enrichment_module._source_segments(context) if segment["source_id"] == "conteudo:1"
    ]

    assert len(segments) == 7
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
async def test_enrichment_rejects_response_that_exceeds_the_size_ceiling(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Sem teto, um bloco enriquecido podia crescer o quanto o modelo quisesse -
    # reproduziu estouro de max_output_tokens no fallback OpenAI em producao
    # (ver _MAX_EXPANDED_CHARS). Um bloco que devolve conteudo_aprofundado
    # maior que o teto deve ser rejeitado, mesmo cumprindo o piso minimo.
    def verbose(payload: dict[str, Any]) -> dict[str, Any]:
        response = _rich_response(payload)
        block = response["blocos"][0]
        block["conteudo_aprofundado"] = block["conteudo_aprofundado"] + ("x" * 12_500)
        return response

    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _gemini_factory(verbose, {}),
    )

    with pytest.raises(ContentEnrichmentError, match="excede o teto"):
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

    # batch_size=8 (ver _settings()) cabe todos os 4 blocos numa chamada so;
    # o retry (chamada 2) so reenvia o bloco que falhou na validacao, nao o
    # lote inteiro - "correcao localizada" vem do afunilamento de `pending`
    # a cada tentativa (ver enrich_content_blocks), nao do tamanho do lote.
    assert len(captured["payloads"][0]["blocos_base"]) == 4
    assert len(captured["payloads"][1]["blocos_base"]) == 1
    assert (
        captured["payloads"][1]["blocos_base"][0]["id"]
        == captured["payloads"][0]["blocos_base"][-1]["id"]
    )
    assert len(result["blocos"]) == result["metadata"]["blocos_gerados"]
    assert result["metadata"]["chamadas_realizadas"] == 2


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


def test_parse_gemini_keys_aceita_multiplas_chaves_separadas_por_virgula() -> None:
    assert enrichment_module._parse_gemini_keys("key-1, key-2 ;key-3") == [
        "key-1",
        "key-2",
        "key-3",
    ]
    assert enrichment_module._parse_gemini_keys("key-1, key-1, key-2") == [
        "key-1",
        "key-2",
    ]
    assert enrichment_module._parse_gemini_keys("") == []


@pytest.mark.asyncio
async def test_gemini_alterna_para_a_proxima_chave_quando_uma_esgota_a_cota(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Com 2+ chaves configuradas, uma chave esgotada nao deve derrubar o
    enriquecimento pro fallback pago da OpenAI — a proxima tentativa ja roda
    com a proxima chave disponivel."""
    captured: dict[str, Any] = {}

    class _QuotaExhaustedClient:
        def with_structured_output(self, _schema: Any) -> Any:
            class _Structured:
                async def ainvoke(self, _messages: list[Any]) -> Any:
                    raise Exception("429 RESOURCE_EXHAUSTED: quota exceeded")

            return _Structured()

    def factory(api_key: str, model: str) -> Any:
        captured.setdefault("keys_used", []).append(api_key)
        if api_key == "key-1":
            return _QuotaExhaustedClient()
        return _GeminiClient(_rich_response, captured)

    monkeypatch.setattr(enrichment_module, "_gemini_client", factory)

    result = await enrich_content_blocks(
        context=_context(),
        settings=_settings(gemini_api_key="key-1,key-2"),
    )

    assert result["metadata"]["enrichment_llm_provider"] == "gemini"
    # a 1a tentativa esgota a cota de key-1; a 2a tentativa ja roda com key-2,
    # sem precisar do fallback pago da OpenAI.
    assert captured["keys_used"] == ["key-1", "key-2"]


@pytest.mark.asyncio
async def test_gemini_usa_modelo_alternativo_quando_todas_as_chaves_esgotam_o_modelo_principal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A cota do free tier e por (chave, modelo): gemini-2.5-flash-lite tem
    teto bem maior que gemini-3.6-flash. Com uma unica chave configurada, se
    ela esgotar a cota do modelo principal em TODAS as tentativas, a proxima
    tentativa deve trocar pro modelo alternativo (mesma chave) antes de
    precisar do fallback pago da OpenAI."""
    captured: dict[str, Any] = {}

    class _QuotaExhaustedClient:
        def with_structured_output(self, _schema: Any) -> Any:
            class _Structured:
                async def ainvoke(self, _messages: list[Any]) -> Any:
                    raise Exception("429 RESOURCE_EXHAUSTED: quota exceeded")

            return _Structured()

    def factory(api_key: str, model: str) -> Any:
        captured.setdefault("models_used", []).append(model)
        if model == "gemini-3.6-flash":
            return _QuotaExhaustedClient()
        return _GeminiClient(_rich_response, captured)

    monkeypatch.setattr(enrichment_module, "_gemini_client", factory)

    result = await enrich_content_blocks(
        context=_context(),
        settings=_settings(
            gemini_api_key="key-1",
            content_enrichment_gemini_model="gemini-3.6-flash",
            content_enrichment_gemini_fallback_models="gemini-2.5-flash-lite,gemini-2.0-flash",
        ),
    )

    assert result["metadata"]["enrichment_llm_provider"] == "gemini"
    # a 1a tentativa esgota a cota do modelo principal na unica chave; a 2a
    # tentativa ja roda com o modelo alternativo, sem precisar da OpenAI.
    assert captured["models_used"] == ["gemini-3.6-flash", "gemini-2.5-flash-lite"]


@pytest.mark.asyncio
async def test_gemini_percorre_toda_a_cadeia_de_modelos_alternativos_ate_um_funcionar(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Com 5 modelos alternativos configurados, se os 3 primeiros esgotarem a
    cota na unica chave, o codigo deve continuar tentando ate o 4o (nao
    desistir no primeiro fallback) antes de precisar da OpenAI."""
    captured: dict[str, Any] = {}
    exhausted_models = {"gemini-3.6-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"}

    class _QuotaExhaustedClient:
        def with_structured_output(self, _schema: Any) -> Any:
            class _Structured:
                async def ainvoke(self, _messages: list[Any]) -> Any:
                    raise Exception("429 RESOURCE_EXHAUSTED: quota exceeded")

            return _Structured()

    def factory(api_key: str, model: str) -> Any:
        captured.setdefault("models_used", []).append(model)
        if model in exhausted_models:
            return _QuotaExhaustedClient()
        return _GeminiClient(_rich_response, captured)

    monkeypatch.setattr(enrichment_module, "_gemini_client", factory)

    result = await enrich_content_blocks(
        context=_context(),
        settings=_settings(
            gemini_api_key="key-1",
            content_enrichment_gemini_model="gemini-3.6-flash",
            content_enrichment_gemini_fallback_models=(
                "gemini-2.5-flash-lite,gemini-2.0-flash,gemini-2.0-flash-lite,"
                "gemini-3.1-flash-lite"
            ),
        ),
    )

    assert result["metadata"]["enrichment_llm_provider"] == "gemini"
    assert captured["models_used"] == [
        "gemini-3.6-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
    ]


@pytest.mark.asyncio
async def test_gemini_pula_pro_proximo_modelo_quando_o_atual_esta_aposentado(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reproduz o bug real: gemini-2.5-flash-lite retornou 404 NOT_FOUND ("no
    longer available to new users") em producao. Um 404 nao e erro de cota,
    mas ainda assim deve pular pro proximo modelo candidato — antes dessa
    correcao, um 404 abortava a cadeia inteira na primeira tentativa."""
    captured: dict[str, Any] = {}

    class _NotFoundClient:
        def with_structured_output(self, _schema: Any) -> Any:
            class _Structured:
                async def ainvoke(self, _messages: list[Any]) -> Any:
                    raise Exception(
                        "404 NOT_FOUND. This model models/gemini-2.5-flash-lite is "
                        "no longer available to new users."
                    )

            return _Structured()

    def factory(api_key: str, model: str) -> Any:
        captured.setdefault("models_used", []).append(model)
        if model == "gemini-2.5-flash-lite":
            return _NotFoundClient()
        return _GeminiClient(_rich_response, captured)

    monkeypatch.setattr(enrichment_module, "_gemini_client", factory)

    result = await enrich_content_blocks(
        context=_context(),
        settings=_settings(
            gemini_api_key="key-1",
            content_enrichment_gemini_model="gemini-2.5-flash-lite",
            content_enrichment_gemini_fallback_models="gemini-2.0-flash",
        ),
    )

    assert result["metadata"]["enrichment_llm_provider"] == "gemini"
    assert captured["models_used"] == ["gemini-2.5-flash-lite", "gemini-2.0-flash"]


@pytest.mark.asyncio
async def test_gemini_tenta_proxima_chave_quando_servidor_retorna_503_sobrecarregado(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reproduz o bug real: 503 UNAVAILABLE ('This model is currently
    experiencing high demand') e sobrecarga transitoria do servidor, nao um
    problema da chave/conta — antes dessa correcao, abortava a cadeia
    inteira na primeira tentativa em vez de tentar a proxima chave."""
    captured: dict[str, Any] = {}

    class _OverloadedClient:
        def with_structured_output(self, _schema: Any) -> Any:
            class _Structured:
                async def ainvoke(self, _messages: list[Any]) -> Any:
                    raise Exception(
                        "503 UNAVAILABLE. {'error': {'code': 503, 'message': "
                        "'This model is currently experiencing high demand. "
                        "Spikes in demand are usually temporary. Please try "
                        "again later.', 'status': 'UNAVAILABLE'}}"
                    )

            return _Structured()

    def factory(api_key: str, model: str) -> Any:
        captured.setdefault("keys_used", []).append(api_key)
        if api_key == "key-1":
            return _OverloadedClient()
        return _GeminiClient(_rich_response, captured)

    monkeypatch.setattr(enrichment_module, "_gemini_client", factory)

    result = await enrich_content_blocks(
        context=_context(),
        settings=_settings(gemini_api_key="key-1,key-2"),
    )

    assert result["metadata"]["enrichment_llm_provider"] == "gemini"
    assert captured["keys_used"] == ["key-1", "key-2"]


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
    # batch_size=8 (ver _settings_with_openai) cabe os 4 blocos de _context()
    # numa chamada so.
    assert len(captured["calls"]) == 1
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


def test_derive_base_blocks_and_topic_e_deterministico_sem_llm() -> None:
    context = _context()
    base_blocks_1, topic_1, source_hash_1, segments_1 = enrichment_module.derive_base_blocks_and_topic(context)
    base_blocks_2, topic_2, source_hash_2, segments_2 = enrichment_module.derive_base_blocks_and_topic(context)

    assert [b["id"] for b in base_blocks_1] == [b["id"] for b in base_blocks_2]
    assert topic_1 == topic_2
    assert source_hash_1 == source_hash_2
    assert len(segments_1) == len(segments_2)
    assert all(b["id"].startswith("bloco-") for b in base_blocks_1)


@pytest.mark.asyncio
async def test_enrich_base_blocks_aceita_subconjunto_de_blocos(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _context(paragraphs=2)
    base_blocks, topic, source_hash, _segments = enrichment_module.derive_base_blocks_and_topic(context)
    assert len(base_blocks) >= 1
    subset = base_blocks[:1]

    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _gemini_factory(_rich_response, captured),
    )

    blocks, metadata = await enrichment_module.enrich_base_blocks(
        base_blocks=subset,
        topic=topic,
        source_hash=source_hash,
        settings=_settings(),
    )

    assert len(blocks) == 1
    assert blocks[0]["id"] == subset[0]["id"]
    assert metadata["enrichment_llm_provider"] == "gemini"
    # so o subconjunto pedido (1 bloco) chegou na chamada ao Gemini - nao o
    # conjunto completo de base_blocks do context.
    assert len(captured["payloads"][-1]["blocos_base"]) == 1


@pytest.mark.asyncio
async def test_enrich_content_blocks_continua_equivalente_apos_refatoracao(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Regressao: enrich_content_blocks precisa continuar se comportando
    # exatamente igual apos virar um wrapper de derive_base_blocks_and_topic
    # + enrich_base_blocks - mesmo formato de retorno, mesmos campos.
    context = _context()
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _gemini_factory(_rich_response, captured),
    )

    result = await enrich_content_blocks(
        context=context,
        settings=_settings(),
    )

    assert result["schema_version"]
    assert isinstance(result["blocos"], list)
    assert len(result["blocos"]) >= 1
    assert result["metadata"]["enrichment_llm_provider"] == "gemini"
    assert result["metadata"]["openai_fallback_used"] is False
    assert result["metadata"]["gemini_failure_reason"] == ""
