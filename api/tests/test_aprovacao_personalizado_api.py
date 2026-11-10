"""O aluno só recebe pela API o material que o professor aprovou (`20261110_09`).

A RLS segura o que o app lê direto do Supabase; a API lê como `postgres`, por cima dela, então
repete o filtro nas três rotas que entregam material ao aluno: a listagem, o `POST /personalizar`
e o `media-status`. O professor continua vendo tudo da turma.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_session
from app.api.v1 import personalizacao as personalizacao_module
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.estudo import EstudoRepository
from tests.conftest import FakeSession


def _registro(rid: int) -> dict:
    return {
        "id": rid, "aluno_id": "aluno-1", "classe_id": 1, "topico_id": 5, "ciclo_id": f"c{rid}",
        "status": "pronto", "materiais": {"markdown": {"payload": {"texto": "segredo"}}},
        "plano": {"perfil_dominante": "seeker", "justificativa": "x"},
        "formato_prioritario": "texto", "formatos_gerados": ["markdown"],
        "gerado_em": "2026-11-01T12:00:00Z",
    }


def _como(app, user, monkeypatch, aprovados: set[int]) -> None:
    async def sessao():
        yield FakeSession()

    async def ids_aprovados(self, ids):
        return {i for i in ids if i in aprovados}

    app.dependency_overrides[get_session] = sessao
    app.dependency_overrides[get_current_user] = lambda: user
    monkeypatch.setattr(EstudoRepository, "personalizacao_retida", AsyncMock(return_value=False))
    monkeypatch.setattr(ConteudoPersonalizadoRepository, "ids_aprovados", ids_aprovados)


def test_listagem_do_aluno_so_traz_o_aprovado(app, aluno_user, monkeypatch) -> None:
    _como(app, aluno_user, monkeypatch, {2})
    monkeypatch.setattr(
        ConteudoPersonalizadoRepository, "buscar_por_aluno", AsyncMock(return_value=[_registro(1), _registro(2)])
    )
    with TestClient(app) as client:
        response = client.get("/api/v1/personalizar/aluno-1")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["itens"]] == [2]


def test_media_status_de_material_pendente_e_404_para_o_aluno(app, aluno_user, monkeypatch) -> None:
    _como(app, aluno_user, monkeypatch, set())
    monkeypatch.setattr(ConteudoPersonalizadoRepository, "buscar_por_id", AsyncMock(return_value=_registro(1)))
    with TestClient(app) as client:
        response = client.get("/api/v1/personalizar/1/media-status")
    assert response.status_code == 404


def test_registro_sem_material_mantem_so_o_perfil() -> None:
    sem = personalizacao_module._sem_material(_registro(1))
    assert sem["materiais"] == {}
    assert sem["formatos_gerados"] == []
    assert sem["plano"] == {"perfil_dominante": "seeker"}
    assert sem["id"] == 1


@pytest.mark.asyncio
async def test_filtro_pergunta_ao_repositorio_so_os_ids() -> None:
    chamadas: list[list[int]] = []

    class _Repo:
        def __init__(self, session) -> None:
            pass

        async def ids_aprovados(self, ids):
            chamadas.append(list(ids))
            return {1}

    original = personalizacao_module.ConteudoPersonalizadoRepository
    personalizacao_module.ConteudoPersonalizadoRepository = _Repo
    try:
        saida = await personalizacao_module._so_aprovados(object(), [_registro(1), _registro(3), {"id": None}])
    finally:
        personalizacao_module.ConteudoPersonalizadoRepository = original
    assert [r["id"] for r in saida] == [1]
    assert chamadas == [[1, 3]]
    assert await personalizacao_module._so_aprovados(object(), []) == []


class _Sessao:
    def __init__(self, linhas) -> None:
        self.linhas, self.params = linhas, None

    async def execute(self, consulta, params=None):
        self.params = params
        return SimpleNamespace(all=lambda: self.linhas)


@pytest.mark.asyncio
async def test_repositorio_sem_a_coluna_deixa_passar_e_com_ela_pergunta(monkeypatch) -> None:
    sessao = _Sessao([(2,)])
    repo = ConteudoPersonalizadoRepository(sessao)
    monkeypatch.setattr(repo, "_table_has_column", AsyncMock(return_value=True))
    assert await repo.ids_aprovados([3, 2, 2]) == {2}
    assert sessao.params == {"ids": [2, 3]}

    sem_coluna = ConteudoPersonalizadoRepository(_Sessao([]))
    monkeypatch.setattr(sem_coluna, "_table_has_column", AsyncMock(return_value=False))
    assert await sem_coluna.ids_aprovados([5, 6]) == {5, 6}
    assert await sem_coluna.ids_aprovados([]) == set()
