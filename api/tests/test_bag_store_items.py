from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "api/alembic/versions/20260913_21_bag_itens_loja.py"


def test_bag_projeta_compras_ativas_com_o_catalogo_da_loja() -> None:
    source = MIGRATION.read_text(encoding="utf-8")

    assert "loja_compras" in source
    assert "loja_itens" in source
    assert "lc.aluno_id = auth.uid()" in source
    assert "lc.status <> 'estornada'" in source
    assert "'origem', 'loja'" in source


def test_bag_marca_item_comprado_como_somente_leitura() -> None:
    source = MIGRATION.read_text(encoding="utf-8")

    assert "'editavel', false" in source
    assert "'tipo', 'loja'" in source
    assert "GRANT EXECUTE ON FUNCTION public.bag_listar" in source
