"""Notificação diária escrita pela IA: uma por aluno a cada N horas, com tópico, sem RAG e sem texto extra."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from importlib import import_module
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.agent.graph.routing import compute_supervisor_next
from app.core.settings import Settings
from app.services import state_builder
from app.services.llm import StructuredOutputError

modulo = import_module("app.agent.graph.nodes.agente_notificacao")
AGORA = datetime(2026, 11, 20, 15, 0, tzinfo=UTC)
FOCO = {"topico_id": 11, "topico": "Frações", "percentual_concluido": 82, "proximo_conteudo": "Soma de frações"}

# Sem emoção negativa e sem inatividade: só a trava diária pode trazer o nó.
ESTADO = {
    "aluno_id": "a",
    "nome_aluno": "Fulana",
    "email_aluno": "f@x",
    "perfil_brainhex": [{"perfil": "Conqueror", "afinidade": 85}],
    "emocao_atual": {"emocao_primaria": "neutro", "valencia": 0.1},
    "desempenho_recente": {"media_acertos": 80},
    "eventos_novos": [{"tipo": "atividade_concluida"}],
    "foco_estudo": FOCO,
}


def _gerada(**campos):
    base = {
        "tipo": "lembrete",
        "titulo": "Bora fechar Frações, {nome}?",
        "corpo": "Falta pouco. Abra Soma de frações e vença mais uma etapa.",
        "horario": AGORA + timedelta(hours=3),
        "prioridade": 1,
        "evidencia": None,
    }
    return modulo.NotificacaoGerada(**{**base, **campos})


# --- trava do state_builder ---------------------------------------------------------------------


class _Repo:
    def __init__(self, ultima):
        self.ultima = ultima
        self.chamadas = 0

    async def fetch_ultima_notificacao_ia_em(self, *, aluno_id: str):
        self.chamadas += 1
        if isinstance(self.ultima, Exception):
            raise self.ultima
        return self.ultima


def _settings(monkeypatch, ligada: bool = True, horas: int = 20) -> None:
    monkeypatch.setattr(
        state_builder,
        "get_settings",
        lambda: SimpleNamespace(notificacao_ia_diaria=ligada, notificacao_ia_intervalo_horas=horas),
    )


async def _liberada(repo, foco=FOCO):
    return await state_builder._notificacao_diaria_liberada(repo, aluno_id="a", foco_estudo=foco, agora=AGORA)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("ultima", "esperado"),
    [
        (None, True),  # a IA nunca escreveu para o aluno
        (AGORA - timedelta(hours=2), False),  # escreveu há pouco: o lote seguinte não chama de novo
        (AGORA - timedelta(hours=19, minutes=59), False),
        (AGORA - timedelta(hours=20), True),
        (AGORA - timedelta(days=14), True),
    ],
)
async def test_uma_por_aluno_a_cada_20_horas(monkeypatch, ultima, esperado) -> None:
    _settings(monkeypatch)
    assert await _liberada(_Repo(ultima)) is esperado


@pytest.mark.asyncio
async def test_sem_topico_em_andamento_nao_libera_nem_le_o_banco(monkeypatch) -> None:
    _settings(monkeypatch)
    repo = _Repo(None)
    assert await _liberada(repo, foco=None) is False
    assert repo.chamadas == 0


@pytest.mark.asyncio
async def test_desligada_nas_configuracoes_nao_libera(monkeypatch) -> None:
    _settings(monkeypatch, ligada=False)
    assert await _liberada(_Repo(None)) is False


@pytest.mark.asyncio
async def test_falha_de_leitura_ou_repositorio_sem_o_metodo_nao_libera(monkeypatch) -> None:
    _settings(monkeypatch)
    assert await _liberada(_Repo(RuntimeError("banco"))) is False
    assert await _liberada(object()) is False


def test_vem_ligada_por_padrao_com_20_horas() -> None:
    s = Settings(openai_api_key=None)
    assert (s.notificacao_ia_diaria, s.notificacao_ia_intervalo_horas) == (True, 20)


# --- roteamento ---------------------------------------------------------------------------------


def test_liberada_chama_o_agente_de_notificacao() -> None:
    assert "agente_notificacao" in compute_supervisor_next({**ESTADO, "notificacao_diaria_liberada": True})
    assert "agente_notificacao" not in compute_supervisor_next({**ESTADO, "notificacao_diaria_liberada": False})


def test_turma_retida_continua_sem_notificacao() -> None:
    estado = {**ESTADO, "notificacao_diaria_liberada": True, "personalizacao_retida": True}
    assert "agente_notificacao" not in compute_supervisor_next(estado)


def test_diaria_nao_chama_o_agente_de_texto() -> None:
    concluidos = ["agente_notificacao", "agente_emocao", "agente_perfil", "agente_ui"]
    diaria = {**ESTADO, "completed_nodes": concluidos, "notificacao_payload": {"contexto": {"diaria": True}}}
    outra = {**ESTADO, "completed_nodes": concluidos, "notificacao_payload": {"contexto": {"motivo": "inatividade"}}}
    assert "agente_texto" not in compute_supervisor_next(diaria)
    assert "agente_texto" in compute_supervisor_next(outra)


# --- o nó ---------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_diaria_sai_do_modelo_sem_rag_e_marcada(monkeypatch) -> None:
    monkeypatch.setattr(modulo.OpenAIRagService, "is_configured", lambda self: True)
    chamada = AsyncMock(return_value=_gerada())
    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", chamada)

    r = await modulo.agente_notificacao(ESTADO, Settings(openai_api_key=None), agora=AGORA)

    assert [c.kwargs["use_rag"] for c in chamada.await_args_list] == [False]
    assert chamada.await_args.kwargs["payload"]["motivo"] == "engajamento"
    assert chamada.await_args.kwargs["payload"]["foco"]["topico"] == "Frações"
    payload = r["notificacao_payload"]
    assert payload["tipo"] == "lembrete" and payload["titulo"] == "Bora fechar Frações, {nome}?"
    assert payload["contexto"]["diaria"] is True and payload["contexto"]["origem"] == "modelo"


@pytest.mark.asyncio
async def test_diaria_sem_texto_do_modelo_nao_sai(monkeypatch) -> None:
    """Fora do ar, recusado ou rota de menor: a rotina do banco já vai com o tópico."""
    monkeypatch.setattr(modulo.OpenAIRagService, "is_configured", lambda self: True)
    monkeypatch.setattr(
        modulo.JsonLLMService, "ainvoke_structured", AsyncMock(side_effect=StructuredOutputError("fora"))
    )

    r = await modulo.agente_notificacao(ESTADO, Settings(openai_api_key=None), agora=AGORA)

    assert "notificacao_payload" not in r
    assert r["completed_nodes"] == ["agente_notificacao"]


@pytest.mark.asyncio
async def test_emocao_negativa_continua_com_rag_e_regra(monkeypatch) -> None:
    monkeypatch.setattr(modulo.OpenAIRagService, "is_configured", lambda self: True)
    monkeypatch.setattr(
        modulo.JsonLLMService, "ainvoke_structured", AsyncMock(side_effect=StructuredOutputError("fora"))
    )
    estado = {**ESTADO, "emocao_atual": {"emocao_primaria": "frustrado", "valencia": -0.6}}

    r = await modulo.agente_notificacao(estado, Settings(openai_api_key=None), agora=AGORA)

    assert r["notificacao_payload"]["contexto"]["origem"] == "regra"
    assert "diaria" not in r["notificacao_payload"]["contexto"]
