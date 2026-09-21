from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "api/alembic/versions/20260913_25_progresso_tempo_e_detalhado.py"


def test_detalhado_expoe_tempo_do_topico() -> None:
    source = MIGRATION.read_text(encoding="utf-8")

    assert "ta.tempo_gasto_min AS topico_tempo_gasto_min" in source


def test_migration_expoe_rpc_de_fallback_atomico_de_tempo() -> None:
    source = MIGRATION.read_text(encoding="utf-8")

    assert "trailup_registrar_tempo_estudo" in source
    assert "tempo_gasto_min = COALESCE" in source
    assert "auth.uid()" in source
