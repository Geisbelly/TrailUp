"""`TentativasRepository` contra Postgres de verdade (#136, fase 4).

Banco local com o esqueleto e a `20261101_13` inteira (tabelas, `fn_cronometro_ligado`, RPCs). As
tentativas entram pelas RPCs, como o app faz; o que se mede é o resumo que a IA lê e o UPSERT com
que ela desliga o cronômetro sem passar por cima da escolha do aluno.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.repositories.tentativas import TentativasRepository
from tests import _f5_banco as f5
from tests import test_e2e_tentativas_com_tempo_do_servidor as fase1

pytestmark = [f5.e2e, pytest.mark.asyncio]


def _url_async(c) -> str:
    return f5._dsn_para(c.info.dbname).replace("postgresql://", "postgresql+asyncpg://", 1)


async def _com_repo(c, fn):
    engine = create_async_engine(_url_async(c))
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as s:
            resultado = await fn(TentativasRepository(s))
            await s.commit()
            return resultado
    finally:
        await engine.dispose()


def _origem(c, aluno=f5.A):
    return c.execute(
        "SELECT ligado, origem, motivo FROM public.aluno_cronometro WHERE aluno_id = %s", (aluno,)
    ).fetchone()


async def test_resumo_le_as_tentativas_e_o_cronometro_do_perfil() -> None:
    with fase1._banco() as c:
        fase1._semear(c, tentativas_max=2)
        t1 = fase1._iniciar(c)["tentativa_id"]
        fase1._atrasar(c, t1, 300)  # fora do tempo
        fase1._responder(c, t1, 40, 4)
        t2 = fase1._iniciar(c)["tentativa_id"]
        fase1._responder(c, t2, 90, 9)
        fase1._iniciar(c, f5.B)  # aberta, de outro aluno: não entra

        r = await _com_repo(c, lambda repo: repo.resumo_do_aluno(str(f5.A), f5.TURMA))

        assert (r["respondidas"], r["atividades"], r["atividades_esgotadas"]) == (2, 1, 1)
        assert (r["media_acertos_primeira"], r["media_acertos_ultima"]) == (40.0, 90.0)
        assert r["ultimas_cronometradas_no_tempo"] == [True, False]  # da mais recente para a mais antiga
        assert r["cronometro"] == {"ligado": True, "origem": "perfil"}  # Achiever

        b = await _com_repo(c, lambda repo: repo.resumo_do_aluno(str(f5.B), f5.TURMA))
        assert b["respondidas"] == 0 and b["cronometro"] == {"ligado": False, "origem": "perfil"}  # Seeker


async def test_ia_desliga_uma_vez_e_nunca_passa_por_cima_do_aluno() -> None:
    with fase1._banco() as c:
        fase1._semear(c)

        assert await _com_repo(c, lambda repo: repo.desligar_cronometro_pela_ia(str(f5.A), "motivo x")) is True
        assert _origem(c) == (False, "ia", "motivo x")
        # Já desligado: nada muda, e o executor não avisa o professor de novo.
        assert await _com_repo(c, lambda repo: repo.desligar_cronometro_pela_ia(str(f5.A), "motivo y")) is False
        assert _origem(c) == (False, "ia", "motivo x")

        # O aluno religa: a escolha dele vence, e a IA não desliga mais.
        fase1._como(c, f5.A, "SELECT public.aluno_definir_cronometro(true)")
        assert await _com_repo(c, lambda repo: repo.desligar_cronometro_pela_ia(str(f5.A), "motivo z")) is False
        assert _origem(c) == (True, "aluno", None)

        r = await _com_repo(c, lambda repo: repo.resumo_do_aluno(str(f5.A), f5.TURMA))
        assert r["cronometro"] == {"ligado": True, "origem": "aluno"}


async def test_resumos_da_turma_respeitam_a_janela() -> None:
    with fase1._banco() as c:
        fase1._semear(c)
        t = fase1._iniciar(c)["tentativa_id"]
        fase1._responder(c, t, 80, 8)
        tb = fase1._iniciar(c, f5.B)["tentativa_id"]
        fase1._responder(c, tb, 50, 5, quem=f5.B)
        c.execute("UPDATE public.atividade_tentativas SET respondida_em = now() - interval '40 days' WHERE id = %s", (tb,))

        desde = datetime.now(UTC) - timedelta(days=30)
        por_aluno = await _com_repo(c, lambda repo: repo.resumos_da_turma(f5.TURMA, desde))
        assert set(por_aluno) == {str(f5.A)}
        assert por_aluno[str(f5.A)]["media_acertos_ultima"] == 80.0


async def test_banco_sem_a_fase_1_devolve_vazio_sem_abortar_a_transacao() -> None:
    with f5.banco() as c:
        f5.semear_turma(c)

        async def ler(repo):
            vazio = await repo.resumo_do_aluno(str(f5.A), f5.TURMA)
            # A sessão continua usável: quem chamou não perde a transação.
            seguinte = (await repo.session.execute(text("SELECT 1"))).scalar()
            return vazio, seguinte, await repo.resumos_da_turma(f5.TURMA, datetime.now(UTC))

        assert await _com_repo(c, ler) == ({}, 1, {})
