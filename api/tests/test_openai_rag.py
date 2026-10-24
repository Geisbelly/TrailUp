from types import SimpleNamespace

import pytest

from app.core.settings import Settings
from app.services.llm import StructuredOutputError
from app.services.openai_rag import OpenAIRagService, _strict_json_schema


class _FakeResponses:
    def __init__(self, response):
        self.response = response
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


class _FakeClient:
    def __init__(self, response):
        self.responses = _FakeResponses(response)


class _Answer:
    @classmethod
    def model_json_schema(cls):
        return {
            "type": "object",
            "properties": {"reply": {"type": "string"}},
            "required": ["reply"],
            "additionalProperties": False,
        }

    @classmethod
    def model_validate(cls, value):
        return SimpleNamespace(**value)


def _settings(**kwargs) -> Settings:
    values = {
        "app_env": "test",
        "supabase_jwt_secret": "test-secret",
        "admin_panel_password": "secret-admin",
        "openai_api_key": "test-key",
        "openai_rag_enabled": True,
        "openai_rag_vector_store_id": "vs_test",
    }
    values.update(kwargs)
    return Settings(**values)


@pytest.mark.asyncio
async def test_invoke_structured_uses_file_search_without_response_storage():
    response = SimpleNamespace(output_text='{"reply":"confirmado"}')
    client = _FakeClient(response)
    service = OpenAIRagService(_settings(), client=client)

    result = await service.invoke_structured(
        prompt_name="mentor_personalizacao_chat.txt",
        payload={"mensagem": "pergunta"},
        schema=_Answer,
    )

    assert result.reply == "confirmado"
    call = client.responses.calls[0]
    assert call["store"] is False
    assert call["tools"] == [{"type": "file_search", "vector_store_ids": ["vs_test"]}]
    assert call["include"] == ["file_search_call.results"]


@pytest.mark.asyncio
async def test_invoke_structured_does_not_leak_remote_error_details():
    class BrokenResponses:
        async def create(self, **kwargs):
            raise RuntimeError("secret-key-and-private-document")

    service = OpenAIRagService(_settings(), client=SimpleNamespace(responses=BrokenResponses()))

    with pytest.raises(StructuredOutputError, match="RuntimeError") as exc_info:
        await service.invoke_structured(
            prompt_name="mentor_personalizacao_chat.txt",
            payload={"mensagem": "pergunta"},
            schema=_Answer,
        )

    assert "secret-key" not in str(exc_info.value)
    assert "private-document" not in str(exc_info.value)


@pytest.mark.asyncio
async def test_rag_requires_public_store_configuration():
    service = OpenAIRagService(
        _settings(openai_rag_enabled=False),
    )

    assert not service.is_configured()

    with pytest.raises(StructuredOutputError, match="nao esta configurado"):
        await service.invoke_structured(
            prompt_name="mentor_personalizacao_chat.txt",
            payload={"mensagem": "pergunta"},
            schema=_Answer,
        )


def test_strict_json_schema_closes_objects_and_requires_properties():
    result = _strict_json_schema(
        {
            "type": "object",
            "properties": {
                "outer": {
                    "type": "object",
                    "properties": {"value": {"type": "string"}},
                }
            },
        }
    )

    assert result["additionalProperties"] is False
    assert result["required"] == ["outer"]
    assert result["properties"]["outer"]["additionalProperties"] is False
    assert result["properties"]["outer"]["required"] == ["value"]
