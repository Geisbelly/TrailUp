"""Trava que serializa `upgrade head` entre processos que sobem juntos.

`DATABASE_MIGRATIONS_ON_STARTUP` e `true` em producao (confirmado com o time),
entao toda subida da API roda as migracoes. Com restart sobreposto ou duas
replicas, dois processos chamam `upgrade` ao mesmo tempo e o Postgres aborta
uma das transacoes -- a instancia perdedora nao sobe.
"""

from __future__ import annotations

from typing import Any

from app.db import migrations


class _Dialeto:
    def __init__(self, nome: str) -> None:
        self.name = nome


class _ConexaoFalsa:
    """Registra o SQL executado, sem banco."""

    def __init__(self, dialeto: str = "postgresql") -> None:
        self.dialect = _Dialeto(dialeto)
        self.chamadas: list[tuple[str, dict[str, Any]]] = []

    def execute(self, clausula: Any, parametros: dict[str, Any] | None = None) -> None:
        self.chamadas.append((str(clausula), parametros or {}))

    def sqls(self) -> list[str]:
        return [sql for sql, _ in self.chamadas]


def test_a_trava_e_de_transacao_e_nao_tem_unlock() -> None:
    # 02/11: o lock de SESSAO, atras do Supavisor em modo transacao, era solto
    # num backend diferente do que o pegou e ficava preso. O de transacao se
    # solta no COMMIT/ROLLBACK, no mesmo backend.
    conexao = _ConexaoFalsa()
    assert migrations.trava_de_migracao(conexao) is True
    assert conexao.sqls() == ["SELECT pg_advisory_xact_lock(:chave)"]
    assert conexao.chamadas[0][1] == {"chave": migrations.MIGRATION_ADVISORY_LOCK_KEY}


def test_fora_do_postgres_nao_executa_nada() -> None:
    # Os testes do repositorio rodam migracoes em modo offline e contra SQLite;
    # `pg_advisory_xact_lock` nao existe la.
    conexao = _ConexaoFalsa(dialeto="sqlite")
    assert migrations.trava_de_migracao(conexao) is False
    assert conexao.chamadas == []


def test_a_chave_e_um_bigint_valido() -> None:
    # `pg_advisory_xact_lock(bigint)`: fora da faixa, o Postgres recusa.
    chave = migrations.MIGRATION_ADVISORY_LOCK_KEY
    assert isinstance(chave, int)
    assert -(2**63) <= chave < 2**63


def test_env_py_trava_dentro_da_transacao_das_migracoes() -> None:
    # Guarda de fiacao: a trava tem de estar DENTRO de `begin_transaction`,
    # depois do `SET TRANSACTION` (que precisa ser o primeiro comando) e antes
    # de `run_migrations` (que e onde o Alembic le a versao atual).
    from pathlib import Path

    env = Path(migrations.__file__).resolve().parents[2] / "alembic" / "env.py"
    texto = env.read_text(encoding="utf-8")
    online = texto[texto.index("def run_migrations_online") :]
    bloco = online[online.index("with context.begin_transaction():") :]
    pos_modo = bloco.index("declara_leitura_e_escrita(connection)")
    pos_trava = bloco.index("trava_de_migracao(connection)")
    pos_migra = bloco.index("context.run_migrations()")
    assert pos_modo < pos_trava < pos_migra
    assert "with trava_de_migracao" not in texto
    # offline nao disputa banco: so imprime SQL
    offline = texto[texto.index("def run_migrations_offline") : texto.index("def run_migrations_online")]
    assert "trava_de_migracao" not in offline


def test_env_py_roda_as_migracoes_numa_transacao_so() -> None:
    # A trava de transacao so cobre todas as migracoes se elas estiverem numa
    # transacao so'. `transaction_per_migration=True` soltaria a trava depois da
    # primeira.
    from pathlib import Path

    env = Path(migrations.__file__).resolve().parents[2] / "alembic" / "env.py"
    assert "transaction_per_migration" not in env.read_text(encoding="utf-8")
