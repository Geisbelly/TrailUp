"""O Guia reconhece crise, liga o modo de cuidado e grava o momento so com consentimento.

O nivel (`bem_estar`) nunca vai para `chat_guia_registros`."""

from __future__ import annotations

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.repositories.cuidado import CuidadoRepository
from tests.test_chat_guia_registros_rota import RESPOSTA, _pedido, _preparar

EXPIRA = "2026-11-20T20:00:00+00:00"


def _com_bem_estar(nivel: str) -> dict:
    return {**RESPOSTA, "registro": {**RESPOSTA["registro"], "bem_estar": nivel}}


def _cuidado(monkeypatch, *, permitido=True, registrar=None):
    registrar = registrar or AsyncMock(return_value={"ok": True, "expira_em": EXPIRA})
    monkeypatch.setattr(CuidadoRepository, "permitido", AsyncMock(return_value=permitido))
    monkeypatch.setattr(CuidadoRepository, "registrar_pelo_guia", registrar)
    return registrar


def _conversar(app, mensagem: str = "não entendi a soma de frações"):
    with TestClient(app) as client:
        return client.post("/api/v1/personalizar/chat", json=_pedido(mensagem))


def test_crise_liga_o_modo_e_grava_com_consentimento(app, monkeypatch) -> None:
    _preparar(app, monkeypatch, resposta=_com_bem_estar("crise"))
    registrar = _cuidado(monkeypatch)

    r = _conversar(app, "estou tendo uma crise")

    assert r.status_code == 200, r.text
    assert r.json()["modo_cuidado"]["nivel"] == "crise"
    assert r.json()["modo_cuidado"]["expira_em"].startswith("2026-11-20T20:00:00")
    assert registrar.await_args.kwargs["nivel"] == "crise"
    assert registrar.await_args.kwargs["acoes"] == {
        "pausa_sugerida": True,
        "tecnica_oferecida": True,
        "cvv_indicado": False,
    }


def test_desconforto_so_sugere_pausa(app, monkeypatch) -> None:
    _preparar(app, monkeypatch, resposta=_com_bem_estar("desconforto"))
    registrar = _cuidado(monkeypatch)

    r = _conversar(app, "não aguento mais esse conteúdo")

    assert r.json()["modo_cuidado"]["nivel"] == "desconforto"
    assert registrar.await_args.kwargs["acoes"] == {
        "pausa_sugerida": True,
        "tecnica_oferecida": False,
        "cvv_indicado": False,
    }


def test_risco_sem_consentimento_tem_cvv_e_nao_grava(app, monkeypatch) -> None:
    _preparar(app, monkeypatch, resposta=_com_bem_estar("risco"))
    registrar = _cuidado(monkeypatch, permitido=False)

    r = _conversar(app, "não quero mais viver")

    assert "188" in r.json()["reply"]
    assert r.json()["modo_cuidado"]["nivel"] == "risco"
    assert r.json()["modo_cuidado"]["expira_em"] is None
    assert registrar.await_count == 0


def test_barreira_de_texto_eleva_para_risco(app, monkeypatch) -> None:
    _preparar(app, monkeypatch, resposta=_com_bem_estar("nenhum"))
    registrar = _cuidado(monkeypatch)

    r = _conversar(app, "não quero mais viver")

    assert r.json()["modo_cuidado"]["nivel"] == "risco"
    assert registrar.await_args.kwargs["acoes"]["cvv_indicado"] is True


def test_bem_estar_nao_vai_para_chat_guia_registros(app, monkeypatch) -> None:
    _pedidos, gravar = _preparar(app, monkeypatch, resposta=_com_bem_estar("crise"))
    _cuidado(monkeypatch)

    _conversar(app, "estou tendo uma crise")

    assert "bem_estar" not in gravar.await_args.args[0].__dict__


def test_nenhum_nao_liga_o_modo(app, monkeypatch) -> None:
    _preparar(app, monkeypatch, resposta=_com_bem_estar("nenhum"))
    registrar = _cuidado(monkeypatch)

    r = _conversar(app)

    assert r.json()["modo_cuidado"] is None
    assert registrar.await_count == 0


def test_valor_fora_da_lista_vira_nenhum(app, monkeypatch) -> None:
    _preparar(app, monkeypatch, resposta=_com_bem_estar("depressao"))
    _cuidado(monkeypatch)

    assert _conversar(app).json()["modo_cuidado"] is None


def test_falha_ao_gravar_o_momento_nao_derruba_a_resposta(app, monkeypatch) -> None:
    _preparar(app, monkeypatch, resposta=_com_bem_estar("crise"))
    _cuidado(monkeypatch, registrar=AsyncMock(side_effect=RuntimeError("banco fora")))

    r = _conversar(app, "estou tendo uma crise")

    assert r.status_code == 200
    assert r.json()["modo_cuidado"]["nivel"] == "crise"
    assert r.json()["modo_cuidado"]["expira_em"] is None


def test_rpc_recusada_nao_e_erro(app, monkeypatch) -> None:
    _preparar(app, monkeypatch, resposta=_com_bem_estar("crise"))
    _cuidado(monkeypatch, registrar=AsyncMock(return_value={"ok": False, "motivo": "intervalo"}))

    r = _conversar(app, "estou tendo uma crise")

    assert r.status_code == 200
    assert r.json()["modo_cuidado"] == {"nivel": "crise", "expira_em": None}
