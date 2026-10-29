"""F2 (coletor) — SQL offline da `20261029_07`: o banco fecha a sessão no lote terminal.

O comportamento (fecha nos três motivos terminais, o upsert com `ended_at` nulo não reabre, lote de
outro aluno não fecha, os dois caminhos dão a mesma linha, backfill e I17) é medido contra Postgres de
verdade em `test_e2e_sessao_fecha_pelo_banco.py`. Aqui fica o que a leitura do SQL garante sem banco.
"""

import re
from io import StringIO

from alembic.script import ScriptDirectory

from app.api.v1.telemetria import TERMINAL_FLUSH_REASONS
from app.db import migrations
from tests.test_e2e_guilda_mantem_quem_saiu_da_turma import _modulo
from tests.test_migrations import _offline_alembic_config

TERMINAIS = ("session_end", "app_background", "screen_blur")
LISTA = "('session_end','app_background','screen_blur')"


def _sql_bruto(intervalo: str, *, downgrade: bool = False) -> str:
    output = StringIO()
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(_offline_alembic_config(output), intervalo, sql=True)
    return output.getvalue()


def _upgrade_sql() -> str:
    return _sql_bruto("20261029_06:20261029_07")


def _downgrade_sql() -> str:
    return _sql_bruto("20261029_07:20261029_06", downgrade=True)


def _funcao(sql: str, nome: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}()")
    return sql[inicio : sql.index("$function$;", inicio)]


def test_uma_cabeca_so_e_ela_vem_depois_da_trava_de_eventos() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert scripts.get_heads() == ["20261029_07"]
    assert scripts.get_revision("20261029_07").down_revision == "20261029_06"


def test_sql_offline_nao_tem_porcento() -> None:
    """O Alembic offline dobra `%` e corrompe plpgsql sem dar erro; aqui não há nenhum para dobrar."""
    assert "%" not in _upgrade_sql()
    assert "%" not in _downgrade_sql()


def test_mescla_da_sessao_e_invoker_e_nao_deixa_reabrir() -> None:
    sql = _upgrade_sql()
    corpo = _funcao(sql, "fn_telemetria_sessoes_mescla")

    assert "RETURNS trigger" in corpo
    assert "SECURITY INVOKER" in corpo
    assert "SECURITY DEFINER" not in corpo
    assert "SET search_path = ''" in corpo
    assert "NEW.ended_at := GREATEST(OLD.ended_at, NEW.ended_at)" in corpo
    assert "NEW.started_at := LEAST(OLD.started_at, NEW.started_at)" in corpo
    assert "NEW.topico_inicial_id := COALESCE(OLD.topico_inicial_id, NEW.topico_inicial_id)" in corpo
    assert re.search(
        r"CREATE TRIGGER trg_telemetria_sessoes_mescla\s+BEFORE UPDATE ON public\.telemetria_sessoes\s+"
        r"FOR EACH ROW EXECUTE FUNCTION public\.fn_telemetria_sessoes_mescla\(\)",
        sql,
    )


def test_fechamento_pelo_lote_e_definer_com_search_path_vazio_e_filtra_o_aluno() -> None:
    sql = _upgrade_sql()
    corpo = _funcao(sql, "fn_telemetria_lote_fecha_sessao")

    assert "RETURNS trigger" in corpo
    assert "SECURITY DEFINER" in corpo
    assert "SET search_path = ''" in corpo
    assert f"NEW.flush_reason IN {LISTA}" in corpo
    assert "UPDATE public.telemetria_sessoes" in corpo
    assert "SET ended_at = GREATEST(ended_at, LEAST(NEW.captured_at, now() + interval '5 minutes'))" in corpo
    assert "WHERE id = NEW.sessao_id AND aluno_id = NEW.aluno_id" in corpo
    assert re.search(
        r"CREATE TRIGGER trg_telemetria_lotes_fecha_sessao\s+AFTER INSERT ON public\.telemetria_lotes\s+"
        r"FOR EACH ROW EXECUTE FUNCTION public\.fn_telemetria_lote_fecha_sessao\(\)",
        sql,
    )
    # só uma das duas é DEFINER
    assert sql.count("SECURITY DEFINER") == 1


def test_funcoes_sem_execute_para_cliente() -> None:
    sql = _upgrade_sql()
    for fn in ("fn_telemetria_sessoes_mescla", "fn_telemetria_lote_fecha_sessao"):
        assert f"REVOKE ALL ON FUNCTION public.{fn}() FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT EXECUTE" not in sql


def test_backfill_usa_o_predicado_do_gatilho_e_so_toca_sessao_aberta() -> None:
    sql = _upgrade_sql()
    inicio = sql.index("UPDATE public.telemetria_sessoes s")
    backfill = sql[inicio : sql.index(";", inicio)]

    assert f"l.flush_reason IN {LISTA}" in backfill
    assert "max(l.captured_at)" in backfill
    assert "SET ended_at = LEAST(t.fim, now() + interval '5 minutes')" in backfill
    assert "s.id = t.sessao_id" in backfill
    assert "s.aluno_id = t.aluno_id" in backfill
    assert "s.ended_at IS NULL" in backfill


def test_os_motivos_terminais_sao_os_da_api_e_os_da_i17() -> None:
    """Uma lista só: a da API (`ended_at` no upsert), a do gatilho e a que a I17 confere."""
    m = _modulo("20261029_07_sessao_fecha_pelo_banco.py")
    assert set(m.MOTIVOS_TERMINAIS) == set(TERMINAL_FLUSH_REASONS) == set(TERMINAIS)
    i17 = _modulo("20261029_03_invariantes_das_metricas.py").INVARIANTES["17"]
    assert "IN ('session_end', 'app_background', 'screen_blur')" in i17


def test_downgrade_tira_os_gatilhos_e_as_funcoes_e_nao_desfaz_o_backfill() -> None:
    sql = _downgrade_sql()

    assert "DROP TRIGGER IF EXISTS trg_telemetria_lotes_fecha_sessao ON public.telemetria_lotes" in sql
    assert "DROP TRIGGER IF EXISTS trg_telemetria_sessoes_mescla ON public.telemetria_sessoes" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_telemetria_lote_fecha_sessao()" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_telemetria_sessoes_mescla()" in sql
    assert "UPDATE public.telemetria_sessoes" not in sql
    assert "ended_at = NULL" not in sql
