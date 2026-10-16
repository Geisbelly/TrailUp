"""Funcao de trigger nao precisa estar na superficie REST do cliente.

Endurecimento, nao correcao de vulnerabilidade: o Postgres ja recusa a chamada
direta de qualquer funcao que retorna `trigger` ("trigger functions can only be
called as triggers", 0A000). O que a migracao tira e um privilegio inutil que
enche o linter do Supabase de 109 avisos -- e aviso demais esconde o achado
real na varredura seguinte.

O que estes testes protegem:

1. **O alvo e so quem retorna `trigger`.** Pegar funcao normal junto
   arrancaria as ~249 RPCs que o app chama (`notificacoes_registrar_login`,
   `social_*`, `trailup_*`...) e derrubaria o mobile inteiro.
2. **O loop e dinamico.** A maioria dessas funcoes veio de schema nao
   versionado; lista fixa deixaria metade de fora e nao cobriria trigger nova.
3. **`service_role` nao e tocado.** E com ele que a API escreve.
4. **O downgrade devolve o que havia** -- EXECUTE para PUBLIC/anon/authenticated.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]


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


def test_revoga_execute_dos_papeis_do_cliente() -> None:
    sql = _render("20261003_04:20261003_05")
    assert "REVOKE EXECUTE ON FUNCTION" in sql
    assert "FROM PUBLIC, anon, authenticated" in sql


def test_mira_so_em_quem_retorna_trigger() -> None:
    sql = _render("20261003_04:20261003_05")
    assert "pg_get_function_result(p.oid) = ''trigger''" in sql or (
        "pg_get_function_result(p.oid) = 'trigger'" in sql
    ), "sem esse filtro, as RPCs do app perdem EXECUTE e o mobile para"


def test_nao_toca_no_service_role() -> None:
    sql = _render("20261003_04:20261003_05")
    assert "service_role" not in sql, "e com service_role que a API escreve"


def test_pega_tambem_funcao_de_schema_nao_versionado() -> None:
    sql = _render("20261003_04:20261003_05")
    # loop dinamico sobre pg_proc, nao lista fixa de nomes
    assert "FROM pg_proc p" in sql
    assert "'public'::regnamespace" in sql


def test_downgrade_devolve_o_execute() -> None:
    sql = _render("20261003_05:20261003_04", downgrade=True)
    assert "GRANT EXECUTE ON FUNCTION" in sql
    assert "TO PUBLIC, anon, authenticated" in sql
