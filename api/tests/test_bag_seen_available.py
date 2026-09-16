from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "api/alembic/versions/20260913_23_bag_seen_available.py"
OWNERSHIP_MIGRATION = ROOT / "api/alembic/versions/20260913_24_bag_card_ownership.py"


def test_bag_exige_conteudo_ou_topico_ja_visualizado() -> None:
    source = MIGRATION.read_text(encoding="utf-8")

    assert "ultima_visualizacao IS NOT NULL" in source
    assert "public.conteudo_aluno" in source
    assert "public.topico_aluno" in source


def test_bag_limita_material_da_turma_ao_perfil_ativo() -> None:
    source = MIGRATION.read_text(encoding="utf-8")

    assert "p_classe_id IS NOT NULL" in source
    assert "app_classes_do_aluno()" in source
    assert "metadata ->> 'brainhex_profile_key'" in source
    assert "public.alunos" in source


def test_bag_nao_expoe_card_personalizado_de_outro_aluno() -> None:
    source = OWNERSHIP_MIGRATION.read_text(encoding="utf-8")

    assert "cp.aluno_id IS NULL OR cp.aluno_id = auth.uid()" in source
