"""`20261102_15`: o fuso é validado sem `pg_timezone_names`, e o conjunto aceito não muda.

Banco local com o esqueleto de produção. O validador é comparado com `pg_timezone_names` nome a
nome, e as três funções são chamadas como `authenticated`, como o PostgREST faria.
"""

from __future__ import annotations

import uuid

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_estudo_coorte as coorte
from tests import test_e2e_kpis_por_topico as kpis

M = f5.modulo("20261102_15_fuso_sem_pg_timezone_names.py")
UP = f5.sql_de(M)
DOWN = f5.sql_de(M, "downgrade")

# Aceitos pelo `AT TIME ZONE`, recusados antes e depois. '-03' e '+03:00' têm o sinal POSIX: o
# primeiro é UTC+3.
RECUSADOS = (
    "-03", "-3", "+03:00", "BRT", "brt", "PST", "Z", "UTC+3", "UTC-3", "XYZ+3", "BRT3", "<-03>3",
    "utc", "foo", "America/Nowhere", "", " ", "localtime", "America/Sao_Paulo/",
)


# No Supabase o `authenticated` usa `auth.uid()`; o esqueleto não dá o USAGE, e a RPC de presença é
# SECURITY INVOKER.
AUTH = "GRANT USAGE ON SCHEMA auth TO authenticated;"


def _valido(c, valor) -> bool:
    return c.execute("SELECT public.trailup_fuso_valido(%s)", (valor,)).fetchone()[0]


def _como(c, quem, sql: str, params=()):
    c.execute("BEGIN")
    try:
        f5.como(c, quem)
        c.execute("SET LOCAL ROLE authenticated")
        return c.execute(sql, params).fetchall()
    finally:
        c.execute("ROLLBACK")
        f5.como(c, None)


@f5.e2e
def test_aceita_o_mesmo_que_pg_timezone_names() -> None:
    with f5.banco(M.VALIDADOR) as c:
        nomes = [n for (n,) in c.execute("SELECT name FROM pg_timezone_names")]
        recusados = {n for n in nomes if not _valido(c, n)}
        # O único nome local fora da lista de produção é `posixrules`, que produção não lista.
        assert recusados <= {"posixrules"}, recusados
        assert set(M.FUSOS_SEM_BARRA) <= set(nomes)
        for valor in RECUSADOS:
            assert c.execute("SELECT 1 FROM pg_timezone_names WHERE name = %s", (valor,)).fetchone() is None
            assert not _valido(c, valor), valor
        assert not _valido(c, None)
        # Mesmo fuso em outra caixa: a única coisa que passa a ser aceita.
        assert _valido(c, "america/sao_paulo")


@f5.e2e
def test_resumo_presenca() -> None:
    with f5.banco(coorte.GRANTS_SUPABASE, AUTH, M.VALIDADOR, M.presenca_nova()) as c:
        aluno = uuid.uuid4()
        r = _como(c, aluno, "SELECT public.trailup_resumo_presenca('America/Sao_Paulo')")[0][0]
        assert len(r["semana_diaria"]) == 7
        assert _como(c, aluno, "SELECT public.trailup_resumo_presenca()")[0][0]["dias_ativos"] == 0
        for valor in ("-03", "BRT", None):
            with pytest.raises(psycopg.errors.RaiseException, match="fuso_invalido"):
                _como(c, aluno, "SELECT public.trailup_resumo_presenca(%s)", (valor,))


@f5.e2e
def test_metricas_engajamento_turma() -> None:
    sql = [kpis.POSSE] + [s for m in kpis.M for s in f5.sql_de(m)]
    with f5.banco(*sql, UP[0], M.VALIDADOR, M.metricas_nova()) as c:
        kpis._semear(c)
        assert kpis._rpc(c)["versao"] == 2
        f5.como(c, f5.PROF)
        for valor in ("-03", "UTC+3", None):
            with pytest.raises(psycopg.errors.InvalidParameterValue, match="timezone_invalido"):
                c.execute(
                    "SELECT public.metricas_engajamento_turma(1, current_date - 30, current_date, %s)", (valor,)
                )


@f5.e2e
def test_estudo_coorte_registrar() -> None:
    with coorte._banco(*UP) as c:
        coorte._semear(c)
        reg = (
            "SELECT public.estudo_coorte_registrar(1, 'tcc', 'A', 'intervencao', current_date + 1,"
            " current_date + 10, NULL, %s)"
        )
        for valor in ("-03", "brt", None):
            with pytest.raises(psycopg.errors.InvalidParameterValue, match="timezone_invalido"):
                _como(c, f5.PROF, reg, (valor,))
        assert _como(c, f5.PROF, reg, ("America/Sao_Paulo",))[0][0] > 0


@f5.e2e
def test_guarda_recusa_corpo_que_mudou() -> None:
    with f5.banco() as c:
        c.execute(
            "CREATE FUNCTION public.trailup_resumo_presenca(p_timezone text) RETURNS jsonb"
            " LANGUAGE sql AS $$ SELECT '{}'::jsonb $$"
        )
        with pytest.raises(psycopg.errors.RaiseException, match="revise a 20261102_15"):
            c.execute(UP[0])


@f5.e2e
def test_downgrade_volta_ao_corpo_anterior() -> None:
    # O banco do cohort tem o tipo `estudo_coorte`; as outras duas nascem aqui pelo corpo anterior.
    with coorte._banco(M.presenca_anterior(), M.metricas_anterior()) as c:
        corpos = """
            SELECT proname, md5(prosrc) FROM pg_proc
             WHERE proname IN ('trailup_resumo_presenca', 'metricas_engajamento_turma', 'estudo_coorte_registrar')
             ORDER BY 1
        """
        antes = c.execute(corpos).fetchall()
        assert len(antes) == 3
        for s in UP:
            c.execute(s)
        assert c.execute(corpos).fetchall() != antes
        for s in DOWN:
            c.execute(s)
        assert c.execute(corpos).fetchall() == antes
        assert c.execute("SELECT to_regprocedure('public.trailup_fuso_valido(text)')").fetchone()[0] is None
        # E dá para subir de novo: a guarda aceita os três corpos restaurados.
        for s in UP:
            c.execute(s)
