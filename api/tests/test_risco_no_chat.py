"""Barreira de risco do Guia: o CVV sai em texto fixo, mesmo com o modelo fora do ar."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.services import modo_restrito
from app.services.llm import ProvedorIndisponivelError
from app.services.risco_no_chat import TEXTO_DO_CVV, garantir_cvv, sinal_de_risco
from tests.test_chat_guia_registros_rota import _pedido, _preparar


@pytest.mark.parametrize(
    "frase",
    ["não quero mais viver", "nao quero mais viver", "vou me matar", "quero me machucar", "Pensei em acabar com tudo"],
)
def test_frases_de_risco(frase) -> None:
    assert sinal_de_risco(frase)


@pytest.mark.parametrize("frase", ["essa questão me mata de rir", "não entendi o mmc", "quero acabar a trilha hoje"])
def test_nao_e_risco(frase) -> None:
    assert not sinal_de_risco(frase)


def test_texto_fixo_traz_os_dois_numeros_sem_diagnostico() -> None:
    assert "188" in TEXTO_DO_CVV and "192" in TEXTO_DO_CVV
    for palavra in ("ansiedade", "crise", "ansioso"):
        assert palavra not in TEXTO_DO_CVV.lower()


def test_garantir_cvv_nao_duplica() -> None:
    assert garantir_cvv("x\n\n" + TEXTO_DO_CVV).count("188") == 1
    assert garantir_cvv("x").endswith("\n\n" + TEXTO_DO_CVV)


def test_reserva_com_risco_leva_o_cvv(app, monkeypatch) -> None:
    _preparar(app, monkeypatch, resposta=ProvedorIndisponivelError("fora"))

    with TestClient(app) as client:
        resposta = client.post("/api/v1/personalizar/chat", json=_pedido("não quero mais viver"))

    assert resposta.status_code == 200, resposta.text
    reply = resposta.json()["reply"]
    assert "188" in reply and "192" in reply


def test_resposta_do_modelo_com_risco_leva_o_cvv(app, monkeypatch) -> None:
    _preparar(app, monkeypatch)

    with TestClient(app) as client:
        resposta = client.post("/api/v1/personalizar/chat", json=_pedido("vou me matar"))

    corpo = resposta.json()
    assert corpo["reply"].count("188") == 1 and "192" in corpo["reply"]
    assert corpo["reply"].startswith("Pense no mmc")


def test_risco_nao_cai_na_resposta_fixa_de_navegacao(app, monkeypatch) -> None:
    pedidos, _ = _preparar(app, monkeypatch)

    with TestClient(app) as client:
        resposta = client.post("/api/v1/personalizar/chat", json=_pedido("onde fica a loja, não quero mais viver"))

    assert pedidos, "mensagem de risco tem de chegar ao modelo"
    assert "188" in resposta.json()["reply"]


def test_sem_risco_nao_acrescenta_nada(app, monkeypatch) -> None:
    _preparar(app, monkeypatch)

    with TestClient(app) as client:
        resposta = client.post("/api/v1/personalizar/chat", json=_pedido())

    assert "188" not in resposta.json()["reply"]


def test_ia_barrada_com_risco_leva_o_cvv_no_403(app, monkeypatch) -> None:
    _preparar(app, monkeypatch)
    monkeypatch.setattr(modo_restrito, "finalidades_permitidas", AsyncMock(return_value={"mentor": False}))

    with TestClient(app) as client:
        com_risco = client.post("/api/v1/personalizar/chat", json=_pedido("quero me machucar"))
        sem_risco = client.post("/api/v1/personalizar/chat", json=_pedido())

    assert com_risco.status_code == 403 and "188" in com_risco.text
    assert sem_risco.status_code == 403 and "188" not in sem_risco.text


def test_garantir_cvv_respeita_o_cvv_escrito_pelo_modelo():
    escrito = "Respire comigo. Você pode ligar para o CVV no 188, a qualquer hora, e para o SAMU no 192."
    assert garantir_cvv(escrito) == escrito


def test_garantir_cvv_so_completa_o_samu_quando_falta():
    escrito = "Ligue para o CVV 188, é gratuito."
    final = garantir_cvv(escrito)
    assert final.count("188") == 1 and "SAMU 192" in final
