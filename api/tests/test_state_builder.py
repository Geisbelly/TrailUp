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
            mental_state_recorrente=MentalStateRecorrente(recorrente=True, kind="dificuldade", ocorrencias=3),
        )

    monkeypatch.setattr(state_builder, "ler_memoria", fake_ler_memoria)

    payload = AnalisarPayload(classe_id=32, modo="estudo", eventos_novos=[])
    state = await build_initial_state(
        object(), "aluno-1", payload, context_repository_factory=_FakeContextRepo
    )

    assert state["memoria_aluno"]["mental_state_recorrente"]["recorrente"] is True
    assert state["memoria_aluno"]["mental_state_recorrente"]["kind"] == "dificuldade"


@pytest.mark.asyncio
async def test_foco_de_estudo_vai_para_o_estado(monkeypatch) -> None:
    async def fake_ler_memoria(_session, *, aluno_id, classe_id):
        return MemoriaAluno(dominio_por_topico={})

    class _ComFoco(_FakeContextRepo):
        chamadas: list[dict] = []

        async def fetch_foco_de_estudo(self, **kwargs):
            self.chamadas.append(kwargs)
            return {"topico_id": 11, "topico": "Frações", "percentual_concluido": 40, "proximo_conteudo": None}

    monkeypatch.setattr(state_builder, "ler_memoria", fake_ler_memoria)
    payload = AnalisarPayload(classe_id=32, topico_id=11, modo="estudo", eventos_novos=[])
    state = await build_initial_state(object(), "aluno-1", payload, context_repository_factory=_ComFoco)

    assert state["foco_estudo"]["topico"] == "Frações"
    assert _ComFoco.chamadas == [{"aluno_id": "aluno-1", "classe_id": 32, "topico_id": 11}]


@pytest.mark.asyncio
async def test_falha_no_foco_nao_derruba_o_ciclo(monkeypatch) -> None:
    async def fake_ler_memoria(_session, *, aluno_id, classe_id):
        return MemoriaAluno(dominio_por_topico={})

    class _Quebrado(_FakeContextRepo):
        async def fetch_foco_de_estudo(self, **kwargs):
            raise RuntimeError("banco fora")

    monkeypatch.setattr(state_builder, "ler_memoria", fake_ler_memoria)
    payload = AnalisarPayload(classe_id=32, modo="estudo", eventos_novos=[])
    sem_metodo = await build_initial_state(object(), "a", payload, context_repository_factory=_FakeContextRepo)
    quebrado = await build_initial_state(object(), "a", payload, context_repository_factory=_Quebrado)

    assert sem_metodo["foco_estudo"] is None
    assert quebrado["foco_estudo"] is None


def test_foco_de_estudo_esta_declarado_no_estado() -> None:
    # Chave fora do TrailUpState é descartada na entrada do LangGraph (#64).
    from app.agent.graph.state import TrailUpState

    assert "foco_estudo" in TrailUpState.__annotations__
