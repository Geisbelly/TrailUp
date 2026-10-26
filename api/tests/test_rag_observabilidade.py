"""#67: a busca do RAG vai para `ia_decision_logs` e entra no fluxo do grafo (guardrails)."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from app.agent.graph.guardrails import GuardrailViolation, gerar_validado
from app.core.settings import Settings
from app.schemas.mentor_chat import MentorChatLLMResult
from app.services.llm import JsonLLMService
from app.services.openai_rag import OpenAIRagService
from app.services.rag_observabilidade import (
    STAGE,
    coletar_buscas_rag,
    gravar_buscas_rag,
    resumo_da_busca,
)


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


class _RepoFalso:
    def __init__(self) -> None:
        self.linhas: list[dict[str, Any]] = []

    async def log(self, **kwargs: Any) -> None:
        self.linhas.append(kwargs)


class _Respostas:
    """Devolve as respostas em ordem, cada uma com uma busca de um arquivo."""

    def __init__(self, replies: list[str]) -> None:
        self.replies = list(replies)
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any):
        self.calls.append(kwargs)
        reply = self.replies.pop(0)
        return SimpleNamespace(
            output_text=json.dumps({"reply": reply, "should_close": False, "hinted_actions": []}),
            output=[
                SimpleNamespace(
                    type="file_search_call",
                    queries=["consulta"],
                    results=[SimpleNamespace(file_id=f"file_{len(self.calls)}", score=0.8, text="trecho")],
                )
            ],
        )


def test_resumo_aceita_resposta_sem_output():
    resumo = resumo_da_busca(None, latencia_ms=12.345, prompt_name="p.txt", model="m", top_k=3)
    assert resumo["status"] == "ok"
    assert resumo["latencia_ms"] == 12.3
    assert resumo["top_k"] == 3
    assert resumo["n_resultados"] == 0 and resumo["com_resultado"] is False


def test_resumo_limita_a_lista_de_resultados():
    resposta = SimpleNamespace(
        output=[
            SimpleNamespace(
                type="file_search_call",
                queries=[],
                results=[SimpleNamespace(file_id=f"f{i}", score=0.1) for i in range(30)],
            )
        ]
    )
    resumo = resumo_da_busca(resposta, latencia_ms=1, prompt_name="p", model=None, top_k=None)
    assert resumo["n_resultados"] == 30
    assert len(resumo["resultados"]) == 20


@pytest.mark.asyncio
async def test_gravar_buscas_uma_linha_por_busca_sem_texto():
    repo = _RepoFalso()
    buscas = [
        resumo_da_busca(None, latencia_ms=10, prompt_name="p", model="gpt", top_k=5),
        resumo_da_busca(None, latencia_ms=20, prompt_name="p", model="gpt", top_k=5, erro=TimeoutError("x")),
    ]

    total = await gravar_buscas_rag(
        repo, buscas, aluno_id="aluno-1", classe_id=7, topico_id=3, trigger_event="topico", intervencao=True
    )

    assert total == 2
    assert [linha["stage"] for linha in repo.linhas] == [STAGE, STAGE]
    linha = repo.linhas[1]
    assert linha["source"] == "chat"  # dentro do CHECK de `ia_decision_logs.source`
    assert linha["provider"] == "openai"
    assert linha["model_name"] == "gpt"
    assert linha["aluno_id"] == "aluno-1" and linha["classe_id"] == 7 and linha["topico_id"] == 3
    assert linha["input_summary"]["intervencao"] is True
    assert linha["input_summary"]["status"] == "erro"
    assert linha["input_summary"]["erro"] == "TimeoutError"
    assert "prompt_text" not in linha and "raw_response" not in linha
    assert linha["decision_summary"] == "rag erro: 0 resultado(s) em 20.0 ms"


@pytest.mark.asyncio
async def test_sem_busca_nao_grava_nada():
    repo = _RepoFalso()
    assert await gravar_buscas_rag(repo, [], aluno_id="a", classe_id=1) == 0
    assert repo.linhas == []


@pytest.mark.asyncio
async def test_coletor_isola_contextos():
    with coletar_buscas_rag() as fora:
        async with coletar_buscas_rag() as dentro:
            from app.services.rag_observabilidade import registrar_busca

            registrar_busca({"prompt": "x"})
        registrar_busca({"prompt": "y"})
    assert dentro == [{"prompt": "x"}]
    assert fora == [{"prompt": "y"}]


@pytest.mark.asyncio
async def test_grafo_com_rag_registra_cada_tentativa_e_a_intervencao(monkeypatch):
    """`gerar_validado` (camada de guardrails do grafo) com `use_rag=True`: a 1ª resposta viola o
    guardrail, a 2ª passa. As duas buscas são coletadas e a intervenção fica visível."""
    respostas = _Respostas(["resposta proibida", "resposta boa"])
    monkeypatch.setattr(OpenAIRagService, "_get_client", lambda self: SimpleNamespace(responses=respostas))
    llm = JsonLLMService(_settings())

    def _guardrail(resultado: MentorChatLLMResult, contexto: dict[str, Any]):
        if "proibida" in resultado.reply:
            return GuardrailViolation(regra="grounding_chat", mensagem="fora do material")
        return None

    intervencoes: list[str] = []

    async def _auditar(violacao, fase) -> None:
        intervencoes.append(fase)

    repo = _RepoFalso()
    async with coletar_buscas_rag() as buscas:
        resultado = await gerar_validado(
            llm,
            prompt_name="mentor_personalizacao_chat.txt",
            payload={"mensagem": "pergunta"},
            schema=MentorChatLLMResult,
            guardrails=[_guardrail],
            fallback_factory=lambda: {"reply": "fallback", "should_close": False, "hinted_actions": []},
            on_violation=_auditar,
            use_rag=True,
        )
    await gravar_buscas_rag(repo, buscas, aluno_id="a", classe_id=1, intervencao=bool(intervencoes))

    assert resultado.reply == "resposta boa"
    assert len(respostas.calls) == 2
    assert [b["resultados"][0]["file_id"] for b in buscas] == ["file_1", "file_2"]
    assert intervencoes == ["retry"]
    assert [linha["input_summary"]["intervencao"] for linha in repo.linhas] == [True, True]
    # a correção do retry vai no payload, mas nunca no log
    assert "fora do material" not in json.dumps(repo.linhas, ensure_ascii=False)


@pytest.mark.asyncio
async def test_grafo_com_rag_em_fallback_ainda_registra_as_buscas(monkeypatch):
    respostas = _Respostas(["proibida 1", "proibida 2"])
    monkeypatch.setattr(OpenAIRagService, "_get_client", lambda self: SimpleNamespace(responses=respostas))
    llm = JsonLLMService(_settings())

    async with coletar_buscas_rag() as buscas:
        resultado = await gerar_validado(
            llm,
            prompt_name="mentor_personalizacao_chat.txt",
            payload={"mensagem": "pergunta"},
            schema=MentorChatLLMResult,
            guardrails=[lambda r, c: GuardrailViolation(regra="x", mensagem="y")],
            fallback_factory=lambda: {"reply": "fallback", "should_close": False, "hinted_actions": []},
            use_rag=True,
        )

    assert resultado.reply == "fallback"
    assert len(buscas) == 2 and all(b["status"] == "ok" for b in buscas)


def test_chat_do_mentor_grava_a_busca_em_ia_decision_logs(app, settings, aluno_user, monkeypatch) -> None:
    """Ponta da API: `POST /personalizar/chat` com RAG grava a linha `rag_retrieval`, sem texto."""
    from unittest.mock import AsyncMock

    from fastapi.testclient import TestClient

    from app.api.deps import get_current_user, get_session
    from app.repositories.access import AccessRepository
    from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
    from app.repositories.context import ContextRepository
    from app.repositories.ia_decision_logs import IADecisionLogRepository
    from app.services.rag_observabilidade import registrar_busca
    from tests.conftest import FakeSession

    async def override_session():
        yield FakeSession()

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: aluno_user
    monkeypatch.setattr(AccessRepository, "aluno_belongs_to_classe", AsyncMock(return_value=True))
    monkeypatch.setattr(
        ContextRepository,
        "fetch_aluno_context",
        AsyncMock(return_value={"aluno": {"id": "aluno-1", "nome": "Ana", "apelido": None}}),
    )
    monkeypatch.setattr(ConteudoPersonalizadoRepository, "buscar_por_aluno", AsyncMock(return_value=[]))

    async def fake_ainvoke_structured(self, *, prompt_name, payload, schema, use_rag=False, **kwargs):
        if prompt_name == "mentor_grounding_check.txt":
            return schema.model_validate({"viola": False, "motivo": ""})
        if use_rag:
            registrar_busca(
                resumo_da_busca(
                    SimpleNamespace(
                        output=[
                            SimpleNamespace(
                                type="file_search_call",
                                queries=[payload["mensagem"]],
                                results=[SimpleNamespace(file_id="file_x", score=0.7, text="trecho")],
                            )
                        ]
                    ),
                    latencia_ms=42,
                    prompt_name=prompt_name,
                    model="gpt-4o-mini",
                    top_k=None,
                )
            )
        return schema.model_validate({"reply": "Revise o conteudo 2.", "should_close": False, "hinted_actions": []})

    monkeypatch.setattr(JsonLLMService, "ainvoke_structured", fake_ainvoke_structured)
    linhas: list[dict[str, Any]] = []

    async def fake_log(self, **kwargs):
        linhas.append(kwargs)

    monkeypatch.setattr(IADecisionLogRepository, "log", fake_log)
    monkeypatch.setattr(settings, "openai_rag_enabled", True)
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/personalizar/chat",
            json={
                "classe_id": 1,
                "topico_id": None,
                "conteudo_id": None,
                "escopo": "trilha_home",
                "mensagem": "nao entendi fotossintese",
                "historico": [],
            },
        )

    assert r.status_code == 200, r.text
    rag = [linha for linha in linhas if linha["stage"] == STAGE]
    assert len(rag) == 1
    assert rag[0]["source"] == "chat"
    assert rag[0]["classe_id"] == 1
    assert rag[0]["trigger_event"] == "trilha_home"
    assert rag[0]["input_summary"]["resultados"] == [{"file_id": "file_x", "score": 0.7}]
    assert rag[0]["input_summary"]["intervencao"] is False
    assert "fotossintese" not in json.dumps(rag, ensure_ascii=False)


def test_iniciar_coleta_vale_no_contexto_atual():
    import contextvars

    from app.services.rag_observabilidade import iniciar_coleta_rag, registrar_busca

    def _requisicao():
        buscas = iniciar_coleta_rag()
        registrar_busca({"prompt": "p"})
        return buscas

    assert contextvars.copy_context().run(_requisicao) == [{"prompt": "p"}]
    # fora do contexto da "requisição" não sobra coletor
    with coletar_buscas_rag() as buscas:
        pass
    assert buscas == []
