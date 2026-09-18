from pathlib import Path

MIGRACAO = Path(__file__).parents[1] / "alembic" / "versions" / "20260913_14_perfil_publico_por_afinidade.py"


def test_perfil_publico_faz_fallback_para_maior_afinidade() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")
    assert "perfil_escolhido" in source
    assert "ap.afinidade DESC" in source
    assert "COALESCE(NULLIF(btrim(a.perfil_ativo),''),p.nome)" in source


def test_perfil_publico_continua_validando_turma() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")
    assert "auth.uid()" in source
    assert "turma_compartilhada" in source
    assert "SECURITY DEFINER" in source
