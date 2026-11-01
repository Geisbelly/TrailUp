"""A IA desliga o cronômetro (#136, fase 4): roteamento, nó e executor."""

from __future__ import annotations

from importlib import import_module
from unittest.mock import AsyncMock

import pytest

from app.agent.graph.nodes.agente_cronometro import agente_cronometro
from app.agent.graph.nodes.executor import executor
from app.agent.graph.routing import compute_supervisor_next
from app.services.tentativas_atividade import decidir_desligar_cronometro
from tests.test_agente_intervencao import _Fabrica

modulo_executor = import_module("app.agent.graph.nodes.executor")

FORA = [False, False, True, False, True]


def _estado(ligado=True, origem="perfil", janela=FORA, **extra):
    return {
        "aluno_id": "a",
        "classe_id": 7,
        "ciclo_id": "c",
        "historico_eventos": [{"tipo": "x"}],
        "eventos_novos": [],
        "completed_nodes": ["agente_perfil"],
        "perfil_update": {"x": 1},
        "desempenho_recente": {
            "tentativas": {"cronometro": {"ligado": ligado, "origem": origem}, "ultimas_cronometradas_no_tempo": janela}
        },
        **extra,
    }


def test_supervisor_chama_o_cronometro_so_quando_a_regra_dispara() -> None:
    assert "agente_cronometro" in compute_supervisor_next(_estado())
    assert "agente_cronometro" not in compute_supervisor_next(_estado(janela=[True] * 5))
    assert "agente_cronometro" not in compute_supervisor_next(_estado(origem="aluno"))
    assert "agente_cronometro" not in compute_supervisor_next(_estado(ligado=False))
    assert "agente_cronometro" not in compute_supervisor_next(_estado(classe_id=None))
    assert "agente_cronometro" not in compute_supervisor_next(_estado(completed_nodes=["agente_perfil", "agente_cronometro"]))


def test_supervisor_leva_a_decisao_ao_executor() -> None:
    decisao = decidir_desligar_cronometro(_estado()["desempenho_recente"]["tentativas"], None)
    estado = _estado(
        completed_nodes=["agente_perfil", "agente_cronometro"], perfil_update=None,
        cronometro_payload=decisao.model_dump(mode="json"),
    )
    assert compute_supervisor_next(estado) == ["executor"]


@pytest.mark.asyncio
async def test_no_devolve_o_payload_com_o_motivo() -> None:
    r = await agente_cronometro(_estado())
    assert r["cronometro_payload"]["criterio"] == "fora_do_tempo"
    assert "3 das últimas 5" in r["cronometro_payload"]["motivo"]
    assert "cronometro_payload" not in await agente_cronometro(_estado(janela=[True] * 5))


def _mock(monkeypatch, gravou: bool):
    desligar = AsyncMock(return_value=gravou)
    registrar = AsyncMock(return_value="uuid-1")
    monkeypatch.setattr(modulo_executor.TentativasRepository, "desligar_cronometro_pela_ia", desligar)
    monkeypatch.setattr(modulo_executor.IntervencaoRepository, "registrar_do_aluno", registrar)
    monkeypatch.setattr(modulo_executor.EventoRepository, "log", AsyncMock())
    return desligar, registrar


@pytest.mark.asyncio
async def test_executor_desliga_e_avisa_o_professor(monkeypatch) -> None:
    desligar, registrar = _mock(monkeypatch, True)
    payload = (await agente_cronometro(_estado()))["cronometro_payload"]
    r = await executor({"aluno_id": "a", "classe_id": 7, "ciclo_id": "c", "cronometro_payload": payload}, _Fabrica())

    assert desligar.await_args.args == ("a", payload["motivo"])
    assert "cronometro_desligado" in r["acoes_aplicadas"]
    aviso = registrar.await_args.kwargs["intervencao"]
    assert (aviso.kind, aviso.tipo, aviso.acao, aviso.origem) == ("cronometro_desligado", "engajamento", "acompanhar", "regra")
    assert payload["motivo"] in aviso.texto and "nota não muda" in aviso.texto
    assert registrar.await_args.kwargs["classe_id"] == 7


@pytest.mark.asyncio
async def test_executor_nao_avisa_quando_o_aluno_escolheu_antes(monkeypatch) -> None:
    """O UPSERT não grava se o aluno mexeu no interruptor entre a leitura e o executor."""
    _, registrar = _mock(monkeypatch, False)
    payload = (await agente_cronometro(_estado()))["cronometro_payload"]
    r = await executor({"aluno_id": "a", "classe_id": 7, "ciclo_id": "c", "cronometro_payload": payload}, _Fabrica())
    assert "cronometro_mantido" in r["acoes_aplicadas"]
    registrar.assert_not_awaited()
