"""Estado de estudo no histórico (DAT-45): o que cada ciclo grava e quem lê."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.repositories.sugestao_material import SugestaoMaterialRepository
from app.schemas.common import Evento
from app.services import analysis_runner
from app.services.estado_de_estudo import KINDS_DE_ALERTA, estado_do_ciclo
from app.services.memoria_aluno import _detectar_recorrencia
from tests import _f5_banco as f5

DIFICIL = {"media_acertos": 40.0, "itens": 3}


def _ev(*tipos: str) -> list[Evento]:
    return [Evento(tipo=t) for t in tipos]


def test_abandono_vence_dificuldade() -> None:
    estado = estado_do_ciclo(eventos_novos=_ev("abandono_atividade", "erro_recorrente"), desempenho_topico=DIFICIL)
    assert estado["kind"] == "abandono"


def test_dificuldade_pelo_acerto_do_topico_cita_o_numero() -> None:
    estado = estado_do_ciclo(eventos_novos=[], desempenho_topico=DIFICIL)
    assert estado == {"kind": "dificuldade", "reason": "acerto médio de 40% em 3 atividades concluídas do tópico"}


def test_dificuldade_segue_a_regra_da_sugestao() -> None:
    # Mesma regra da camada 0 (DAT-21): uma atividade só é tropeço, e 60% basta.
    assert estado_do_ciclo(eventos_novos=[], desempenho_topico={"media_acertos": 10.0, "itens": 1})["kind"] == "sem_alerta"
    assert estado_do_ciclo(eventos_novos=[], desempenho_topico={"media_acertos": 60.0, "itens": 4})["kind"] == "sem_alerta"


def test_erros_seguidos_no_lote_sao_dificuldade() -> None:
    assert estado_do_ciclo(eventos_novos=_ev("erro_recorrente"), desempenho_topico=None)["kind"] == "dificuldade"


def test_sem_sinal_grava_sem_alerta_e_nao_conta_na_recorrencia() -> None:
    estado = estado_do_ciclo(eventos_novos=_ev("atividade_errada", "atividade_errada"), desempenho_topico=None)
    assert estado == {"kind": "sem_alerta", "reason": None}
    assert estado["kind"] not in KINDS_DE_ALERTA


def test_sem_alerta_ocupa_a_janela() -> None:
    # Sem o registro neutro, a janela juntaria alertas de semanas diferentes.
    registros = [{"kind": "sem_alerta"}] * 3 + [{"kind": "abandono"}] * 3
    assert _detectar_recorrencia(registros).recorrente is False


class _Sessao:
    async def execute(self, *a, **k):
        return None

    async def commit(self):
        return None

    async def rollback(self):
        return None


@pytest.mark.asyncio
async def test_ciclo_grava_o_estado_de_estudo_e_ignora_a_emocao_do_ai_patch(monkeypatch) -> None:
    registrar = AsyncMock()
    desempenho = AsyncMock(return_value=DIFICIL)
    monkeypatch.setattr("app.repositories.mental_state.MentalStateHistoryRepository.registrar", registrar)
    monkeypatch.setattr(SugestaoMaterialRepository, "desempenho_no_topico", desempenho)
    monkeypatch.setattr("app.repositories.evento.EventoRepository.log", AsyncMock())
    monkeypatch.setattr(analysis_runner, "_revisar_sugestao", AsyncMock(return_value=None))

    async def estado_inicial(session, aluno_id, payload, **kwargs):
        return {"ciclo_id": "c1", "aluno_id": aluno_id, "classe_id": payload.classe_id, "desempenho_recente": {}}

    class _Orquestrador:
        async def run(self, **kwargs):
            state = kwargs["state"]
            # O ai_patch ainda pode trazer `anxious` (regra fixa sobre nota): não vai para o histórico.
            state["ai_patch"] = {"mentalState": {"kind": "anxious"}}
            return state

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

    desempenho.assert_awaited_once_with(aluno_id="aluno-1", topico_id=10)
    registrar.assert_awaited_once()
    assert registrar.await_args.kwargs["kind"] == "dificuldade"
    assert registrar.await_args.kwargs["ciclo_id"] == "c1"


def test_migration_do_risco_troca_o_fator_e_deixa_dificuldade_de_fora() -> None:
    m = f5.modulo("20261102_10_risco_le_estado_de_estudo.py")
    corpo = m.funcao_nova()
    assert "e.kind = 'abandono'" in corpo
    assert "'fator', 'abandono_recorrente'" in corpo
    for antigo in ("frustrated", "anxious", "estado_negativo_recorrente", "dificuldade'"):
        assert antigo not in corpo
    # O resto da função é o da 20261101_03: só os trechos trocados mudam.
    original = m._funcao_da_20261101_03()
    assert corpo.count("jsonb_build_object(") == original.count("jsonb_build_object(")
