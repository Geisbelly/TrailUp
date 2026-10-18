from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261011_04:20261013_01", sql=True)
    return output.getvalue()


def test_coluna_nasce_nula_e_sem_backfill_inventado() -> None:
    sql = _upgrade_sql()

    assert "ADD COLUMN IF NOT EXISTS liberado_em timestamptz" in sql
    # Não preenche quem já estava liberado: a data real não existe.
    assert "UPDATE public.professor" not in sql
    assert "SET liberado_em" not in sql


def test_gatilho_grava_ao_liberar_e_limpa_ao_revogar() -> None:
    sql = _upgrade_sql()

    assert "BEFORE INSERT OR UPDATE OF liberado ON public.professor" in sql
    assert "NEW.liberado IS TRUE" in sql
    # só carimba na TRANSIÇÃO para liberado (INSERT, ou OLD.liberado diferente de true)
    assert "TG_OP = 'INSERT' OR OLD.liberado IS DISTINCT FROM TRUE" in sql
    assert "NEW.liberado_em := now()" in sql
    assert "NEW.liberado_em := NULL" in sql


def test_funcao_de_gatilho_fora_da_superficie_rest() -> None:
    sql = _upgrade_sql()
    assert "REVOKE ALL ON FUNCTION public.trg_professor_liberado_em() FROM PUBLIC, anon, authenticated" in sql


def test_downgrade_desfaz_tudo() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261013_01:20261011_04", sql=True)
    sql = output.getvalue()
    assert "DROP TRIGGER IF EXISTS trg_professor_liberado_em ON public.professor" in sql
    assert "DROP COLUMN IF EXISTS liberado_em" in sql
