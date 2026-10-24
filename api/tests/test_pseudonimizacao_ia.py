"""#195: nome/e-mail do aluno nao vao ao provedor de IA; a resposta ao usuario
continua com o nome certo. LangSmith travado fora de dev; chave do Gemini no
header. Todos os provedores sao mocks — nada sai da maquina."""

from __future__ import annotations

import importlib
import json
from datetime import UTC, date, datetime
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_session
from app.core.settings import Settings
from app.core.tracing import ENVS_DE_TRACING, aplicar_politica_de_tracing, tracing_permitido
from app.repositories.access import AccessRepository
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.context import ContextRepository
from app.schemas.escriba import EscribaSaida, PerguntaEscriba
from app.schemas.insights import InsightGerado, InsightsTurmaSaida
from app.schemas.texto_gerado import TextoGerado
from app.services import insights_turma as insights_module
from app.services.escriba import EscribaService
from app.services.insights_turma import InsightsTurmaService, montar_payload
from app.services.llm import JsonLLMService
from app.services.pseudonimizacao import (
    PLACEHOLDER_NOME,
    pseudonimizar_nome_proprio,
    pseudonimizar_texto,
    restaurar_nome,
    restaurar_refs,
    termos_identificadores,
)
from tests.conftest import FakeSession

# `nodes/__init__` reexporta a funcao com o mesmo nome do modulo.
agente_texto_module = importlib.import_module("app.agent.graph.nodes.agente_texto")

NOMES = {"u-ana": "Ana Clara Souza", "u-bruno": "Bruno Lima", "u-ana2": "Ana Pereira"}
EMAILS = ["ana.souza@escola.edu.br", "bruno@escola.edu.br"]


def _sem_identificador(payload: Any) -> None:
    """Nenhum nome completo, parte de nome (3+ letras) ou e-mail no payload
    serializado — do jeito que ele vai ao provedor."""
    bruto = json.dumps(payload, ensure_ascii=False, default=str).lower()
    vazados = sorted(t for t in termos_identificadores(NOMES.values(), EMAILS) if t.lower() in bruto)
    assert vazados == [], f"identificador no payload ao provedor: {vazados}"


# ---------------------------------------------------------------- utilitarios


def test_restaurar_nome_troca_placeholder_e_some_sem_nome() -> None:
    assert restaurar_nome("Boa, {{nome}}! Continue.", "Ana Clara Souza") == "Boa, Ana! Continue."
    assert restaurar_nome("Boa, {{ Nome }}!", "Bruno") == "Boa, Bruno!"
    assert restaurar_nome("Boa, {{nome}}! Continue.", None) == "Boa! Continue."
    assert restaurar_nome("{{nome}}, vamos la", "") == "Vamos la"


def test_refs_vao_e_voltam_com_homonimos_distinguidos() -> None:
    mapa = {"A1": "Ana Clara Souza", "A2": "Ana Pereira", "A3": "Bruno Lima"}
    ida = pseudonimizar_texto("Como esta a Ana Clara Souza? E a ana? E o Bruno (bruno@x.com)?", mapa)
    assert ida == "Como esta a A1? E a A1 ou A2? E o A3 ([email])?"
    assert restaurar_refs("A1 e A3 precisam de apoio; A9 nao existe.", mapa) == (
        "Ana S. e Bruno precisam de apoio; A9 nao existe."
    )


def test_nome_proprio_vira_placeholder_no_texto_livre() -> None:
    texto = "Oi, aqui e a Ana Clara Souza (ana.souza@escola.edu.br), a Ana mesmo"
    saida = pseudonimizar_nome_proprio(texto, "Ana Clara Souza", "Aninha")
    assert saida == f"Oi, aqui e a {PLACEHOLDER_NOME} ([email]), a {PLACEHOLDER_NOME} mesmo"


# ---------------------------------------------------------------- agente_texto


@pytest.mark.asyncio
async def test_agente_texto_nao_manda_nome_e_restaura_na_resposta(monkeypatch) -> None:
    capturado: dict[str, Any] = {}

    class LLMFalso:
        def __init__(self, settings) -> None: ...

        async def ainvoke_structured(self, *, prompt_name, payload, schema, **kwargs):
            capturado["payload"] = payload
            return TextoGerado(titulo="Bora, {{nome}}!", corpo="{{nome}}, voce esta indo bem.", emoji=None)

    monkeypatch.setattr(agente_texto_module, "JsonLLMService", LLMFalso)
    state = {
        "nome_aluno": "Ana Clara Souza",
        "email_aluno": "ana.souza@escola.edu.br",
        "emocao_atual": {"emocao_primaria": "frustrado", "intensidade": 0.8},
        "perfil_brainhex": [{"perfil": "Achiever", "afinidade": 0.9}],
        "ui_config": {"tipo_modal": "suporte"},
    }

    out = await agente_texto_module.agente_texto(state, settings=None)

    _sem_identificador(capturado["payload"])
    assert capturado["payload"]["nome_aluno"] == PLACEHOLDER_NOME
    # Emocao e BrainHex seguem completos.
    assert capturado["payload"]["emocao_atual"] == state["emocao_atual"]
    assert capturado["payload"]["perfil_brainhex"] == state["perfil_brainhex"]
    texto = out["textos_gerados"][0]
    assert texto["titulo"] == "Bora, Ana!"
    assert texto["corpo"] == "Ana, voce esta indo bem."


# ---------------------------------------------------------------- insights


def _alunos() -> list[dict[str, Any]]:
    return [{"aluno_id": a, "perfil": "seeker", "percentual_concluido": 50} for a in NOMES]


def test_payload_dos_insights_nao_tem_nome() -> None:
    payload, refs, nomes_por_ref = montar_payload(
        _alunos(), NOMES, {}, {}, {}, [], [], date(2026, 10, 24)
    )
    _sem_identificador(payload)
    assert {refs[r]: n for r, n in nomes_por_ref.items()} == NOMES


@pytest.mark.asyncio
async def test_insights_vai_so_com_ref_e_volta_com_nome(monkeypatch) -> None:
    session = FakeSession()
    llm = AsyncMock()
    service = InsightsTurmaService(session, llm)
    monkeypatch.setattr(insights_module.GroupAnalysisService, "fetch_alunos", AsyncMock(return_value=_alunos()))

    async def ler(rotulo, sql, params):
        if rotulo == "nomes":
            return [{"id": k, "nome": v} for k, v in NOMES.items()]
        return []

    monkeypatch.setattr(service, "_ler", ler)
    # refs por ordem de aluno_id: u-ana=A1, u-ana2=A2, u-bruno=A3
    llm.ainvoke_structured.return_value = InsightsTurmaSaida(
        insights=[
            InsightGerado(
                natureza="sugestao", escopo="aluno", aluno_ref="A3", tipo="engajamento",
                texto="A3 nao acessa ha 9 dias; vale chamar A3 para conversar.", base="9 dias sem sessao (A3)",
            )
        ]
    )

    assert await service.gerar(7, agora=datetime(2026, 10, 24, tzinfo=UTC)) == ("concluido", 1)

    _sem_identificador(llm.ainvoke_structured.await_args.kwargs["payload"])
    insert = next(p for stmt, p in session.executed if "INSERT INTO intervencoes" in str(stmt))
    assert insert["aluno_id"] == "u-bruno"
    assert insert["texto"] == "Bruno nao acessa ha 9 dias; vale chamar Bruno para conversar."
    assert insert["base"] == "9 dias sem sessao (Bruno)"


# ---------------------------------------------------------------- escriba


@pytest.mark.asyncio
async def test_escriba_pseudonimiza_payload_pergunta_e_historico_e_restaura(monkeypatch) -> None:
    llm = AsyncMock()
    llm.ainvoke_structured.return_value = EscribaSaida(resposta="A2 e A4 precisam de atencao.")
    service = EscribaService(FakeSession(), llm)
    monkeypatch.setattr(
        service, "turmas_do_professor",
        AsyncMock(return_value=[{"id": 54, "descricao": "SPD"}, {"id": 56, "descricao": "Redes"}]),
    )
    monkeypatch.setattr(service, "_ler", AsyncMock(return_value=[]))

    retratos = {
        54: ({"alunos": [{"ref": "A1", "perfil": "seeker"}, {"ref": "A2", "perfil": "achiever"}], "topicos": []},
             {"A1": "u-ana", "A2": "u-bruno"}, {"A1": "Ana Clara Souza", "A2": "Bruno Lima"}),
        56: ({"alunos": [{"ref": "A1", "perfil": "seeker"}, {"ref": "A2", "perfil": "survivor"}], "topicos": []},
             {"A1": "u-ana2", "A2": "u-x"}, {"A1": "Ana Pereira", "A2": "Carla Dias"}),
    }

    async def coletar(self, classe_id, agora, *, incluir_descartados=True):
        return retratos[classe_id]

    monkeypatch.setattr(InsightsTurmaService, "coletar_contexto", coletar)

    r = await service.perguntar(
        "prof-1",
        PerguntaEscriba(
            pergunta="Como estao a Ana Clara Souza e o Bruno? (bruno@escola.edu.br)",
            historico=[{"papel": "escriba", "texto": "Bruno Lima esta sem acessar."}],
        ),
    )

    payload = llm.ainvoke_structured.await_args.kwargs["payload"]
    _sem_identificador(payload)
    assert "Carla" not in json.dumps(payload)
    # refs unicas entre turmas (A1..A4) e citadas na pergunta/historico
    assert [a["ref"] for t in payload["turmas"] for a in t["alunos"]] == ["A1", "A2", "A3", "A4"]
    assert all("_nomes_por_ref" not in t for t in payload["turmas"])
    assert payload["pergunta"] == "Como estao a A1 e o A2? ([email])"
    assert payload["historico"][0]["texto"] == "A2 esta sem acessar."
    assert r.resposta == "Bruno e Carla precisam de atencao."


# ---------------------------------------------------------------- mentor


def test_mentor_nao_manda_nome_nem_apelido_e_restaura_na_resposta(app, aluno_user, monkeypatch) -> None:
    fake_session = FakeSession()

    async def override_session_local():
        yield fake_session

    app.dependency_overrides[get_session] = override_session_local
    app.dependency_overrides[get_current_user] = lambda: aluno_user
    monkeypatch.setattr(AccessRepository, "aluno_belongs_to_classe", AsyncMock(return_value=True))
    contexto = {
        "aluno": {"id": "aluno-1", "nome": "Ana Clara Souza", "email": "ana.souza@escola.edu.br", "apelido": None},
        "perfil_brainhex": [{"perfil": "Seeker", "afinidade": 0.7}],
        "desempenho_recente": {"media_acertos": 0.6},
    }
    monkeypatch.setattr(ContextRepository, "fetch_aluno_context", AsyncMock(return_value=contexto))
    monkeypatch.setattr(ConteudoPersonalizadoRepository, "buscar_por_aluno", AsyncMock(return_value=[]))

    payloads: list[dict[str, Any]] = []

    async def fake_ainvoke_structured(self, *, prompt_name, payload, schema, **kwargs):
        payloads.append(payload)
        if prompt_name == "mentor_grounding_check.txt":
            return schema.model_validate({"viola": False, "motivo": ""})
        return schema.model_validate(
            {"reply": "Boa pergunta, {{nome}}! Revise o conteudo 2.", "should_close": False, "hinted_actions": []}
        )

    monkeypatch.setattr(JsonLLMService, "ainvoke_structured", fake_ainvoke_structured)

    with TestClient(app) as client:
        r = client.post(
            "/api/v1/personalizar/chat",
            json={
                "classe_id": 1, "topico_id": None, "conteudo_id": None, "escopo": "trilha_home",
                "mensagem": "Oi, sou a Ana Clara Souza, como estudo melhor?",
                "historico": [{"role": "assistant", "content": "Ola, Ana! Em que posso ajudar?"}],
            },
        )

    assert r.status_code == 200, r.text
    assert r.json()["reply"] == "Boa pergunta, Ana! Revise o conteudo 2."
    assert payloads, "o mentor nao chamou o provedor"
    for payload in payloads:
        _sem_identificador(payload)
    principal = payloads[0]
    assert principal["metricas_aluno"]["apelido"] == PLACEHOLDER_NOME
    assert principal["mensagem"] == f"Oi, sou a {PLACEHOLDER_NOME}, como estudo melhor?"
    assert principal["historico"][0]["content"] == f"Ola, {PLACEHOLDER_NOME}! Em que posso ajudar?"
    assert principal["perfil_brainhex"] == contexto["perfil_brainhex"]


# ---------------------------------------------------------------- LangSmith


def _settings(**kw) -> Settings:
    return Settings(supabase_jwt_secret="x", admin_panel_password="x", cors_allow_origins=["https://a"], **kw)


@pytest.mark.parametrize("ambiente", ["production", "staging", "prod", "qualquer-coisa"])
def test_tracing_forcado_desligado_fora_de_dev_mesmo_com_env_ligada(ambiente) -> None:
    environ = {nome: "true" for nome in ENVS_DE_TRACING}
    settings = _settings(app_env=ambiente, langchain_tracing_v2=True)

    assert aplicar_politica_de_tracing(settings, environ) is False
    assert all(environ[nome] == "false" for nome in ENVS_DE_TRACING)


def test_tracing_em_producao_so_com_flag_explicita() -> None:
    assert tracing_permitido(_settings(app_env="production")) is False
    environ = {"LANGCHAIN_TRACING_V2": "true"}
    liberado = _settings(app_env="production", langsmith_tracing_autorizado_em_producao=True)
    assert aplicar_politica_de_tracing(liberado, environ) is True
    assert environ == {"LANGCHAIN_TRACING_V2": "true"}


def test_tracing_em_dev_nao_e_mexido() -> None:
    environ = {"LANGCHAIN_TRACING_V2": "true"}
    assert aplicar_politica_de_tracing(_settings(app_env="development"), environ) is True
    assert environ == {"LANGCHAIN_TRACING_V2": "true"}


def test_create_app_aplica_a_trava(monkeypatch) -> None:
    from app import main as main_module

    for nome in ENVS_DE_TRACING:
        monkeypatch.setenv(nome, "true")
    main_module.create_app(_settings(app_env="production"))
    import os

    assert all(os.environ[nome] == "false" for nome in ENVS_DE_TRACING)


# ---------------------------------------------------------------- chave do Gemini


class _ClienteHttpFalso:
    chamadas: list[dict[str, Any]] = []

    def __init__(self, *a, **kw) -> None: ...

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a) -> None: ...

    async def post(self, url, json=None, headers=None, **kw):
        _ClienteHttpFalso.chamadas.append({"url": url, "headers": headers or {}})

        class R:
            status_code = 500
            text = "erro"

            def json(self):
                return {}

            def raise_for_status(self):
                raise RuntimeError("falha simulada")

        return R()


@pytest.mark.asyncio
async def test_chave_do_gemini_vai_no_header_e_nunca_na_url(monkeypatch) -> None:
    import httpx

    from app.adapters.gemini_boss_image import GeminiBossImageAdapter
    from app.schemas.ia_patch import IAEnemySpec
    from app.services import audio as audio_module

    _ClienteHttpFalso.chamadas = []
    monkeypatch.setattr(httpx, "AsyncClient", _ClienteHttpFalso)
    settings = _settings(gemini_api_key="CHAVE-FALSA-123")

    try:
        await audio_module.gerar_mp3_gemini_tts(settings=settings, texto="Ola turma")
    except Exception:
        pass
    campos = {
        name: ("x" if f.annotation is str else None)
        for name, f in IAEnemySpec.model_fields.items()
        if f.is_required()
    }
    try:
        await GeminiBossImageAdapter(settings).generate_png(IAEnemySpec.model_construct(**campos))
    except Exception:
        pass

    assert len(_ClienteHttpFalso.chamadas) >= 2
    for chamada in _ClienteHttpFalso.chamadas:
        assert "key=" not in chamada["url"] and "CHAVE-FALSA-123" not in chamada["url"]
        assert chamada["headers"].get("x-goog-api-key") == "CHAVE-FALSA-123"


def test_nenhuma_chamada_http_ao_gemini_com_chave_na_url() -> None:
    """Varredura do codigo: `?key=` na URL do Gemini nao volta."""
    from pathlib import Path

    raiz = Path(__file__).resolve().parents[1]
    alvos = list((raiz / "app").rglob("*.py")) + list((raiz.parent / "frontend" / "supabase" / "functions").rglob("*.ts"))
    ofensores = [
        str(p.relative_to(raiz.parent))
        for p in alvos
        if "generateContent?key=" in p.read_text(encoding="utf-8") or "GEMINI_URL}?key=" in p.read_text(encoding="utf-8")
    ]
    assert ofensores == []
