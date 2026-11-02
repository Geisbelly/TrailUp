"""`20261102_10`: faixa de XP do aluno na turma, com quanto falta para a próxima (#143)."""

from __future__ import annotations

import psycopg
import pytest

from tests import _f5_banco as f5
from tests.test_e2e_notas_da_turma_para_exportar import OUTRA_TURMA, REFERENCIA, RESOLVE
from tests.test_e2e_notas_da_turma_para_exportar import _semear as _semear_notas

M = f5.modulo("20261102_10_faixas_de_xp.py")
COLUNAS = (
    "classe_id, xp, nivel, titulo, total_niveis, xp_minimo, proximo_minimo, proximo_titulo,"
    " xp_na_faixa, tamanho_faixa, xp_para_proxima"
)


def _banco():
    return f5.banco(REFERENCIA, RESOLVE, *f5.sql_de(M))


def _eventos(c, *linhas) -> None:
    for aluno, classe, tipo, referencia, valor in linhas:
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor) VALUES (%s, %s, %s, %s, %s)",
            (aluno, classe, tipo, referencia, valor),
        )


def _faixa(c, quem=f5.A, turma=f5.TURMA) -> dict | None:
    c.execute("BEGIN")
    try:
        f5.como(c, quem)
        c.execute("SET LOCAL ROLE authenticated")
        cur = c.execute(f"SELECT {COLUNAS} FROM public.aluno_faixa_xp(%s)", (turma,))
        nomes = [d.name for d in cur.description]
        linha = cur.fetchone()
    finally:
        c.execute("ROLLBACK")
    if linha is None:
        return None
    return {k: (float(v) if hasattr(v, "as_tuple") else v) for k, v in zip(nomes, linha)}


@f5.e2e
def test_sem_evento_comeca_na_primeira_faixa() -> None:
    with _banco() as c:
        _semear_notas(c)
        f = _faixa(c)
        assert (f["xp"], f["nivel"], f["titulo"], f["total_niveis"]) == (0, 1, "Ponto de partida", 10)
        assert (f["xp_minimo"], f["proximo_minimo"], f["proximo_titulo"]) == (0, 50, "Primeiros passos")
        assert (f["xp_na_faixa"], f["tamanho_faixa"], f["xp_para_proxima"]) == (0, 50, 50)


@f5.e2e
def test_soma_so_o_xp_da_turma_e_do_proprio_aluno() -> None:
    with _banco() as c:
        _semear_notas(c)
        _eventos(
            c,
            (f5.A, f5.TURMA, "atividade_concluida", "atividade:500", 15),
            (f5.A, None, "topico_concluido", "topico:10", 150),  # antigo: a turma vem do tópico
            (f5.A, None, "atividade_concluida", "atividade:502", 999),  # de outra turma
            (f5.A, OUTRA_TURMA, "presenca_aula", "classe:2:2026-10-10", 999),  # gravado em outra turma
            (f5.B, f5.TURMA, "atividade_concluida", "atividade:500", 999),  # de outro aluno
        )
        f = _faixa(c)
        assert f["classe_id"] == f5.TURMA
        assert (f["xp"], f["nivel"], f["titulo"]) == (165, 3, "Trilha aberta")
        assert (f["xp_minimo"], f["proximo_minimo"], f["proximo_titulo"]) == (150, 250, "Ritmo de trilha")
        assert (f["xp_na_faixa"], f["tamanho_faixa"], f["xp_para_proxima"]) == (15, 100, 85)


@f5.e2e
def test_piso_exato_sobe_de_faixa() -> None:
    with _banco() as c:
        _semear_notas(c)
        _eventos(c, (f5.A, f5.TURMA, "conquista_desbloqueada", "conquista:1", 50))
        f = _faixa(c)
        assert (f["nivel"], f["titulo"], f["xp_na_faixa"], f["xp_para_proxima"]) == (2, "Primeiros passos", 0, 100)


@f5.e2e
def test_ultima_faixa_nao_tem_proxima() -> None:
    with _banco() as c:
        _semear_notas(c)
        _eventos(c, (f5.A, f5.TURMA, "participacao_aula", "classe:1:2026-10-10", 5000))
        f = _faixa(c)
        assert (f["nivel"], f["titulo"], f["total_niveis"]) == (10, "Lenda da trilha", 10)
        assert (f["proximo_minimo"], f["proximo_titulo"], f["tamanho_faixa"], f["xp_para_proxima"]) == (
            None,
            None,
            None,
            None,
        )
        assert f["xp_na_faixa"] == 5000 - 1700


@f5.e2e
def test_xp_negativo_conta_como_zero() -> None:
    with _banco() as c:
        _semear_notas(c)
        _eventos(c, (f5.A, f5.TURMA, "desafio_derrota", "desafio:x", -30))
        f = _faixa(c)
        assert (f["xp"], f["nivel"], f["xp_para_proxima"]) == (0, 1, 50)


@f5.e2e
def test_faixas_vem_da_tabela() -> None:
    with _banco() as c:
        _semear_notas(c)
        c.execute("UPDATE public.xp_faixa SET titulo = 'Começo' WHERE xp_minimo = 0")
        c.execute("INSERT INTO public.xp_faixa (xp_minimo, titulo) VALUES (20, 'Aquecendo')")
        _eventos(c, (f5.A, f5.TURMA, "conteudo_concluido", "conteudo:1", 30))
        f = _faixa(c)
        assert (f["nivel"], f["titulo"], f["total_niveis"]) == (2, "Aquecendo", 11)
        assert (f["proximo_minimo"], f["proximo_titulo"], f["xp_para_proxima"]) == (50, "Primeiros passos", 20)
        c.execute("DELETE FROM public.xp_faixa")
        assert _faixa(c) is None  # sem faixa configurada, o app esconde o cartão


@f5.e2e
def test_so_quem_esta_matriculado_le() -> None:
    with _banco() as c:
        _semear_notas(c)
        for quem, turma in ((f5.A, OUTRA_TURMA), (None, f5.TURMA), (f5.PROF, f5.TURMA)):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                _faixa(c, quem, turma)
        c.execute("BEGIN")
        try:
            c.execute("SET LOCAL ROLE anon")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute("SELECT * FROM public.aluno_faixa_xp(%s)", (f5.TURMA,))
        finally:
            c.execute("ROLLBACK")


@f5.e2e
def test_aluno_le_as_faixas_mas_nao_escreve_e_anonimo_nao_le() -> None:
    with _banco() as c:
        _semear_notas(c)
        c.execute("BEGIN")
        try:
            f5.como(c, f5.A)
            c.execute("SET LOCAL ROLE authenticated")
            assert c.execute("SELECT count(*) FROM public.xp_faixa").fetchone()[0] == 10
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute("UPDATE public.xp_faixa SET titulo = 'X'")
        finally:
            c.execute("ROLLBACK")
        c.execute("BEGIN")
        try:
            c.execute("SET LOCAL ROLE anon")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute("SELECT count(*) FROM public.xp_faixa")
        finally:
            c.execute("ROLLBACK")


@f5.e2e
def test_downgrade_remove_tabela_e_funcoes() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert c.execute("SELECT to_regclass('public.xp_faixa')").fetchone()[0] is None
        assert (
            c.execute("SELECT count(*) FROM pg_proc WHERE proname IN ('aluno_faixa_xp', 'fn_faixa_xp')").fetchone()[0]
            == 0
        )
