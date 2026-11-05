"""`20261105_20` (#154, fase 4): o resumo da arena do professor diz de qual evento é cada duelo."""

import importlib.util
from io import StringIO
from pathlib import Path

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo():
    spec = importlib.util.spec_from_file_location("m_20261105_20_teste", VERSOES / "20261105_20_duelos_do_evento_no_console.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_uma_cabeca_e_vem_depois_da_19() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261105_20").down_revision == "20261105_19"


def test_so_acrescenta_o_evento_id() -> None:
    m = _modulo()
    assert m.resumo_novo().replace(m.DEPOIS, m.ANTES) == m.resumo_anterior()
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261105_19:20261105_20", sql=True)
    sql = output.getvalue()
    assert "'evento_id', d.evento_id," in sql
    assert "GRANT" not in sql
