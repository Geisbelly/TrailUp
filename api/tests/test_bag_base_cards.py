from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "api/alembic/versions/20260913_20_bag_cards_base.py"


def test_bag_lista_cards_do_aluno_e_cards_base_da_turma() -> None:
    source = MIGRATION.read_text(encoding="utf-8")

    assert "cp.aluno_id = auth.uid()" in source
    assert "cp.aluno_id IS NULL" in source
    assert "app_classes_do_aluno()" in source


def test_bag_mantem_o_filtro_de_classe_e_origem() -> None:
    source = MIGRATION.read_text(encoding="utf-8")

    assert "p_classe_id IS NULL OR cp.classe_id = p_classe_id" in source
    assert "p_origem IS NULL OR p_origem = 'plataforma'" in source
