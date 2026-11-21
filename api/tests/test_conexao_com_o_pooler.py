"""Conexao da API com o Supavisor: pool que reaproveita a conexao e cache de schema por processo.

Em 20/11 a cota de egress do plano Free estourou (5,57 de 5 GB) e o Supabase restringiu todos os
servicos. 99,5% era o Shared Pooler: com NullPool, cada sessao abria uma conexao nova (TLS,
autenticacao, introspeccao de tipos do asyncpg), e os lacos de fundo abrem sessao a cada poucos
segundos. Estes testes travam as duas correcoes.
"""

from __future__ import annotations

import pytest
from sqlalchemy.pool import NullPool

from app.core.settings import Settings
from app.db import schema_cache
from app.db.session import build_engine, opcoes_do_engine
from app.repositories.personalizacao_jobs import PersonalizacaoJobsRepository

POOLER = "postgresql+asyncpg://postgres.ref:senha@aws-0-us-west-2.pooler.supabase.com:6543/postgres"


def _settings(**overrides) -> Settings:
    values = {
        "app_env": "test",
        "database_url": POOLER,
        "supabase_jwt_secret": "test-secret",
        "admin_panel_password": "secret-admin",
    }
    values.update(overrides)
    return Settings(**values)


def test_pooler_usa_pool_que_reaproveita_conexao_e_nao_nullpool():
    engine = build_engine(_settings())
    pool = engine.sync_engine.pool
    assert not isinstance(pool, NullPool)
    assert pool.size() == 5
    assert pool._max_overflow == 5
    assert pool._recycle == 300
    assert pool._timeout == 30
    assert engine.sync_engine.pool._pre_ping is True


def test_pool_do_pooler_vem_das_configuracoes():
    engine = build_engine(
        _settings(
            database_pool_size=3,
            database_pool_max_overflow=0,
            database_pool_recycle_sec=120,
            database_pool_timeout_sec=10,
        )
    )
    pool = engine.sync_engine.pool
    assert pool.size() == 3
    assert pool._max_overflow == 0
    assert pool._recycle == 120
    assert pool._timeout == 10


def test_pooler_desliga_os_dois_caches_de_prepared_statement():
    """O backend pode mudar a cada transacao: statement preparado numa nao existe na outra."""
    connect_args, engine_kwargs = opcoes_do_engine(_settings())
    assert connect_args["statement_cache_size"] == 0
    assert connect_args["prepared_statement_cache_size"] == 0
    assert "poolclass" not in engine_kwargs


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+asyncpg://postgres:postgres@localhost:5432/trailup",
        "sqlite+aiosqlite:///:memory:",
    ],
)
def test_fora_do_pooler_o_engine_nao_muda(url):
    connect_args, engine_kwargs = opcoes_do_engine(_settings(database_url=url))
    assert "prepared_statement_cache_size" not in connect_args
    assert "pool_size" not in engine_kwargs
    assert "poolclass" not in engine_kwargs


class _SessaoQueConta:
    """Responde `EXISTS` do information_schema e conta quantas vezes foi perguntada."""

    def __init__(self, existe: bool = True) -> None:
        self.existe = existe
        self.consultas: list[str] = []

    async def execute(self, statement, params=None):
        sql = str(statement)
        self.consultas.append(sql)
        existe = self.existe

        class _Resultado:
            def scalar(self_inner):
                return existe

        return _Resultado()


@pytest.mark.asyncio
async def test_tabela_existente_e_perguntada_uma_vez_por_processo_nao_por_sessao():
    for _ in range(5):
        # Uma instancia por sessao, como no laco da fila.
        sessao = _SessaoQueConta(existe=True)
        repo = PersonalizacaoJobsRepository(sessao)  # type: ignore[arg-type]
        assert await repo._jobs_exists() is True
        assert await repo._column_exists("personalizacao_jobs", "media_snapshot") is True
        if _ == 0:
            assert len(sessao.consultas) == 2
        else:
            assert sessao.consultas == []


@pytest.mark.asyncio
async def test_tabela_ausente_e_perguntada_de_novo_depois_do_prazo(monkeypatch):
    agora = [1000.0]
    monkeypatch.setattr(schema_cache.time, "monotonic", lambda: agora[0])

    sessao = _SessaoQueConta(existe=False)
    assert await PersonalizacaoJobsRepository(sessao)._jobs_exists() is False  # type: ignore[arg-type]
    assert len(sessao.consultas) == 1

    sessao = _SessaoQueConta(existe=True)
    assert await PersonalizacaoJobsRepository(sessao)._jobs_exists() is False  # type: ignore[arg-type]
    assert sessao.consultas == []

    agora[0] += schema_cache.TTL_AUSENTE_SEC + 1
    assert await PersonalizacaoJobsRepository(sessao)._jobs_exists() is True  # type: ignore[arg-type]
    assert len(sessao.consultas) == 1
