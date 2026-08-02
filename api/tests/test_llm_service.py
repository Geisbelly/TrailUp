from app.core.settings import Settings
from app.services.llm import JsonLLMService


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
