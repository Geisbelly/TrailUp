from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "api/alembic/versions/20260913_19_social_perfil_ativo_ranking.py"


def test_ranking_social_prioriza_perfil_ativo_do_aluno() -> None:
    source = MIGRATION.read_text(encoding="utf-8")

    active_profile = "NULLIF(btrim(a.perfil_ativo), '')"
    affinity_profile = "SELECT p.nome"

    assert active_profile in source
    assert affinity_profile in source
    assert source.index(active_profile) < source.index(affinity_profile)


def test_ranking_social_preserva_fallback_para_aluno_sem_perfil_ativo() -> None:
    source = MIGRATION.read_text(encoding="utf-8")

    assert "COALESCE(" in source
    assert "ORDER BY ap.afinidade DESC NULLS LAST" in source
