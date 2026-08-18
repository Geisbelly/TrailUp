from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.settings import Settings
from app.services.media_agents import (
    _BRAINHEX_GUIDE_CONFIG,
    _brainhex_contract_matches,
    _build_brainhex_presentation_theme,
    brainhex_contract_ready,
    disparar_brainhex_async,
    gerar_apresentacao_parte_brainhex,
    gerar_audio_parte_brainhex,
    gerar_capitulo_bloco_brainhex,
    gerar_conteudo_brainhex,
    gerar_imagem_slide,
    regenerar_capitulo_brainhex,
    regenerar_documento_brainhex,
    regenerar_slide_brainhex,
)
from app.services.media_contract import (
    CONTENT_ENRICHMENT_PROVIDER,
    MEDIA_PIPELINE_VERSION,
    PRESENTATION_DESIGN_VERSION,
    PRESENTATION_ENGINE_VERSION,
)


@pytest.fixture
def settings():
    s = Settings()
    s.gemini_api_key = "fake-key"
    s.gemini_model_multimodal_primary = "gemini-2.5-flash"
    s.gemini_model_image = "gemini-2.0-flash-preview-image-generation"
    s.brainhex_api_url = "http://brainhex.local"
    return s


@pytest.fixture
def conteudo_estudado():
    return {
        "tema_central": "Sistemas Distribuídos",
        "conceitos_nucleares": ["consistência", "disponibilidade", "particionamento"],
        "fatos_ancorados": ["O teorema CAP define trade-offs fundamentais."],
        "objetivo_pedagogico": "Entender trade-offs em sistemas distribuídos.",
        "resumo_geral": "Sistemas distribuídos exigem decisões sobre CAP.",
    }


def test_brainhex_guide_config_has_all_profiles():
    profiles = ["mastermind", "seeker", "survivor", "daredevil", "conqueror", "socializer", "achiever"]
    for p in profiles:
        assert p in _BRAINHEX_GUIDE_CONFIG
        cfg = _BRAINHEX_GUIDE_CONFIG[p]
        assert "guia_nome" in cfg
        assert "guia_voz" in cfg
        assert "guia_cor" in cfg
        assert "framing" in cfg


def test_brainhex_contract_requires_openai_content_enrichment():
    valid = {
        "media_pipeline_version": MEDIA_PIPELINE_VERSION,
        "presentation_engine_version": PRESENTATION_ENGINE_VERSION,
        "presentation_design_version": PRESENTATION_DESIGN_VERSION,
        "content_enrichment_provider": CONTENT_ENRICHMENT_PROVIDER,
    }

    assert _brainhex_contract_matches(valid) is True
    assert _brainhex_contract_matches(
        {**valid, "content_enrichment_provider": "gemini"}
    ) is False

    assert _BRAINHEX_GUIDE_CONFIG["seeker"]["guia_voz"] == "Leda"
    assert _BRAINHEX_GUIDE_CONFIG["survivor"]["guia_voz"] == "Schedar"
    assert _BRAINHEX_GUIDE_CONFIG["socializer"]["guia_voz"] == "Achird"
    assert _BRAINHEX_GUIDE_CONFIG["socializer"]["guia_voz_secundario"] == "Sulafat"
    assert _BRAINHEX_GUIDE_CONFIG["achiever"]["guia_voz"] == "Orus"


def test_presentation_theme_combines_profile_and_content_subject():
    seeker = _build_brainhex_presentation_theme(
        perfil="seeker",
        content_blocks=[
            {
                "id": "bloco-01",
                "tema": "Civilização Maia",
                "topico": "Calendários",
            }
        ],
    )
    mastermind = _build_brainhex_presentation_theme(
        perfil="mastermind",
        content_blocks=[{"id": "bloco-01", "tema": "Civilização Maia"}],
    )

    assert seeker["version"] == PRESENTATION_DESIGN_VERSION
    assert seeker["subject"] == "Civilização Maia"
    assert seeker["style_name"] == "Atlas das Descobertas"
    assert seeker["layout_sequence"][0] == "cover"
    assert seeker["layout_sequence"][-1] == "finale"
    assert mastermind["style_name"] == "Blueprint Estratégico"
    assert mastermind["art_direction"] != seeker["art_direction"]


@pytest.mark.asyncio
async def test_brainhex_contract_ready_retries_transient_render_502(settings):
    settings.brainhex_health_retry_delay_sec = 0
    contract = {
        "media_pipeline_version": MEDIA_PIPELINE_VERSION,
        "presentation_engine_version": PRESENTATION_ENGINE_VERSION,
        "presentation_design_version": PRESENTATION_DESIGN_VERSION,
        "content_enrichment_provider": CONTENT_ENRICHMENT_PROVIDER,
    }
    unavailable = MagicMock(status_code=502, text="Bad Gateway")
    healthy = MagicMock(status_code=200)
    healthy.json.return_value = {"status": "ok", **contract}

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=[unavailable, healthy])
        mock_client_cls.return_value = mock_client

        ready = await brainhex_contract_ready(settings=settings)

    assert ready is True
    assert mock_client.get.await_count == 2
    assert all(call.kwargs["timeout"] == 90.0 for call in mock_client_cls.call_args_list)


@pytest.mark.asyncio
async def test_brainhex_contract_ready_does_not_retry_real_contract_mismatch(settings):
    settings.brainhex_health_retry_delay_sec = 0
    legacy = MagicMock(status_code=200)
    legacy.json.return_value = {
        "status": "ok",
        "media_pipeline_version": "legacy",
    }

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=legacy)
        mock_client_cls.return_value = mock_client

        ready = await brainhex_contract_ready(settings=settings)

    assert ready is False
    mock_client.get.assert_awaited_once()


@pytest.mark.asyncio
async def test_gerar_conteudo_brainhex_returns_none_without_api_url(settings, conteudo_estudado):
    settings.brainhex_api_url = None
    result = await gerar_conteudo_brainhex(
        settings=settings,
        perfil="mastermind",
        conteudo_estudado=conteudo_estudado,
    )
    assert result is None


@pytest.mark.asyncio
async def test_gerar_conteudo_brainhex_parses_api_response(settings, conteudo_estudado):
    fake_output = {
        "markdown": "# Arquitetura do Conceito\n\nConteúdo...",
        "audioScript": "[Tom: grave] Bem-vindo ao Tratado...",
        "slides": [
            {
                "titulo": "Engrenagens do Sistema",
                "topics": ["Consistência", "Disponibilidade"],
                "explanation": "Síntese Técnica: O teorema CAP...",
                "visualDescription": "Diagrama de três engrenagens interligadas.",
                "characterQuote": "Idris: 'A lógica revela padrões ocultos.'",
                "characterAction": "explaining",
                "imagePrompt": "Three gears representing CAP theorem, magical alchemy style",
                "sourceIds": [],
            }
        ],
        "confidence": 0.95,
    }

    mock_response = MagicMock()
    mock_response.json.return_value = fake_output
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await gerar_conteudo_brainhex(
            settings=settings,
            perfil="mastermind",
            conteudo_estudado=conteudo_estudado,
        )

    assert result is not None
    assert result["markdown"].startswith("# Arquitetura")
    assert "[Tom:" in result["audioScript"]
    assert len(result["slides"]) == 1
    assert result["slides"][0]["titulo"] == "Engrenagens do Sistema"
    assert result["confidence"] == 0.95


@pytest.mark.asyncio
async def test_gerar_conteudo_brainhex_returns_json_for_any_profile(settings, conteudo_estudado):
    fake_output = {"markdown": "x", "audioScript": "y", "slides": [], "confidence": 0.8}

    mock_response = MagicMock()
    mock_response.json.return_value = fake_output
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await gerar_conteudo_brainhex(
            settings=settings,
            perfil="unknown_profile",
            conteudo_estudado=conteudo_estudado,
        )

    assert result is not None


@pytest.mark.asyncio
async def test_disparar_brainhex_waits_for_completion(settings):
    settings.brainhex_api_wait_timeout_sec = 300
    contract = {
        "media_pipeline_version": MEDIA_PIPELINE_VERSION,
        "presentation_engine_version": PRESENTATION_ENGINE_VERSION,
        "presentation_design_version": PRESENTATION_DESIGN_VERSION,
        "content_enrichment_provider": CONTENT_ENRICHMENT_PROVIDER,
    }
    mock_health = MagicMock(status_code=200)
    mock_health.json.return_value = {"status": "ok", **contract}
    mock_response = MagicMock(status_code=200, text='{"status":"completed"}')
    mock_response.json.return_value = {"status": "completed", **contract}

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=mock_health)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        dispatched = await disparar_brainhex_async(
            settings=settings,
            perfil="seeker",
            fontes=[],
            content_blocks=[{"id": "bloco-01"}],
            personalizacao_id=257,
            aluno_id="aluno-1",
            classe_id=32,
            topico_id=121,
            ciclo_id="ciclo-257",
            source_hash="hash-257",
            generation_key="ciclo-257:hash-257",
            wait_for_completion=True,
        )

    assert dispatched is True
    assert mock_client.post.await_args.kwargs["json"]["wait_for_completion"] is True
    assert (
        mock_client.post.await_args.kwargs["json"]["generation_key"]
        == "ciclo-257:hash-257"
    )
    assert mock_client.post.await_args.kwargs["json"][
        "required_media_pipeline_version"
    ] == MEDIA_PIPELINE_VERSION
    assert mock_client.post.await_args.kwargs["json"][
        "required_presentation_engine_version"
    ] == PRESENTATION_ENGINE_VERSION
    assert mock_client.post.await_args.kwargs["json"][
        "required_presentation_design_version"
    ] == PRESENTATION_DESIGN_VERSION
    assert mock_client.post.await_args.kwargs["json"]["presentation_theme"][
        "style_name"
    ] == "Atlas das Descobertas"
    assert mock_client_cls.call_args_list[0].kwargs["timeout"] == 90.0
    configured_timeout = mock_client_cls.call_args.kwargs["timeout"]
    assert configured_timeout.read == 300
    assert configured_timeout.connect == 60


@pytest.mark.asyncio
async def test_disparar_brainhex_does_not_treat_legacy_202_as_completed(settings):
    contract = {
        "media_pipeline_version": MEDIA_PIPELINE_VERSION,
        "presentation_engine_version": PRESENTATION_ENGINE_VERSION,
        "presentation_design_version": PRESENTATION_DESIGN_VERSION,
        "content_enrichment_provider": CONTENT_ENRICHMENT_PROVIDER,
    }
    mock_health = MagicMock(status_code=200)
    mock_health.json.return_value = {"status": "ok", **contract}
    mock_response = MagicMock(status_code=202, text='{"status":"processing"}')
    mock_response.json.return_value = {"status": "processing", **contract}

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=mock_health)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        dispatched = await disparar_brainhex_async(
            settings=settings,
            perfil="seeker",
            fontes=[],
            content_blocks=[{"id": "bloco-01"}],
            personalizacao_id=257,
            ciclo_id="ciclo-257",
            source_hash="hash-257",
            generation_key="ciclo-257:hash-257",
            wait_for_completion=True,
        )

    assert dispatched is False


@pytest.mark.asyncio
async def test_disparar_brainhex_captures_real_error_in_error_sink(settings):
    # Reproduz o bug real: o target so via um RuntimeError generico
    # ("Microservico BrainHex nao concluiu a geracao.") mesmo quando o
    # microservico devolvia a causa real no corpo JSON (ex.: Gemini e OpenAI
    # falharam). error_sink deve carregar essa causa para o chamador.
    contract = {
        "media_pipeline_version": MEDIA_PIPELINE_VERSION,
        "presentation_engine_version": PRESENTATION_ENGINE_VERSION,
        "presentation_design_version": PRESENTATION_DESIGN_VERSION,
        "content_enrichment_provider": CONTENT_ENRICHMENT_PROVIDER,
    }
    mock_health = MagicMock(status_code=200)
    mock_health.json.return_value = {"status": "ok", **contract}
    error_body = (
        '{"status":"failed","personalizacao_id":3326,"error":'
        '"A geração falhou no Gemini e as tentativas obrigatórias pela '
        'OpenAI também falharam."}'
    )
    mock_response = MagicMock(status_code=500, text=error_body)
    mock_response.json.return_value = {
        "status": "failed",
        "personalizacao_id": 3326,
        "error": "A geração falhou no Gemini e as tentativas obrigatórias pela OpenAI também falharam.",
    }

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=mock_health)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        error_sink: list[str] = []
        dispatched = await disparar_brainhex_async(
            settings=settings,
            perfil="achiever",
            fontes=[],
            content_blocks=[{"id": "bloco-01"}],
            personalizacao_id=3326,
            ciclo_id="ciclo-3326",
            source_hash="hash-3326",
            generation_key="ciclo-3326:hash-3326",
            wait_for_completion=True,
            error_sink=error_sink,
        )

    assert dispatched is False
    assert error_sink == [
        "A geração falhou no Gemini e as tentativas obrigatórias pela OpenAI também falharam."
    ]


@pytest.mark.asyncio
async def test_disparar_brainhex_does_not_start_job_on_legacy_microservice(settings):
    mock_health = MagicMock(status_code=200)
    mock_health.json.return_value = {
        "status": "ok",
        "message": "TrailUp Alchemy Microservice is online!",
    }

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=mock_health)
        mock_client.post = AsyncMock()
        mock_client_cls.return_value = mock_client

        dispatched = await disparar_brainhex_async(
            settings=settings,
            perfil="seeker",
            fontes=[],
            content_blocks=[{"id": "bloco-01"}],
            personalizacao_id=257,
            ciclo_id="ciclo-257",
            source_hash="hash-257",
            generation_key="ciclo-257:hash-257",
            wait_for_completion=True,
        )

    assert dispatched is False
    mock_client.post.assert_not_awaited()


@pytest.mark.asyncio
async def test_disparar_brainhex_reuses_prechecked_contract(settings):
    contract = {
        "media_pipeline_version": MEDIA_PIPELINE_VERSION,
        "presentation_engine_version": PRESENTATION_ENGINE_VERSION,
        "presentation_design_version": PRESENTATION_DESIGN_VERSION,
        "content_enrichment_provider": CONTENT_ENRICHMENT_PROVIDER,
    }
    completed = MagicMock(status_code=200, text='{"status":"completed"}')
    completed.json.return_value = {"status": "completed", **contract}

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock()
        mock_client.post = AsyncMock(return_value=completed)
        mock_client_cls.return_value = mock_client

        dispatched = await disparar_brainhex_async(
            settings=settings,
            perfil="seeker",
            fontes=[],
            content_blocks=[{"id": "bloco-01"}],
            personalizacao_id=257,
            ciclo_id="ciclo-257",
            source_hash="hash-257",
            generation_key="ciclo-257:hash-257",
            wait_for_completion=True,
            contract_prechecked=True,
        )

    assert dispatched is True
    mock_client.get.assert_not_awaited()
    mock_client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_gerar_imagem_slide_returns_none_without_api_key(settings):
    settings.gemini_api_key = None
    result = await gerar_imagem_slide(settings=settings, prompt="test prompt")
    assert result is None


@pytest.mark.asyncio
async def test_gerar_imagem_slide_returns_base64_on_success(settings):
    fake_base64 = "aGVsbG8="
    fake_body = {
        "candidates": [
            {"content": {"parts": [{"inlineData": {"data": fake_base64, "mimeType": "image/png"}}]}}
        ]
    }
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = fake_body
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await gerar_imagem_slide(settings=settings, prompt="magical concept art")

    assert result == fake_base64


@pytest.mark.asyncio
async def test_gerar_imagem_slide_returns_none_on_error(settings):
    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=Exception("network error"))
        mock_client_cls.return_value = mock_client

        result = await gerar_imagem_slide(settings=settings, prompt="test")

    assert result is None


@pytest.mark.asyncio
async def test_disparar_brainhex_propagates_guidance_prompt(settings):
    contract = {
        "media_pipeline_version": MEDIA_PIPELINE_VERSION,
        "presentation_engine_version": PRESENTATION_ENGINE_VERSION,
        "presentation_design_version": PRESENTATION_DESIGN_VERSION,
        "content_enrichment_provider": CONTENT_ENRICHMENT_PROVIDER,
    }
    mock_health = MagicMock(status_code=200)
    mock_health.json.return_value = {"status": "ok", **contract}
    mock_response = MagicMock(status_code=202, text='{"status":"accepted"}')
    mock_response.json.return_value = {"status": "accepted", **contract}

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=mock_health)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        await disparar_brainhex_async(
            settings=settings,
            perfil="seeker",
            fontes=[],
            content_blocks=[{"id": "bloco-01"}],
            personalizacao_id=257,
            ciclo_id="ciclo-257",
            source_hash="hash-257",
            generation_key="ciclo-257:hash-257",
            guidance_prompt="  foque em exemplos praticos de docas do porto  ",
        )

    assert (
        mock_client.post.await_args.kwargs["json"]["guidance_prompt"]
        == "foque em exemplos praticos de docas do porto"
    )


@pytest.mark.asyncio
async def test_disparar_brainhex_omits_empty_guidance_prompt(settings):
    contract = {
        "media_pipeline_version": MEDIA_PIPELINE_VERSION,
        "presentation_engine_version": PRESENTATION_ENGINE_VERSION,
        "presentation_design_version": PRESENTATION_DESIGN_VERSION,
        "content_enrichment_provider": CONTENT_ENRICHMENT_PROVIDER,
    }
    mock_health = MagicMock(status_code=200)
    mock_health.json.return_value = {"status": "ok", **contract}
    mock_response = MagicMock(status_code=202, text='{"status":"accepted"}')
    mock_response.json.return_value = {"status": "accepted", **contract}

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=mock_health)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        await disparar_brainhex_async(
            settings=settings,
            perfil="seeker",
            fontes=[],
            content_blocks=[{"id": "bloco-01"}],
            personalizacao_id=257,
            ciclo_id="ciclo-257",
            source_hash="hash-257",
            generation_key="ciclo-257:hash-257",
        )

    assert mock_client.post.await_args.kwargs["json"]["guidance_prompt"] is None


@pytest.mark.asyncio
async def test_regenerar_capitulo_brainhex_returns_none_without_url(settings):
    settings.brainhex_api_url = None
    result = await regenerar_capitulo_brainhex(
        settings=settings,
        chapter={"markdown": "m", "audioScript": "a"},
        improvement_prompt="mais exemplos",
        profile="seeker",
    )
    assert result is None


@pytest.mark.asyncio
async def test_regenerar_capitulo_brainhex_posts_expected_payload(settings):
    fake_output = {
        "markdown": "novo markdown",
        "audioScript": "novo audio script",
        "audioWavBase64": None,
        "audioMp3Base64": "base64==",
    }
    mock_response = MagicMock(status_code=200)
    mock_response.json.return_value = fake_output

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await regenerar_capitulo_brainhex(
            settings=settings,
            chapter={"markdown": "m", "audioScript": "a"},
            improvement_prompt="mais exemplos praticos",
            profile="Seeker",
            expansion_prompt="aprofunde em docas",
        )

    assert result == fake_output
    call = mock_client.post.await_args
    assert call.args[0] == "http://brainhex.local/api/v1/regenerate/chapter"
    assert call.kwargs["json"] == {
        "chapter": {"markdown": "m", "audioScript": "a"},
        "improvement_prompt": "mais exemplos praticos",
        "profile": "seeker",
        "expansion_prompt": "aprofunde em docas",
    }


@pytest.mark.asyncio
async def test_regenerar_capitulo_brainhex_returns_none_and_fills_error_sink_on_failure(settings):
    mock_response = MagicMock(status_code=500, text="Falha ao regenerar capítulo")

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        error_sink: list[str] = []
        result = await regenerar_capitulo_brainhex(
            settings=settings,
            chapter={"markdown": "m", "audioScript": "a"},
            improvement_prompt="mais exemplos",
            profile="seeker",
            error_sink=error_sink,
        )

    assert result is None
    assert error_sink == ["Falha ao regenerar capítulo"]


@pytest.mark.asyncio
async def test_regenerar_slide_brainhex_posts_expected_payload(settings):
    fake_output = {"slide": {"title": "novo titulo"}, "imageBase64": "base64=="}
    mock_response = MagicMock(status_code=200)
    mock_response.json.return_value = fake_output

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await regenerar_slide_brainhex(
            settings=settings,
            slide={"title": "titulo antigo"},
            improvement_prompt="deixe mais visual",
            profile="mastermind",
        )

    assert result == fake_output
    call = mock_client.post.await_args
    assert call.args[0] == "http://brainhex.local/api/v1/regenerate/slide"
    assert call.kwargs["json"]["slide"] == {"title": "titulo antigo"}
    assert call.kwargs["json"]["profile"] == "mastermind"


@pytest.mark.asyncio
async def test_regenerar_documento_brainhex_posts_expected_payload(settings):
    fake_output = {"markdown": "doc novo", "audioScript": "script novo"}
    mock_response = MagicMock(status_code=200)
    mock_response.json.return_value = fake_output

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await regenerar_documento_brainhex(
            settings=settings,
            markdown="doc antigo",
            improvement_prompt="resuma mais",
            profile="achiever",
        )

    assert result == fake_output
    call = mock_client.post.await_args
    assert call.args[0] == "http://brainhex.local/api/v1/regenerate/document"
    assert call.kwargs["json"]["markdown"] == "doc antigo"


@pytest.mark.asyncio
async def test_gerar_capitulo_bloco_brainhex_chama_endpoint_correto(settings):
    fake_output = {
        "success": True,
        "chapters": [{"blockId": "bloco-01", "markdown": "md", "audioScript": "audio", "slides": []}],
    }
    mock_response = MagicMock(status_code=200)
    mock_response.json.return_value = fake_output

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await gerar_capitulo_bloco_brainhex(
            settings=settings,
            content_blocks=[{"id": "bloco-01"}],
            profile="mastermind",
        )

    assert result["chapters"][0]["blockId"] == "bloco-01"
    call = mock_client.post.await_args
    assert call.args[0] == "http://brainhex.local/api/v1/generate/block"
    assert call.kwargs["json"]["contentBlocks"] == [{"id": "bloco-01"}]
    assert call.kwargs["json"]["profile"] == "mastermind"


@pytest.mark.asyncio
async def test_gerar_audio_parte_brainhex_chama_endpoint_correto(settings):
    fake_output = {"success": True, "url": "https://fake/audio.mp3", "storagePath": "path.mp3", "mimeType": "audio/mpeg"}
    mock_response = MagicMock(status_code=200)
    mock_response.json.return_value = fake_output

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await gerar_audio_parte_brainhex(
            settings=settings,
            audio_script="roteiro",
            profile="mastermind",
            bucket="conteudo_aluno",
            storage_path="brainhex/mastermind/topico-1/audio/material-1-parte-01",
        )

    assert result["url"] == "https://fake/audio.mp3"
    call = mock_client.post.await_args
    assert call.args[0] == "http://brainhex.local/api/v1/generate/part-audio"


@pytest.mark.asyncio
async def test_gerar_apresentacao_parte_brainhex_chama_endpoint_correto(settings):
    fake_output = {"success": True, "url": "https://fake/apresentacao.html"}
    mock_response = MagicMock(status_code=200)
    mock_response.json.return_value = fake_output

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await gerar_apresentacao_parte_brainhex(
            settings=settings,
            markdown="## Bloco\n\nConteúdo",
            topic="Bloco 1",
            profile="mastermind",
            bucket="conteudo_aluno",
            storage_path="brainhex/mastermind/topico-1/apresentacao/material-1-parte-01.html",
        )

    assert result["url"] == "https://fake/apresentacao.html"
    call = mock_client.post.await_args
    assert call.args[0] == "http://brainhex.local/api/v1/generate/part-presentation"
