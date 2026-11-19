"""A rota do Guia grava o que a pergunta era (mascarado) e lê de volta como memória (20261118_01)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_session
from app.repositories.access import AccessRepository
from app.repositories.chat_guia_registros import ChatGuiaRegistrosRepository
from app.repositories.conteudo_classe import ConteudoClasseRepository
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.context import ContextRepository
from app.services.auth import UserContext
from app.services.llm import JsonLLMService, ProvedorIndisponivelError
from tests.conftest import FakeSession

ALUNO = "3f0c9d2e-7a41-4b8e-9c55-1d2e3f4a5b6c"

RESPOSTA = {
    "reply": "Pense no mmc dos denominadores.",
    "should_close": False,
    "hinted_actions": [],
    "registro": {
        "intencao": "duvida_materia",
        "assunto": "soma de frações que a Bia Lima não entendeu, liga 11 98765-4321",
        "conceitos": ["Frações", "mmc", "Bia"],
        "dificuldade": "travado",
    },
}


def _preparar(app, monkeypatch, *, resposta=RESPOSTA, recentes=None, turma=None, gravar=None):
    fake_session = FakeSession()

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: UserContext(user_id=ALUNO, role="aluno", aluno_id=ALUNO)
    monkeypatch.setattr(AccessRepository, "aluno_belongs_to_classe", AsyncMock(return_value=True))
    monkeypatch.setattr(
        ContextRepository,
        "fetch_aluno_context",
        AsyncMock(return_value={"aluno": {"id": ALUNO, "nome": "Carla Mendes", "apelido": "Cacá"}}),
    )
    monkeypatch.setattr(ConteudoPersonalizadoRepository, "buscar_por_aluno", AsyncMock(return_value=[]))
    monkeypatch.setattr(ConteudoClasseRepository, "buscar_classe_id_por_topico", AsyncMock(return_value=1))
    monkeypatch.setattr(ConteudoClasseRepository, "buscar_topico", AsyncMock(return_value={"nome": "Frações"}))
    for metodo in (
        "buscar_conteudos_topico",
        "buscar_atividades_topico",
        "buscar_questoes_com_gabarito_topico",
        "buscar_cards_topico",
    ):
        monkeypatch.setattr(ConteudoClasseRepository, metodo, AsyncMock(return_value=[]))
    monkeypatch.setattr(
        ChatGuiaRegistrosRepository,
        "nomes_da_turma",
        AsyncMock(return_value=[{"nome": "Beatriz Lima", "apelido": "Bia"}]),
    )
    monkeypatch.setattr(ChatGuiaRegistrosRepository, "recentes_do_aluno", AsyncMock(return_value=recentes or []))
    monkeypatch.setattr(ChatGuiaRegistrosRepository, "dificuldades_da_turma", AsyncMock(return_value=turma or []))
    gravar = gravar or AsyncMock()
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


def _pedido(mensagem: str = "não entendi a soma de frações") -> dict:
    return {"classe_id": 1, "topico_id": 7, "escopo": "modulo", "mensagem": mensagem, "historico": []}


def test_grava_o_registro_mascarado_e_nao_devolve_ao_app(app, monkeypatch) -> None:
    _pedidos, gravar = _preparar(app, monkeypatch)

    with TestClient(app) as client:
        resposta = client.post("/api/v1/personalizar/chat", json=_pedido())

    assert resposta.status_code == 200, resposta.text
    assert "registro" not in resposta.json()
    registro = gravar.await_args.args[0]
    kwargs = gravar.await_args.kwargs
    assert kwargs["origem"] == "modelo"
    assert (kwargs["classe_id"], kwargs["topico_id"], kwargs["escopo"]) == (1, 7, "modulo")
    assert registro.intencao == "duvida_materia"
    assert registro.dificuldade == "travado"
    assert registro.conceitos == ["frações", "mmc"]
    gravado = json.dumps(registro.__dict__, ensure_ascii=False)
    for vazado in ("Bia", "Lima", "98765", "não entendi"):
        assert vazado not in gravado


def test_memoria_e_dificuldade_da_turma_vao_ao_modelo(app, monkeypatch) -> None:
    pedidos, _ = _preparar(
        app,
        monkeypatch,
        recentes=[
            {"topico_id": 7, "intencao": "duvida_materia", "assunto": "mmc", "conceitos": ["mmc"], "dificuldade": "travado"}
        ],
        turma=[{"conceito": "denominador", "alunos": 4}],
    )

    with TestClient(app) as client:
        client.post("/api/v1/personalizar/chat", json=_pedido())

    memoria = pedidos[-1]["memoria_do_guia"]
    assert memoria["conceitos_com_dificuldade"] == ["mmc"]
    assert memoria["travou_neste_topico"] is True
    assert memoria["dificuldades_da_turma_neste_topico"] == ["denominador"]
    # A pergunta continua por último: a memória não pode entrar na frente dela no payload (cache).
    chaves = list(pedidos[-1])
    assert chaves.index("memoria_do_guia") < chaves.index("mensagem")


def test_primeira_conversa_manda_memoria_vazia(app, monkeypatch) -> None:
    pedidos, _ = _preparar(app, monkeypatch)

    with TestClient(app) as client:
        client.post("/api/v1/personalizar/chat", json=_pedido())

    assert pedidos[-1]["memoria_do_guia"] == {}


def test_navegacao_registra_a_tela_sem_chamar_o_modelo(app, monkeypatch) -> None:
    pedidos, gravar = _preparar(app, monkeypatch)

    with TestClient(app) as client:
        client.post("/api/v1/personalizar/chat", json=_pedido("Onde fica a Loja?"))

    assert pedidos == []
    assert gravar.await_args.kwargs["origem"] == "regra"
    assert gravar.await_args.args[0].assunto == "onde fica: perfil.loja"


def test_resposta_de_reserva_registra_sem_classificar(app, monkeypatch) -> None:
    _pedidos, gravar = _preparar(app, monkeypatch, resposta=ProvedorIndisponivelError("fora"))

    with TestClient(app) as client:
        resposta = client.post("/api/v1/personalizar/chat", json=_pedido())

    assert resposta.status_code == 200, resposta.text
    assert gravar.await_args.kwargs["origem"] == "reserva"
    registro = gravar.await_args.args[0]
    assert (registro.intencao, registro.assunto, registro.conceitos) == ("outro", None, [])


def test_falha_ao_gravar_nao_derruba_a_resposta(app, monkeypatch) -> None:
    _preparar(app, monkeypatch, gravar=AsyncMock(side_effect=RuntimeError("tabela ausente")))

    with TestClient(app) as client:
        resposta = client.post("/api/v1/personalizar/chat", json=_pedido())

    assert resposta.status_code == 200
    assert resposta.json()["reply"]
