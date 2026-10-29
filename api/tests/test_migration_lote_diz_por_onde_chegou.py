"""F0 (medir antes de mexer) — SQL offline da `20261029_01`: o lote diz por onde chegou.

O comportamento (o gatilho preenche `via` pelo papel de quem escreve, build antigo não perde lote,
motivo fora da lista é recusado) é medido contra Postgres de verdade em
`test_e2e_lote_diz_por_onde_chegou.py`. Aqui fica o que a leitura do SQL garante sem banco.
"""

from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

MOTIVOS = ("sem_url", "rede", "timeout", "http_4xx", "http_5xx", "sem_sessao", "desconhecido")


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261027_01:20261029_01", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261029_01:20261027_01", sql=True)
    return output.getvalue().replace("%%", "%")


def test_colunas_e_checks() -> None:
    sql = _upgrade_sql()

    assert "ADD COLUMN IF NOT EXISTS via text" in sql
    assert "ADD COLUMN IF NOT EXISTS fallback_motivo text" in sql
    assert "telemetria_lotes_via_valida" in sql
    assert "via IN ('api','direta')" in sql
    assert "telemetria_lotes_fallback_motivo_valido" in sql
    for motivo in MOTIVOS:
        assert f"'{motivo}'" in sql
    # Build antigo do app não manda o motivo, e recusar o lote perderia telemetria: nada de NOT NULL.
    assert "NOT NULL" not in sql


def test_checks_aceitam_nulo() -> None:
    """Linha antiga e build antigo têm as duas colunas nulas; CHECK com NULL passa em SQL."""
    sql = _upgrade_sql()
    assert "NOT VALID" not in sql  # sem backfill a validar: a tabela já existe e as colunas nascem nulas


def test_gatilho_decide_a_via_pelo_papel_e_nao_toca_no_motivo() -> None:
    sql = _upgrade_sql()

    assert "CREATE OR REPLACE FUNCTION public.fn_telemetria_lote_via()" in sql
    assert "BEFORE INSERT ON public.telemetria_lotes" in sql
    assert "trg_telemetria_lote_via" in sql
    # R9: aluno nunca escolhe a via; os demais podem declará-la (COALESCE)
    assert "NEW.via := 'direta'" in sql
    assert "NEW.via := COALESCE(NEW.via, 'api')" in sql
    assert "NEW.via IS NULL" not in sql
    assert "request.jwt.claims" in sql
    assert "'authenticated'" in sql
    assert "NEW.fallback_motivo" not in sql
    assert "SET search_path = ''" in sql


def test_funcao_do_gatilho_sem_execute_para_cliente() -> None:
    sql = _upgrade_sql()

    assert "REVOKE ALL ON FUNCTION public.fn_telemetria_lote_via() FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT EXECUTE" not in sql


def test_downgrade_remove_tudo() -> None:
    sql = _downgrade_sql()

    assert "DROP TRIGGER IF EXISTS trg_telemetria_lote_via" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_telemetria_lote_via()" in sql
    assert "DROP CONSTRAINT IF EXISTS telemetria_lotes_via_valida" in sql
    assert "DROP CONSTRAINT IF EXISTS telemetria_lotes_fallback_motivo_valido" in sql
    assert "DROP COLUMN IF EXISTS via" in sql
    assert "DROP COLUMN IF EXISTS fallback_motivo" in sql
