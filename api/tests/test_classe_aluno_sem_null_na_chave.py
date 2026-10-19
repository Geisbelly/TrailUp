"""Matricula sem turma nao pode existir: ela desliga a guarda da loja.

`loja_comprar` barra compra em turma alheia com
`IF p_classe_id NOT IN (SELECT public.app_classes_do_aluno())`. Basta UMA
linha de `classe_aluno` com `classe_id` nulo para a subconsulta devolver NULL,
o `NOT IN` virar NULL em vez de TRUE, e o `IF` nao disparar.

E a policy de INSERT autoriza o proprio aluno a criar essa linha
(`aluno_id = auth.uid()`), entao o bypass e self-service.

O que estes testes protegem:

1. **As duas colunas viram NOT NULL.** `classe_id` fecha o bypass;
   `aluno_id` entra pelo mesmo motivo (matricula sem aluno nao significa nada)
   e todo gravador ja preenche as duas.
2. **A migracao avisa antes de estourar.** Numa base com a linha orfa, um
   `SET NOT NULL` cru falha com mensagem que nao diz o que fazer.
3. **O downgrade devolve o nullable** -- e, com ele, o bypass. Reverter tem de
   devolver o estado antigo, senao o downgrade mente.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]

INTERVALO = "20261019_10:20261019_11"

COLUNAS = ("classe_id", "aluno_id")


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


def test_as_duas_colunas_viram_not_null() -> None:
    sql = _render(INTERVALO)
    for coluna in COLUNAS:
        assert (
            f"ALTER COLUMN {coluna}" in sql and "SET NOT NULL" in sql
        ), f"{coluna} continuaria aceitando nulo"


def test_confere_as_orfas_antes_de_alterar() -> None:
    """Sem a guarda, uma base com a linha orfa recebe um erro que nao ensina
    nada. A mensagem tem de dizer o que apagar e por que importa."""
    sql = _render(INTERVALO)
    assert "aluno_id IS NULL OR classe_id IS NULL" in sql
    assert "loja_comprar" in sql, "a mensagem precisa dizer o que quebra"


def test_a_guarda_vem_antes_do_alter() -> None:
    sql = _render(INTERVALO)
    assert sql.index("RAISE EXCEPTION") < sql.index("SET NOT NULL")


def test_downgrade_devolve_o_nullable() -> None:
    sql = _render("20261019_11:20261019_10", downgrade=True)
    for coluna in COLUNAS:
        assert f"ALTER COLUMN {coluna}" in sql
    assert "DROP NOT NULL" in sql
    assert "SET NOT NULL" not in sql
