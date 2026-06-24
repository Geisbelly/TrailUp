import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import json

# Imports da função
from app.services.media_agents import gerar_conteudo_brainhex, gerar_imagem_slide, _BRAINHEX_GUIDE_CONFIG
from app.core.settings import Settings


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
                "characterQuote": "Atena: 'A lógica revela padrões ocultos.'",
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
