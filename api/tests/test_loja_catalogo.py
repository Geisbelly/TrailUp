"""O catalogo e global; o professor liga e desliga, nao inventa item.

Preco unico para todo o sistema foi decisao explicita: simples de explicar a 20
adultos. O que o professor controla e' o teto e quais itens ficam ligados na
turma dele.
"""

from __future__ import annotations

import importlib.util
from io import StringIO
from pathlib import Path
from types import ModuleType

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = API_ROOT / "alembic" / "versions" / "20260912_03_loja_catalogo.py"


def _offline_alembic_config(output_buffer: StringIO | None = None) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output_buffer)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    return config


def _sql() -> str:
    output = StringIO()
    migrations.command.upgrade(
        _offline_alembic_config(output), "20260912_02:20260912_03", sql=True
    )
    return output.getvalue()


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_catalogo", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_o_catalogo_existe_e_e_global() -> None:
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.loja_itens" in sql
    assert "codigo       text PRIMARY KEY" in sql
    assert "CHECK (preco_base > 0)" in sql


def test_o_preco_cresce_a_cada_unidade() -> None:
    """Estoque finito, preco crescente e teto duro sao os tres parametros para
    que a folga tenha custo -- e' o custo que produz persistencia, nao a folga."""
    sql = _sql()

    assert "preco_fator  numeric NOT NULL DEFAULT 1" in sql
    assert "CHECK (preco_fator >= 1)" in sql


def test_nenhum_item_da_vantagem_de_um_aluno_sobre_outro() -> None:
    """Nada de roubar ponto, pular a vez ou subir no rank. O custo de evitar e'
    zero e o de errar, num grupo de 20 adultos que se conhecem, e' alto."""
    modulo = _modulo()

    efeitos = {item["efeito"] for item in modulo.ITENS.values()}
    assert efeitos <= {"prazo_extra", "segunda_chance", "dica", "troca_formato"}


def test_o_item_de_autonomia_e_o_mais_barato() -> None:
    """troca_formato nao tem consequencia avaliativa: existe para o aluno ter o
    que comprar sem apostar nada."""
    modulo = _modulo()

    troca = modulo.ITENS["troca_formato"]["preco_base"]
    assert troca < modulo.ITENS["segunda_chance"]["preco_base"]
    assert troca < modulo.ITENS["prazo_extra"]["preco_base"]


def test_o_aluno_ve_o_catalogo_e_nao_escreve_nele() -> None:
    sql = _sql()

    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "CREATE POLICY loja_itens_sel" in sql
    assert "REVOKE INSERT, UPDATE, DELETE ON public.loja_itens" in sql
    assert "FROM anon, authenticated" in sql
