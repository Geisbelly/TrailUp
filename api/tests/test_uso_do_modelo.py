"""Uso do modelo que o microservice devolve, até o alvo da fila (#21, `20261103_14`)."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.settings import Settings
from app.services.media_agents import (
    CONTENT_ENRICHMENT_PROVIDER,
    MEDIA_PIPELINE_VERSION,
    PRESENTATION_DESIGN_VERSION,
    PRESENTATION_ENGINE_VERSION,
    disparar_brainhex_async,
)
from app.services.personalizacao_jobs import _gravar_uso_do_modelo
from app.services.uso_do_modelo import extrair_uso

USO = {
    "chamadas": 3,
    "tokens_entrada": 1200,
    "tokens_saida": 800,
    "caracteres": 0,
    "por_modelo": {"gemini-flash": {"chamadas": 3, "tokens_entrada": 1200, "tokens_saida": 800, "caracteres": 0}},
}


def test_extrai_o_uso_limpo() -> None:
    assert extrair_uso({"status": "completed", "uso_modelo": USO}) == USO


def test_sem_uso_ou_sem_chamada_nao_grava_nada() -> None:
    assert extrair_uso(None) is None
    assert extrair_uso({"status": "completed"}) is None
    assert extrair_uso({"uso_modelo": "x"}) is None
    assert extrair_uso({"uso_modelo": {"chamadas": 0, "por_modelo": {}}}) is None


def test_campo_estranho_vira_zero_e_modelo_invalido_sai() -> None:
    uso = extrair_uso(
        {"uso_modelo": {"chamadas": 2, "tokens_entrada": "muito", "tokens_saida": -4, "caracteres": True,
                        "por_modelo": {"ok": {"chamadas": 2.4}, "ruim": None}}}
    )
    assert uso == {
        "chamadas": 2, "tokens_entrada": 0, "tokens_saida": 0, "caracteres": 0,
        "por_modelo": {"ok": {"chamadas": 2, "tokens_entrada": 0, "tokens_saida": 0, "caracteres": 0}},
    }


@pytest.fixture
def settings() -> Settings:
    s = Settings()
    s.brainhex_api_url = "http://brainhex.local"
    return s


async def _disparar(settings, status: int, corpo: dict[str, Any], uso_sink: list) -> bool:
    contract = {
        "media_pipeline_version": MEDIA_PIPELINE_VERSION,
        "presentation_engine_version": PRESENTATION_ENGINE_VERSION,
        "presentation_design_version": PRESENTATION_DESIGN_VERSION,
        "content_enrichment_provider": CONTENT_ENRICHMENT_PROVIDER,
    }
    health = MagicMock(status_code=200)
    health.json.return_value = {"status": "ok", **contract}
    resposta = MagicMock(status_code=status, text="")
    resposta.json.return_value = {**corpo, **(contract if status == 200 else {})}
    erros: list[str] = []
    with patch("httpx.AsyncClient") as cls:
        cliente = AsyncMock()
        cliente.__aenter__ = AsyncMock(return_value=cliente)
        cliente.__aexit__ = AsyncMock(return_value=None)
        cliente.get = AsyncMock(return_value=health)
        cliente.post = AsyncMock(return_value=resposta)
        cls.return_value = cliente
        ok = await disparar_brainhex_async(
            settings=settings, perfil="achiever", fontes=[], content_blocks=[{"id": "b"}],
            personalizacao_id=1, ciclo_id="c", source_hash="h", generation_key="c:h",
            wait_for_completion=True, error_sink=erros, uso_sink=uso_sink,
        )
    return ok


@pytest.mark.asyncio
async def test_o_disparo_devolve_o_uso_no_sucesso(settings) -> None:
    uso_sink: list = []
    assert await _disparar(settings, 200, {"status": "completed", "uso_modelo": USO}, uso_sink) is True
    assert uso_sink == [USO]


@pytest.mark.asyncio
async def test_o_disparo_devolve_o_uso_tambem_na_falha(settings) -> None:
    """A tentativa que falhou também foi paga."""
    uso_sink: list = []
    assert await _disparar(settings, 500, {"status": "failed", "error": "x", "uso_modelo": USO}, uso_sink) is False
    assert uso_sink == [USO]


class _Sessao:
    def __init__(self, falhar: bool = False) -> None:
        self.executados: list[tuple[str, dict]] = []
        self.commits = 0
        self.falhar = falhar

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, sql, params=None):
        if self.falhar:
            raise RuntimeError("coluna uso_modelo nao existe")
        self.executados.append((str(sql), params))

    async def commit(self):
        self.commits += 1


def _app(sessao: _Sessao) -> Any:
    app = MagicMock()
    app.state.session_factory = lambda: sessao
    return app


@pytest.mark.asyncio
async def test_grava_cada_uso_no_alvo_e_confirma() -> None:
    sessao = _Sessao()
    await _gravar_uso_do_modelo(_app(sessao), {"id": 77}, [USO, USO])
    assert len(sessao.executados) == 2
    sql, params = sessao.executados[0]
    assert "fn_personalizacao_uso_somar(uso_modelo" in sql
    assert params["target_id"] == 77
    assert sessao.commits == 1


@pytest.mark.asyncio
async def test_sem_uso_nao_abre_sessao_e_erro_nunca_sobe() -> None:
    sessao = _Sessao(falhar=True)
    await _gravar_uso_do_modelo(_app(sessao), {"id": 77}, [])
    await _gravar_uso_do_modelo(_app(sessao), {"id": 77}, [USO])  # não levanta
    assert sessao.commits == 0
