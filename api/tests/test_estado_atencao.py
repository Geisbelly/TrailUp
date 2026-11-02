"""Estado de atenção corrente (#149): a API grava ao fim do ciclo, o motor de notificações lê."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.repositories.estado_atencao import EstadoAtencaoRepository, estado_da_atencao
from app.repositories.sugestao_material import SugestaoMaterialRepository
from app.services import analysis_runner


class _Sessao:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    async def execute(self, statement, params=None):
        self.calls.append((str(statement), params))
        return None

    async def commit(self):
        return None

    async def rollback(self):
        return None


@pytest.mark.asyncio
async def test_registrar_faz_upsert_e_limita_o_score() -> None:
    sessao = _Sessao()
    gravou = await EstadoAtencaoRepository(sessao).registrar(
        aluno_id="aluno-1", estado="baixa", score=1.4, ciclo_id="c1"
    )
    sql, params = sessao.calls[0]
    assert gravou is True
    assert "ON CONFLICT (aluno_id) DO UPDATE" in sql
    assert "CAST(:score AS NUMERIC)" in sql
    assert params == {"aluno_id": "aluno-1", "estado": "baixa", "score": 1.0, "ciclo_id": "c1"}


@pytest.mark.asyncio
async def test_estado_desconhecido_nao_grava() -> None:
    sessao = _Sessao()
    assert await EstadoAtencaoRepository(sessao).registrar(aluno_id="a", estado="distraido") is False
    assert sessao.calls == []


def test_estado_da_atencao_le_o_snapshot_do_pipeline() -> None:
    assert estado_da_atencao({"attention_snapshot": {"estado_atencao": "alta", "score": 0.81}}) == ("alta", 0.81)
    assert estado_da_atencao({"attention_snapshot": {"estado_atencao": "moderada", "score": "x"}}) == ("moderada", None)
    assert estado_da_atencao({"attention_snapshot": {"estado_atencao": "??"}}) is None
    assert estado_da_atencao({}) is None
    assert estado_da_atencao(None) is None


@pytest.mark.asyncio
async def test_ciclo_grava_o_estado_de_atencao(monkeypatch) -> None:
    registrar = AsyncMock(return_value=True)
    monkeypatch.setattr(EstadoAtencaoRepository, "registrar", registrar)
    monkeypatch.setattr("app.repositories.mental_state.MentalStateHistoryRepository.registrar", AsyncMock())
    monkeypatch.setattr(SugestaoMaterialRepository, "desempenho_no_topico", AsyncMock(return_value=None))
    monkeypatch.setattr("app.repositories.evento.EventoRepository.log", AsyncMock())
    monkeypatch.setattr(analysis_runner, "_revisar_sugestao", AsyncMock(return_value=None))

    async def estado_inicial(session, aluno_id, payload, **kwargs):
        return {"ciclo_id": "c1", "aluno_id": aluno_id, "classe_id": payload.classe_id, "desempenho_recente": {}}

    class _Orquestrador:
        async def run(self, **kwargs):
            # O pipeline escreve o snapshot no `state`; o resultado do grafo pode vir sem ele.
            kwargs["state"]["attention_snapshot"] = {"estado_atencao": "alta", "score": 0.77}
            return {"ciclo_id": "c1"}

    monkeypatch.setattr(analysis_runner, "build_initial_state", estado_inicial)
    monkeypatch.setattr(analysis_runner, "build_linear_analysis_orchestrator", lambda _s: _Orquestrador())
    app = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(default_checkpoint_ns="t")))

    await analysis_runner.run_analysis(
        request=SimpleNamespace(app=app),
        session=_Sessao(),
        aluno_id="aluno-1",
        classe_id=32,
        topico_id=10,
        atividade_id=None,
        frame_b64=None,
        eventos_novos=[],
        modo="estudo",
    )

    registrar.assert_awaited_once()
    assert registrar.await_args.kwargs == {
        "aluno_id": "aluno-1", "estado": "alta", "score": 0.77, "ciclo_id": "c1"
    }
