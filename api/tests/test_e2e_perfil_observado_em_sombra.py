"""`20261111_05`: o vetor observado em sombra (fase 5 do roteiro de diversidade de perfis).

`aluno_perfil_observado` guarda, por aluno e indicador, o que o uso diz sobre um perfil. Fica em
sombra: não escreve em `aluno_perfil`, ninguém do produto lê, e o cliente nem enxerga a tabela.

Os casos de `fixtures/perfil_observado_casos.json` são os mesmos do vitest
(`frontend/src/features/signup/perfilObservadoParidade.test.ts`), que os roda nas funções puras do
frontend: a conta do banco tem de dar o mesmo resultado.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from tests import _f5_banco as f5
from tests.test_e2e_kpis_por_topico import _trecho

MIGRATION = "20261111_05_perfil_observado_em_sombra.py"
CASOS = json.loads((Path(__file__).parent / "fixtures" / "perfil_observado_casos.json").read_text("utf-8"))["casos"]


# --------------------------------------------------------------------------- estrutura


def _sql(fn: str = "upgrade") -> str:
    return "\n".join(f5.sql_de(f5.modulo(MIGRATION), fn))


def test_encadeamento() -> None:
    assert f5.modulo(MIGRATION).down_revision == "20261111_04"


def test_nunca_escreve_no_vetor_do_questionario() -> None:
    sql = _sql()
    escrita = re.compile(r"(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(public\.)?aluno_perfil\b(?!_)", re.IGNORECASE)
    assert not escrita.search(sql)


def test_tabela_fechada_para_o_cliente_e_com_prazo() -> None:
    sql = _sql()
    assert "ALTER TABLE public.aluno_perfil_observado ENABLE ROW LEVEL SECURITY" in sql
    assert "REVOKE ALL ON TABLE public.aluno_perfil_observado FROM PUBLIC, anon, authenticated" in sql
    assert "CREATE POLICY" not in sql
    assert "INSERT INTO public.retencao_politica" in sql and "'aluno_perfil_observado'" in sql
    assert "REVOKE ALL ON FUNCTION public.fn_perfil_observado_recalcular() FROM PUBLIC, anon, authenticated" in sql


def test_agenda_no_cron_e_o_downgrade_tira_tudo() -> None:
    assert "cron.schedule('trailup_perfil_observado'" in _sql()
    volta = _sql("downgrade")
    assert "cron.unschedule('trailup_perfil_observado')" in volta
    assert "DROP FUNCTION IF EXISTS public.fn_perfil_observado_recalcular()" in volta
    assert "DROP TABLE IF EXISTS public.aluno_perfil_observado" in volta
    assert "DELETE FROM public.retencao_politica WHERE tabela = 'aluno_perfil_observado'" in volta


# --------------------------------------------------------------------------- contra Postgres real

TENTATIVAS = """
CREATE TABLE IF NOT EXISTS public.atividade_tentativas (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aluno_id           uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  atividade_id       bigint NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  classe_id          bigint NOT NULL,
  numero             integer NOT NULL CHECK (numero > 0),
  iniciada_em        timestamptz NOT NULL DEFAULT now(),
  respondida_em      timestamptz,
  cronometrada       boolean NOT NULL DEFAULT false,
  acertos_percentual numeric,
  UNIQUE (aluno_id, atividade_id, numero)
);
"""


@pytest.fixture()
def c():
    if not f5.DSN:
        pytest.skip("TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)")
    retencao = _trecho(
        "20261024_03_retencao_e_expurgo.py", "CREATE TABLE IF NOT EXISTS public.retencao_politica (", "\n);"
    )
    with f5.banco(retencao, TENTATIVAS, *f5.sql_de(f5.modulo(MIGRATION))) as conn:
        f5.semear_turma(conn)
        for tabela in ("atividades", "conteudos", "atividade_aluno", "conteudo_aluno"):
            f5.afrouxa(conn, tabela)
        conn.execute(
            "INSERT INTO public.atividades (id, topico_id, titulo) OVERRIDING SYSTEM VALUE"
            " SELECT g, 10, 'At ' || g FROM generate_series(1, 9) g"
        )
        conn.execute(
            "INSERT INTO public.conteudos (id, topico_id, titulo) OVERRIDING SYSTEM VALUE"
            " SELECT g, 10, 'Ct ' || g FROM generate_series(1, 9) g"
        )
        yield conn


def _semear_caso(c, aluno, caso: dict) -> None:
    for t in caso["tentativas"]:
        c.execute(
            "INSERT INTO public.atividade_tentativas (aluno_id, atividade_id, classe_id, numero, respondida_em,"
            " acertos_percentual) VALUES (%s, %s, %s, %s, CASE WHEN %s::numeric IS NULL THEN NULL ELSE now() END, %s)",
            (aluno, t["atividade"], f5.TURMA, t["numero"], t["acertos"], t["acertos"]),
        )
    for i, minutos in enumerate(caso["conteudo_min"], start=1):
        c.execute(
            "INSERT INTO public.conteudo_aluno (aluno_id, conteudo_id, tempo_gasto_min) VALUES (%s, %s, %s)",
            (aluno, i, minutos),
        )
    for i, minutos in enumerate(caso["atividade_min"], start=1):
        c.execute(
            "INSERT INTO public.atividade_aluno (aluno_id, atividade_id, tempo_gasto_min) VALUES (%s, %s, %s)",
            (aluno, i, minutos),
        )


def _observado(c, aluno) -> dict:
    linhas = c.execute(
        "SELECT perfil, indicador, valor, n, versao FROM public.aluno_perfil_observado WHERE aluno_id = %s",
        (aluno,),
    ).fetchall()
    return {perfil: {"indicador": ind, "valor": float(valor), "n": n, "versao": versao} for perfil, ind, valor, n, versao in linhas}


def _recalcular(c) -> int:
    return c.execute("SELECT public.fn_perfil_observado_recalcular()").fetchone()[0]


@f5.e2e
@pytest.mark.parametrize("caso", CASOS, ids=[caso["nome"] for caso in CASOS])
def test_paridade_com_o_frontend(c, caso) -> None:
    _semear_caso(c, f5.A, caso)
    _recalcular(c)
    obtido = _observado(c, f5.A)
    for perfil, indicador in (("survivor", "persistencia_apos_erro"), ("mastermind", "proporcao_de_teoria")):
        esperado = caso["esperado"][perfil]
        if esperado is None:
            assert perfil not in obtido
        else:
            assert obtido[perfil]["indicador"] == indicador
            assert obtido[perfil]["valor"] == pytest.approx(esperado["valor"], abs=1e-9)
            assert obtido[perfil]["n"] == esperado["n"]
            assert obtido[perfil]["versao"] == "v1-sombra"


@f5.e2e
def test_alunos_sao_independentes_e_o_recalculo_e_idempotente(c) -> None:
    _semear_caso(c, f5.A, CASOS[0])
    _semear_caso(c, f5.B, CASOS[1])
    assert _recalcular(c) == 3  # A: survivor + mastermind; B: mastermind
    _recalcular(c)
    assert set(_observado(c, f5.A)) == {"survivor", "mastermind"}
    assert set(_observado(c, f5.B)) == {"mastermind"}
    assert _observado(c, f5.C) == {}
    total = c.execute("SELECT count(*) FROM public.aluno_perfil_observado").fetchone()[0]
    assert total == 3


@f5.e2e
def test_indicador_que_perdeu_a_ocasiao_sai(c) -> None:
    _semear_caso(c, f5.A, CASOS[0])
    _recalcular(c)
    c.execute("DELETE FROM public.atividade_tentativas WHERE aluno_id = %s", (f5.A,))
    _recalcular(c)
    assert set(_observado(c, f5.A)) == {"mastermind"}


@f5.e2e
def test_nao_toca_no_vetor_do_questionario(c) -> None:
    c.execute("INSERT INTO public.perfil (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'seeker')")
    c.execute("INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) VALUES (%s, 1, 77)", (f5.A,))
    antes = c.execute("SELECT md5(string_agg(t::text, ',' ORDER BY t::text)) FROM public.aluno_perfil t").fetchone()[0]
    _semear_caso(c, f5.A, CASOS[0])
    _recalcular(c)
    depois = c.execute("SELECT md5(string_agg(t::text, ',' ORDER BY t::text)) FROM public.aluno_perfil t").fetchone()[0]
    assert antes == depois


@f5.e2e
def test_aluno_e_professor_nao_enxergam_a_tabela(c) -> None:
    _semear_caso(c, f5.A, CASOS[0])
    _recalcular(c)
    for quem in (f5.A, f5.PROF):
        f5.como(c, quem)
        c.execute("SET ROLE authenticated")
        try:
            with pytest.raises(Exception, match="permission denied"):
                c.execute("SELECT count(*) FROM public.aluno_perfil_observado").fetchone()
        finally:
            c.execute("RESET ROLE")
            f5.como(c, None)
    f5.como(c, f5.A)
    c.execute("SET ROLE authenticated")
    try:
        with pytest.raises(Exception, match="permission denied"):
            c.execute("SELECT public.fn_perfil_observado_recalcular()").fetchone()
    finally:
        c.execute("RESET ROLE")
        f5.como(c, None)


@f5.e2e
def test_sai_com_a_conta_do_aluno(c) -> None:
    _semear_caso(c, f5.A, CASOS[0])
    _recalcular(c)
    c.execute("DELETE FROM public.alunos WHERE id = %s", (f5.A,))
    assert _observado(c, f5.A) == {}
    acao = c.execute(
        "SELECT acao FROM public.retencao_politica WHERE tabela = 'aluno_perfil_observado'"
    ).fetchone()[0]
    assert acao == "vida_da_conta"


@f5.e2e
def test_downgrade(c) -> None:
    for sql in f5.sql_de(f5.modulo(MIGRATION), "downgrade"):
        c.execute(sql)
    assert c.execute("SELECT to_regclass('public.aluno_perfil_observado')").fetchone()[0] is None
