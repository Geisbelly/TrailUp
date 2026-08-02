import asyncio

import pytest

from app.core.settings import Settings
from app.services import llm as llm_module
from app.services.llm import JsonLLMService, reset_gemini_llm_circuit


@pytest.fixture(autouse=True)
def _reset_gemini_circuit():
    reset_gemini_llm_circuit()
    yield
    reset_gemini_llm_circuit()


class _FakeMessage:
    def __init__(self, content: str) -> None:
        self.content = content


class _FakeGeminiClient:
    def __init__(self, respond) -> None:
        self._respond = respond

    async def ainvoke(self, _messages):
        result = self._respond()
        if isinstance(result, Exception):
            raise result
        return _FakeMessage(result)


def _settings(**overrides: object) -> Settings:
    base = dict(
        supabase_jwt_secret="test-secret",
        admin_panel_password="secret-admin",
    )
    base.update(overrides)
    return Settings(**base)


def test_llm_provider_defaults_to_gemini() -> None:
    """Gemini e gratuito (varias chaves com rotacao) e e o provedor principal
    em todo o resto do sistema. Reverter esse default pra "openai" faz o
    supervisor do LangGraph, gerar_cards_direto e generate_plano_personalizacao
    (que nao fixam provider= explicitamente) tentarem direto uma conta OpenAI
    que pode estar sem credito, sem nem tentar o Gemini primeiro."""
    assert _settings().llm_provider == "gemini"


def test_get_client_uses_gemini_by_default_when_only_gemini_key_is_configured() -> None:
    settings = _settings(gemini_api_key="gemini-secret", openai_api_key="")
    service = JsonLLMService(settings)

    client = service._get_client(settings.active_model_default)

    assert client is not None


def test_gemini_model_defaults_are_not_the_retired_1x_models() -> None:
    """gemini-1.5-pro/gemini-1.5-flash foram aposentados e retornam 401
    UNAUTHENTICATED via chave de API simples (exigem OAuth) - reproduzido em
    producao assim que llm_provider passou a defaultar pra "gemini" (o
    supervisor do LangGraph e gerar_cards_direto usam active_model_supervisor/
    active_model_default quando nao fixam um model= proprio)."""
    settings = _settings()
    assert settings.gemini_model_supervisor == "gemini-3.6-flash"
    assert settings.gemini_model_default == "gemini-3.6-flash"
    assert settings.active_model_supervisor == "gemini-3.6-flash"
    assert settings.active_model_default == "gemini-3.6-flash"


def test_ainvoke_json_gemini_parses_multiple_keys_instead_of_passing_the_raw_string(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reproduz o bug real: GEMINI_API_KEY com 4 chaves separadas por ';'
    (mesmo formato de content_enrichment.py) sendo passada INTEIRA como uma
    unica chave pro ChatGoogleGenerativeAI, gerando 401 UNAUTHENTICATED
    (ACCESS_TOKEN_TYPE_UNSUPPORTED) mesmo com chaves validas configuradas."""
    captured: dict[str, list[str]] = {"keys_used": []}

    def factory(*, model: str, temperature: float, google_api_key: str):
        captured["keys_used"].append(google_api_key)
        return _FakeGeminiClient(lambda: '{"cards": [1]}')

    monkeypatch.setattr(llm_module, "ChatGoogleGenerativeAI", factory)
    monkeypatch.setattr(llm_module, "load_prompt", lambda _name: "instrucoes")

    settings = _settings(gemini_api_key="key-1;key-2;key-3;key-4", openai_api_key="")
    service = JsonLLMService(settings)

    result = asyncio.run(
        service.ainvoke_json(prompt_name="gerador_conteudo.txt", payload={})
    )

    assert result == {"cards": [1]}
    assert captured["keys_used"] == ["key-1"]


def test_ainvoke_json_gemini_rotates_to_next_key_when_one_exhausts_quota(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, list[str]] = {"keys_used": []}

    def factory(*, model: str, temperature: float, google_api_key: str):
        captured["keys_used"].append(google_api_key)
        if google_api_key == "key-1":
            return _FakeGeminiClient(
                lambda: Exception("429 RESOURCE_EXHAUSTED: quota exceeded")
            )
        return _FakeGeminiClient(lambda: '{"cards": [1]}')

    monkeypatch.setattr(llm_module, "ChatGoogleGenerativeAI", factory)
    monkeypatch.setattr(llm_module, "load_prompt", lambda _name: "instrucoes")

    settings = _settings(gemini_api_key="key-1;key-2", openai_api_key="")
    service = JsonLLMService(settings)

    result = asyncio.run(
        service.ainvoke_json(prompt_name="gerador_conteudo.txt", payload={})
    )

    assert result == {"cards": [1]}
    assert captured["keys_used"] == ["key-1", "key-2"]


def test_ainvoke_json_gemini_falls_back_to_next_model_when_current_is_retired(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reproduz o 404 real de gemini-2.5-flash-lite ("no longer available to
    new users"): o modelo indisponivel deve pular pro proximo candidato da
    cadeia (gemini_text_fallback_models), nao abortar a chamada inteira."""
    captured: dict[str, list[str]] = {"models_used": []}

    def factory(*, model: str, temperature: float, google_api_key: str):
        captured["models_used"].append(model)
        if model == "gemini-3.6-flash":
            return _FakeGeminiClient(
                lambda: Exception(
                    "404 NOT_FOUND. This model is no longer available to new users."
                )
            )
        return _FakeGeminiClient(lambda: '{"cards": [1]}')

    monkeypatch.setattr(llm_module, "ChatGoogleGenerativeAI", factory)
    monkeypatch.setattr(llm_module, "load_prompt", lambda _name: "instrucoes")

    settings = _settings(
        gemini_api_key="key-1",
        openai_api_key="",
        gemini_text_fallback_models="gemini-3.1-flash-lite",
    )
    service = JsonLLMService(settings)

    result = asyncio.run(
        service.ainvoke_json(prompt_name="gerador_conteudo.txt", payload={})
    )

    assert result == {"cards": [1]}
    assert captured["models_used"] == ["gemini-3.6-flash", "gemini-3.1-flash-lite"]


def test_extract_json_handles_content_as_list_of_parts() -> None:
    """langchain_google_genai as vezes devolve response.content como uma
    lista de partes (str ou dict com chave "text") em vez de string simples
    - reproduzido em producao: 'list' object has no attribute 'strip'."""
    from app.services.llm import extract_json

    assert extract_json('{"cards": [1]}') == {"cards": [1]}
    assert extract_json(["{\"cards\": ", "[1]}"]) == {"cards": [1]}
    assert extract_json([{"text": '{"cards": [1]}'}]) == {"cards": [1]}


def test_ainvoke_json_gemini_handles_response_content_as_list_of_parts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def factory(*, model: str, temperature: float, google_api_key: str):
        return _FakeGeminiClient(lambda: [{"text": '{"cards": [1]}'}])

    monkeypatch.setattr(llm_module, "ChatGoogleGenerativeAI", factory)
    monkeypatch.setattr(llm_module, "load_prompt", lambda _name: "instrucoes")

    settings = _settings(gemini_api_key="key-1", openai_api_key="")
    service = JsonLLMService(settings)

    result = asyncio.run(
        service.ainvoke_json(prompt_name="gerador_conteudo.txt", payload={})
    )

    assert result == {"cards": [1]}
