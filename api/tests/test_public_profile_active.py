from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "api/alembic/versions/20260913_22_social_perfil_publico_ativo.py"


def test_public_profile_migration_prioritizes_active_profile():
    sql = MIGRATION.read_text(encoding="utf-8")

    assert 'revision = "20260913_22"' in sql
    assert "social_perfil_publico" in sql
    assert "a.perfil_ativo" in sql
    assert "CASE WHEN lower(btrim(p.nome)) = lower(btrim((" in sql
    assert "SELECT a.perfil_ativo" in sql
    assert "ap.afinidade DESC NULLS LAST" in sql
    assert "GRANT EXECUTE ON FUNCTION public.social_perfil_publico" in sql
