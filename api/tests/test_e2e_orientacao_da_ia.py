"""`20261115_01`: a orientação da IA é da turma e só o professor dono a lê e escreve.

Banco descartável com o esqueleto de produção, os GRANTs que o Supabase dá por padrão a toda
tabela nova e o `app_classes_do_professor()` de verdade. O professor é dono da turma 1, os alunos A,
B e C estão matriculados nela, e OUTRO é professor de outra turma.
"""

from __future__ import annotations

import uuid

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_estudo_coorte as e
from tests.test_e2e_kpis_por_topico import POSSE

M = f5.modulo("20261115_01_orientacao_da_ia_por_turma.py")
OUTRO = uuid.UUID(int=12)


def _banco():
    return f5.banco(e.GRANTS_SUPABASE, POSSE, *f5.sql_de(M))


def _semear(c) -> None:
    f5.semear_turma(c)
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES ('{OUTRO}', 'outro@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{OUTRO}', 'Outro');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES (2, 1, '{OUTRO}', 'T2');
"""
    )


def _como(c, quem: uuid.UUID | None, papel: str = "authenticated") -> None:
    f5.como(c, quem)
    c.execute(f"SET ROLE {papel}")


def _voltar(c) -> None:
    c.execute("RESET ROLE")
    f5.como(c, None)


def _ler(c, quem: uuid.UUID | None, papel: str = "authenticated") -> list[tuple]:
    _como(c, quem, papel)
    try:
        return c.execute("SELECT classe_id, pedir, evitar FROM public.classe_orientacao_ia ORDER BY classe_id").fetchall()
    finally:
        _voltar(c)


@f5.e2e
def test_professor_grava_le_e_atualiza_a_da_turma_dele() -> None:
    with _banco() as c:
        _semear(c)
        _como(c, f5.PROF)
        c.execute(
            "INSERT INTO public.classe_orientacao_ia (classe_id, pedir, evitar) VALUES (%s, %s, %s)"
            " ON CONFLICT (classe_id) DO UPDATE SET pedir = EXCLUDED.pedir, evitar = EXCLUDED.evitar",
            (f5.TURMA, "Questões com código SQL", "Pegadinhas de nomenclatura"),
        )
        antes = c.execute("SELECT atualizado_em FROM public.classe_orientacao_ia").fetchone()[0]
        c.execute(
            "INSERT INTO public.classe_orientacao_ia (classe_id, pedir, evitar) VALUES (%s, %s, %s)"
            " ON CONFLICT (classe_id) DO UPDATE SET pedir = EXCLUDED.pedir, evitar = EXCLUDED.evitar",
            (f5.TURMA, "Questões com código SQL e consultas", ""),
        )
        depois = c.execute("SELECT atualizado_em FROM public.classe_orientacao_ia").fetchone()[0]
        _voltar(c)
        assert _ler(c, f5.PROF) == [(f5.TURMA, "Questões com código SQL e consultas", "")]
        assert depois >= antes


@f5.e2e
def test_aluno_outro_professor_e_anonimo_nao_veem() -> None:
    with _banco() as c:
        _semear(c)
        c.execute("INSERT INTO public.classe_orientacao_ia (classe_id, pedir) VALUES (%s, 'x')", (f5.TURMA,))
        assert _ler(c, f5.A) == []
        assert _ler(c, OUTRO) == []
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _ler(c, None, "anon")


@f5.e2e
def test_ninguem_alem_do_dono_escreve() -> None:
    with _banco() as c:
        _semear(c)
        for quem in (f5.A, OUTRO):
            _como(c, quem)
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute("INSERT INTO public.classe_orientacao_ia (classe_id, pedir) VALUES (%s, 'x')", (f5.TURMA,))
            _voltar(c)
        # O dono não grava na turma de outro professor.
        _como(c, f5.PROF)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("INSERT INTO public.classe_orientacao_ia (classe_id, pedir) VALUES (2, 'x')")
        _voltar(c)
        assert _ler(c, OUTRO) == []


@f5.e2e
def test_texto_longo_e_recusado_e_a_linha_sai_com_a_turma() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.CheckViolation):
            c.execute(
                "INSERT INTO public.classe_orientacao_ia (classe_id, pedir) VALUES (%s, %s)",
                (f5.TURMA, "a" * (M.LIMITE + 1)),
            )
        c.execute("INSERT INTO public.classe_orientacao_ia (classe_id, pedir) VALUES (%s, 'x')", (f5.TURMA,))
        f5.afrouxa(c, "topicos")
        c.execute("DELETE FROM public.classe_aluno WHERE classe_id = %s", (f5.TURMA,))
        c.execute("DELETE FROM public.topicos WHERE classe_id = %s", (f5.TURMA,))
        c.execute("DELETE FROM public.classe WHERE id = %s", (f5.TURMA,))
        assert c.execute("SELECT count(*) FROM public.classe_orientacao_ia").fetchone()[0] == 0
