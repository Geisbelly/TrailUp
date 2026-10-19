"""Trava que serializa `upgrade head` entre processos que sobem juntos.

`DATABASE_MIGRATIONS_ON_STARTUP` e `true` em producao (confirmado com o time),
entao toda subida da API roda as migracoes. Com restart sobreposto ou duas
replicas, dois processos chamam `upgrade` ao mesmo tempo e o Postgres aborta
uma das transacoes -- a instancia perdedora nao sobe.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.db import migrations


class _Dialeto:
    def __init__(self, nome: str) -> None:
        self.name = nome


class _ConexaoFalsa:
    """Registra o SQL executado, sem banco."""

    def __init__(self, dialeto: str = "postgresql", falhar_no_unlock: bool = False) -> None:
        self.dialect = _Dialeto(dialeto)
        self.chamadas: list[tuple[str, dict[str, Any]]] = []
        self._falhar_no_unlock = falhar_no_unlock
        self.em_transacao = False
        self.commits = 0

    def execute(self, clausula: Any, parametros: dict[str, Any] | None = None) -> None:
        sql = str(clausula)
        if self._falhar_no_unlock and "unlock" in sql:
            raise RuntimeError("conexao morreu")
        self.chamadas.append((sql, parametros or {}))
        self.em_transacao = True  # autobegin do SQLAlchemy 2

    def in_transaction(self) -> bool:
        return self.em_transacao

    def commit(self) -> None:
        self.em_transacao = False
        self.commits += 1

    def sqls(self) -> list[str]:
        return [sql for sql, _ in self.chamadas]


def test_adquire_e_solta_a_trava_no_postgres() -> None:
    conexao = _ConexaoFalsa()
    with migrations.trava_de_migracao(conexao) as travou:
        assert travou is True
        assert any("pg_advisory_lock" in sql for sql in conexao.sqls())
        assert not any("pg_advisory_unlock" in sql for sql in conexao.sqls())

    assert any("pg_advisory_unlock" in sql for sql in conexao.sqls())


def test_usa_a_mesma_chave_para_travar_e_soltar() -> None:
    # Chaves diferentes deixariam o lock preso ate o fim da sessao.
    conexao = _ConexaoFalsa()
    with migrations.trava_de_migracao(conexao):
        pass

    chaves = {params["chave"] for _, params in conexao.chamadas}
    assert chaves == {migrations.MIGRATION_ADVISORY_LOCK_KEY}
    assert len(conexao.chamadas) == 2


def test_solta_a_trava_mesmo_quando_a_migracao_estoura() -> None:
    # Sem isto, uma migracao com erro deixaria a trava presa e a proxima
    # instancia esperaria para sempre.
    conexao = _ConexaoFalsa()
    with pytest.raises(RuntimeError, match="migracao ruim"):
        with migrations.trava_de_migracao(conexao):
            raise RuntimeError("migracao ruim")

    assert any("pg_advisory_unlock" in sql for sql in conexao.sqls())


def test_falha_ao_soltar_nao_mascara_o_sucesso() -> None:
    # O fechamento da conexao solta locks de sessao; perder o unlock explicito
    # nao pode virar excecao nova.
    conexao = _ConexaoFalsa(falhar_no_unlock=True)
    with migrations.trava_de_migracao(conexao) as travou:
        assert travou is True


def test_fora_do_postgres_nao_executa_nada() -> None:
    # Os testes do repositorio rodam migracoes em modo offline e contra SQLite;
    # `pg_advisory_lock` nao existe la.
    conexao = _ConexaoFalsa(dialeto="sqlite")
    with migrations.trava_de_migracao(conexao) as travou:
        assert travou is False

    assert conexao.chamadas == []


def test_a_chave_e_um_bigint_valido() -> None:
    # `pg_advisory_lock(bigint)`: fora da faixa, o Postgres recusa.
    chave = migrations.MIGRATION_ADVISORY_LOCK_KEY
    assert isinstance(chave, int)
    assert -(2**63) <= chave < 2**63


def test_env_py_usa_a_trava_no_caminho_online() -> None:
    # Guarda de fiacao: o helper existir sem estar ligado nao protege nada.
    from pathlib import Path

    env = Path(migrations.__file__).resolve().parents[2] / "alembic" / "env.py"
    texto = env.read_text(encoding="utf-8")
    assert "trava_de_migracao" in texto
    online = texto[texto.index("def run_migrations_online") :]
    assert "with trava_de_migracao(connection):" in online
    # offline nao disputa banco: so imprime SQL
    offline = texto[texto.index("def run_migrations_offline") : texto.index("def run_migrations_online")]
    assert "trava_de_migracao" not in offline


def test_a_trava_nao_deixa_transacao_aberta_para_o_alembic() -> None:
    # Transacao aberta pela trava faz o Alembic pular a dele e ninguem commitar.
    conexao = _ConexaoFalsa()
    with migrations.trava_de_migracao(conexao):
        assert conexao.in_transaction() is False
    assert conexao.in_transaction() is False
    assert conexao.commits == 2


def test_migracao_sob_a_trava_fica_gravada_de_verdade(tmp_path) -> None:
    """Reproduz o rollback silencioso com SQLAlchemy e Alembic de verdade.

    O SQLite faz o papel do banco; a conexao embrulhada so troca o SQL da trava
    (que nao existe fora do Postgres) por um SELECT, que dispara o mesmo
    autobegin. O resto e o caminho do env.py: trava, `begin_transaction`, DDL,
    fechar a conexao. Antes da correcao a tabela e o `alembic_version` sumiam.
    """
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import Column, Integer, create_engine, inspect, text

    engine = create_engine(f"sqlite:///{tmp_path / 'trava.db'}")

    class _ComoPostgres:
        dialect = _Dialeto("postgresql")

        def __init__(self, conexao) -> None:
            self._c = conexao

        def execute(self, clausula: Any, parametros: dict[str, Any] | None = None) -> None:
            self._c.execute(text("SELECT 1"))

        def in_transaction(self) -> bool:
            return self._c.in_transaction()

        def commit(self) -> None:
            self._c.commit()

    with engine.connect() as conexao:
        with migrations.trava_de_migracao(_ComoPostgres(conexao)):
            contexto = MigrationContext.configure(connection=conexao)
            with contexto.begin_transaction():
                Operations(contexto).create_table("sonda_da_trava", Column("id", Integer, primary_key=True))
                conexao.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32))"))
                conexao.execute(text("INSERT INTO alembic_version VALUES ('sonda')"))

    with engine.connect() as nova:
        assert "sonda_da_trava" in inspect(nova).get_table_names()
        assert nova.execute(text("SELECT version_num FROM alembic_version")).scalar() == "sonda"
