"""Painel `/admin/molduras`: atrás do login do admin, e a regra recusada pelo banco vira 404/422."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.exc import DBAPIError

from app.api.deps import get_session

ADMIN = ("admin", "secret-admin")


class _Resultado:
    def __init__(self, linhas=None, escalar=None):
        self._linhas = linhas or []
        self._escalar = escalar

    def mappings(self):
        return self

    def all(self):
        return self._linhas

    def scalar_one(self):
        return self._escalar


class _Sessao:
    def __init__(self, respostas):
        self.respostas = list(respostas)
        self.chamadas: list[tuple[str, dict | None]] = []
        self.commits = 0
        self.rollbacks = 0

    async def execute(self, sql, params=None):
        self.chamadas.append((str(sql), params))
        resposta = self.respostas.pop(0)
        if isinstance(resposta, Exception):
            raise resposta
        return resposta

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1


def _usar(app, sessao):
    async def override():
        yield sessao

    app.dependency_overrides[get_session] = override


class _ErroPg(Exception):
    def __init__(self, sqlstate: str, mensagem: str):
        super().__init__(mensagem)
        self.sqlstate = sqlstate


def test_sem_login_nao_entra(client):
    assert client.get("/admin/molduras").status_code == 401
    assert client.post("/admin/molduras/folhagem", json={"ativa": True, "preco": 20}).status_code == 401
    assert client.post("/admin/molduras/acoes/avaliar_app", json={"ativa": True}).status_code == 401


def test_pagina_lista_acoes_e_catalogo(app):
    molduras = [
        {
            "codigo": "folhagem",
            "nome": "Folhagem",
            "origem": "loja",
            "preco": 20,
            "ativa": True,
            "conquista": None,
            "donos": 3,
        },
        {
            "codigo": "estrela_guia",
            "nome": "Estrela-Guia",
            "origem": "acao",
            "preco": None,
            "ativa": True,
            "conquista": None,
            "donos": 1,
        },
    ]
    acoes = [
        {
            "acao": "avaliar_app",
            "rotulo": "Avaliar o app",
            "descricao": "Avalie.",
            "moldura_codigo": "estrela_guia",
            "ativa": True,
            "feitas": 7,
        },
    ]
    _usar(app, _Sessao([_Resultado(molduras), _Resultado(acoes)]))
    with TestClient(app) as client:
        r = client.get("/admin/molduras", auth=ADMIN)
    assert r.status_code == 200
    assert "Avaliar o app" in r.text
    assert "<option value='estrela_guia' selected>Estrela-Guia</option>" in r.text
    # A da loja não aparece como opção de ação: o banco recusaria.
    assert "<option value='folhagem'" not in r.text
    assert "id='p-folhagem' value='20'" in r.text


def test_salvar_passa_o_admin_como_ator(app):
    sessao = _Sessao([_Resultado(escalar={"codigo": "folhagem", "ativa": False, "preco": 25})])
    _usar(app, sessao)
    with TestClient(app) as client:
        r = client.post("/admin/molduras/folhagem", json={"ativa": False, "preco": 25}, auth=ADMIN)
    assert r.status_code == 200
    assert r.json() == {"codigo": "folhagem", "ativa": False, "preco": 25}
    assert sessao.chamadas[0][1] == {"codigo": "folhagem", "ativa": False, "preco": 25, "ator": "admin"}
    assert sessao.commits == 1


def test_regra_do_banco_vira_422_e_inexistente_404(app):
    recusa = DBAPIError("SELECT", {}, _ErroPg("22023", "moldura folhagem nao e rara (origem acao)"))
    _usar(app, _Sessao([recusa]))
    with TestClient(app) as client:
        r = client.post("/admin/molduras/acoes/avaliar_app", json={"ativa": True, "moldura": "folhagem"}, auth=ADMIN)
    assert r.status_code == 422
    assert "nao e rara" in r.json()["detail"]

    sumiu = DBAPIError("SELECT", {}, _ErroPg("P0002", "acao x nao existe"))
    sessao = _Sessao([sumiu])
    _usar(app, sessao)
    with TestClient(app) as client:
        r = client.post("/admin/molduras/acoes/x", json={"ativa": True}, auth=ADMIN)
    assert r.status_code == 404
    assert sessao.rollbacks == 1


def test_preco_fora_da_faixa_nem_chega_no_banco(app):
    sessao = _Sessao([])
    _usar(app, sessao)
    with TestClient(app) as client:
        r = client.post("/admin/molduras/folhagem", json={"ativa": True, "preco": 0}, auth=ADMIN)
    assert r.status_code == 422
    assert sessao.chamadas == []
