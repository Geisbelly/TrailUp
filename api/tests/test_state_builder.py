import pytest

from app.schemas.api import AnalisarPayload
from app.schemas.memoria_aluno import MemoriaAluno, MentalStateRecorrente
from app.services import state_builder
from app.services.state_builder import build_initial_state


class _FakeContextRepo:
    def __init__(self, _session) -> None:
        pass

    async def fetch_aluno_context(self, aluno_id, classe_id):
        return {
            "aluno": {"nome": "Aluno Teste", "email": "a@teste.com", "modo_operacao": "imediato", "modo_resposta": "imediato"},
            "perfil_brainhex": [],
            "historico_eventos": [],
            "progresso_trilha": {},
            "desempenho_recente": {"media_acertos": 80, "topico_recente_id": None, "topico_concluido": False},
            "trilha_atual": None,
            "ia_descricao_atual": None,
        }

    async def resolve_conteudo_foco_id(self, **kwargs):
        return None


@pytest.mark.asyncio
async def test_build_initial_state_propaga_memoria_aluno(monkeypatch) -> None:
    async def fake_ler_memoria(_session, *, aluno_id, classe_id):
        return MemoriaAluno(
            dominio_por_topico={},
            mental_state_recorrente=MentalStateRecorrente(recorrente=True, kind="frustrated", ocorrencias=3),
        )

    monkeypatch.setattr(state_builder, "ler_memoria", fake_ler_memoria)

    payload = AnalisarPayload(classe_id=32, modo="estudo", eventos_novos=[])
    state = await build_initial_state(
        object(), "aluno-1", payload, context_repository_factory=_FakeContextRepo
    )

    assert state["memoria_aluno"]["mental_state_recorrente"]["recorrente"] is True
    assert state["memoria_aluno"]["mental_state_recorrente"]["kind"] == "frustrated"
