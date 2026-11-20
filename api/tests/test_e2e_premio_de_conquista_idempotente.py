"""`20261120_01`: prêmio de conquista já pago não aborta o evento que disparou a avaliação.

Banco local com o esqueleto de produção, o índice único dos creditados (`20261016_03`) e o gatilho de
eventos como a cadeia o deixou (montagem da `test_e2e_premio_de_missao_na_turma`). O avaliador de
métrica é dublê e diz "cumpriu" sempre: quem decide se a conquista vale não é esta migration.

O caso medido em produção (20/11): o prêmio `conquista:<id>` está no razão e `conquistas_aluno` não tem
a linha. O evento seguinte do aluno (`ciclo_iniciado`, gravado pela API ao começar a análise) estourava
`eventos_aluno_creditado_unico`. Dados sintéticos.
"""

from __future__ import annotations

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_premio_de_missao_na_turma as base

pytestmark = f5.e2e

M = f5.modulo("20261120_01_premio_de_conquista_idempotente.py")
M_INDICE = f5.modulo("20261016_03_nota_professor_evento_creditado.py")

PONTOS = 50


def _banco(com_migration: bool = True):
    return f5.banco(
        *base._cadeia(),
        *f5.sql_de(base.M),
        M_INDICE._indice(M_INDICE.TIPOS_DO_INDICE_DEPOIS),
        *(f5.sql_de(M) if com_migration else []),
    )


def _semear(c) -> int:
    base._semear(c)
    f5.afrouxa(c, "conquistas")
    return c.execute(
        "INSERT INTO public.conquistas (nome, criterio, pontos_recompensa, escopo, ativa)"
        " VALUES ('Primeiros passos', '{\"metrica\": \"eventos\", \"minimo\": 1}', %s, 'comum', true)"
        " RETURNING id",
        (PONTOS,),
    ).fetchone()[0]


def _premio_ja_pago_sem_registro(c, conquista: int) -> None:
    """O estado da invariante I13: o prêmio está no razão, a linha de `conquistas_aluno` não."""
    c.execute(
        "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor)"
        " VALUES (%s, 'conquista_desbloqueada', %s, %s)",
        (f5.A, f"conquista:{conquista}", PONTOS),
    )
    assert c.execute("SELECT count(*) FROM public.conquistas_aluno").fetchone()[0] == 0


def _ciclo_iniciado(c) -> None:
    c.execute(
        "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor)"
        " VALUES (%s, 'ciclo_iniciado', 'c81142e6-278c-4bdd-844c-2a081f9b7f8a', 1)",
        (f5.A,),
    )


def _premios(c, conquista: int) -> list[tuple]:
    return c.execute(
        "SELECT aluno_id, valor FROM public.eventos_aluno WHERE tipo = 'conquista_desbloqueada' AND referencia = %s",
        (f"conquista:{conquista}",),
    ).fetchall()


def test_controle_sem_a_migration_o_evento_aborta() -> None:
    """O erro da tela do aluno existe neste banco."""
    with _banco(com_migration=False) as c:
        conquista = _semear(c)
        _premio_ja_pago_sem_registro(c, conquista)
        with pytest.raises(psycopg.errors.UniqueViolation, match="eventos_aluno_creditado_unico"):
            _ciclo_iniciado(c)


def test_premio_ja_pago_nao_aborta_o_evento_e_nao_paga_de_novo() -> None:
    with _banco() as c:
        conquista = _semear(c)
        _premio_ja_pago_sem_registro(c, conquista)
        _ciclo_iniciado(c)
        assert c.execute(
            "SELECT count(*) FROM public.eventos_aluno WHERE aluno_id = %s AND tipo = 'ciclo_iniciado'", (f5.A,)
        ).fetchone()[0] == 1
        # O valor de quem já viu não muda, e o prêmio não dobra.
        assert _premios(c, conquista) == [(f5.A, PONTOS)]
        # O registro volta a dizer "concluída": o próximo evento não tenta pagar de novo.
        assert c.execute(
            "SELECT concluida FROM public.conquistas_aluno WHERE aluno_id = %s AND conquista_id = %s",
            (f5.A, conquista),
        ).fetchall() == [(True,)]
        _ciclo_iniciado(c)
        assert _premios(c, conquista) == [(f5.A, PONTOS)]
        assert c.execute("SELECT count(*) FROM public.conquistas_aluno").fetchone()[0] == 1


def test_primeiro_premio_continua_sendo_pago() -> None:
    with _banco() as c:
        conquista = _semear(c)
        _ciclo_iniciado(c)
        assert _premios(c, conquista) == [(f5.A, PONTOS)]


def test_migration_e_idempotente_e_o_downgrade_volta_ao_texto_anterior() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M):
            c.execute(sql)
        corpo = c.execute(
            "SELECT pg_get_functiondef('public.trg_eventos_aluno_after_iud()'::regprocedure)"
        ).fetchone()[0]
        assert corpo.count("ON CONFLICT DO NOTHING;") == 1
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        corpo = c.execute(
            "SELECT pg_get_functiondef('public.trg_eventos_aluno_after_iud()'::regprocedure)"
        ).fetchone()[0]
        assert "ON CONFLICT DO NOTHING" not in corpo
        assert M.PREMIO_ANTES in corpo
