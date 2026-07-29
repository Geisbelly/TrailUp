import pytest

from app.schemas.api import AnalisarPayload
from app.services.state_builder import build_initial_state


class _FakeContextRepository:
    def __init__(self, session) -> None:
        self.session = session

    async def fetch_aluno_context(self, aluno_id: str, classe_id: int) -> dict:
        return {
            "aluno": {"nome": "Aluno Teste", "email": "aluno@example.com", "modo_operacao": "imediato", "modo_resposta": "imediato"},
            "perfil_brainhex": [{"perfil": "Achiever", "afinidade": 50}],
            "historico_eventos": [],
            "progresso_trilha": {},
            "desempenho_recente": {"media_acertos": 20, "topico_concluido": False, "topico_recente_id": 9},
            "trilha_atual": None,
            "ia_descricao_atual": None,
        }

    async def resolve_conteudo_foco_id(self, *, topico_id, atividade_id, fallback_topico_id):
        return None


@pytest.mark.asyncio
async def test_build_initial_state_flags_gerar_materiais_for_low_media_acertos_percentage() -> None:
    payload = AnalisarPayload(classe_id=1, modo="revisao")

    state = await build_initial_state(
        session=None,
        aluno_id="aluno-1",
        payload=payload,
        context_repository_factory=_FakeContextRepository,
    )

    assert state["gerar_materiais"] is True
