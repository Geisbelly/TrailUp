from __future__ import annotations

from pathlib import Path

MIGRACAO = (
    Path(__file__).parents[1]
    / "alembic"
    / "versions"
    / "20260913_15_progresso_perfil_ativo.py"
)


def test_progresso_personalizado_fica_limitado_ao_perfil_ativo() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")

    assert "JOIN conteudo_personalizado cp ON cp.id = pip.personalizacao_id" in source
    assert "cp.brainhex_profile_key = al.perfil_ativo" in source
    assert "lower(coalesce(cp.status, '')) = 'pronto'" in source


def test_trilha_e_classe_recalculam_o_mesmo_livro_caixa() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")

    assert "CREATE OR REPLACE FUNCTION public.trailup_recalcular_topico_aluno" in source
    assert "CREATE OR REPLACE FUNCTION public.trailup_recalcular_classe_aluno" in source
    assert "SELECT aluno_id, topico_id FROM topico_aluno" in source
    assert "SELECT aluno_id, classe_id FROM classe_aluno" in source
