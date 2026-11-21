"""`20261120_04`: conquista paga sem registro ganha o registro (I13)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

from sqlalchemy import text

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = "20261120_04_registra_conquistas_pagas_sem_registro.py"


def _mod():
    spec = importlib.util.spec_from_file_location("m_registra_conquistas_20_04", VERSOES / ARQUIVO)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_cadeia() -> None:
    mod = _mod()
    assert (mod.revision, mod.down_revision) == ("20261120_04", "20261120_03")


def test_sql_sem_parametro_de_bind() -> None:
    """`op.execute` passa por `text()`: um `:palavra` no SQL viraria parâmetro."""
    assert text(_mod().REGISTRA).compile().params == {}


def test_so_insere_onde_falta_e_so_conquista_que_existe() -> None:
    sql = _mod().REGISTRA
    assert "JOIN public.conquistas c" in sql
    assert "NOT EXISTS" in sql
    assert "DISTINCT ON (e.aluno_id, c.id)" in sql
    assert "e.criado_em AT TIME ZONE 'UTC'" in sql
    assert "DELETE" not in sql.upper()


def _vetor():
    spec = importlib.util.spec_from_file_location(
        "m_vetor_demo_20_05", VERSOES / "20261120_05_vetor_da_conta_de_demonstracao.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_vetor_da_demonstracao_encadeia_e_nao_apaga() -> None:
    mod = _vetor()
    assert (mod.revision, mod.down_revision) == ("20261120_05", "20261120_04")
    assert text(mod.RESTAURA).compile().params == {}
    assert "DELETE" not in mod.RESTAURA.upper()
    assert mod.MEDIDO == {"mastermind": 85, "conqueror": 60}
