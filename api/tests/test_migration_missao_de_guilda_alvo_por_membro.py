"""`20261105_13` (#154, D6): alvo da missão de guilda por membro. O comportamento está no e2e."""

import importlib.util
from io import StringIO
from pathlib import Path

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_teste_d6", VERSOES / nome)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261105_12:20261105_13", sql=True)
    return output.getvalue().replace("%%", "%")


def test_uma_cabeca_e_vem_depois_da_12() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261105_13").down_revision == "20261105_12"


def test_missoes_antigas_ficam_false_e_novas_nascem_true() -> None:
    sql = _sql()
    assert sql.index("ADD COLUMN IF NOT EXISTS alvo_por_membro boolean NOT NULL DEFAULT false") < sql.index(
        "ALTER COLUMN alvo_por_membro SET DEFAULT true"
    )


def test_avaliador_so_ganha_o_multiplicador_e_continua_fechado() -> None:
    m = _modulo("20261105_13_missao_de_guilda_alvo_por_membro.py")
    novo = m.avaliar_novo()
    assert "v_alvo := v_alvo * GREATEST(v_membros, 1);" in novo
    assert "IF v_m.alvo_por_membro THEN" in novo
    sql = _sql()
    assert "REVOKE ALL ON FUNCTION public.fn_missao_guilda_avaliar(bigint, uuid) FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT" not in sql


def test_downgrade_e_o_avaliador_da_15() -> None:
    m = _modulo("20261105_13_missao_de_guilda_alvo_por_membro.py")
    assert m.avaliar_anterior() == _modulo("20261021_15_missao_de_guilda_soma_os_membros.py").AVALIAR
