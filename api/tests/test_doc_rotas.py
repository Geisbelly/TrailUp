"""`docs/rotas.md` é gerado do código, mas só fica certo se alguém rodar o gerador."""

from pathlib import Path

from app.main import create_app


def test_toda_rota_publica_da_api_esta_no_documento() -> None:
    documento = (Path(__file__).resolve().parents[2] / "docs" / "rotas.md").read_text(encoding="utf-8")
    faltam = [
        f"{metodo.upper()} {caminho}"
        for caminho, operacoes in create_app().openapi()["paths"].items()
        for metodo in operacoes
        if f"`{metodo.upper()} {caminho}`" not in documento
    ]
    assert not faltam, f"Rode scripts/site_docs/rotas.py: {faltam}"
