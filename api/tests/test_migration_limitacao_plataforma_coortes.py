"""A #30 não permite apresentar resultados agregados como comparação por plataforma."""

import importlib.util
from pathlib import Path

from alembic.script import ScriptDirectory

from tests.test_migrations import _offline_alembic_config

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo():
    path = VERSOES / "20261105_29_limitacao_plataforma_coortes.py"
    spec = importlib.util.spec_from_file_location("m_20261105_29_teste", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_migration_declara_que_resultados_nao_sao_estratificados_por_plataforma() -> None:
    sql = _modulo().rpc_nova()
    assert "lotes_por_plataforma informa cobertura" in sql
    assert "PR1 e PR2 continuam agregados" in sql
    assert "nao permitem comparar resultados por plataforma" in sql
    assert sql.count("lotes_por_plataforma") == 1


def test_downgrade_restaura_rpc_anterior_e_mantem_cadeia_unica() -> None:
    m = _modulo()
    assert m.rpc_anterior() == m._load("20261105_11_estudo_relatorio_volta_a_trava.py").rpc_nova()
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261105_29").down_revision == "20261105_28"
