"""`20261102_22`: painel técnico (#21) — só o dono, só agrega, e o que o painel não sabe, diz.

O comportamento (posse, os quatro gatilhos com dado e sem dado, o mesmo SLO da #14, privacidade) foi
exercitado num Postgres real (PGlite) com o esqueleto das tabelas: ver o PR. Aqui fica o que dá para
travar sem banco.
"""

import re
from io import StringIO

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261102_21:20261102_22", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261102_22:20261102_21", sql=True)
    return output.getvalue().replace("%%", "%")


def test_a_arvore_continua_com_uma_cabeca_e_vem_depois_da_20() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261102_22").down_revision == "20261102_21"


def test_a_posse_do_dono_vem_antes_de_qualquer_leitura() -> None:
    sql = _upgrade_sql()
    corpo = sql[sql.index("CREATE OR REPLACE FUNCTION public.painel_tecnico") :]
    assert "IF NOT public.app_e_dono() THEN" in corpo
    portao = corpo.index("IF NOT public.app_e_dono()")
    for primeira_leitura in ("FROM public.app_config", "FROM public.personalizacao_jobs", "FROM public.metricas_invariante_resultado"):
        assert portao < corpo.index(primeira_leitura), primeira_leitura
    assert "SECURITY DEFINER" in corpo and "STABLE" in corpo
    assert "REVOKE ALL ON FUNCTION public.painel_tecnico(integer) FROM PUBLIC, anon" in sql


def test_so_agrega_e_nenhum_dado_de_pessoa_entra_no_resultado() -> None:
    sql = _upgrade_sql()
    corpo = sql[sql.index("CREATE OR REPLACE FUNCTION public.painel_tecnico") :]
    # O corpo da função não projeta nenhuma coluna de pessoa nem o texto do erro de job ou de alvo.
    assert not re.search(r"\b(?:j|t|a|l)\.(?:aluno_id|last_error)\b", corpo)
    assert "'aluno" not in corpo and '"aluno' not in corpo
    # O erro de invariante sai cortado: carrega SQLSTATE, não dado de aluno.
    assert "left(r.erro, 160)" in corpo


def test_usa_o_mesmo_slo_da_14_e_nao_inventa_outro() -> None:
    sql = _upgrade_sql()
    assert "chave = 'personalizacao_kpi_slo'" in sql
    for chave in ("latencia_job_p95_seg", "geracao_p95_seg", "falha_pct_max", "dias_persistencia"):
        assert chave in sql, chave


def test_os_quatro_gatilhos_do_paragrafo_11_existem_e_nenhum_inventa_ok_sem_dado() -> None:
    sql = _upgrade_sql()
    for gatilho in ("fila_persistente", "divergencia_progresso", "custo_por_artefato", "latencia_slo"):
        assert f"'id', '{gatilho}'" in sql, gatilho
    # Cada um tem o ramo "sem_dado": ausência de medida nunca vira "ok".
    assert sql.count("'estado', 'sem_dado'") >= 4
    assert "slo_violado" in sql


def test_o_custo_se_declara_proxy_porque_o_banco_nao_grava_tokens() -> None:
    sql = _upgrade_sql()
    assert "proxy" in sql
    assert "GREATEST(t.attempts, t.processing_runs)" in sql  # o mesmo critério da #14


def test_o_downgrade_so_remove_a_funcao() -> None:
    sql = _downgrade_sql()
    assert "DROP FUNCTION IF EXISTS public.painel_tecnico(integer)" in sql
