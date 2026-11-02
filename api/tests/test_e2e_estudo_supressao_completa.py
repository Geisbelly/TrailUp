"""`20261102_24`: abaixo de `n_minimo`, a célula do estudo volta nula inteira (#17).

Mesmo banco e mesmos dados do e2e da `_03` (`test_e2e_estudo_coorte`), com a `_24` por cima: a turma 1
tem 3 pareados, e o catálogo pede 5. Com o mínimo em 1, os números são os mesmos de antes.
"""

from __future__ import annotations

from tests import _f5_banco as f5
from tests import test_e2e_estudo_coorte as e

M = f5.modulo("20261102_24_estudo_supressao_completa.py")


def _banco():
    return e._banco(*f5.sql_de(M))


@f5.e2e
def test_abaixo_do_minimo_plataforma_e_ciclos_tambem_voltam_nulos() -> None:
    with _banco() as c:
        e._semear(c)
        e._dados_da_turma1(c)  # 3 pareados; n_minimo do catálogo: 5
        t = e._rpc(c, f5.PROF, [f5.TURMA])["coortes"][0]
        for fase in ("pre", "pos"):
            assert t[fase]["amostra_insuficiente"] is True
            assert t[fase]["lotes_por_plataforma"] is None
            assert t[fase]["exposicao"] == {"alunos_expostos_pct": None, "ciclos_personalizacao": None}
        assert t["serie_semanal"]  # sem semanas, o laço abaixo não provaria nada
        for semana in t["serie_semanal"]:
            assert semana["lotes_por_plataforma"] is None
            assert semana["exposicao"]["ciclos_personalizacao"] is None


@f5.e2e
def test_acima_do_minimo_nada_muda() -> None:
    with _banco() as c:
        e._semear(c)
        e._dados_da_turma1(c)
        e._n_minimo(c, 1)
        t = e._rpc(c, f5.PROF, [f5.TURMA])["coortes"][0]
        # Os mesmos números de `test_contaminacao_marcos_e_plataforma`, na `_03`.
        assert t["pre"]["exposicao"] == {"alunos_expostos_pct": 33.33, "ciclos_personalizacao": 1}
        assert t["pos"]["lotes_por_plataforma"] == {"sem_cliente": 3, "web": 1}


@f5.e2e
def test_downgrade_devolve_a_funcao_da_03() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        e._semear(c)
        e._dados_da_turma1(c)
        t = e._rpc(c, f5.PROF, [f5.TURMA])["coortes"][0]
        assert t["pre"]["amostra_insuficiente"] is True
        assert t["pos"]["lotes_por_plataforma"] == {"sem_cliente": 3, "web": 1}
