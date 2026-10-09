import logging
from collections.abc import Iterator
from contextlib import contextmanager
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


@contextmanager
def trava_de_migracao(connection) -> Iterator[bool]:
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

    Lock de SESSAO, nao de transacao (`pg_advisory_xact_lock`): o Alembic pode
    rodar as migracoes em mais de uma transacao, e um lock de transacao seria
    solto no meio do caminho. A liberacao tem duas redes: o `finally` e o
    fechamento da conexao, que o Postgres trata soltando os locks de sessao.

    Fora do Postgres (SQLite nos testes) nao faz nada e devolve False, em vez
    de quebrar.
    """
    from sqlalchemy import text

    aplicavel = connection.dialect.name == "postgresql"
    if not aplicavel:
        yield False
        return

    connection.execute(
        text("SELECT pg_advisory_lock(:chave)"), {"chave": MIGRATION_ADVISORY_LOCK_KEY}
    )
    logger.info("Migracoes: advisory lock %s adquirido.", MIGRATION_ADVISORY_LOCK_KEY)
    try:
        yield True
    finally:
        try:
            connection.execute(
                text("SELECT pg_advisory_unlock(:chave)"),
                {"chave": MIGRATION_ADVISORY_LOCK_KEY},
            )
        except Exception:  # pragma: no cover - conexao ja morta solta o lock sozinha
            logger.warning(
                "Migracoes: falha ao soltar o advisory lock; o fim da sessao o solta."
            )


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
