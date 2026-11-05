"""A reserva do chat: o lote nunca toca nela, e o chat a tenta primeiro."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from app.agent.graph.guardrails import gerar_validado
from app.services import gemini_chaves

CHAVES = ["k1", "k2", "k3", "k4"]


@pytest.fixture(autouse=True)
def _pool_limpo():
    gemini_chaves.reset()
    yield
    gemini_chaves.reset()


def _esgotar(*chaves: str) -> None:
    for chave in chaves:
        gemini_chaves._indisponivel_ate[(chave, "m")] = 9e12


def test_sem_reserva_nada_muda() -> None:
    _esgotar("k1", "k2", "k3")

    assert gemini_chaves.escolher_chave(CHAVES, "m") == "k4"


def test_lote_nao_toca_na_reserva_mesmo_sem_outra_chave() -> None:
    _esgotar("k1", "k2", "k3")

    assert gemini_chaves.escolher_chave(CHAVES, "m", reservadas=1) is None


def test_chat_tenta_a_reserva_primeiro() -> None:
    with gemini_chaves.faixa_do_chat():
        assert gemini_chaves.escolher_chave(CHAVES, "m", reservadas=1) == "k4"


def test_chat_usa_as_outras_quando_a_reserva_esgota() -> None:
    _esgotar("k4")

    with gemini_chaves.faixa_do_chat():
        assert gemini_chaves.escolher_chave(CHAVES, "m", reservadas=1) in {"k1", "k2", "k3"}


def test_a_faixa_termina_com_o_bloco() -> None:
    with gemini_chaves.faixa_do_chat():
        pass

    assert gemini_chaves.escolher_chave(CHAVES, "m", reservadas=3) == "k1"


@pytest.mark.parametrize("reservadas", [4, 9])
def test_reservar_tudo_nao_para_o_lote(reservadas: int) -> None:
    assert gemini_chaves.escolher_chave(CHAVES, "m", reservadas=reservadas) in CHAVES


@pytest.mark.parametrize(("valor", "esperado"), [(2, 2), (0, 0), (-1, 0), ("x", 0), (None, 0)])
def test_valor_invalido_vira_sem_reserva(valor, esperado) -> None:
    assert gemini_chaves.reservadas_de(SimpleNamespace(gemini_chaves_reservadas_chat=valor)) == esperado


class _Saida(BaseModel):
    ok: bool = True


def _faixa_durante_a_geracao(**kwargs) -> bool:
    visto: list[bool] = []

    async def ainvoke_structured(**_kwargs):
        visto.append(gemini_chaves._na_faixa_do_chat.get())
        return _Saida()

    asyncio.run(
        gerar_validado(
            SimpleNamespace(ainvoke_structured=ainvoke_structured),
            prompt_name="x.txt",
            payload={},
            schema=_Saida,
            guardrails=[],
            fallback_factory=dict,
            **kwargs,
        )
    )
    return visto[0]


def test_quem_da_prazo_entra_na_faixa_do_chat() -> None:
    assert _faixa_durante_a_geracao(prazo_total=5) is True


def test_sem_prazo_e_lote() -> None:
    assert _faixa_durante_a_geracao() is False
