"""Pedidos iguais ao mesmo tempo viram um job só.

Em 03/11 um "Regerar" do socializer da turma 68 abriu 3 `manual_profile_generate` no mesmo
segundo (#775). O dedupe de `enqueue_personalizacao_job` lê os jobs abertos e depois insere: sem
trava, os três pedidos passam pela leitura antes de qualquer INSERT e nenhum vê os outros.

Roda contra Postgres LOCAL (`TRAILUP_E2E_RETENCAO_DATABASE_URL`, ver `_f5_banco`): a corrida
entre sessões só existe num Postgres de verdade.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock
from urllib.parse import urlsplit, urlunsplit

import pytest

from app.services import personalizacao_jobs as jobs_module
from tests._f5_banco import DSN, TURMA, banco, e2e, semear_turma

pytestmark = [e2e]

_PEDIDOS = 3


def _url_async(c) -> str:
    nome = c.execute("SELECT current_database()").fetchone()[0]
    partes = urlsplit(DSN)._replace(path=f"/{nome}")
    return urlunsplit(partes._replace(scheme="postgresql+asyncpg"))


def _targets(perfil: str, topico: int = 10) -> list[dict]:
    return [
        {
            "aluno_id": None,
            "topico_id": topico,
            "conteudo_id": None,
            "brainhex_profile_key": perfil,
            "is_profile_template": True,
        }
    ]


async def _pedir(url: str, *, perfil: str, topico: int = 10) -> str:
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    engine = create_async_engine(url)
    try:
        async with AsyncSession(engine) as session:
            detalhe = await jobs_module.enqueue_personalizacao_job(
                session=session,
                kind=jobs_module.JOB_KIND_MANUAL_PROFILE_GENERATE,
                classe_id=TURMA,
                trigger_source="web_console",
                topico_ids=[topico],
                brainhex_profile_keys=[perfil],
            )
            return str(detalhe["job"]["id"])
    finally:
        await engine.dispose()


def _montar_targets_em_sincronia(monkeypatch, total: int) -> None:
    """Segura cada pedido até todos terem chegado: é o que torna a corrida certa, não sorte."""
    chegaram = 0
    todos = asyncio.Event()

    async def montar(**kwargs):
        nonlocal chegaram
        chegaram += 1
        if chegaram >= total:
            todos.set()
        await todos.wait()
        perfil = kwargs["brainhex_profile_keys"][0]
        topico = kwargs["topico_ids"][0]
        return _targets(perfil, topico), [topico], {}

    monkeypatch.setattr(jobs_module, "_build_targets", montar)


def _jobs(c) -> int:
    return c.execute("SELECT count(*) FROM public.personalizacao_jobs").fetchone()[0]


@pytest.mark.asyncio
async def test_tres_pedidos_iguais_ao_mesmo_tempo_abrem_um_job(monkeypatch) -> None:
    with banco() as c:
        semear_turma(c)
        url = _url_async(c)
        _montar_targets_em_sincronia(monkeypatch, _PEDIDOS)

        ids = await asyncio.gather(*(_pedir(url, perfil="socializer") for _ in range(_PEDIDOS)))

        assert _jobs(c) == 1
        # Todos recebem o mesmo job: o console acompanha o progresso de quem foi criado.
        assert len(set(ids)) == 1
        assert c.execute("SELECT count(*) FROM public.personalizacao_job_targets").fetchone()[0] == 1


@pytest.mark.asyncio
async def test_pedidos_de_perfis_diferentes_seguem_em_jobs_separados(monkeypatch) -> None:
    with banco() as c:
        semear_turma(c)
        url = _url_async(c)
        _montar_targets_em_sincronia(monkeypatch, 2)

        ids = await asyncio.gather(_pedir(url, perfil="socializer"), _pedir(url, perfil="seeker"))

        assert _jobs(c) == 2
        assert len(set(ids)) == 2


@pytest.mark.asyncio
async def test_pedidos_de_topicos_diferentes_seguem_em_jobs_separados(monkeypatch) -> None:
    with banco() as c:
        semear_turma(c)
        url = _url_async(c)
        _montar_targets_em_sincronia(monkeypatch, 2)

        await asyncio.gather(
            _pedir(url, perfil="socializer", topico=10), _pedir(url, perfil="socializer", topico=11)
        )

        assert _jobs(c) == 2


@pytest.mark.asyncio
async def test_pedido_depois_do_job_terminar_abre_outro(monkeypatch) -> None:
    """A trava só funde pedidos com job aberto: regerar depois de pronto continua valendo."""
    with banco() as c:
        semear_turma(c)
        url = _url_async(c)
        monkeypatch.setattr(
            jobs_module, "_build_targets", AsyncMock(return_value=(_targets("socializer"), [10], {}))
        )

        primeiro = await _pedir(url, perfil="socializer")
        c.execute("UPDATE public.personalizacao_jobs SET status = 'completed'")
        segundo = await _pedir(url, perfil="socializer")

        assert primeiro != segundo
        assert _jobs(c) == 2
