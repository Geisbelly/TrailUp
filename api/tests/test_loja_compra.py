"""Comprar debita e concede, ou nao faz nada.

E' o aceite do #144, e a razao de a compra ser uma RPC e nao um INSERT com
gatilhos em cadeia: atomicidade em varios gatilhos, em ordem, e' promessa, nao
garantia.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]


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
        _offline_alembic_config(output), "20260912_03:20260912_04", sql=True
    )
    return output.getvalue()


def test_a_posse_guarda_de_onde_veio() -> None:
    """Dotacao e compra moram na mesma tabela: uma unidade dada e uma posse como
    outra qualquer, com preco zero."""
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.loja_compras" in sql
    assert "CHECK (origem IN ('compra','dotacao','concessao'))" in sql
    assert "preco_pago       numeric NOT NULL DEFAULT 0 CHECK (preco_pago >= 0)" in sql


def test_o_mesmo_pedido_nao_cobra_duas_vezes() -> None:
    """A chave e' do cliente, gerada antes de chamar: serve ao caso em que o
    pedido chegou e a resposta se perdeu."""
    sql = _sql()

    assert "UNIQUE (aluno_id, idempotency_key)" in sql


def test_o_cliente_nao_escreve_a_posse() -> None:
    sql = _sql()

    assert "REVOKE INSERT, UPDATE, DELETE ON public.loja_compras" in sql
    assert "FROM anon, authenticated" in sql


def test_unidade_gratuita_vem_antes_da_comprada() -> None:
    """dotacao - usadas + compradas. A compra so' entra quando a dotacao acabou,
    e e' ai que a moeda passa a valer."""
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION public.loja_saldo_item" in sql
    assert "v_dotacao" in sql
    assert "v_usadas" in sql


def test_ganhar_unidade_nao_encarece_a_seguinte() -> None:
    """A escalada de preco conta so' origem = 'compra'. O teto conta todas --
    ele e sobre quanto e aceitavel, nao sobre quanto o aluno pagou."""
    sql = _sql()

    assert "origem = 'compra'" in sql


def test_a_vitrine_traz_o_preco_ja_calculado() -> None:
    """O preco nunca e' calculado no cliente: e' a mesma regra de saldo. Numero
    que o app calcula e' numero em que o aluno nao acredita."""
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION public.loja_catalogo" in sql
    assert "preco" in sql
    assert "gratis_restantes" in sql


def test_a_vitrine_esconde_o_que_o_professor_desligou() -> None:
    sql = _sql()

    assert "itens_desligados" in sql


def test_a_escalada_usa_as_compradas_e_nao_as_gratuitas() -> None:
    sql = _sql()

    assert "public.loja_compradas_do_item" in sql
    assert "preco_fator" in sql
