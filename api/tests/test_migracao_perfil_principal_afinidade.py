from __future__ import annotations

from pathlib import Path

MIGRACAO = (
    Path(__file__).parents[1]
    / "alembic"
    / "versions"
    / "20260913_16_perfil_principal_afinidade.py"
)


def test_perfil_publico_escolhe_maior_afinidade_com_desempate_estavel() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")

    assert "ORDER BY ap.afinidade DESC NULLS LAST" in source
    assert "ap.atualizado_em DESC NULLS LAST" in source
    assert "ap.perfil_id ASC" in source


def test_conquistas_usam_o_mesmo_perfil_principal_exibido() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")

    assert "'perfil_ativo', pp.nome" in source
    assert "OR c.perfil_alvo = pp.nome" in source
