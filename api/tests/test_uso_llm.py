from types import SimpleNamespace

from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, LLMResult

from app.services import uso_llm


def _capturar(monkeypatch) -> list[dict]:
    linhas: list[dict] = []
    monkeypatch.setattr(uso_llm, "registrar", lambda **kw: linhas.append(kw))
    return linhas


def test_callback_le_tokens_e_cache_do_prompt_etiquetado(monkeypatch) -> None:
    linhas = _capturar(monkeypatch)
    mensagem = AIMessage(
        content="{}",
        usage_metadata={
            "input_tokens": 100,
            "output_tokens": 20,
            "total_tokens": 120,
            "input_token_details": {"cache_read": 64},
        },
        response_metadata={"model_name": "gemini-3.6-flash"},
    )
    with uso_llm.etiqueta("supervisor.txt"):
        uso_llm.UsoCallback("gemini").on_llm_end(LLMResult(generations=[[ChatGeneration(message=mensagem)]]))

    assert linhas[0].pop("latencia_ms") >= 0
    assert linhas == [
        {
            "prompt": "supervisor.txt",
            "provedor": "gemini",
            "modelo": "gemini-3.6-flash",
            "tokens_entrada": 100,
            "tokens_saida": 20,
            "tokens_cache": 64,
            "fim": None,
        }
    ]


def test_resposta_sem_uso_nao_registra(monkeypatch) -> None:
    linhas = _capturar(monkeypatch)
    uso_llm.UsoCallback("openai").on_llm_end(LLMResult(generations=[[ChatGeneration(message=AIMessage(content=""))]]))
    assert linhas == []


def test_rag_le_cached_tokens_da_responses_api(monkeypatch) -> None:
    linhas = _capturar(monkeypatch)
    uso = SimpleNamespace(input_tokens=50, output_tokens=5, input_tokens_details=SimpleNamespace(cached_tokens=32))
    uso_llm.registrar_resposta_openai(SimpleNamespace(usage=uso), prompt="p.txt", modelo="gpt-4o-mini", usou_rag=True)
    assert linhas[0]["tokens_cache"] == 32
    assert linhas[0]["usou_rag"] is True


def test_sem_banco_configurado_registrar_nao_quebra() -> None:
    uso_llm.configurar(None)
    uso_llm.registrar(prompt=None, provedor="gemini", modelo=None, tokens_entrada=1, tokens_saida=1, tokens_cache=None)
