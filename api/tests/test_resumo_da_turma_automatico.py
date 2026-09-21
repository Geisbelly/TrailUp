"""O retrato da turma se atualiza sem ninguem abrir a aba "Turma".

`classe_perfil_summary` era gravado SO quando alguem chamava
`GET /personalizar/grupo/{classe_id}`. Sem visita ele envelhecia em silencio,
e a conta continuava certa enquanto o numero na tela ficava velho.

Medido em producao: a classe 32 tinha o retrato de 26/08, mostrando 6.25 de
`percentual_concluido` medio quando o unico aluno da turma estava com 99.06 em
`classe_aluno` -- 16x de diferenca no painel do professor.

A conta NAO foi reimplementada: o laco chama o mesmo `upsert_summary` do
endpoint. Duas copias da mesma regra discordando e o defeito que este repo ja
pagou caro, e as sutilezas aqui convidam a isso -- o percentual da
distribuicao usa como denominador os alunos COM perfil, as medias usam TODOS,
e `perfil_predominante` e nulo em empate de proposito.
"""

from __future__ import annotations

import asyncio
import inspect
from pathlib import Path
from typing import Any

import pytest

from app.core.settings import Settings
from app.services import group_analysis
from app.services.group_analysis import (
    classe_perfil_summary_loop,
    classes_com_resumo_desatualizado,
    run_classe_perfil_summary_once,
)

FONTE = (
    Path(__file__).resolve().parents[1] / "app" / "services" / "group_analysis.py"
)


class _SessaoFalsa:
    def __init__(self, registro: list[str]) -> None:
        self._registro = registro

    async def __aenter__(self) -> "_SessaoFalsa":
        self._registro.append("abriu")
        return self

    async def __aexit__(self, *_: object) -> None:
        self._registro.append("fechou")

    async def commit(self) -> None:
        self._registro.append("commit")


def _fabrica(registro: list[str]):
    def fabricar() -> _SessaoFalsa:
        return _SessaoFalsa(registro)

    return fabricar


def test_a_staleness_olha_as_duas_fontes() -> None:
    """`classe_aluno` move o desempenho medio; `aluno_perfil` move a
    distribuicao e o perfil predominante. Olhar so a primeira deixaria a
    distribuicao velha quando um aluno refaz o quiz do BrainHex."""
    sql = inspect.getsource(classes_com_resumo_desatualizado)

    assert "ca.updated_at" in sql
    assert "ap.atualizado_em" in sql
    # E classe sem retrato nenhum tem de entrar.
    assert "cs.classe_id IS NULL" in sql


@pytest.mark.asyncio
async def test_uma_sessao_por_classe(monkeypatch) -> None:
    """Uma turma que estoura -- perfil sem linha em `perfil`, por exemplo --
    nao pode abortar a transacao das outras."""
    registro: list[str] = []
    monkeypatch.setattr(
        group_analysis,
        "classes_com_resumo_desatualizado",
        lambda _s: _resolvido([32, 54, 56]),
    )

    chamadas: list[int] = []

    async def upsert(_self, classe_id: int, summary: Any = None) -> dict[str, Any]:
        del summary
        chamadas.append(classe_id)
        if classe_id == 54:
            raise RuntimeError("perfil orfao nesta turma")
        return {"classe_id": classe_id}

    monkeypatch.setattr(group_analysis.GroupAnalysisService, "upsert_summary", upsert)

    atualizadas = await run_classe_perfil_summary_once(_fabrica(registro))

    # As tres foram tentadas, e a falha do meio nao impediu a ultima.
    assert chamadas == [32, 54, 56]
    assert atualizadas == 2


@pytest.mark.asyncio
async def test_nao_reimplementa_a_conta(monkeypatch) -> None:
    """O laco delega ao `upsert_summary` -- a mesma funcao que o endpoint usa.
    Se um dia ele passar a montar o summary por conta propria, existem duas
    autoridades para o mesmo numero."""
    registro: list[str] = []
    monkeypatch.setattr(
        group_analysis,
        "classes_com_resumo_desatualizado",
        lambda _s: _resolvido([32]),
    )

    recebido: list[Any] = []

    async def upsert(_self, classe_id: int, summary: Any = None) -> dict[str, Any]:
        recebido.append(summary)
        return {"classe_id": classe_id}

    monkeypatch.setattr(group_analysis.GroupAnalysisService, "upsert_summary", upsert)

    await run_classe_perfil_summary_once(_fabrica(registro))

    # `summary=None` significa "calcule com a sua propria regra".
    assert recebido == [None]


@pytest.mark.asyncio
async def test_o_laco_sobrevive_a_erro_e_respeita_o_intervalo(monkeypatch) -> None:
    """Falha de uma volta nao pode derrubar o laco -- o retrato voltaria a
    envelhecer em silencio, que e exatamente o defeito original."""
    voltas = 0
    dormidas: list[float] = []

    async def uma_vez(_fabrica_de_sessao) -> int:
        nonlocal voltas
        voltas += 1
        if voltas == 1:
            raise RuntimeError("banco fora do ar")
        if voltas >= 3:
            raise asyncio.CancelledError
        return 1

    monkeypatch.setattr(group_analysis, "run_classe_perfil_summary_once", uma_vez)

    async def dormir(segundos: float) -> None:
        dormidas.append(segundos)

    with pytest.raises(asyncio.CancelledError):
        await classe_perfil_summary_loop(
            session_factory=None,  # type: ignore[arg-type]
            interval_min=15,
            sleep_fn=dormir,
        )

    assert voltas == 3
    assert dormidas == [900.0, 900.0]


@pytest.mark.asyncio
async def test_cancelamento_nao_e_engolido(monkeypatch) -> None:
    """`asyncio.CancelledError` tem de subir: engolir trava o shutdown da API."""

    async def uma_vez(_fabrica_de_sessao) -> int:
        raise asyncio.CancelledError

    monkeypatch.setattr(group_analysis, "run_classe_perfil_summary_once", uma_vez)

    with pytest.raises(asyncio.CancelledError):
        await classe_perfil_summary_loop(
            session_factory=None,  # type: ignore[arg-type]
            interval_min=1,
            sleep_fn=_nunca_dorme,
        )


def test_o_intervalo_tem_piso() -> None:
    """`interval_min=0` viraria laco quente contra o banco."""
    fonte = inspect.getsource(classe_perfil_summary_loop)

    assert "max(1, int(interval_min))" in fonte


def test_vem_ligado_por_padrao_e_e_configuravel() -> None:
    """Precisa valer sem ninguem configurar nada -- o defeito era justamente
    depender de alguem agir."""
    s = Settings(supabase_jwt_secret="x", admin_panel_password="y")

    assert s.classe_perfil_summary_refresh_enabled is True
    assert s.classe_perfil_summary_interval_min == 15


def test_o_laco_e_desligavel_por_settings() -> None:
    """Em ambiente onde o laco incomoda, tem de ter chave de desligar."""
    fonte = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text(
        encoding="utf-8"
    )

    assert "classe_perfil_summary_refresh_enabled" in fonte
    # E ser cancelado no shutdown, como os outros dois lacos.
    assert "resumo_perfis_task.cancel()" in fonte


def _resolvido(valor: Any):
    async def _coro(*_a: object, **_k: object) -> Any:
        return valor

    return _coro()


async def _nunca_dorme(_segundos: float) -> None:
    raise AssertionError("nao deveria dormir depois de cancelado")
