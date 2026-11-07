"""`20261106_02` (#30): PR1 e PR2 por plataforma de uso do aluno.

A cadeia de produção até a `20261105_29`, mais a migration. A e C consentiram pesquisa, B não: os
pareados da turma 1 são A e C. Turma 1, intervenção: baseline 04/10–17/10, pós 18/10–31/10.

Tempo ativo do escopo topic, calculado à mão: A 600 s no baseline e 1200 s no pós; C nada. Com A na
web e C no app: web = 10 min / 1 aluno / 2 semanas = 5,0 no baseline e 10,0 no pós; app = 0.
O total (A e C) é 10 min / 2 alunos / 2 semanas = 2,5 — a média dos dois estratos, porque a conta é uma só.
"""

from __future__ import annotations

import json
import uuid

import pytest

from tests import _f5_banco as f5
from tests import test_e2e_agregados_so_quem_consentiu as ag
from tests import test_e2e_estudo_coorte as coorte
from tests import test_e2e_estudo_relatorio_volta_a_trava as trava_relatorio

M_TRAVA_NO_RELATORIO = f5.modulo("20261105_11_estudo_relatorio_volta_a_trava.py")
M_LONGITUDINAL = f5.modulo("20261105_12_metricas_estudo_longitudinal.py")
M_LIMITACAO = f5.modulo("20261105_29_limitacao_plataforma_coortes.py")
M = f5.modulo("20261106_02_estudo_por_plataforma.py")

ESTRATOS = {"web", "app", "misto", "sem_cliente"}


def _banco():
    return trava_relatorio._banco(
        *f5.sql_de(M_TRAVA_NO_RELATORIO), *f5.sql_de(M_LONGITUDINAL), *f5.sql_de(M_LIMITACAO), *f5.sql_de(M)
    )


def _lote(c, aluno, plataforma: str | None, quando: str) -> None:
    sessao = uuid.uuid4()
    f5.sessao(c, sessao, aluno, quando, None)
    payload = {} if plataforma is None else {"cliente": {"plataforma": plataforma}}
    c.execute(
        "INSERT INTO public.telemetria_lotes (id, sessao_id, aluno_id, classe_id, flush_reason, captured_at, payload)"
        " VALUES (%s, %s, %s, 1, 'interval', %s, %s)",
        (uuid.uuid4(), sessao, aluno, quando, json.dumps(payload)),
    )


def _turma(c, n_minimo: int = 1) -> None:
    coorte._semear(c)
    coorte._dados_da_turma1(c)
    ag._consentir(c, f5.A, f5.C)
    c.execute("UPDATE public.estudo_coorte SET registrado_em = '2026-10-01T00:00:00Z' WHERE classe_id = %s", (f5.TURMA,))
    coorte._n_minimo(c, n_minimo)


def _coorte(c) -> dict:
    return coorte._rpc(c, f5.PROF, [f5.TURMA])["coortes"][0]


@f5.e2e
def test_cada_estrato_tem_a_propria_conta_e_o_total_e_a_media() -> None:
    with _banco() as c:
        _turma(c)
        _lote(c, f5.A, "web", "2026-10-05T10:00:00Z")
        _lote(c, f5.C, "android", "2026-10-05T10:00:00Z")
        t = _coorte(c)
        por = t["por_plataforma"]
        assert set(por) == ESTRATOS
        web, app = por["web"], por["app"]
        assert (web["pre"]["pareados"], app["pre"]["pareados"]) == (1, 1)
        assert web["pre"]["pr1"]["tempo_ativo_min_por_aluno_semana"] == pytest.approx(5.0)
        assert web["pos"]["pr1"]["tempo_ativo_min_por_aluno_semana"] == pytest.approx(10.0)
        assert app["pre"]["pr1"]["tempo_ativo_min_por_aluno_semana"] == 0
        # A conta é uma só: o total é a média ponderada dos estratos (1 aluno cada).
        assert t["pre"]["pr1"]["tempo_ativo_min_por_aluno_semana"] == pytest.approx(2.5)
        # Estrato vazio não publica nada de aluno.
        assert por["misto"]["pre"]["pareados"] is None
        assert por["sem_cliente"]["pos"]["amostra_insuficiente"] is True


@f5.e2e
def test_so_conta_lote_anterior_ao_corte_e_misto_tem_os_dois() -> None:
    with _banco() as c:
        _turma(c)
        # A: web e ios antes do corte -> misto. C: só um lote de android depois do corte -> sem_cliente.
        _lote(c, f5.A, "web", "2026-10-05T10:00:00Z")
        _lote(c, f5.A, "ios", "2026-10-06T10:00:00Z")
        _lote(c, f5.C, "android", "2026-10-20T10:00:00Z")
        por = _coorte(c)["por_plataforma"]
        assert por["misto"]["pre"]["pareados"] == 1
        assert por["sem_cliente"]["pre"]["pareados"] == 1
        assert por["web"]["pre"]["pareados"] is None and por["app"]["pre"]["pareados"] is None
        assert por["misto"]["pre"]["pr1"]["tempo_ativo_min_por_aluno_semana"] == pytest.approx(5.0)


@f5.e2e
def test_estrato_pequeno_suprime_todos_para_nao_sair_por_subtracao() -> None:
    with _banco() as c:
        _turma(c, n_minimo=2)
        _lote(c, f5.A, "web", "2026-10-05T10:00:00Z")
        _lote(c, f5.C, "web", "2026-10-06T10:00:00Z")
        # Tudo na web: o único estrato não vazio tem 2 pareados, atinge o mínimo e publica.
        assert _coorte(c)["por_plataforma"]["web"]["pre"]["pareados"] == 2

    with _banco() as c:
        _turma(c, n_minimo=2)
        _lote(c, f5.A, "web", "2026-10-05T10:00:00Z")
        _lote(c, f5.C, "ios", "2026-10-06T10:00:00Z")
        t = _coorte(c)
        # web e app têm 1 pareado cada, abaixo do mínimo de 2: nenhum estrato é publicado.
        assert t["por_plataforma"] == {e: {"amostra_insuficiente": True} for e in ESTRATOS}


@f5.e2e
def test_total_e_limitacao_dizem_o_que_o_recorte_cobre() -> None:
    with _banco() as c:
        _turma(c)
        r = coorte._rpc(c, f5.PROF, [f5.TURMA])
        assert "anteriores ao corte" in r["definicoes"]["plataforma"]
        limitacoes = " ".join(r["limitacoes"])
        assert "por_plataforma" in limitacoes and "diferenca-em-diferencas" in limitacoes
        assert "continuam agregados e nao permitem comparar" not in limitacoes


@f5.e2e
def test_a_funcao_interna_nao_fica_exposta_ao_cliente() -> None:
    with _banco() as c:
        for papel in ("anon", "authenticated"):
            for assinatura in (M.HELPER, M.JANELA_7):
                (pode,) = c.execute(
                    "SELECT has_function_privilege(%s, %s::regprocedure, 'EXECUTE')", (papel, assinatura)
                ).fetchone()
                assert pode is False, (papel, assinatura)


@f5.e2e
def test_downgrade_volta_a_janela_de_seis_argumentos() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        existe = lambda assinatura: c.execute("SELECT to_regprocedure(%s) IS NOT NULL", (assinatura,)).fetchone()[0]
        assert existe(M.JANELA_6) and not existe(M.JANELA_7) and not existe(M.HELPER)
