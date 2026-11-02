import logging
from pathlib import Path

from alembic.config import Config
from sqlalchemy.engine import make_url

from alembic import command

logger = logging.getLogger(__name__)


def normalize_database_url_for_alembic(raw_url: str) -> str:
    url = make_url(raw_url)
    if url.drivername == "postgresql+asyncpg":
        url = url.set(drivername="postgresql+psycopg")
    elif url.drivername == "postgresql":
        url = url.set(drivername="postgresql+psycopg")
    elif url.drivername == "sqlite+aiosqlite":
        url = url.set(drivername="sqlite")

    # ``str(URL)`` oculta a senha como "***" no SQLAlchemy 2. Essa string e
    # usada para abrir a conexao, portanto o Alembic acabava autenticando com
    # a senha mascarada. O valor integral fica somente na configuracao interna.
    return url.render_as_string(hide_password=False)


# Chave do advisory lock que serializa as migracoes. Numero arbitrario, mas
# ESTAVEL: trocar depois de um deploy faria a instancia nova nao enxergar a
# trava da antiga, que e exatamente o que isto existe para impedir.
MIGRATION_ADVISORY_LOCK_KEY = 724_113_052_609


def trava_de_migracao(connection) -> bool:
    """Serializa `upgrade head` entre processos que sobem ao mesmo tempo.

    `DATABASE_MIGRATIONS_ON_STARTUP` e `true` em producao, entao TODA subida da
    API roda `upgrade head`. Com uma replica so' isso nunca da problema. Num
    restart com sobreposicao (o container novo sobe antes de o velho morrer) ou
    com duas replicas, dois processos chamam `upgrade` ao mesmo tempo: o
    Postgres resolve a corrida abortando uma das transacoes, e a instancia
    perdedora NAO SOBE. Falha intermitente de deploy, do tipo que some quando
    se vai investigar.

    Com a trava, a segunda instancia espera a primeira terminar e entao
    encontra tudo aplicado — `upgrade head` vira no-op e ela sobe normalmente.

    Lock de TRANSACAO (`pg_advisory_xact_lock`), chamado DENTRO da transacao
    das migracoes, depois de `declara_leitura_e_escrita`. Ele se solta sozinho
    no COMMIT ou no ROLLBACK, e nao ha `unlock` para errar.

    Ate 02/11 era lock de SESSAO (`pg_advisory_lock` + `pg_advisory_unlock`), e
    isso nao funciona atras do Supavisor em modo transacao (porta 6543, a
    `DATABASE_URL` de producao): cada transacao pode cair num backend diferente.
    O lock ficava no backend da primeira, o `unlock` rodava em outro (e
    devolvia false, sem erro), e a trava ficava PRESA naquele backend ate o
    pooler recicla-lo. Medido em 02/11: a `_08` terminou as 04:24:06, e o
    container seguinte esperou a trava das 04:38 as ~04:43 sem migracao
    nenhuma rodando -- duas subidas mortas por `statement timeout` em
    `pg_advisory_lock`, API em 502. Dentro de uma transacao so', o pooler
    garante um backend so', e o lock nasce e morre nele.

    Isso depende de o Alembic rodar TODAS as migracoes numa transacao so', que
    e o padrao (`transaction_per_migration=False`) e o que o `env.py` usa. Ligar
    `transaction_per_migration` soltaria a trava depois da primeira migracao.

    Fora do Postgres (SQLite nos testes) nao faz nada e devolve False, em vez
    de quebrar.
    """
    from sqlalchemy import text

    if connection.dialect.name != "postgresql":
        return False

    connection.execute(
        text("SELECT pg_advisory_xact_lock(:chave)"), {"chave": MIGRATION_ADVISORY_LOCK_KEY}
    )
    logger.info("Migracoes: advisory lock %s adquirido.", MIGRATION_ADVISORY_LOCK_KEY)
    return True


def declara_leitura_e_escrita(connection) -> None:
    """Primeiro comando da transacao das migracoes: `SET TRANSACTION READ WRITE`.

    A API fala com o banco pelo Supavisor em modo transacao (porta 6543), que
    reaproveita o mesmo backend entre clientes e NAO limpa o estado de sessao.
    Um `SET default_transaction_read_only = on` de qualquer outro cliente (um
    script de medicao "so leitura", por exemplo) fica grudado no backend, e o
    BEGIN seguinte -- o das migracoes -- nasce somente leitura. Em 02/11 foi
    assim que a `20261102_07` falhou com `ReadOnlySqlTransaction` e a API nao
    subiu (502). Declarar o modo na propria transacao vale so para ela: nao
    muda a sessao de ninguem e ignora o default herdado. Precisa vir antes de
    qualquer consulta da transacao, por isso fica aqui e nao na migration.

    Fora do Postgres (SQLite nos testes) nao faz nada.
    """
    from sqlalchemy import text

    if connection.dialect.name == "postgresql":
        connection.execute(text("SET TRANSACTION READ WRITE"))


def upgrade_database_to_head(database_url: str | None = None) -> None:
    """Aplica as migracoes pendentes antes de a API aceitar requisicoes."""
    api_root = Path(__file__).resolve().parents[2]
    config = Config(str(api_root / "alembic.ini"))
    config.set_main_option("script_location", str(api_root / "alembic"))
    if database_url:
        # O startup deve migrar exatamente o banco usado pela API. Uma
        # ALEMBIC_DATABASE_URL antiga nao pode derrubar o deploy enquanto a
        # DATABASE_URL de runtime esta valida.
        config.attributes["database_url_override"] = database_url
    try:
        command.upgrade(config, "head")
    except Exception:
        logger.exception("Falha ao aplicar migracoes do banco de dados.")
        raise
