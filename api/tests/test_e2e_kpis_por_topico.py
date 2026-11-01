"""`20261031_06`: a RPC de KPIs da turma ganha a quebra por tópico e o abandono por etapa (#12, F5 Task 4).

Dado, calculado à mão (janela = os últimos 30 dias, fuso de Brasília):

    tópico 10: A estudou 300 s (há 20 dias) e concluiu; C estudou 200 s (há 15 dias), 60%, abaixo da
               mediana (80) e sem avanço → estagnado; B 80%
    tópico 11: A estudou 120 s (há 15 dias), 20%, abaixo da mediana (60) e sem avanço → estagnado;
               C 60%; B 80%
    tópico 12: ninguém

    tópico 10 → tempo 500, 2 ativos, média 250, 2 sessões, iniciaram 3, concluíram 1, estagnados 1 (C)
    tópico 11 → tempo 120, 1 ativo, média 120, iniciaram 3, concluíram 0, estagnados 1 (A)
    tópico 12 → tempo NULL, 0 ativos, média NULL, tudo 0
"""

from __future__ import annotations

import json
import uuid

import psycopg
import pytest

from tests import _f5_banco as f5

M = [
    f5.modulo(a)
    for a in (
        "20261031_03_views_de_metricas_no_alembic.py",
        "20261031_04_views_de_metricas_tempo_e_sessoes.py",
        "20261031_05_views_de_metricas_retorno_e_sinais.py",
        "20261031_06_kpis_por_topico.py",
    )
]
M_RPC_ANTIGA = f5.modulo("20261026_01_kpis_engajamento_turma.py")


def _trecho(arquivo: str, inicio: str, fim: str) -> str:
    texto = (f5.VERSOES / arquivo).read_text(encoding="utf-8")
    a = texto.index(inicio)
    return texto[a : texto.index(fim, a) + len(fim)]


POSSE = _trecho(
    "20260826_09_rls_posse_por_tabela.py", "CREATE OR REPLACE FUNCTION public.app_classes_do_professor()", "$$;"
)


def _banco(*, com_f5: bool = True):
    sql = [POSSE]
    if com_f5:
        sql += [s for m in M for s in f5.sql_de(m)]
    else:
        sql += [s for m in M[:3] for s in f5.sql_de(m)] + f5.sql_de(M_RPC_ANTIGA)
    return f5.banco(*sql)


def _estudo(c, aluno, topico: int, dias: int, ativo: float) -> None:
    quando = c.execute(f"SELECT now() - interval '{dias} days'").fetchone()[0]
    sid = uuid.uuid4()
    f5.sessao(c, sid, aluno, quando, None)
    f5.tempo(c, sid, aluno, "topic", topico, ativo, 0, quando)


def _progresso(c, aluno, topico: int, pct: float) -> None:
    status = "concluido" if pct >= 100 else ("em andamento" if pct > 0 else "não iniciado")
    c.execute(
        "INSERT INTO public.topico_aluno (aluno_id, topico_id, status, percentual_concluido) VALUES (%s, %s, %s, %s)",
        (aluno, topico, status, pct),
    )


def _semear(c) -> None:
    f5.semear_turma(c)
    for aluno, topico, pct in (
        (f5.A, 10, 100), (f5.C, 10, 60), (f5.B, 10, 80),
        (f5.A, 11, 20), (f5.C, 11, 60), (f5.B, 11, 80),
    ):
        _progresso(c, aluno, topico, pct)
    _estudo(c, f5.A, 10, 20, 300)
    _estudo(c, f5.C, 10, 15, 200)
    _estudo(c, f5.A, 11, 15, 120)


def _rpc(c, inicio_sql: str = "current_date - 30", fim_sql: str = "current_date"):
    f5.como(c, f5.PROF)
    try:
        bruto = c.execute(
            f"SELECT public.metricas_engajamento_turma(1, ({inicio_sql})::date, ({fim_sql})::date)"
        ).fetchone()[0]
    finally:
        f5.como(c, None)
    return bruto if isinstance(bruto, dict) else json.loads(bruto)


def _topicos(r) -> dict[int, dict]:
    return {t["topico_id"]: t for t in r["por_topico"]["topicos"]}


@f5.e2e
def test_por_topico_tempo_ativo_por_aluno() -> None:
    with _banco() as c:
        _semear(c)
        r = _rpc(c)
        assert r["versao"] == 2
        t = _topicos(r)
        assert [x["topico_id"] for x in r["por_topico"]["topicos"]] == [10, 11, 12]  # ordem da trilha
        assert (t[10]["tempo_ativo_seg"], t[10]["alunos_ativos"], t[10]["sessoes"]) == (500, 2, 2)
        assert t[10]["tempo_ativo_medio_por_aluno_ativo_seg"] == 250
        assert (t[11]["tempo_ativo_seg"], t[11]["alunos_ativos"]) == (120, 1)


@f5.e2e
def test_por_topico_respeita_a_janela() -> None:
    """Janela dos últimos 16 dias: o estudo de A no tópico 10 (há 20 dias) fica de fora."""
    with _banco() as c:
        _semear(c)
        t = _topicos(_rpc(c, "current_date - 16"))
        assert (t[10]["tempo_ativo_seg"], t[10]["alunos_ativos"]) == (200, 1)


@f5.e2e
def test_abandono_por_etapa_e_estagnado_por_topico() -> None:
    with _banco() as c:
        _semear(c)
        t = _topicos(_rpc(c))
        assert (t[10]["iniciaram"], t[10]["concluiram"], t[10]["estagnados"]) == (3, 1, 1)
        assert (t[11]["iniciaram"], t[11]["concluiram"], t[11]["estagnados"]) == (3, 0, 1)


@f5.e2e
def test_topico_sem_aluno_vem_com_nulos_e_zeros() -> None:
    with _banco() as c:
        _semear(c)
        t = _topicos(_rpc(c))[12]
        assert t["tempo_ativo_seg"] is None
        assert t["tempo_ativo_medio_por_aluno_ativo_seg"] is None
        assert (t["alunos_ativos"], t["sessoes"], t["iniciaram"], t["concluiram"], t["estagnados"]) == (0, 0, 0, 0, 0)


@f5.e2e
def test_rpc_e_view_dao_o_mesmo_numero() -> None:
    """Uma definição: estagnados da RPC = estagnados da view; tempo ativo da RPC (janela cobrindo tudo)
    = soma do tempo ativo da view."""
    with _banco() as c:
        _semear(c)
        r = _rpc(c, "current_date - 60")
        da_view = dict(
            c.execute(
                "SELECT estagnado_topico_id, count(*) FROM public.vw_metricas_engajamento_aluno_classe"
                " WHERE estagnado_topico_id IS NOT NULL GROUP BY 1"
            ).fetchall()
        )
        assert {k: v["estagnados"] for k, v in _topicos(r).items() if v["estagnados"]} == da_view
        ativo_view = c.execute("SELECT sum(tempo_ativo_seg) FROM public.vw_metricas_engajamento_aluno_classe").fetchone()[0]
        assert sum(t["tempo_ativo_seg"] or 0 for t in r["por_topico"]["topicos"]) == ativo_view
        assert r["engajamento"]["tempo_ativo_seg"] == ativo_view


@f5.e2e
def test_o_resto_do_contrato_nao_mudou() -> None:
    """As chaves da versão 1 continuam, com os mesmos valores."""
    with _banco(com_f5=False) as c:
        _semear(c)
        antes = _rpc(c)
    with _banco() as c:
        _semear(c)
        depois = _rpc(c)
    for chave in ("periodo", "populacao", "engajamento", "retorno_semanal", "jornada_sessoes"):
        assert antes[chave] == depois[chave], chave


@f5.e2e
def test_professor_de_outra_turma_nao_le() -> None:
    with _banco() as c:
        _semear(c)
        f5.como(c, uuid.UUID(int=99))
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("SELECT public.metricas_engajamento_turma(1, current_date - 30, current_date)")
        f5.como(c, None)


@f5.e2e
def test_downgrade_volta_a_versao_1() -> None:
    with _banco() as c:
        _semear(c)
        for sql in f5.sql_de(M[3], "downgrade"):
            c.execute(sql)
        r = _rpc(c)
        assert r["versao"] == 1 and "por_topico" not in r
