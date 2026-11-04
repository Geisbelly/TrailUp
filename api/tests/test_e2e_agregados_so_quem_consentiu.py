"""`20261104_04` (#17): os agregados da pesquisa só contam quem consentiu pesquisa.

Banco do e2e do estudo, com a `20261024_02` (consentimento e `vw_alunos_pesquisa_elegiveis`) por
baixo. A e C são adultos com aceite de pesquisa vigente; B não decidiu nada. O que se prova:

- `metricas_estudo_coortes`: B sai dos pareados, e a supressão abaixo de `n_minimo` passa a valer
  sobre o número menor;
- `metricas_perfil_formato`: B (achiever) sai da população e do perfil;
- revogar o consentimento tira o aluno na próxima leitura;
- o downgrade devolve a população inteira.
"""

from __future__ import annotations

import pytest

from tests import _f5_banco as f5
from tests import test_e2e_estudo_coorte as e
from tests import test_e2e_metricas_perfil_formato as pf
from tests.test_e2e_kpis_por_topico import POSSE
from tests.test_e2e_retencao_expurgo import CARIMBO

M_CONSENTIMENTO = f5.modulo("20261024_02_consentimento_do_responsavel.py")
M_PERFIL_FORMATO = f5.modulo("20261102_26_metricas_perfil_formato.py")
M = f5.modulo("20261104_04_agregados_so_quem_consentiu.py")


def _banco(*depois: str):
    return f5.banco(
        e.GRANTS_SUPABASE, POSSE, CARIMBO, *f5.sql_de(M_CONSENTIMENTO), e.APP_E_DEV, e.TENTATIVAS, e.RETENCAO,
        *f5.sql_de(e.M_CATALOGO), *f5.sql_de(e.M_COORTE), *f5.sql_de(e.M_RPC), *f5.sql_de(M_PERFIL_FORMATO),
        *depois,
    )


def _consentir(c, *alunos) -> None:
    for aluno in alunos:
        c.execute(
            "INSERT INTO public.aluno_nascimento (aluno_id, data_nascimento, registrado_por)"
            " VALUES (%s, DATE '1990-01-15', %s)",
            (aluno, aluno),
        )
        c.execute(
            "INSERT INTO public.consentimento_pesquisa (aluno_id, versao, status, decidido_em)"
            " VALUES (%s, %s, 'accepted', now())",
            (aluno, M_CONSENTIMENTO.VERSAO_PESQUISA),
        )


def _estudo(c) -> dict:
    return e._rpc(c, f5.PROF, [f5.TURMA])


def _semear_estudo(c) -> None:
    e._semear(c)
    e._dados_da_turma1(c)
    _consentir(c, f5.A, f5.C)


@f5.e2e
def test_estudo_conta_so_quem_consentiu() -> None:
    with _banco(*f5.sql_de(M)) as c:
        _semear_estudo(c)
        e._n_minimo(c, 1)
        r = _estudo(c)
        t = r["coortes"][0]
        pre, pos = t["pre"], t["pos"]
        # Sem a migration seriam 3 (A, B, C): B não consentiu.
        assert pre["pareados"] == pos["pareados"] == 2
        # Pós: só os 1200 s de A contam (os 300 s de B saem): 20 min / 2 alunos / 2 semanas.
        assert pos["pr1"]["tempo_ativo_min_por_aluno_semana"] == pytest.approx(5.0)
        assert pos["pr1"]["alunos_ativos_pct"] == 50
        assert "consentimento de pesquisa" in r["definicoes"]["populacao"]


@f5.e2e
def test_supressao_vale_sobre_a_populacao_menor() -> None:
    with _banco(*f5.sql_de(M)) as c:
        _semear_estudo(c)
        e._n_minimo(c, 3)  # 3 matriculados, mas só 2 consentiram
        pre = _estudo(c)["coortes"][0]["pre"]
        assert pre["pareados"] is None


@f5.e2e
def test_revogar_tira_o_aluno_na_proxima_leitura() -> None:
    with _banco(*f5.sql_de(M)) as c:
        _semear_estudo(c)
        e._n_minimo(c, 1)
        c.execute(
            "INSERT INTO public.consentimento_pesquisa (aluno_id, versao, status, decidido_em)"
            " VALUES (%s, %s, 'rejected', now() + interval '1 second')",
            (f5.C, M_CONSENTIMENTO.VERSAO_PESQUISA),
        )
        assert _estudo(c)["coortes"][0]["pre"]["pareados"] == 1


@f5.e2e
def test_perfil_formato_conta_so_quem_consentiu() -> None:
    with _banco(*f5.sql_de(M)) as c:
        pf._semear(c)
        pf._dados(c)
        _consentir(c, f5.A, f5.C)
        pf._n_minimo(c, 1)
        r = pf._rpc(c, f5.PROF, [f5.TURMA])
        # Sem a migration: alunos 3, com_perfil 2 (A e B). B, achiever, não consentiu.
        assert r["populacao"]["alunos"] == 2
        assert (r["populacao"]["com_perfil"], r["populacao"]["sem_perfil"]) == (1, 1)
        ach = pf._perfil(r, "achiever")
        assert (ach["alunos"], ach["afinidade_media"]) == (1, 80.0)
        assert "consentimento de pesquisa" in r["definicoes"]["populacao"]


@f5.e2e
def test_downgrade_devolve_a_populacao_inteira() -> None:
    with _banco(*f5.sql_de(M), *f5.sql_de(M, "downgrade")) as c:
        _semear_estudo(c)
        e._n_minimo(c, 1)
        r = _estudo(c)
        assert r["coortes"][0]["pre"]["pareados"] == 3
        assert "consentimento" not in r["definicoes"]["populacao"]
        pf_r = pf._rpc(c, f5.PROF, [f5.TURMA])
        # A, B, C e D: aqui não há corte, então D (que entrou depois do corte do estudo) conta.
        assert pf_r["populacao"]["alunos"] == 4
