"""O UUID do aluno nao vai ao provedor de IA (LGPD, minimizacao).

Nenhum prompt usa o identificador, e dado pseudonimizado continua sendo dado
pessoal para o controlador. Ele saia em dois pontos: o pedido do chat do mentor
(`aluno.id`) e o resumo de estado do supervisor (`aluno_id`).
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.agent.graph.routing import build_state_summary
from app.api.deps import get_current_user, get_session
from app.repositories.access import AccessRepository
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.context import ContextRepository
from app.services.auth import UserContext
from app.services.llm import JsonLLMService
from tests.conftest import FakeSession

UUID_ALUNO = "3f0c9d2e-7a41-4b8e-9c55-1d2e3f4a5b6c"


def test_chat_do_mentor_nao_manda_o_uuid_do_aluno(app, monkeypatch) -> None:
    fake_session = FakeSession()

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: UserContext(
        user_id=UUID_ALUNO, role="aluno", aluno_id=UUID_ALUNO
    )
    monkeypatch.setattr(AccessRepository, "aluno_belongs_to_classe", AsyncMock(return_value=True))
    monkeypatch.setattr(
        ContextRepository,
        "fetch_aluno_context",
        AsyncMock(return_value={"aluno": {"id": UUID_ALUNO, "modo_operacao": "foco"}}),
    )
    monkeypatch.setattr(ConteudoPersonalizadoRepository, "buscar_por_aluno", AsyncMock(return_value=[]))

    enviados: list[str] = []
    respostas = iter(
        [
            {"reply": "Vamos revisar o tópico.", "should_close": False, "hinted_actions": []},
            {"viola": False, "motivo": ""},
        ]
    )

    async def fake_ainvoke_structured(self, *, prompt_name, payload, schema, **kwargs):
        enviados.append(json.dumps(payload, ensure_ascii=False, default=str))
        return schema.model_validate(next(respostas))

    monkeypatch.setattr(JsonLLMService, "ainvoke_structured", fake_ainvoke_structured)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/personalizar/chat",
            json={
                "classe_id": 1,
                "topico_id": None,
                "conteudo_id": None,
                "escopo": "trilha_home",
                "mensagem": "por onde começo?",
                "historico": [],
            },
        )

    assert response.status_code == 200
    assert enviados, "o modelo nao foi chamado"
    for enviado in enviados:
        assert UUID_ALUNO not in enviado
    # O resto do aluno continua indo: so o identificador saiu.
    assert '"modo_operacao": "foco"' in enviados[0]


def test_resumo_do_supervisor_nao_leva_o_uuid_do_aluno() -> None:
    base = {"aluno_id": UUID_ALUNO, "classe_id": 7, "perfil_brainhex": ["seeker"]}
    for state in ({**base, "workflow_kind": "personalizar"}, base):
        resumo = build_state_summary(state)
        assert "aluno_id" not in resumo
        assert UUID_ALUNO not in json.dumps(resumo, default=str)
        assert resumo["classe_id"] == 7
