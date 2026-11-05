"""`20261105_09`: o relatório do estudo volta a mostrar a trava (#13, #17).

A cadeia de produção: a `_05` (trava), a `_04_04` (só quem consentiu) e a `_09`. Sem a `_09`, a
`_04_04` apaga a trava do relatório; com ela, as duas coisas valem juntas.
"""

from __future__ import annotations

from tests import _f5_banco as f5
from tests import test_e2e_agregados_so_quem_consentiu as ag
from tests import test_e2e_estudo_coorte as coorte
from tests import test_e2e_trava_personalizacao as trava
from tests.test_e2e_retencao_expurgo import CARIMBO

M_CONSENTIU = f5.modulo("20261104_04_agregados_so_quem_consentiu.py")
M = f5.modulo("20261105_09_estudo_relatorio_volta_a_trava.py")


def _banco(*depois: str):
    return trava._banco(
        CARIMBO, *f5.sql_de(ag.M_CONSENTIMENTO), *f5.sql_de(ag.M_PERFIL_FORMATO), *f5.sql_de(M_CONSENTIU), *depois,
    )


def _turma(c) -> dict:
    coorte._semear(c)
    coorte._dados_da_turma1(c)
    ag._consentir(c, f5.A, f5.C)
    c.execute("UPDATE public.estudo_coorte SET registrado_em = '2026-10-01T00:00:00Z' WHERE classe_id = %s", (f5.TURMA,))
    coorte._n_minimo(c, 1)
    return coorte._rpc(c, f5.PROF, [f5.TURMA])


@f5.e2e
def test_sem_a_09_a_trava_some_do_relatorio() -> None:
    with _banco() as c:
        r = _turma(c)
        t = r["coortes"][0]
        assert "trava" not in t
        assert "exposicao_antes_do_registro" not in t["contaminacao"]
        assert any(x.startswith("sem trava de personalizacao") for x in r["limitacoes"])


@f5.e2e
def test_com_a_09_volta_a_trava_e_fica_a_populacao_nova() -> None:
    with _banco(*f5.sql_de(M)) as c:
        r = _turma(c)
        t = r["coortes"][0]
        assert t["trava"] == {"retida_agora": False, "libera_em": "2026-10-18"}
        assert t["contaminacao"] == {
            "material_pronto_antes_do_corte": True,
            "exposicao_antes_do_registro": False,
            "comparacao_recebeu_personalizacao": None,
            "baseline_contaminado": True,  # A estudou material personalizado em 08/10
        }
        # A população continua a da 20261104_04: B não consentiu.
        assert t["pre"]["pareados"] == 2
        assert "consentimento de pesquisa" in r["definicoes"]["populacao"]
        assert not any(x.startswith("sem trava") for x in r["limitacoes"])


@f5.e2e
def test_downgrade_volta_ao_que_a_04_04_deixou() -> None:
    with _banco(*f5.sql_de(M), *f5.sql_de(M, "downgrade")) as c:
        t = _turma(c)["coortes"][0]
        assert "trava" not in t
        assert t["pre"]["pareados"] == 2
