"""`20261105_21` (#154, fase 5): gatilho de paridade no painel técnico. O comportamento está no e2e."""

import importlib.util
from io import StringIO
from pathlib import Path

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo():
    spec = importlib.util.spec_from_file_location("m_20261105_21_teste", VERSOES / "20261105_21_paridade_no_painel_tecnico.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261105_20:20261105_21", sql=True)
    return output.getvalue().replace("%%", "%")


def test_uma_cabeca_e_vem_depois_da_20() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261105_21").down_revision == "20261105_20"


def test_o_resto_do_painel_nao_muda() -> None:
    m = _modulo()
    novo = m.painel_novo()
    for antigo, troca in ((m.DECLARE_ANTES, m.DECLARE_DEPOIS), (m.CONTA_ANTES, m.CONTA_DEPOIS), (m.LISTA_ANTES, m.LISTA_DEPOIS)):
        novo = novo.replace(troca, antigo)
    assert novo == m.painel_anterior()


def test_xp_sem_duelo_e_sem_aluno_na_saida() -> None:
    m = _modulo()
    assert "FILTER (WHERE NOT ev.fora_do_xp)" in m.CONTA_DEPOIS
    retorno = m.CONTA_DEPOIS[m.CONTA_DEPOIS.index("v_g_paridade := CASE"):]
    assert "aluno_id" not in retorno


def test_acesso_e_configuracao() -> None:
    sql = _sql()
    assert "GRANT EXECUTE ON FUNCTION public.painel_tecnico(integer) TO authenticated" in sql
    assert "ON CONFLICT (chave) DO NOTHING" in sql
    assert "'paridade_guilda_limiar_pct', '25'" in sql
