"""`20261121_04`: a resposta curta aceita o número com a unidade escrita de outro jeito.

Mesmo banco local do e2e da `20261117_04` (`test_e2e_missao_desafio_responder._banco`), com a migration
daqui por cima. A forma comparável é medida direto na função e, no fim, pelo caminho do aluno
(`missao_desafio_responder` como `authenticated`). Dados sintéticos.
"""

from __future__ import annotations

import pytest

from tests import _f5_banco as f5
from tests import test_e2e_missao_desafio_responder as tr

e2e = f5.e2e

N = f5.modulo("20261121_04_desafio_resposta_numero_e_unidade.py")
A = tr.A
LOGICA = tr.LOGICA


def _banco():
    return tr._banco(True, *f5.sql_de(N))


def _forma(c, texto: str, curta: bool = True) -> str | None:
    return c.execute("SELECT public.fn_missao_desafio_comparavel(%s, %s)", (texto, curta)).fetchone()[0]


# (aceita, variações que passam a casar)
IGUAIS = [
    ("-15 metros", ["-15 m", "-15m", "−15 metros", "– 15 m", "- 15 metro", "-15 METROS"]),
    ("20 m/s", ["20 metros por segundo", "20m / s", "20 m/s", "20 metro/segundo", "20 m por s"]),
    ("3,5 km/h", ["3.5 quilômetros por hora", "3,5km/h", "3.5 km / h"]),
    ("2 kg", ["2 quilogramas", "2kg"]),
    ("90 min", ["90 minutos"]),
    ("1,5 l", ["1.5 litros"]),
    ("12 cm", ["12 centímetros"]),
    ("9,8 m/s²", ["9.8 m / s²", "9,8 metros/segundo²"]),
]

# (aceita, variações que continuam erradas)
DIFERENTES = [
    ("15 m", ["15 kg", "15 km", "15 mm", "15 min", "-15 m", "150 m"]),
    ("20 m/s", ["20 m/h", "20 km/s", "20 m"]),
    ("2 kg", ["2 g"]),
    ("16", ["-16", "1 6"]),
]


@e2e
def test_formas_iguais_e_diferentes() -> None:
    with _banco() as c:
        for aceita, variacoes in IGUAIS:
            for v in variacoes:
                assert _forma(c, v) == _forma(c, aceita), (aceita, v, _forma(c, v), _forma(c, aceita))
        for aceita, variacoes in DIFERENTES:
            for v in variacoes:
                assert _forma(c, v) != _forma(c, aceita), (aceita, v, _forma(c, v))


@e2e
def test_palavra_sem_numero_nao_vira_simbolo() -> None:
    """A unidade só vira símbolo logo depois de número ou barra: texto livre fica como estava."""
    with _banco() as c:
        assert _forma(c, "metros") == "metros"
        assert _forma(c, "menos 15") == "menos 15"
        assert _forma(c, "hora do almoço") == "hora do almoco"
        assert _forma(c, "15 metrossexuais") == "15metrossexuais"
        assert _forma(c, "a - 15") == "a -15"


@e2e
def test_multipla_e_nulo_nao_mudam() -> None:
    with _banco() as c:
        assert _forma(c, "20 Metros por Segundo", False) == "20 metros por segundo"
        assert _forma(c, None) is None
        assert _forma(c, None, False) is None


@e2e
@pytest.mark.parametrize("resposta", ["-15 m", "−15m", "- 15 metro"])
def test_aluno_acerta_com_o_simbolo(resposta: str) -> None:
    with _banco() as c:
        tr._semear(c)
        dx = tr._criar(c, LOGICA, {"aceitas": ["-15", "-15 metros", "menos 15"]}, ["mastermind"])["mastermind"]
        assert tr._responder(c, A, dx, {"resposta": "-15 kg"})["acertou"] is False
        assert tr._responder(c, A, dx, {"resposta": resposta})["acertou"] is True


@e2e
def test_downgrade_volta_a_rejeitar() -> None:
    with _banco() as c:
        for sql in f5.sql_de(N, "downgrade"):
            c.execute(sql)
        assert _forma(c, "-15 m") != _forma(c, "-15 metros")
        assert _forma(c, "3,5") == "3.5"
