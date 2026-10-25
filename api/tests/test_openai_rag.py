import json
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


# --- #67: observabilidade da busca (sem texto do aluno) ----------------------------------------

from app.services.rag_observabilidade import coletar_buscas_rag  # noqa: E402

_TEXTO_DO_ALUNO = "meu nome e Ana e nao entendi fotossintese"
_TRECHO_RECUPERADO = "A clorofila absorve luz vermelha e azul"


def _resposta_com_busca(output_text='{"reply":"confirmado"}'):
    return SimpleNamespace(
        output_text=output_text,
        output=[
            SimpleNamespace(
                type="file_search_call",
                queries=[_TEXTO_DO_ALUNO, "fotossintese clorofila"],
                results=[
                    SimpleNamespace(file_id="file_a", score=0.91234, filename="bio.pdf", text=_TRECHO_RECUPERADO),
                    {"file_id": "file_b", "score": 0.5, "filename": "quim.pdf", "text": "outro trecho"},
                ],
            ),
            SimpleNamespace(type="message", content=[]),
        ],
    )


async def _invocar(service):
    return await service.invoke_structured(
        prompt_name="mentor_personalizacao_chat.txt",
        payload={"mensagem": _TEXTO_DO_ALUNO},
        schema=_Answer,
    )


@pytest.mark.asyncio
async def test_busca_registra_arquivos_scores_e_latencia_sem_texto():
    service = OpenAIRagService(_settings(), client=_FakeClient(_resposta_com_busca()))

    with coletar_buscas_rag() as buscas:
        await _invocar(service)

    assert len(buscas) == 1
    busca = buscas[0]
    assert busca["provider"] == "openai"
    assert busca["status"] == "ok"
    assert busca["prompt"] == "mentor_personalizacao_chat.txt"
    assert busca["consultas"] == 2
    assert busca["resultados"] == [{"file_id": "file_a", "score": 0.9123}, {"file_id": "file_b", "score": 0.5}]
    assert busca["n_resultados"] == 2 and busca["com_resultado"] is True
    assert busca["score_max"] == 0.9123
    assert busca["score_medio"] == 0.7062
    assert busca["latencia_ms"] >= 0
    assert busca["top_k"] is None
    # nada de texto: nem do aluno, nem da consulta gerada, nem do trecho, nem nome de arquivo
    serializado = json.dumps(buscas, ensure_ascii=False).lower()
    for proibido in ("ana", "fotossintese", "clorofila", "bio.pdf", "outro trecho", "vs_test"):
        assert proibido not in serializado


@pytest.mark.asyncio
async def test_top_k_configurado_vai_para_a_ferramenta_e_para_o_log():
    client = _FakeClient(_resposta_com_busca())
    service = OpenAIRagService(_settings(openai_rag_top_k=4), client=client)

    with coletar_buscas_rag() as buscas:
        await _invocar(service)

    assert client.responses.calls[0]["tools"] == [
        {"type": "file_search", "vector_store_ids": ["vs_test"], "max_num_results": 4}
    ]
    assert buscas[0]["top_k"] == 4


@pytest.mark.asyncio
async def test_busca_sem_resultado_marca_cobertura_falsa():
    resposta = SimpleNamespace(
        output_text='{"reply":"ok"}',
        output=[SimpleNamespace(type="file_search_call", queries=["x"], results=None)],
    )
    service = OpenAIRagService(_settings(), client=_FakeClient(resposta))

    with coletar_buscas_rag() as buscas:
        await _invocar(service)

    assert buscas[0]["com_resultado"] is False
    assert buscas[0]["n_resultados"] == 0
    assert buscas[0]["score_max"] is None and buscas[0]["score_medio"] is None


@pytest.mark.asyncio
async def test_falha_remota_e_registrada_so_com_o_tipo_do_erro():
    class BrokenResponses:
        async def create(self, **kwargs):
            raise RuntimeError("secret-key-and-private-document")

    service = OpenAIRagService(_settings(), client=SimpleNamespace(responses=BrokenResponses()))

    with coletar_buscas_rag() as buscas, pytest.raises(StructuredOutputError):
        await _invocar(service)

    assert buscas[0]["status"] == "erro"
    assert buscas[0]["erro"] == "RuntimeError"
    assert buscas[0]["n_resultados"] == 0
    assert "secret" not in json.dumps(buscas)


@pytest.mark.asyncio
async def test_resposta_fora_do_schema_ainda_registra_a_busca():
    service = OpenAIRagService(_settings(), client=_FakeClient(_resposta_com_busca(output_text="nao e json")))

    with coletar_buscas_rag() as buscas, pytest.raises(StructuredOutputError):
        await _invocar(service)

    assert buscas[0]["status"] == "ok"
    assert buscas[0]["n_resultados"] == 2


@pytest.mark.asyncio
async def test_sem_coletor_aberto_a_busca_nao_quebra():
    service = OpenAIRagService(_settings(), client=_FakeClient(_resposta_com_busca()))
    assert (await _invocar(service)).reply == "confirmado"


@pytest.mark.asyncio
async def test_rota_de_menor_com_rag_vai_so_para_a_openai_sem_guardar(monkeypatch):
    """#195: com RAG, menor continua só na OpenAI, `store=False`, e nunca no Gemini."""
    from app.services.llm import JsonLLMService
    from app.services.roteamento_ia import ROTA_MENOR, usar_rota

    client = _FakeClient(_resposta_com_busca())
    monkeypatch.setattr(OpenAIRagService, "_get_client", lambda self: client)

    def _gemini_proibido(*args, **kwargs):
        raise AssertionError("Gemini chamado na rota de menor")

    monkeypatch.setattr(JsonLLMService, "_ainvoke_gemini_with_rotation", _gemini_proibido)
    monkeypatch.setattr(JsonLLMService, "_get_client", _gemini_proibido)

    llm = JsonLLMService(_settings(llm_provider="gemini"))
    with usar_rota(ROTA_MENOR), coletar_buscas_rag() as buscas:
        resultado = await llm.ainvoke_structured(
            prompt_name="mentor_personalizacao_chat.txt",
            payload={"mensagem": "pergunta"},
            schema=_Answer,
            use_rag=True,
        )

    assert resultado.reply == "confirmado"
    assert client.responses.calls[0]["store"] is False
    assert buscas[0]["provider"] == "openai"
