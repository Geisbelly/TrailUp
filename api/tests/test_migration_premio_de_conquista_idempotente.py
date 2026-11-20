"""`20261120_01`: o prêmio de conquista ganha `ON CONFLICT DO NOTHING` no corpo vivo do gatilho."""

from __future__ import annotations

import importlib.util
import types
from pathlib import Path

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = "20261120_01_premio_de_conquista_idempotente.py"


def _mod():
    spec = importlib.util.spec_from_file_location("m_premio_conquista_20_01", VERSOES / ARQUIVO)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _sql(fn: str = "upgrade") -> str:
    mod = _mod()
    coletados: list[str] = []
    mod.op = types.SimpleNamespace(execute=lambda sql: coletados.append(str(sql)))
    getattr(mod, fn)()
    return "\n".join(coletados)


def test_cadeia() -> None:
    mod = _mod()
    assert (mod.revision, mod.down_revision) == ("20261120_01", "20261118_01")


def test_ancora_existe_uma_vez_na_cadeia_do_git_e_e_o_premio_de_conquista() -> None:
    mod = _mod()
    gatilho = mod.gatilho_de_eventos_do_git()
    assert gatilho.count(mod.PREMIO_ANTES) == 1
    inicio = gatilho.index(mod.PREMIO_ANTES)
    assert "'conquista_desbloqueada'" in gatilho[inicio - 400 : inicio]


def test_upgrade_troca_o_corpo_vivo_sem_alvo_no_on_conflict() -> None:
    sql = _sql()
    assert "pg_get_functiondef('public.trg_eventos_aluno_after_iud()'::regprocedure)" in sql
    assert "ON CONFLICT DO NOTHING;" in sql
    # Sem alvo: a inferência do índice parcial só seria resolvida em tempo de execução, em todo evento.
    assert "ON CONFLICT (" not in sql
    assert "position($m$20261120_01$m$ IN v_def) > 0" in sql


def test_downgrade_desfaz_a_troca() -> None:
    sql = _sql("downgrade")
    assert "position($m$20261120_01$m$ IN v_def) = 0" in sql
    # Inverte: procura o texto novo e devolve o antigo.
    assert sql.index("$a$") < sql.index("ON CONFLICT DO NOTHING;") < sql.index("$r$")
