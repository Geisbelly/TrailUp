"""As tabelas que o app assina tem de estar na publicacao do Realtime.

Fora da publicacao `supabase_realtime`, o Postgres nao emite a mudanca no WAL
logico: o canal assina, o `.subscribe()` nao reclama e evento nenhum chega.
E a falha mais silenciosa desse caminho -- nada estoura, a tela so para de
acompanhar o banco.

O que estes testes protegem:

1. **As seis tabelas entram.** Elas sao assinadas em `PortoesContext`,
   `TrilhaContext`, `ConquistaRankContext` e `TrailupApiProvider`.
2. **A migracao nao estoura fora do Supabase.** Em Postgres local/CI a
   publicacao nao existe; sem a guarda, `alembic upgrade head` quebraria o
   boot da API (`DATABASE_MIGRATIONS_ON_STARTUP`).
3. **Roda duas vezes sem erro.** `ALTER PUBLICATION ... ADD TABLE` de uma
   tabela que ja e membro levanta erro, entao a checagem de pertencimento
   tem de estar la.
4. **O downgrade volta exatamente as seis**, sem tocar nas que ja estavam
   (`notificacoes`, `classe_aluno`, `ranks`, telemetria...).
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]

TABELAS_ASSINADAS = (
    "atividade_aluno",
    "classe_mapa_tema",
    "conteudo_aluno",
    "conteudo_personalizado",
    "eventos_aluno",
    "topico_aluno",
)

# Ja estavam na publicacao antes desta migracao; nenhuma delas pode aparecer
# no SQL, nem para adicionar (erro) nem para remover (quebraria notificacao).
JA_ESTAVAM = ("notificacoes", "classe_aluno", "ranks", "telemetria_lotes")


def _render(intervalo: str, *, downgrade: bool = False) -> str:
    output = StringIO()
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(config, intervalo, sql=True)
    return output.getvalue()


def test_as_seis_tabelas_assinadas_entram_na_publicacao() -> None:
    sql = _render("20261003_03:20261003_04")
    assert "alter publication supabase_realtime" in sql.lower()
    assert "add table" in sql.lower()
    for tabela in TABELAS_ASSINADAS:
        assert f"'{tabela}'" in sql, f"{tabela} ficaria sem Realtime"


def test_nao_mexe_nas_tabelas_que_ja_estavam() -> None:
    sql = _render("20261003_03:20261003_04")
    for tabela in JA_ESTAVAM:
        assert f"'{tabela}'" not in sql, f"{tabela} nao deveria ser tocada"


def test_tolera_banco_sem_a_publicacao() -> None:
    sql = _render("20261003_03:20261003_04").lower()
    assert "from pg_publication where pubname" in sql, (
        "sem a guarda, Postgres local/CI quebra o alembic upgrade head"
    )


def test_pula_tabela_que_ja_e_membro() -> None:
    sql = _render("20261003_03:20261003_04").lower()
    assert "pg_publication_tables" in sql, (
        "ADD TABLE de tabela ja publicada levanta erro; falta a checagem"
    )


def test_downgrade_remove_so_as_seis() -> None:
    sql = _render("20261003_04:20261003_03", downgrade=True)
    assert "drop table" in sql.lower()
    for tabela in TABELAS_ASSINADAS:
        assert f"'{tabela}'" in sql
    for tabela in JA_ESTAVAM:
        assert f"'{tabela}'" not in sql
