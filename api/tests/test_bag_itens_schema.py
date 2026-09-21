from __future__ import annotations

from pathlib import Path


MIGRACAO = (
    Path(__file__).parents[1]
    / "alembic"
    / "versions"
    / "20260913_12_bag_itens_pessoais.py"
)


def test_migrationa_cria_tabela_autoral_com_tipos_e_soft_delete() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS public.bag_itens" in source
    assert "resumo" in source and "anotacao" in source and "card" in source
    assert "excluido_em" in source


def test_migrationa_expoe_cards_existentes_e_itens_autorais() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")
    assert "cards_personalizados" in source
    assert "bag_itens" in source
    assert "origem" in source
    assert "editavel" in source


def test_migrationa_protege_posse_e_vinculo_com_a_turma() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")
    assert "auth.uid()" in source
    assert "social_chat" not in source
    assert "classe_aluno" in source
