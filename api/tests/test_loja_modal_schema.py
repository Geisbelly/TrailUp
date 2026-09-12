from pathlib import Path
import importlib.util


ROOT = Path(__file__).resolve().parents[2]
SQL = ROOT / "docs/mobile/sql/20260912_01_loja_modal_social.sql"
MIGRATION = ROOT / "api/alembic/versions/20260912_01_loja_modal_social.py"


def test_loja_sql_define_catalogo_posse_saldo_e_ledger():
    sql = SQL.read_text(encoding="utf-8")
    for table in ("loja_perfis", "loja_itens", "loja_saldos", "loja_movimentos", "loja_posses"):
        assert f"CREATE TABLE IF NOT EXISTS public.{table}" in sql
    for section in ("informacoes", "itens", "combos", "bonus", "presentes"):
        assert section in sql
    assert "PRIMARY KEY (aluno_id, item_id)" in sql
    assert "UNIQUE (aluno_id, request_id)" in sql


def test_gate_usa_colunas_exatas_da_telemetria():
    sql = SQL.read_text(encoding="utf-8")
    assert "scope = p_gate->>'scope'" in sql
    assert "sum(e.active_sec)" in sql
    assert "captured_at <= now()" in sql
    assert "trailup_loja_catalogo" in sql


def test_compra_e_revalidada_no_banco():
    sql = SQL.read_text(encoding="utf-8")
    assert "trailup_comprar_loja_item" in sql
    assert "FOR UPDATE" in sql
    assert "insufficient_balance" in sql
    assert "gate_not_met" in sql
    assert "GRANT EXECUTE" in sql


def test_alembic_aponta_para_a_migracao_atual():
    spec = importlib.util.spec_from_file_location("store_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.revision == "20260912_01"
    assert module.down_revision == "20260909_05"
