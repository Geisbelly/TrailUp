import json
from types import SimpleNamespace

import pytest

from app.core.settings import Settings
from app.services.llm import JsonLLMService, StructuredOutputError
from app.services.openai_rag import OpenAIRagError, OpenAIRagService, _strict_json_schema
from tests.conftest import FakeSession


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

class _FakeSearch:
    def __init__(self, response):
        self.response = response
        self.calls = []

    async def __call__(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


class _FakeVectorStores:
    def __init__(self, response):
        self.search = _FakeSearch(response)


class _FakeSearchClient:
    def __init__(self, response):
        self.vector_stores = _FakeVectorStores(response)



@pytest.mark.asyncio
async def test_busca_evidencia_restringe_corpus_e_nao_envia_dados_individuais(monkeypatch):
    atributos_validos = {
        "scope": "publico",
        "corpus": "regras-derivadas",
        "rd": "RD-04",
        "fontes": "DAT-21, DAT-36",
        "confianca": "alta",
    }
    resposta = SimpleNamespace(
        data=[
            SimpleNamespace(file_id="file-curado", attributes=dict(atributos_validos)),
            SimpleNamespace(
                file_id="nao-catalogado",
                attributes={
                    **atributos_validos,
                    "scope": "turma",
                    "rd": "RD-03",
                    "fontes": "DAT-21",
                },
            ),
            SimpleNamespace(
                file_id="nao-catalogado",
                attributes={
                    **atributos_validos,
                    "corpus": "pdf-bruto",
                    "rd": "RD-08",
                    "fontes": "DAT-21",
                },
            ),
            SimpleNamespace(
                file_id="nao-catalogado",
                attributes={**atributos_validos, "rd": "RD-99", "fontes": "DAT-21"},
            ),
        ]
    )
    client = _FakeSearchClient(resposta)

    async def listar_do_corpus(_repo, *, vector_store_id, corpus):
        assert vector_store_id == "vs_test"
        assert corpus == "regras-derivadas"
        return [
            {
                "openai_file_id": "file-curado",
                "status": "completed",
                "attributes": atributos_validos,
            }
        ]

    monkeypatch.setattr(
        "app.services.openai_rag.RagOpenAIFilesRepository.listar_do_corpus", listar_do_corpus
    )
    service = OpenAIRagService(_settings(), client=client)

    citacoes = await service.buscar_evidencias_pedagogicas(
        session=object(), fontes=["DAT-21", "DAT-36", "nome do aluno"]
    )

    assert citacoes == [
        {"regra": "RD-04", "fontes": ["DAT-21", "DAT-36"], "confianca": "alta"}
    ]
    chamada = client.vector_stores.search.calls[0]
    assert chamada["filters"] == {
        "type": "and",
        "filters": [
            {"type": "eq", "key": "scope", "value": "publico"},
            {"type": "eq", "key": "corpus", "value": "regras-derivadas"},
        ],
    }
    assert "nome do aluno" not in chamada["query"]
    assert chamada["query"] == "Evidências pedagógicas curadas e limitações para DAT-21, DAT-36"


@pytest.mark.asyncio
async def test_busca_evidencia_sem_fontes_nao_chama_o_vector_store():
    client = _FakeSearchClient(SimpleNamespace(data=[]))
    service = OpenAIRagService(_settings(), client=client)

    assert await service.buscar_evidencias_pedagogicas(
        session=object(), fontes=["nome do aluno"]
    ) == []
    assert client.vector_stores.search.calls == []


@pytest.mark.asyncio
async def test_busca_evidencia_sem_catalogo_curado_nao_consulta_vector_store(monkeypatch):
    client = _FakeSearchClient(SimpleNamespace(data=[]))
    service = OpenAIRagService(_settings(), client=client)

    async def sem_arquivos(_repo, **_kwargs):
        return []

    monkeypatch.setattr(
        "app.services.openai_rag.RagOpenAIFilesRepository.listar_do_corpus", sem_arquivos
    )

    assert await service.buscar_evidencias_pedagogicas(
        session=object(), fontes=["DAT-21"]
    ) == []
    assert client.vector_stores.search.calls == []



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
        "openai_rag_api_key": "test-key",
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
    assert call["tools"] == [
        {
            "type": "file_search",
            "vector_store_ids": ["vs_test"],
            "filters": {"type": "eq", "key": "scope", "value": "publico"},
        }
    ]
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
        {
            "type": "file_search",
            "vector_store_ids": ["vs_test"],
            "filters": {"type": "eq", "key": "scope", "value": "publico"},
            "max_num_results": 4,
        }
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
async def test_rota_de_menor_com_rag_nao_faz_a_busca(monkeypatch):
    """#195: a IA e so para maiores de 18. Com RAG, menor nao faz a busca nem
    chama modelo nenhum."""
    from app.services.llm import JsonLLMService, MenorSemOpenAIError
    from app.services.roteamento_ia import ROTA_MENOR, usar_rota

    client = _FakeClient(_resposta_com_busca())
    monkeypatch.setattr(OpenAIRagService, "_get_client", lambda self: client)

    def _gemini_proibido(*args, **kwargs):
        raise AssertionError("Gemini chamado na rota de menor")

    monkeypatch.setattr(JsonLLMService, "_ainvoke_gemini_with_rotation", _gemini_proibido)
    monkeypatch.setattr(JsonLLMService, "_get_client", _gemini_proibido)

    llm = JsonLLMService(_settings(llm_provider="gemini"))
    with usar_rota(ROTA_MENOR), coletar_buscas_rag() as buscas:
        with pytest.raises(MenorSemOpenAIError):
            await llm.ainvoke_structured(
                prompt_name="mentor_personalizacao_chat.txt",
                payload={"mensagem": "pergunta"},
                schema=_Answer,
                use_rag=True,
            )

    assert client.responses.calls == []
    assert buscas == []


class _FakeArquivos:
    def __init__(self, *, falha_ao_anexar: bool = False, status: str = "completed") -> None:
        self.falha_ao_anexar = falha_ao_anexar
        self.status = status
        self.enviados: list[str] = []
        self.anexados: list[dict] = []
        self.removidos: list[str] = []
        self.files = self
        self.vector_stores = SimpleNamespace(
            files=SimpleNamespace(create_and_poll=self._anexar, delete=self._desanexar)
        )

    async def create(self, *, file, purpose):
        self.enviados.append(file[0])
        return SimpleNamespace(id="file_1")

    async def delete(self, file_id):
        self.removidos.append(f"arquivo:{file_id}")

    async def _anexar(self, **kwargs):
        if self.falha_ao_anexar:
            raise RuntimeError("sem credito")
        self.anexados.append(kwargs)
        return SimpleNamespace(id="vsf_1", status=self.status, last_error=None)

    async def _desanexar(self, file_id, *, vector_store_id):
        self.removidos.append(f"store:{vector_store_id}:{file_id}")


class _FakeCatalogo:
    existente: dict | None = None
    falha: bool = False
    registros: list[dict] = []

    def __init__(self, session) -> None:
        self.session = session

    async def buscar_concluido(self, *, vector_store_id, source_hash):
        return type(self).existente

    async def registrar(self, **kwargs):
        if type(self).falha:
            raise RuntimeError("banco fora")
        type(self).registros.append(kwargs)


@pytest.fixture
def catalogo(monkeypatch):
    class Catalogo(_FakeCatalogo):
        existente = None
        falha = False
        registros: list[dict] = []

    monkeypatch.setattr("app.services.openai_rag.RagOpenAIFilesRepository", Catalogo)
    return Catalogo


async def _enviar(service, **kwargs):
    return await service.upload_public_file(
        session=FakeSession(),
        filename="artigo.pdf",
        content=b"conteudo",
        mime_type="application/pdf",
        **kwargs,
    )


@pytest.mark.asyncio
async def test_envio_marca_o_arquivo_como_publico_e_registra_no_catalogo(catalogo):
    remoto = _FakeArquivos()
    resultado = await _enviar(OpenAIRagService(_settings(), client=remoto), fonte_id=7, attributes={"ano": 2024})

    assert remoto.anexados[0]["attributes"] == {"ano": 2024, "scope": "publico"}
    registro = catalogo.registros[0]
    assert registro["vector_store_id"] == "vs_test"
    assert registro["openai_file_id"] == "file_1"
    assert registro["scope"] == "publico"
    assert registro["fonte_id"] == 7
    assert registro["status"] == "completed"
    assert registro["source_hash"] == resultado["source_hash"]
    assert resultado["reaproveitado"] is False


@pytest.mark.asyncio
async def test_envio_recusa_escopo_que_nao_seja_publico(catalogo):
    remoto = _FakeArquivos()
    with pytest.raises(OpenAIRagError):
        await _enviar(OpenAIRagService(_settings(), client=remoto), attributes={"scope": "turma"})
    assert remoto.enviados == []
    assert catalogo.registros == []


@pytest.mark.asyncio
async def test_conteudo_ja_indexado_nao_e_reenviado(catalogo):
    catalogo.existente = {
        "openai_file_id": "file_antigo",
        "openai_vector_store_file_id": "vsf_antigo",
        "status": "completed",
    }
    remoto = _FakeArquivos()
    resultado = await _enviar(OpenAIRagService(_settings(), client=remoto))

    assert resultado["openai_file_id"] == "file_antigo"
    assert resultado["reaproveitado"] is True
    assert remoto.enviados == []
    assert catalogo.registros == []


@pytest.mark.asyncio
async def test_falha_ao_registrar_desfaz_o_envio(catalogo):
    catalogo.falha = True
    remoto = _FakeArquivos()
    with pytest.raises(OpenAIRagError):
        await _enviar(OpenAIRagService(_settings(), client=remoto))
    assert remoto.removidos == ["store:vs_test:file_1", "arquivo:file_1"]


@pytest.mark.asyncio
async def test_status_de_indexacao_com_falha_fica_no_catalogo(catalogo):
    remoto = _FakeArquivos(status="failed")
    resultado = await _enviar(OpenAIRagService(_settings(), client=remoto))
    assert resultado["status"] == "failed"
    assert catalogo.registros[0]["status"] == "failed"


def test_rag_usa_so_a_propria_chave():
    service = OpenAIRagService(_settings(openai_rag_api_key="chave-rag", openai_api_key="chave-comum"))
    assert service._get_client().api_key == "chave-rag"


def test_chave_comum_nao_liga_o_rag():
    service = OpenAIRagService(_settings(openai_rag_api_key="", openai_api_key="chave-comum"))
    assert service.is_configured() is False
    with pytest.raises(OpenAIRagError):
        service._get_client()


def test_chave_do_rag_nao_vira_a_chave_do_uso_comum():
    settings = _settings(openai_rag_api_key="chave-rag", openai_api_key="")
    assert not settings.openai_api_key
    assert JsonLLMService(settings)._get_client("modelo", provider="openai") is None
