"""`20261102_16`: arco narrativo da turma (#145), medido com o papel de verdade.

Banco local com o esqueleto de produção, os helpers de posse e o índice parcial `uq_job_target_base`
(`20260827_04`), que o gatilho usa no `ON CONFLICT`. A RLS só aparece com `SET LOCAL ROLE`.
"""

from __future__ import annotations

import uuid

import psycopg
import pytest

from tests import _f5_banco as f5
from tests.test_e2e_kpis_por_topico import POSSE

M = f5.modulo("20261102_16_arco_narrativo_da_turma.py")
OUTRO_PROF = uuid.UUID(int=12)
INDICE_DA_BASE = """
CREATE UNIQUE INDEX uq_job_target_base
  ON public.personalizacao_job_targets (job_id, topico_id, conteudo_id, brainhex_profile_key)
  WHERE media_kind IS NULL AND aluno_id IS NULL;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
"""
# Tópico 10 com dois conteúdos e o 11 com um; o 12 fica sem conteúdo (gera o agregado do tópico).
ALVOS_DA_TURMA = 7 * (2 + 1 + 1)


def _banco():
    return f5.banco(POSSE, INDICE_DA_BASE, *f5.sql_de(M))


def _semear(c) -> None:
    f5.semear_turma(c)
    f5.afrouxa(c, "conteudos")
    c.execute(
        "INSERT INTO public.conteudos (id, topico_id, titulo, tipo) OVERRIDING SYSTEM VALUE VALUES"
        " (100, 10, 'A', 'texto'), (101, 10, 'B', 'texto'), (110, 11, 'C', 'texto')"
    )
    c.execute(f"INSERT INTO auth.users (id, email) VALUES ('{OUTRO_PROF}', 'outro@teste.invalid')")
    c.execute(f"INSERT INTO public.professor (id, nome) VALUES ('{OUTRO_PROF}', 'Outro')")


def _como(c, quem: uuid.UUID | None, sql: str, params: tuple = ()) -> list[tuple]:
    """Roda `sql` como `authenticated` (ou `anon`, com `quem=None`) e desfaz tudo no fim."""
    c.execute("BEGIN")
    try:
        f5.como(c, quem)
        c.execute(f"SET LOCAL ROLE {'authenticated' if quem else 'anon'}")
        cur = c.execute(sql, params)
        return cur.fetchall() if cur.description else []
    finally:
        c.execute("ROLLBACK")


def _gravar(c, texto: str, quem: uuid.UUID = f5.PROF) -> None:
    """O upsert que o console faz, como o professor, e que fica gravado."""
    f5.como(c, quem)
    c.execute("BEGIN")
    c.execute("SET LOCAL ROLE authenticated")
    c.execute(
        "INSERT INTO public.classe_arco_narrativo (classe_id, texto) VALUES (%s, %s)"
        " ON CONFLICT (classe_id) DO UPDATE SET texto = EXCLUDED.texto",
        (f5.TURMA, texto),
    )
    c.execute("COMMIT")
    f5.como(c, None)


def _jobs(c) -> list[tuple]:
    return c.execute(
        "SELECT kind, status, trigger_source, total_targets, payload->>'reason',"
        " payload->'topico_ids', payload->'conteudo_ids'"
        " FROM public.personalizacao_jobs WHERE classe_id = %s ORDER BY created_at",
        (f5.TURMA,),
    ).fetchall()


def _alvos(c) -> set[tuple]:
    return set(
        c.execute(
            "SELECT t.topico_id, t.conteudo_id, t.brainhex_profile_key, t.aluno_id, t.is_profile_template"
            " FROM public.personalizacao_job_targets t JOIN public.personalizacao_jobs j ON j.id = t.job_id"
            " WHERE j.classe_id = %s",
            (f5.TURMA,),
        ).fetchall()
    )


@f5.e2e
def test_professor_dono_le_e_escreve_e_mais_ninguem() -> None:
    with _banco() as c:
        _semear(c)
        _gravar(c, "A turma é a tripulação da nave Aurora.")
        assert _como(c, f5.PROF, "SELECT texto FROM public.classe_arco_narrativo") == [
            ("A turma é a tripulação da nave Aurora.",)
        ]
        # Aluno matriculado não lê (a issue não pede), e outro professor também não.
        assert _como(c, f5.A, "SELECT count(*) FROM public.classe_arco_narrativo") == [(0,)]
        assert _como(c, OUTRO_PROF, "SELECT count(*) FROM public.classe_arco_narrativo") == [(0,)]
        # Escrita fora da posse: o INSERT bate na policy, o UPDATE e o DELETE não acham a linha.
        for quem in (f5.A, OUTRO_PROF):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                _como(c, quem, "INSERT INTO public.classe_arco_narrativo (classe_id, texto) VALUES (1, 'x')")
            assert _como(c, quem, "UPDATE public.classe_arco_narrativo SET texto = 'x' RETURNING 1") == []
            assert _como(c, quem, "DELETE FROM public.classe_arco_narrativo RETURNING 1") == []
        # Anônimo nem tem GRANT.
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _como(c, None, "SELECT count(*) FROM public.classe_arco_narrativo")


@f5.e2e
def test_gravar_o_arco_enfileira_a_turma_inteira() -> None:
    with _banco() as c:
        _semear(c)
        _gravar(c, "A turma é a tripulação da nave Aurora.")
        assert _jobs(c) == [
            (
                "class_delta_sync",
                "pending",
                "db_arco_narrativo_trigger",
                ALVOS_DA_TURMA,
                "insert_arco_narrativo_db",
                [10, 11, 12],
                [],
            )
        ]
        perfis = {"seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"}
        esperado = {
            (topico, conteudo, perfil, None, True)
            for topico, conteudo in ((10, 100), (10, 101), (11, 110), (12, None))
            for perfil in perfis
        }
        assert _alvos(c) == esperado
        quem, carimbo = c.execute(
            "SELECT atualizado_por, updated_at IS NOT NULL FROM public.classe_arco_narrativo"
        ).fetchone()
        assert (quem, carimbo) == (f5.PROF, True)


@f5.e2e
def test_mesmo_texto_nao_enfileira_e_texto_novo_funde_no_job_pendente() -> None:
    with _banco() as c:
        _semear(c)
        _gravar(c, "A turma é a tripulação da nave Aurora.")
        _gravar(c, "  A turma é a tripulação da nave Aurora.  ")
        assert len(_jobs(c)) == 1
        _gravar(c, "A turma é a guarda do farol.")
        jobs = _jobs(c)
        assert len(jobs) == 1 and jobs[0][3] == ALVOS_DA_TURMA
        assert jobs[0][4] == "update_arco_narrativo_db"
        # Job que o worker já pegou não é reaproveitado.
        c.execute("UPDATE public.personalizacao_jobs SET status = 'processing'")
        _gravar(c, "A turma é a resistência da cidade submersa.")
        assert [j[1] for j in _jobs(c)] == ["processing", "pending"]


@f5.e2e
def test_job_pendente_do_editor_cresce_para_a_turma_inteira() -> None:
    with _banco() as c:
        _semear(c)
        c.execute(
            "INSERT INTO public.personalizacao_jobs (kind, status, classe_id, trigger_source, payload)"
            " VALUES ('class_delta_sync', 'pending', %s, 'db_conteudo_trigger',"
            " '{\"topico_ids\": [10], \"conteudo_ids\": [100], \"removidos\": [{\"tabela\": \"cards\", \"id\": 9}]}')",
            (f5.TURMA,),
        )
        _gravar(c, "A turma é a tripulação da nave Aurora.")
        (job,) = _jobs(c)
        assert job[2:] == (
            "db_arco_narrativo_trigger", ALVOS_DA_TURMA, "insert_arco_narrativo_db", [10, 11, 12], []
        )
        removidos = c.execute("SELECT payload->'removidos' FROM public.personalizacao_jobs").fetchone()[0]
        assert removidos == [{"tabela": "cards", "id": 9}]


@f5.e2e
def test_apagar_o_arco_regera_e_geracao_manual_nao_enfileira() -> None:
    with _banco() as c:
        _semear(c)
        _gravar(c, "A turma é a tripulação da nave Aurora.")
        c.execute("UPDATE public.personalizacao_jobs SET status = 'completed'")
        f5.como(c, f5.PROF)
        c.execute("BEGIN")
        c.execute("SET LOCAL ROLE authenticated")
        c.execute("DELETE FROM public.classe_arco_narrativo WHERE classe_id = %s", (f5.TURMA,))
        c.execute("COMMIT")
        f5.como(c, None)
        assert [j[4] for j in _jobs(c)] == ["insert_arco_narrativo_db", "delete_arco_narrativo_db"]

        c.execute("DELETE FROM public.personalizacao_jobs")
        c.execute("UPDATE public.professor SET geracao_automatica = false WHERE id = %s", (f5.PROF,))
        _gravar(c, "A turma é a guarda do farol.")
        assert _jobs(c) == []


@f5.e2e
def test_apagar_a_turma_leva_o_arco_sem_erro() -> None:
    with _banco() as c:
        _semear(c)
        _gravar(c, "A turma é a tripulação da nave Aurora.")
        for tabela in ("classe_aluno", "topicos", "conteudos"):
            c.execute(f"DELETE FROM public.{tabela}")
        c.execute("DELETE FROM public.classe WHERE id = %s", (f5.TURMA,))
        assert c.execute("SELECT count(*) FROM public.classe_arco_narrativo").fetchone() == (0,)
        assert c.execute("SELECT count(*) FROM public.personalizacao_jobs").fetchone() == (0,)


@f5.e2e
def test_texto_vazio_ou_longo_demais_e_recusado() -> None:
    with _banco() as c:
        _semear(c)
        for texto in ("   ", "x" * (M.TEXTO_MAXIMO + 1)):
            with pytest.raises(psycopg.errors.CheckViolation):
                _como(c, f5.PROF, "INSERT INTO public.classe_arco_narrativo (classe_id, texto) VALUES (1, %s)", (texto,))
        assert _como(
            c, f5.PROF, "INSERT INTO public.classe_arco_narrativo (classe_id, texto) VALUES (1, %s) RETURNING 1",
            ("x" * M.TEXTO_MAXIMO,),
        ) == [(1,)]
