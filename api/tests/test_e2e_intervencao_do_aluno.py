"""`IntervencaoRepository` contra Postgres de verdade (#64).

O esqueleto traz `intervencoes` sem CHECK nem RLS; aqui entram os da `20260829_03` (tipo e
status) e a `20260929_01` inteira (escopo, natureza, alvo, policies e GRANT por coluna). Sem eles
o INSERT passaria aqui e abortaria em produção.
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.repositories.intervencao import IntervencaoRepository
from app.schemas.intervencao import IntervencaoPayload
from tests import _f5_banco as f5
from tests.test_e2e_kpis_por_topico import POSSE

pytestmark = [f5.e2e, pytest.mark.asyncio]

CHECKS_DA_TABELA_ORIGINAL = """
ALTER TABLE public.intervencoes ADD CONSTRAINT intervencoes_tipo_check
  CHECK (tipo IN ('pedagogica', 'emocional', 'engajamento', 'notificacao'));
ALTER TABLE public.intervencoes ADD CONSTRAINT intervencoes_status_check
  CHECK (status IN ('pending', 'applied', 'dismissed'));
"""
M_INSIGHTS = f5.modulo("20260929_01_intervencoes_insights_turma.py")


def _intervencao(
    kind: str = "abandono",
    tipo: str = "engajamento",
    *,
    origem: str = "regra",
    fontes_rag: list[str] | None = None,
) -> IntervencaoPayload:
    return IntervencaoPayload(
        tipo=tipo,
        kind=kind,
        ocorrencias=3,
        janela=5,
        texto="O sistema observou atividade aberta e deixada sem concluir em 3 dos últimos 5 ciclos.",
        base="3 dos últimos 5 ciclos de estudo: atividade aberta e deixada sem concluir.",
        acao="notificacao",
        notificacao_titulo="Um passo de cada vez",
        notificacao_corpo="Seu próximo passo está mais curto.",
        origem=origem,
        fontes_rag=fontes_rag or [],
    )


def _url_async(c) -> str:
    return f5._dsn_para(c.info.dbname).replace("postgresql://", "postgresql+asyncpg://", 1)


async def test_grava_deduplica_e_so_o_professor_da_turma_le() -> None:
    with f5.banco(POSSE, CHECKS_DA_TABELA_ORIGINAL, *f5.sql_de(M_INSIGHTS)) as c:
        f5.semear_turma(c)
        engine = create_async_engine(_url_async(c))
        try:
            fabrica = async_sessionmaker(engine, expire_on_commit=False)
            async with fabrica() as s:
                repo = IntervencaoRepository(s)
                assert await repo.existe_pendente(aluno_id=str(f5.A), classe_id=f5.TURMA, kind="abandono") is False
                primeira = await repo.registrar_do_aluno(
                    aluno_id=str(f5.A),
                    classe_id=f5.TURMA,
                    intervencao=_intervencao(origem="rag", fontes_rag=["Guia.pdf"]),
                    ciclo_id="c1",
                )
                repetida = await repo.registrar_do_aluno(
                    aluno_id=str(f5.A), classe_id=f5.TURMA, intervencao=_intervencao(), ciclo_id="c2"
                )
                outro_estado = await repo.registrar_do_aluno(
                    aluno_id=str(f5.A),
                    classe_id=f5.TURMA,
                    intervencao=_intervencao("dificuldade", "pedagogica"),
                    ciclo_id="c2",
                )
                assert await repo.existe_pendente(aluno_id=str(f5.A), classe_id=f5.TURMA, kind="abandono") is True
                await s.commit()
        finally:
            await engine.dispose()

        assert primeira is not None
        assert repetida is None, "a recorrência dura vários ciclos; a mesma intervenção não pode repetir"
        assert outro_estado is not None

        linha = c.execute(
            "SELECT escopo, natureza, tipo, motivo, acao, status, classe_id, "
            "contexto->>'ciclo_id', contexto->'fontes_rag' "
            "FROM public.intervencoes WHERE id = %s",
            (primeira,),
        ).fetchone()
        assert linha == (
            "aluno",
            "sugestao",
            "engajamento",
            "abandono",
            "notificacao",
            "pending",
            f5.TURMA,
            "c1",
            ["Guia.pdf"],
        )

        # Dispensada pelo professor, deixa de bloquear: a próxima recorrência gera outra.
        c.execute("UPDATE public.intervencoes SET status = 'dismissed' WHERE id = %s", (primeira,))
        assert c.execute(
            "SELECT count(*) FROM public.intervencoes WHERE status = 'pending' AND motivo = 'abandono'"
        ).fetchone()[0] == 0

        def contar_como(quem) -> int:
            c.execute("BEGIN")
            try:
                f5.como(c, quem)
                c.execute("SET LOCAL ROLE authenticated")
                return c.execute("SELECT count(*) FROM public.intervencoes").fetchone()[0]
            finally:
                c.execute("ROLLBACK")

        assert contar_como(f5.PROF) == 2
        assert contar_como(f5.A) == 0, "o aluno não lê a intervenção sobre ele (20260929_01)"
