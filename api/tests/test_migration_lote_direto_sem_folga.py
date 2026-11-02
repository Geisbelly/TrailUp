"""#96 — SQL offline da `20261102_09`: o lote gravado direto pelo app entra na fila sem folga.

O comportamento (direto vence na hora, API mantém 5 min, downgrade) é medido contra Postgres de verdade
em `test_e2e_lote_direto_sem_folga.py`. Aqui fica o que a leitura do SQL garante sem banco.
"""

import re
from io import StringIO
from pathlib import Path

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

FUNCAO = "fn_telemetria_lote_enfileira_analise"


def _sql_bruto(intervalo: str, *, downgrade: bool = False) -> str:
    output = StringIO()
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(_offline_alembic_config(output), intervalo, sql=True)
    return output.getvalue()


def _upgrade_sql() -> str:
    return _sql_bruto("20261102_08:20261102_09")


def _downgrade_sql() -> str:
    return _sql_bruto("20261102_09:20261102_08", downgrade=True)


def _funcao(sql: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{FUNCAO}()")
    return sql[inicio : sql.index("$function$;", inicio)]


def _versao(arquivo: str) -> str:
    return (Path(__file__).resolve().parents[1] / "alembic" / "versions" / arquivo).read_text(encoding="utf-8")


def test_uma_cabeca_so_e_ela_vem_depois_das_tentativas() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    heads = scripts.get_heads()
    assert len(heads) == 1, f"a árvore bifurcou: {sorted(heads)}"
    assert "20261102_09" in {r.revision for r in scripts.walk_revisions("base", heads[0])}
    assert scripts.get_revision("20261102_09").down_revision == "20261102_08"


def test_sql_offline_nao_tem_porcento() -> None:
    """O Alembic offline dobra `%` e corrompe plpgsql sem dar erro; aqui não há nenhum para dobrar."""
    assert "%" not in _upgrade_sql()
    assert "%" not in _downgrade_sql()


def test_direta_vence_na_hora_e_o_resto_mantem_a_folga() -> None:
    corpo = re.sub(r"\s+", " ", _funcao(_upgrade_sql()))
    assert "VALUES (NEW.id, CASE WHEN NEW.via = 'direta' THEN now() ELSE now() + interval '5 minutes' END)" in corpo
    assert "NEW.analysis_ciclo_id IS NULL AND NEW.analysis_error IS NULL" in corpo
    assert "ON CONFLICT (lote_id) DO NOTHING" in corpo


def test_so_troca_o_corpo_da_funcao() -> None:
    """Gatilho, tabela e funções do worker são da `20261029_09` e não mudam aqui."""
    sql = _upgrade_sql()
    assert sql.count("CREATE OR REPLACE FUNCTION") == 1
    for proibido in ("CREATE TRIGGER", "DROP TRIGGER", "CREATE TABLE", "ALTER TABLE", "GRANT ", "UPDATE public."):
        assert proibido not in sql, proibido


def test_mantem_definer_search_path_e_sem_execute_para_cliente() -> None:
    sql = _upgrade_sql()
    corpo = _funcao(sql)
    assert "RETURNS trigger" in corpo
    assert "SECURITY DEFINER" in corpo
    assert "SET search_path = ''" in corpo
    assert f"REVOKE ALL ON FUNCTION public.{FUNCAO}() FROM PUBLIC, anon, authenticated" in sql


def test_via_e_decidida_por_gatilho_before_e_a_fila_e_after() -> None:
    """`NEW.via` só vale aqui porque a via é gravada por um BEFORE INSERT e a fila é AFTER INSERT."""
    via = _versao("20261029_01_lote_diz_por_onde_chegou.py")
    fila = _versao("20261029_09_analise_de_lote_pela_fila.py")
    assert re.search(r"CREATE TRIGGER trg_telemetria_lote_via\s+BEFORE INSERT ON public\.telemetria_lotes", via)
    assert re.search(
        r"CREATE TRIGGER trg_telemetria_lotes_enfileira_analise\s+AFTER INSERT ON public\.telemetria_lotes", fila
    )


def test_downgrade_volta_a_folga_para_todos() -> None:
    sql = _downgrade_sql()
    corpo = re.sub(r"\s+", " ", _funcao(sql))
    assert "VALUES (NEW.id, now() + interval '5 minutes')" in corpo
    assert "NEW.via" not in corpo
    assert "SECURITY DEFINER" in corpo
    assert f"REVOKE ALL ON FUNCTION public.{FUNCAO}() FROM PUBLIC, anon, authenticated" in sql
