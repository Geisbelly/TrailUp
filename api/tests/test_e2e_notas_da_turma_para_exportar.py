"""`20261101_06`: notas e XP da turma, uma linha por aluno, só para o professor (#146)."""

from __future__ import annotations

import psycopg
import pytest

from tests import _f5_banco as f5
from tests.test_e2e_kpis_por_topico import POSSE, _trecho

M = f5.modulo("20261101_06_notas_da_turma_para_exportar.py")
# `fn_eventos_aluno_referencia_id` é schema não versionado; o dublê extrai o id de "tipo:<id>".
REFERENCIA = (
    "CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_referencia_id(p text) RETURNS bigint "
    "LANGUAGE sql IMMUTABLE AS $$ SELECT NULLIF(regexp_replace(split_part(p, ':', 2), '[^0-9]', '', 'g'), '')::bigint $$"
)
RESOLVE = _trecho(
    "20261003_01_referencia_de_item_personalizado.py",
    "CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_resolve_classe_id(",
    "\n        $function$",
)
OUTRA_TURMA = 2


def _banco():
    return f5.banco(POSSE, REFERENCIA, RESOLVE, *f5.sql_de(M))


def _semear(c) -> None:
    f5.semear_turma(c)
    for t in ("eventos_aluno", "atividades", "atividade_aluno", "classe"):
        f5.afrouxa(c, t)
    c.execute(
        f"INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE"
        f" VALUES ({OUTRA_TURMA}, 1, '{f5.PROF}', 'Outra')"
    )
    c.execute("INSERT INTO public.topicos (id, classe_id, nome, ordem) OVERRIDING SYSTEM VALUE VALUES (90, %s, 'X', 1)", (OUTRA_TURMA,))
    c.execute(
        "INSERT INTO public.atividades (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES (500, 10, 'A1'), (501, 11, 'A2'), (502, 90, 'Outra')"
    )
    c.execute('UPDATE public.classe_aluno SET "notaMedia" = 7.5, "porcentagemConcluida" = 60 WHERE aluno_id = %s', (f5.A,))


def _notas(c, quem=f5.PROF) -> dict:
    c.execute("BEGIN")
    try:
        f5.como(c, quem)
        c.execute("SET LOCAL ROLE authenticated")
        linhas = c.execute(
            "SELECT aluno_id, nome, email, xp, nota_media, progresso_pct, atividades_avaliadas, pontos_obtidos, pontos_maximos"
            " FROM public.professor_notas_da_turma(%s)",
            (f5.TURMA,),
        ).fetchall()
    finally:
        c.execute("ROLLBACK")
    return {r[0]: r[1:] for r in linhas}


@f5.e2e
def test_xp_soma_os_eventos_da_turma_inclusive_os_antigos_sem_classe_gravada() -> None:
    with _banco() as c:
        _semear(c)
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor) VALUES"
            " (%(a)s, %(t)s, 'atividade_concluida', 'atividade:500', 15),"
            " (%(a)s, NULL, 'topico_concluido', 'topico:10', 20),"  # antigo: a turma vem do tópico
            " (%(a)s, NULL, 'atividade_concluida', 'atividade:502', 99),"  # de outra turma: fora
            " (%(a)s, %(o)s, 'presenca_aula', 'classe:2:2026-10-10', 10)",  # gravado em outra turma: fora
            {"a": f5.A, "t": f5.TURMA, "o": OUTRA_TURMA},
        )
        n = _notas(c)
        assert n[f5.A][2] == 35
        assert n[f5.B][2] == 0 and n[f5.C][2] == 0  # sem evento: zero, não some


@f5.e2e
def test_nota_progresso_e_avaliadas_so_da_turma() -> None:
    with _banco() as c:
        _semear(c)
        c.execute(
            "INSERT INTO public.atividade_aluno (aluno_id, atividade_id, pontuacao_obtida, pontuacao_maxima) VALUES"
            " (%(a)s, 500, 8, 10), (%(a)s, 501, 6, 10), (%(a)s, 502, 10, 10), (%(b)s, 500, NULL, 10)",
            {"a": f5.A, "b": f5.B},
        )
        n = _notas(c)
        nome, email, _xp, nota, progresso, avaliadas, obtidos, maximos = n[f5.A]
        assert (nome, email) == ("A", "a@teste.invalid")
        assert (float(nota), float(progresso)) == (7.5, 60.0)
        assert (avaliadas, float(obtidos), float(maximos)) == (2, 14.0, 20.0)
        assert n[f5.B][5:] == (0, None, None)  # entrega sem nota não conta como avaliada
        assert set(n) == {f5.A, f5.B, f5.C}


@f5.e2e
def test_so_o_professor_da_turma_le() -> None:
    with _banco() as c:
        _semear(c)
        for quem in (f5.A, None):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                _notas(c, quem)
        c.execute("BEGIN")
        try:
            c.execute("SET LOCAL ROLE anon")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute("SELECT * FROM public.professor_notas_da_turma(%s)", (f5.TURMA,))
        finally:
            c.execute("ROLLBACK")


@f5.e2e
def test_downgrade_remove_a_funcao() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert c.execute("SELECT count(*) FROM pg_proc WHERE proname = 'professor_notas_da_turma'").fetchone()[0] == 0
