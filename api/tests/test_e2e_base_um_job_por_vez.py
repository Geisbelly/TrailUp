"""Uma base por vez: dois targets da mesma base nunca ficam `processing` juntos.

Em 02/11 a base do achiever da turma 68 foi gerada 5 vezes do zero em poucas
horas: dois `manual_profile_generate` e um `manual_retry` pegavam a mesma linha
de `conteudo_personalizado` ao mesmo tempo, e um invalidava o outro
(`stale_generation`). `tomar_target_para_processar` serializa isso no banco.

Roda contra Postgres LOCAL (`TRAILUP_E2E_RETENCAO_DATABASE_URL`, ver `_f5_banco`):
a corrida entre duas sessoes so existe num Postgres de verdade.
"""

from __future__ import annotations

import asyncio
import uuid
from urllib.parse import urlsplit, urlunsplit

import pytest

from tests._f5_banco import DSN, TURMA, banco, e2e, semear_turma

pytestmark = [e2e]

_STALE_MIN = 40


def _url_async(c) -> str:
    nome = c.execute("SELECT current_database()").fetchone()[0]
    partes = urlsplit(DSN)._replace(path=f"/{nome}")
    return urlunsplit(partes._replace(scheme="postgresql+asyncpg"))


def _job(c, kind: str = "manual_profile_generate") -> str:
    job_id = str(uuid.uuid4())
    c.execute(
        "INSERT INTO public.personalizacao_jobs (id, kind, status, classe_id, trigger_source) "
        "VALUES (%s, %s, 'processing', %s, 'api')",
        (job_id, kind, TURMA),
    )
    return job_id


def _target(c, job_id: str, *, perfil: str = "achiever", topico: int = 10, status: str = "pending") -> dict:
    target_id = c.execute(
        "INSERT INTO public.personalizacao_job_targets (job_id, topico_id, conteudo_id, brainhex_profile_key, status) "
        "VALUES (%s, %s, NULL, %s, %s) RETURNING id",
        (job_id, topico, perfil, status),
    ).fetchone()[0]
    return {
        "id": target_id,
        "topico_id": topico,
        "conteudo_id": None,
        "brainhex_profile_key": perfil,
        "aluno_id": None,
        "media_kind": None,
    }


async def _tomar(url: str, target: dict) -> bool:
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.repositories.personalizacao_jobs import PersonalizacaoJobsRepository

    engine = create_async_engine(url)
    try:
        async with AsyncSession(engine) as session:
            return await PersonalizacaoJobsRepository(session).tomar_target_para_processar(
                target=target, classe_id=TURMA, attempts=1, stale_processing_min=_STALE_MIN
            )
    finally:
        await engine.dispose()


def _status(c, target: dict) -> str:
    return c.execute(
        "SELECT status FROM public.personalizacao_job_targets WHERE id = %s", (target["id"],)
    ).fetchone()[0]


@pytest.mark.asyncio
async def test_segundo_job_da_mesma_base_espera_e_outra_base_segue() -> None:
    with banco() as c:
        semear_turma(c)
        url = _url_async(c)
        primeiro = _target(c, _job(c))
        segundo = _target(c, _job(c, "manual_retry"))
        outro_perfil = _target(c, _job(c), perfil="seeker")

        assert await _tomar(url, primeiro) is True
        assert await _tomar(url, segundo) is False
        assert await _tomar(url, outro_perfil) is True

        # Quem esperou nao foi tocado: continua pending, sem gastar tentativa.
        assert _status(c, segundo) == "pending"
        assert c.execute(
            "SELECT attempts FROM public.personalizacao_job_targets WHERE id = %s", (segundo["id"],)
        ).fetchone()[0] == 0


@pytest.mark.asyncio
async def test_corrida_entre_dois_workers_so_um_pega_a_base() -> None:
    with banco() as c:
        semear_turma(c)
        url = _url_async(c)
        for _ in range(10):
            c.execute("DELETE FROM public.personalizacao_job_targets")
            a = _target(c, _job(c))
            b = _target(c, _job(c, "manual_retry"))

            resultados = await asyncio.gather(_tomar(url, a), _tomar(url, b))

            assert sorted(resultados) == [False, True]
            processando = c.execute(
                "SELECT count(*) FROM public.personalizacao_job_targets WHERE status = 'processing'"
            ).fetchone()[0]
            assert processando == 1


@pytest.mark.asyncio
async def test_target_ja_pego_por_outro_poller_do_mesmo_job_nao_e_refeito() -> None:
    with banco() as c:
        semear_turma(c)
        url = _url_async(c)
        alvo = _target(c, _job(c), status="processing")

        assert await _tomar(url, alvo) is False


@pytest.mark.asyncio
async def test_base_volta_a_ficar_livre_quando_a_geracao_termina() -> None:
    with banco() as c:
        semear_turma(c)
        url = _url_async(c)
        primeiro = _target(c, _job(c))
        segundo = _target(c, _job(c, "manual_retry"))
        assert await _tomar(url, primeiro) is True

        c.execute("UPDATE public.personalizacao_job_targets SET status = 'failed' WHERE id = %s", (primeiro["id"],))

        assert await _tomar(url, segundo) is True


@pytest.mark.asyncio
async def test_processing_parado_alem_do_prazo_nao_segura_a_base() -> None:
    """Worker que morreu no meio: a base e liberada no mesmo prazo de
    `claim_retry_incomplete_generation`, nao fica presa para sempre."""
    with banco() as c:
        semear_turma(c)
        url = _url_async(c)
        morto = _target(c, _job(c), status="processing")
        c.execute(
            "UPDATE public.personalizacao_job_targets SET updated_at = now() - make_interval(mins => %s) WHERE id = %s",
            (_STALE_MIN + 1, morto["id"]),
        )
        novo = _target(c, _job(c, "manual_retry"))

        assert await _tomar(url, novo) is True


@pytest.mark.asyncio
async def test_mesma_base_em_outra_turma_nao_bloqueia() -> None:
    with banco() as c:
        semear_turma(c)
        url = _url_async(c)
        c.execute("ALTER TABLE public.personalizacao_jobs DROP CONSTRAINT IF EXISTS fk_personalizacao_jobs_classe")
        outra_turma = str(uuid.uuid4())
        c.execute(
            "INSERT INTO public.personalizacao_jobs (id, kind, status, classe_id, trigger_source) "
            "VALUES (%s, 'manual_retry', 'processing', %s, 'api')",
            (outra_turma, TURMA + 1000),
        )
        _target(c, outra_turma, status="processing")
        daqui = _target(c, _job(c))

        assert await _tomar(url, daqui) is True
