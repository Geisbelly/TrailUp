"""O Guia sem modelo (24/11): modelos aposentados fora da cadeia, cota esgotada sem gastar o prazo do
chat, e a resposta de reserva honesta, com acento, ligada ao tópico e sem perfil errado.

No dia, o aluno de teste (sem `aluno_perfil`, logo mastermind) perguntou "O que é lógica?" e "o que é a
loja?" e recebeu as duas vezes o texto fixo "Vamos explorar o tema com curiosidade. Na sua trilha eu
considero Seeker...", depois de 40 s de cadeia: 3.6-flash sem cota do dia, três modelos 2.x com 404 em
toda chamada e os 3.x lite com 5xx.
"""

from __future__ import annotations

import asyncio
import time

import pytest
from fastapi.testclient import TestClient
from google.genai import errors as genai_errors
from langchain_google_genai import chat_models as lc_gemini
from pydantic import BaseModel

from app.agent.graph.routing import build_state_summary
from app.api.deps import get_current_user, get_session
from app.core.settings import Settings
from app.repositories.access import AccessRepository
from app.repositories.chat_guia_registros import ChatGuiaRegistrosRepository
from app.repositories.conteudo_classe import ConteudoClasseRepository
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.context import DEFAULT_PROFILES, ContextRepository
from app.schemas.perfil import PerfilScore
from app.services import gemini_chaves
from app.services import llm as llm_module
from app.services.auth import UserContext
from app.services.llm import JsonLLMService, ProvedorIndisponivelError, reset_gemini_llm_circuit
from app.services.reserva_do_guia import resposta_de_reserva, trecho_relacionado
from tests.conftest import FakeSession

APOSENTADOS = ("gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite", "preview-image-generation")
ERRO_DIA = (
    '429 RESOURCE_EXHAUSTED. {"error": {"code": 429, "message": "Quota exceeded", '
    '"details": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}'
)


@pytest.fixture(autouse=True)
def _pool_limpo():
    reset_gemini_llm_circuit()
    yield
    reset_gemini_llm_circuit()


def _settings(**overrides: object) -> Settings:
    return Settings(supabase_jwt_secret="test-secret", admin_panel_password="x", **overrides)


# --- 1. Modelos aposentados ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "campo",
    [
        "gemini_text_fallback_models",
        "content_enrichment_gemini_fallback_models",
        "gemini_model_image",
        "gemini_model_multimodal_fallback",
    ],
)
def test_padrao_nao_tem_modelo_aposentado(campo: str) -> None:
    padrao = str(Settings.model_fields[campo].default)
    for aposentado in APOSENTADOS:
        assert aposentado not in padrao, (campo, padrao)


def test_lista_de_reserva_continua_lida_do_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_TEXT_FALLBACK_MODELS", "gemini-3.5-flash-lite")
    assert _settings().gemini_text_fallback_models == "gemini-3.5-flash-lite"


# --- 2. O que é o GoogleAPIError, e a cota que não gasta o prazo -------------------------------


def _pelo_langchain(erro: Exception) -> Exception:
    """Passa o erro do google-genai pelo mesmo tradutor que o ChatGoogleGenerativeAI usa."""
    try:
        if isinstance(erro, genai_errors.ServerError):
            lc_gemini._handle_server_error(erro)
        else:
            lc_gemini._handle_client_error(erro, {"model": "gemini-3.6-flash"})
    except Exception as traduzido:  # noqa: BLE001
        return traduzido
    raise AssertionError("o tradutor nao levantou")


def _client_error(codigo: int, status: str, mensagem: str) -> genai_errors.ClientError:
    return genai_errors.ClientError(codigo, {"error": {"code": codigo, "status": status, "message": mensagem}})


def test_google_api_error_e_o_5xx_e_nao_esconde_cota() -> None:
    """`erro:GoogleAPIError` em `ia_uso_llm` é o 5xx do Gemini. A cota (429) vira outra classe, e o
    status dela só existe na causa, que a classificação agora lê."""
    servidor = _pelo_langchain(genai_errors.ServerError(503, {"error": {"code": 503, "status": "UNAVAILABLE"}}))
    assert type(servidor).__name__ == "GoogleAPIError"
    assert gemini_chaves.is_transient_error(servidor)
    assert not gemini_chaves.is_quota_error(servidor)

    cota = _pelo_langchain(_client_error(429, "RESOURCE_EXHAUSTED", "GenerateRequestsPerDayPerProjectPerModel"))
    assert type(cota).__name__ == "GoogleRateLimitError"
    assert gemini_chaves.is_quota_error(cota)
    assert gemini_chaves.is_daily_quota_error(cota)

    aposentado = _pelo_langchain(_client_error(404, "NOT_FOUND", "models/gemini-2.0-flash is not found"))
    assert type(aposentado).__name__ == "GoogleModelNotFoundError"
    assert gemini_chaves.is_model_unavailable_error(aposentado)


def test_402_sem_credito_e_o_erro_generico_e_tira_a_chave_de_todos_os_modelos() -> None:
    """O `erro:ChatGoogleGenerativeAIError` de `ia_uso_llm`: 402 não tem classe própria no langchain."""
    sem_credito = _pelo_langchain(_client_error(402, "RESOURCE_EXHAUSTED", "Your prepayment credits are depleted."))
    assert type(sem_credito).__name__ == "ChatGoogleGenerativeAIError"
    assert gemini_chaves.is_billing_error(sem_credito)

    gemini_chaves.marcar_falha("k1", "gemini-3.6-flash", sem_credito)

    assert gemini_chaves.escolher_chave(["k1", "k2"], "gemini-3.1-flash-lite") == "k2"
    assert gemini_chaves.motivo_da_pausa("k1", "gemini-3.5-flash-lite") == "sem_credito"


def test_modelo_aposentado_sai_para_todas_as_chaves() -> None:
    aposentado = _pelo_langchain(_client_error(404, "NOT_FOUND", "no longer available to new users"))
    gemini_chaves.marcar_falha("k1", "gemini-2.0-flash", aposentado)

    assert gemini_chaves.escolher_chave(["k1", "k2", "k3"], "gemini-2.0-flash") is None
    assert gemini_chaves.escolher_chave(["k1", "k2", "k3"], "gemini-3.6-flash") is not None


def test_401_continua_so_da_chave() -> None:
    gemini_chaves.marcar_falha("k1", "gemini-3.6-flash", Exception("401 UNAUTHENTICATED"))
    assert gemini_chaves.escolher_chave(["k1", "k2"], "gemini-3.6-flash") == "k2"


class _Esquema(BaseModel):
    ok: bool


def _service_com_gemini_falso(monkeypatch: pytest.MonkeyPatch, responder, **settings) -> tuple[JsonLLMService, list]:
    chamadas: list[tuple[str, str]] = []

    class _Cliente:
        def __init__(self, model: str, key: str) -> None:
            self.model, self.key = model, key

        def with_structured_output(self, _schema):
            return self

        async def ainvoke(self, _messages):
            chamadas.append((self.model, self.key))
            resultado = responder(self.model, self.key)
            if isinstance(resultado, Exception):
                raise resultado
            return resultado

    def fabrica(*, model: str, google_api_key: str, **_opcoes):
        return _Cliente(model, google_api_key)

    monkeypatch.setattr(llm_module, "ChatGoogleGenerativeAI", fabrica)
    monkeypatch.setattr(llm_module, "load_prompt", lambda _nome: "instrucoes")
    base = dict(
        gemini_api_key="k1,k2,k3,k4",
        openai_api_key="",
        gemini_text_fallback_models="gemini-3.1-flash-lite,gemini-3.5-flash-lite",
    )
    base.update(settings)
    return JsonLLMService(_settings(**base)), chamadas


def test_chat_sem_cota_do_dia_cai_na_reserva_sem_descer_a_cadeia(monkeypatch: pytest.MonkeyPatch) -> None:
    def responder(model, _key):
        if model == "gemini-3.6-flash":
            return Exception(ERRO_DIA)
        return {"ok": True}

    service, chamadas = _service_com_gemini_falso(monkeypatch, responder)

    async def no_chat():
        with gemini_chaves.faixa_do_chat():
            return await service.ainvoke_structured(prompt_name="mentor_personalizacao_chat.txt", payload={}, schema=_Esquema)

    with pytest.raises(ProvedorIndisponivelError):
        asyncio.run(no_chat())
    # As 4 chaves do modelo principal, e nenhum modelo de reserva.
    assert [m for m, _ in chamadas] == ["gemini-3.6-flash"] * 4

    # A pergunta seguinte nem chama o Gemini: o modelo segue sem cota em todas as chaves.
    chamadas.clear()
    inicio = time.monotonic()
    with pytest.raises(ProvedorIndisponivelError):
        asyncio.run(no_chat())
    assert chamadas == []
    assert time.monotonic() - inicio < 1


def test_fora_do_chat_a_fila_continua_descendo_a_cadeia(monkeypatch: pytest.MonkeyPatch) -> None:
    def responder(model, _key):
        return Exception(ERRO_DIA) if model == "gemini-3.6-flash" else {"ok": True}

    service, chamadas = _service_com_gemini_falso(monkeypatch, responder)

    resultado = asyncio.run(
        service.ainvoke_structured(prompt_name="gerador_conteudo.txt", payload={}, schema=_Esquema)
    )

    assert resultado.ok is True
    assert chamadas[-1][0] == "gemini-3.1-flash-lite"


def test_chat_com_5xx_pula_o_modelo_sem_tentar_as_outras_chaves(monkeypatch: pytest.MonkeyPatch) -> None:
    sobrecarga = _pelo_langchain(genai_errors.ServerError(503, {"error": {"code": 503, "status": "UNAVAILABLE"}}))

    def responder(model, _key):
        return sobrecarga if model == "gemini-3.6-flash" else {"ok": True}

    service, chamadas = _service_com_gemini_falso(monkeypatch, responder)

    async def no_chat():
        with gemini_chaves.faixa_do_chat():
            return await service.ainvoke_structured(prompt_name="mentor_personalizacao_chat.txt", payload={}, schema=_Esquema)

    assert asyncio.run(no_chat()).ok is True
    assert [m for m, _ in chamadas] == ["gemini-3.6-flash", "gemini-3.1-flash-lite"]


# --- 3. A reserva ----------------------------------------------------------------------------------

MATERIA = {
    "conteudos": [
        {
            "titulo": "Operadores",
            "texto": (
                "## Operadores\nOs operadores aritméticos fazem contas. "
                "Os **operadores lógicos** (E, OU, NÃO) combinam condições e devolvem verdadeiro ou falso."
            ),
        },
        {"titulo": "Variáveis", "texto": "Uma variável guarda um valor na memória com um nome."},
    ],
    "material_personalizado": "",
}
GABARITO = [{"origem": "questao", "pergunta": "O que faz o operador E?", "respostas": ["devolve verdadeiro so quando as duas condicoes sao verdadeiras"]}]


def _reserva(mensagem: str, **kwargs) -> dict:
    base = dict(
        mensagem=mensagem,
        titulo_topico="Variáveis, tipos e operadores",
        titulo_conteudo="Operadores",
        conteudo_materia=MATERIA,
        gabarito_protegido=GABARITO,
    )
    base.update(kwargs)
    return resposta_de_reserva(**base)


def test_pergunta_da_materia_aponta_o_trecho_e_o_topico() -> None:
    reply = _reserva("O que é lógica?")["reply"]

    assert "não consegui" in reply.lower()
    assert "Variáveis, tipos e operadores" in reply
    assert "operadores lógicos" in reply
    assert "##" not in reply and "**" not in reply
    for sem_acento in ("Nao ", "nao ", "voce", "modulo", "historico"):
        assert sem_acento not in reply


def test_sem_trecho_diz_que_nao_conseguiu_e_sugere_o_conteudo() -> None:
    reply = _reserva("o que é recursão de cauda?")["reply"]

    assert reply.startswith("Não consegui")
    assert "“Operadores”" in reply and "Variáveis, tipos e operadores" in reply


def test_pergunta_sobre_tela_recebe_o_texto_fixo_dela() -> None:
    resposta = _reserva("o que é a loja?")

    assert resposta["reply"].startswith("A Loja fica no Perfil.")
    assert resposta["destinos"] == ["perfil.loja"]
    assert resposta["tutorial"] == "gastar_moedas"


@pytest.mark.parametrize(
    ("pergunta", "comeco"),
    [
        ("como funcionam as missões?", "As Missões"),
        ("pra que serve a bag", "A Bag"),
        ("o que tem no ranking", "O Ranking"),
        ("o que é o perfil?", "O Perfil"),
    ],
)
def test_outras_telas(pergunta: str, comeco: str) -> None:
    assert _reserva(pergunta)["reply"].startswith(comeco)


def test_trecho_nunca_repete_o_gabarito() -> None:
    materia = {
        "conteudos": [
            {
                "titulo": "Operadores",
                "texto": "O operador E devolve verdadeiro so quando as duas condicoes sao verdadeiras.",
            }
        ]
    }
    assert trecho_relacionado("o que faz o operador E?", materia, gabarito_protegido=GABARITO) is None
    reply = _reserva("o que faz o operador E?", conteudo_materia=materia)["reply"]
    assert "duas condicoes" not in reply


def test_pedido_de_resposta_nao_entrega_e_aponta_o_conteudo() -> None:
    reply = _reserva("qual a resposta da questão 2?")["reply"]

    assert reply.startswith("Não posso entregar a resposta")
    assert "Operadores" in reply


@pytest.mark.parametrize("pergunta", ["O que é lógica?", "o que é a loja?", "me explica variáveis", "oi"])
def test_reserva_nao_cita_perfil(pergunta: str) -> None:
    reply = _reserva(pergunta)["reply"]
    for perfil in ("Seeker", "Mastermind", "Survivor", "Daredevil", "Conqueror", "Socializer", "Achiever"):
        assert perfil not in reply


# --- Perfil: sem aluno_perfil é mastermind em todo texto do chat ----------------------------------


def _sem_aluno_perfil() -> list[dict]:
    return [PerfilScore(perfil=nome, afinidade=0).model_dump() for nome in DEFAULT_PROFILES]


def test_lista_padrao_do_contexto_comeca_pelo_mastermind() -> None:
    assert DEFAULT_PROFILES[0] == "Mastermind"
    assert "Seeker" in DEFAULT_PROFILES


def test_supervisor_ve_mastermind_e_nao_seeker() -> None:
    resumo = build_state_summary({"perfil_brainhex": [{"perfil": "Seeker", "afinidade": 0.0}, {"perfil": "Achiever", "afinidade": 0.0}]})
    assert resumo["perfil_dominante"] == {"perfil": "Mastermind", "afinidade": 0.0}

    com_perfil = build_state_summary({"perfil_brainhex": [{"perfil": "Seeker", "afinidade": 10}, {"perfil": "Achiever", "afinidade": 80}]})
    assert com_perfil["perfil_dominante"] == {"perfil": "Achiever", "afinidade": 80.0}


ALUNO = "3f0c9d2e-7a41-4b8e-9c55-1d2e3f4a5b6c"


def _preparar_rota(app, monkeypatch, *, resposta):
    from unittest.mock import AsyncMock

    fake_session = FakeSession()

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: UserContext(user_id=ALUNO, role="aluno", aluno_id=ALUNO)
    monkeypatch.setattr(AccessRepository, "aluno_belongs_to_classe", AsyncMock(return_value=True))
    monkeypatch.setattr(
        ContextRepository,
        "fetch_aluno_context",
        AsyncMock(return_value={"aluno": {"id": ALUNO, "nome": "Teste"}, "perfil_brainhex": _sem_aluno_perfil()}),
    )
    monkeypatch.setattr(ConteudoPersonalizadoRepository, "buscar_por_aluno", AsyncMock(return_value=[]))
    monkeypatch.setattr(ConteudoClasseRepository, "buscar_classe_id_por_topico", AsyncMock(return_value=3))
    monkeypatch.setattr(ConteudoClasseRepository, "buscar_classe_id_por_conteudo", AsyncMock(return_value=3), raising=False)
    monkeypatch.setattr(
        ConteudoClasseRepository, "buscar_topico", AsyncMock(return_value={"nome": "Variáveis, tipos e operadores"})
    )
    monkeypatch.setattr(
        ConteudoClasseRepository,
        "buscar_conteudos_topico",
        AsyncMock(return_value=[{"id": 40, "titulo": "Operadores", "conteudo": MATERIA["conteudos"][0]["texto"]}]),
    )
    for metodo in ("buscar_atividades_topico", "buscar_questoes_com_gabarito_topico", "buscar_cards_topico"):
        monkeypatch.setattr(ConteudoClasseRepository, metodo, AsyncMock(return_value=[]))
    monkeypatch.setattr(ChatGuiaRegistrosRepository, "nomes_da_turma", AsyncMock(return_value=[]))
    monkeypatch.setattr(ChatGuiaRegistrosRepository, "recentes_do_aluno", AsyncMock(return_value=[]))
    monkeypatch.setattr(ChatGuiaRegistrosRepository, "dificuldades_da_turma", AsyncMock(return_value=[]))
    gravar = AsyncMock()
    monkeypatch.setattr(ChatGuiaRegistrosRepository, "gravar", gravar)

    pedidos: list[dict] = []

    async def fake_ainvoke_structured(self, *, prompt_name, payload, schema, **kwargs):
        if prompt_name == "mentor_grounding_check.txt":
            return schema.model_validate({"viola": False, "motivo": ""})
        pedidos.append(payload)
        if isinstance(resposta, Exception):
            raise resposta
        return schema.model_validate(resposta)

    monkeypatch.setattr(JsonLLMService, "ainvoke_structured", fake_ainvoke_structured)
    return pedidos, gravar


def _pedido(mensagem: str) -> dict:
    return {"classe_id": 3, "topico_id": 12, "escopo": "modulo", "mensagem": mensagem, "historico": []}


def test_rota_sem_aluno_perfil_manda_mastermind_ao_modelo(app, monkeypatch) -> None:
    pedidos, _ = _preparar_rota(app, monkeypatch, resposta={"reply": "Lógica é...", "registro": {"intencao": "duvida_materia"}})

    with TestClient(app) as client:
        resposta = client.post("/api/v1/personalizar/chat", json=_pedido("O que é lógica?"))

    assert resposta.status_code == 200, resposta.text
    assert pedidos[-1]["perfil_brainhex"][0]["perfil"] == "Mastermind"


@pytest.mark.parametrize("mensagem", ["O que é lógica?", "o que é a loja?"])
def test_rota_com_modelo_fora_responde_a_reserva_nova(app, monkeypatch, mensagem: str) -> None:
    _, gravar = _preparar_rota(app, monkeypatch, resposta=ProvedorIndisponivelError("sem cota"))

    with TestClient(app) as client:
        resposta = client.post("/api/v1/personalizar/chat", json=_pedido(mensagem))

    assert resposta.status_code == 200, resposta.text
    reply = resposta.json()["reply"]
    assert "Seeker" not in reply
    assert "considero" not in reply
    if "loja" in mensagem:
        assert reply.startswith("A Loja fica no Perfil.")
    else:
        assert "Variáveis, tipos e operadores" in reply
        assert "operadores lógicos" in reply
    assert gravar.await_args.kwargs["origem"] == "reserva"


def test_rag_nao_repete_o_429_por_conta_propria() -> None:
    """O SDK da OpenAI repetia o 429 duas vezes com espera: 19,8 s do prazo do chat em 24/11."""
    from app.services.openai_rag import OpenAIRagService

    cliente = OpenAIRagService(_settings(openai_rag_api_key="sk-teste"))._get_client()
    assert cliente.max_retries == 0
