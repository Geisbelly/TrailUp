"""Worker restrito a turmas (#652).

Subir a API na maquina de alguem para depurar ligava o worker da fila de
personalizacao, e ele reivindicava jobs de QUALQUER turma do Supabase
compartilhado: gerava material de alunos reais, gastava cota de IA e disputava
a fila com a API de producao. `PERSONALIZACAO_JOBS_CLASSE_IDS` limita o worker
local as turmas de teste; vazio continua sendo "todas", como na producao.
"""

from __future__ import annotations

import asyncio

from app.core.settings import Settings
from app.repositories.personalizacao_jobs import PersonalizacaoJobsRepository


class _Resultado:
    def mappings(self):
        return self

    def first(self):
        return None


class _SessaoFalsa:
    def __init__(self) -> None:
        self.chamadas: list[tuple[str, dict]] = []

    async def execute(self, sql, params=None):
        self.chamadas.append((str(sql), dict(params or {})))
        return _Resultado()

    async def rollback(self) -> None:
        return None

    async def commit(self) -> None:
        return None


def _reivindicar(classe_ids):
    sessao = _SessaoFalsa()
    repo = PersonalizacaoJobsRepository(sessao)

    async def _sim() -> bool:
        return True

    async def _nao(*_a, **_k) -> bool:
        return False

    repo._jobs_exists = _sim  # type: ignore[method-assign]
    repo._jobs_has_media_snapshot = _nao  # type: ignore[method-assign]
    asyncio.run(repo.claim_next_job(classe_ids=classe_ids))
    return sessao.chamadas[-1]


def test_sem_filtro_manda_null_e_a_consulta_aceita_todas() -> None:
    sql, params = _reivindicar(None)
    assert params["classe_ids"] is None
    assert "CAST(:classe_ids AS bigint[]) IS NULL" in sql


def test_lista_vazia_equivale_a_sem_filtro() -> None:
    _, params = _reivindicar([])
    assert params["classe_ids"] is None


def test_com_filtro_so_reivindica_as_turmas_pedidas() -> None:
    sql, params = _reivindicar([66])
    assert params["classe_ids"] == [66]
    assert "candidate.classe_id = ANY(CAST(:classe_ids AS bigint[]))" in sql


def test_filtro_vale_para_todos_os_status_reivindicaveis() -> None:
    """O OR de pending/partial/processing fica entre parenteses: sem eles, o AND
    da turma prenderia so' o primeiro ramo e o worker voltaria a pegar job
    `partial` ou `processing` vencido de qualquer turma."""
    sql, _ = _reivindicar([66])
    filtro = sql.index("candidate.classe_id = ANY")
    status = sql.index("candidate.status = 'pending'")
    assert filtro < status
    assert sql[filtro:status].rstrip().endswith("AND (")


def test_settings_le_a_lista_do_ambiente(monkeypatch) -> None:
    monkeypatch.setenv("PERSONALIZACAO_JOBS_CLASSE_IDS", "[66, 65]")
    assert Settings(_env_file=None).personalizacao_jobs_classe_ids == [66, 65]


def test_settings_padrao_e_todas_as_turmas(monkeypatch) -> None:
    monkeypatch.delenv("PERSONALIZACAO_JOBS_CLASSE_IDS", raising=False)
    assert Settings(_env_file=None).personalizacao_jobs_classe_ids == []
