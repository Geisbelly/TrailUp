"""`20261105_15` (#154, fase 2): duelo no evento. O comportamento está no e2e."""

import importlib.util
from io import StringIO
from pathlib import Path

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo():
    spec = importlib.util.spec_from_file_location("m_20261105_15_teste", VERSOES / "20261105_15_duelo_no_evento.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261105_14:20261105_15", sql=True)
    return output.getvalue().replace("%%", "%")


def test_uma_cabeca_e_vem_depois_da_14() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261105_15").down_revision == "20261105_14"


def test_duelo_com_evento_e_sempre_consequencia_evento() -> None:
    assert "CHECK (evento_id IS NULL OR consequencia = 'evento')" in _sql()


def test_acesso() -> None:
    sql = _sql()
    assert "REVOKE ALL ON FUNCTION public.fn_evento_duelo_cobrar(uuid, uuid) FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT EXECUTE ON FUNCTION public.evento_duelo_criar(uuid, text, text, integer, uuid, uuid, uuid[], uuid)\n  TO authenticated" in sql
    assert "SECURITY DEFINER" in sql


def test_view_nao_ganha_funcao() -> None:
    """Função dentro da view pede EXECUTE para o cliente (o 42501 de 29/10)."""
    m = _modulo()
    antes, depois = m.view_anterior(), m.view_nova()
    assert depois.count("public.") == antes.count("public.")
    assert "d.evento_id = rj.evento_id" in depois


def test_downgrade_volta_os_textos_de_origem() -> None:
    m = _modulo()
    assert m.convite_anterior() in m.convite_novo().replace(m.CONVITE_DEPOIS, m.CONVITE_ANTES)
    assert m.view_anterior() == m.view_nova().replace(m.VIEW_DEPOIS, m.VIEW_ANTES)
