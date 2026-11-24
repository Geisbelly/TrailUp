"""O Guia aprende do que o aluno gosta e que postura funciona com ele (`20261124_04`).

O comportamento é do modelo; aqui fica o que o código garante: o catálogo é o mesmo nos três
lugares, o que o modelo devolve é filtrado e mascarado, a coleta desligada não lê nem grava, a
leitura que falha não derruba o chat, e gostos e resumo não vão ao log cru da decisão.
"""

from __future__ import annotations

import json
import re
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import personalizacao as rota
from app.services import preferencias_do_guia as pref
from app.services.llm import load_prompt
from tests.test_chat_guia_registros_rota import RESPOSTA, _pedido, _preparar

RAIZ = Path(__file__).resolve().parents[2]
MIGRATION = RAIZ / "api/alembic/versions/20261124_04_guia_preferencias_do_aluno.py"
APP = RAIZ / "mobile/src/utils/preferenciasDoGuia.ts"


# ---------------------------------------------------------------- o catálogo


def test_catalogo_igual_na_api_na_migration_e_no_app() -> None:
    api = set(pref.GOSTOS)
    texto = MIGRATION.read_text(encoding="utf-8")
    bloco = texto[texto.index("GOSTOS = (") : texto.index(")", texto.index("GOSTOS = ("))]
    migration = set(re.findall(r'"([a-z_]+)"', bloco))
    app_ts = APP.read_text(encoding="utf-8")
    objeto = app_ts[app_ts.index("GOSTOS_DO_GUIA") : app_ts.index("};", app_ts.index("GOSTOS_DO_GUIA"))]
    app = set(re.findall(r"^\s+([a-z_]+):", objeto, re.MULTILINE))
    assert api == migration == app
    postura_ts = app_ts[app_ts.index("POSTURAS_DO_GUIA") :]
    for postura in pref.POSTURAS:
        assert f'"{postura}"' in texto
        assert f"{postura}:" in postura_ts


# ---------------------------------------------------------------- normalizar


def test_sem_atualizar_nao_grava_nada() -> None:
    assert pref.normalizar_preferencias({"atualizar": False, "gostos": ["games"]}) is None
    assert pref.normalizar_preferencias(None) is None


def test_filtra_o_catalogo_a_postura_e_mascara_o_resumo() -> None:
    novas = pref.normalizar_preferencias(
        {
            "atualizar": True,
            "gostos": ["games", "GAMES", "xadrez", "musica"] + list(pref.GOSTOS)[2:],
            "resumo": "A Carla aprende com exemplos de futebol. Escreve para carla@ex.com",
            "postura": "bravo",
        },
        {"Carla"},
    )
    assert novas.gostos[:2] == ["games", "musica"]
    assert len(novas.gostos) == pref.MAX_GOSTOS
    assert "Carla" not in novas.resumo and "carla@ex.com" not in novas.resumo
    assert "[email]" in novas.resumo
    assert novas.postura is None


def test_resumo_so_com_marcas_vira_none_e_longo_e_cortado() -> None:
    assert pref.normalizar_preferencias({"atualizar": True, "resumo": "[nome]"}).resumo is None
    longo = pref.normalizar_preferencias({"atualizar": True, "resumo": "a " * 400, "postura": "acolher"})
    assert len(longo.resumo) <= pref.MAX_RESUMO
    assert longo.postura == "acolher"


def test_bloco_do_guia_sem_linha_e_vazio() -> None:
    assert pref.bloco_para_o_guia(None) == {
        "gostos": [],
        "gostos_por_extenso": [],
        "resumo": None,
        "postura_que_funciona": None,
    }
    bloco = pref.bloco_para_o_guia({"gostos": ["musica", "xadrez"], "resumo": "Gosta de ver o porquê.", "postura": "instigar"})
    assert bloco["gostos"] == ["musica"]
    assert bloco["gostos_por_extenso"] == ["música"]
    assert bloco["postura_que_funciona"] == "instigar"


# ---------------------------------------------------------------- o repositório


class _Sessao:
    def __init__(self, linha=None, falha=None) -> None:
        self.linha, self.falha = linha, falha
        self.sql: list[str] = []

    @asynccontextmanager
    async def begin_nested(self):
        yield

    async def execute(self, sql, params=None):
        self.sql.append(str(sql))
        if self.falha:
            raise self.falha
        linha = self.linha

        class _R:
            def mappings(self):
                return self

            def first(self):
                return linha

        return _R()


@pytest.mark.asyncio
async def test_ler_sem_linha_vale_coleta_ligada() -> None:
    assert await pref.PreferenciasDoGuiaRepository(_Sessao()).ler("u") == (None, True)


@pytest.mark.asyncio
async def test_ler_com_coleta_desligada_nao_devolve_nada() -> None:
    sessao = _Sessao({"gostos": ["games"], "resumo": None, "postura": None, "coleta_ligada": False})
    assert await pref.PreferenciasDoGuiaRepository(sessao).ler("u") == (None, False)


@pytest.mark.asyncio
async def test_leitura_que_falha_nao_coleta() -> None:
    repo = pref.PreferenciasDoGuiaRepository(_Sessao(falha=RuntimeError("relation does not exist")))
    assert await repo.ler("u") == (None, False)
    assert await pref.PreferenciasDoGuiaRepository(None).ler("u") == (None, False)


@pytest.mark.asyncio
async def test_gravar_nunca_toca_quem_desligou() -> None:
    sessao = _Sessao()
    await pref.PreferenciasDoGuiaRepository(sessao).gravar("u", pref.PreferenciasDoGuia(gostos=["games"]))
    assert "WHERE aluno_preferencias_guia.coleta_ligada" in sessao.sql[-1]


# ---------------------------------------------------------------- a rota


RESPOSTA_COM_GOSTO = {
    **RESPOSTA,
    "registro": {
        **RESPOSTA["registro"],
        "preferencias": {
            "atualizar": True,
            "gostos": ["futebol", "xadrez"],
            "resumo": "Entende melhor com exemplos de futebol. A Bia estuda com ele.",
            "postura": "pragmatico",
        },
    },
}


def _com_preferencias(app, monkeypatch, *, linha=None, ligada=True, resposta=RESPOSTA_COM_GOSTO):
    pedidos, _ = _preparar(app, monkeypatch, resposta=resposta)
    monkeypatch.setattr(pref.PreferenciasDoGuiaRepository, "ler", AsyncMock(return_value=(linha, ligada)))
    gravar = AsyncMock()
    monkeypatch.setattr(pref.PreferenciasDoGuiaRepository, "gravar", gravar)
    logs = AsyncMock()
    monkeypatch.setattr(rota.IADecisionLogRepository, "log", logs)
    return pedidos, gravar, logs


def test_guia_recebe_as_preferencias_e_a_api_grava_filtrado(app, monkeypatch) -> None:
    linha = {"gostos": ["games"], "resumo": "Gosta de desafio.", "postura": "instigar"}
    pedidos, gravar, logs = _com_preferencias(app, monkeypatch, linha=linha)

    with TestClient(app) as client:
        resposta = client.post("/api/v1/personalizar/chat", json=_pedido("adoro futebol, explica com isso?"))

    assert resposta.status_code == 200, resposta.text
    bloco = pedidos[-1]["preferencias_do_aluno"]
    assert bloco["gostos"] == ["games"] and bloco["postura_que_funciona"] == "instigar"
    chaves = list(pedidos[-1])
    assert chaves.index("preferencias_do_aluno") < chaves.index("memoria_do_guia") < chaves.index("mensagem")

    novas = gravar.await_args.args[1]
    assert novas.gostos == ["futebol"]
    assert novas.postura == "pragmatico"
    # O colega da turma (Bia, de `_preparar`) sai do resumo.
    assert "Bia" not in novas.resumo
    # Nem gostos nem resumo vão ao log cru da decisão.
    cru = json.dumps(logs.await_args.kwargs["parsed_response"], ensure_ascii=False)
    assert "preferencias" not in cru and "futebol" not in cru
    assert "preferencias" not in resposta.json()


def test_coleta_desligada_nao_manda_nem_grava(app, monkeypatch) -> None:
    pedidos, gravar, _ = _com_preferencias(app, monkeypatch, ligada=False)

    with TestClient(app) as client:
        client.post("/api/v1/personalizar/chat", json=_pedido())

    assert "preferencias_do_aluno" not in pedidos[-1]
    gravar.assert_not_awaited()


def test_sem_nada_novo_nao_grava(app, monkeypatch) -> None:
    _, gravar, _ = _com_preferencias(app, monkeypatch, resposta=RESPOSTA)

    with TestClient(app) as client:
        client.post("/api/v1/personalizar/chat", json=_pedido())

    gravar.assert_not_awaited()


# ---------------------------------------------------------------- o prompt e a migration


def test_prompt_pede_so_o_novo_e_proibe_dado_sensivel() -> None:
    texto = load_prompt("mentor_personalizacao_chat.txt")
    assert '"preferencias_do_aluno"' in texto
    assert "NUNCA ponha no resumo" in texto
    for sensivel in ("saude", "religiao", "politica", "sexualidade"):
        assert sensivel in texto
    for codigo in pref.GOSTOS:
        assert codigo in texto
    assert "Perfil > Configuracoes > O que o Guia sabe de voce" in texto


def test_guia_do_app_cita_a_tela() -> None:
    assert "O que o Guia sabe de você" in load_prompt("guia_do_app_aluno.md")


def test_migration_cria_tabela_e_policy_juntas_e_sem_escrita_do_cliente() -> None:
    texto = MIGRATION.read_text(encoding="utf-8")
    assert "CREATE POLICY aluno_preferencias_guia_sel" in texto
    assert "USING (aluno_id = auth.uid())" in texto
    assert "GRANT SELECT ON TABLE public.aluno_preferencias_guia TO authenticated" in texto
    assert "GRANT INSERT" not in texto and "GRANT UPDATE" not in texto and "GRANT DELETE" not in texto
    assert texto.count("\nSECURITY DEFINER\n") == 2
    assert "FROM PUBLIC, anon" in texto
