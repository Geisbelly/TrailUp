"""`20261105_16` (#154, fase 3): pareamento no evento. O comportamento está no e2e."""

import importlib.util
from io import StringIO
from pathlib import Path

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo():
    spec = importlib.util.spec_from_file_location("m_20261105_16_teste", VERSOES / "20261105_16_pareamento_no_evento.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261105_15:20261105_16", sql=True)
    return output.getvalue().replace("%%", "%")


def test_uma_cabeca_e_vem_depois_da_15() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261105_16").down_revision == "20261105_15"


def test_so_a_sugestao_e_do_cliente() -> None:
    sql = _sql()
    for interna in (
        "fn_evento_desempenho(bigint, uuid)",
        "fn_evento_adversarios_proximos(uuid, uuid, integer)",
        "fn_evento_guildas_proximas(uuid, uuid, integer)",
    ):
        assert f"REVOKE ALL ON FUNCTION public.{interna} FROM PUBLIC, anon, authenticated" in sql
        assert f"GRANT EXECUTE ON FUNCTION public.{interna}" not in sql
    assert "GRANT EXECUTE ON FUNCTION public.evento_sugerir_adversarios(uuid, uuid) TO authenticated" in sql


def test_configuracao_privada_e_sem_sobrescrever() -> None:
    sql = _sql()
    assert sql.count(", false)") >= 5 and "true)" not in sql.split("ON CONFLICT (chave) DO NOTHING")[0]
    assert "ON CONFLICT (chave) DO NOTHING" in sql


def test_sugestao_nao_devolve_numero_de_desempenho() -> None:
    m = _modulo()
    corpo = m.FUNCOES[m.FUNCOES.index("FUNCTION public.evento_sugerir_adversarios"):]
    assert "'distancia'" not in corpo and "'desempenho'" not in corpo and "'media'" not in corpo


def test_criar_so_ganha_a_cobranca() -> None:
    m = _modulo()
    assert m.criar_novo().replace(m.CRIAR_DEPOIS, m.CRIAR_ANTES) == m.criar_anterior()
