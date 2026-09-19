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


def _corpo_comprar(sql: str) -> str:
    inicio = sql.find("FUNCTION public.loja_comprar")
    # Sem esta guarda o teste passa por vacuo: find devolve -1, o corpo sai
    # vazio, e "x not in ''" e sempre verdadeiro.
    assert inicio > 0, "a RPC nem foi criada"
    fim = sql.find("$fn$;", inicio)
    assert fim > inicio
    return sql[inicio:fim]


def test_a_compra_e_uma_transacao_so() -> None:
    """Debita e concede, ou nao faz nada -- aceite do #144."""
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION public.loja_comprar" in sql
    assert "RETURNS jsonb" in sql
    assert "SECURITY DEFINER" in sql


def test_repetir_o_pedido_devolve_a_mesma_compra() -> None:
    """O pedido pode ter chegado e a resposta ter se perdido. Repetir nao pode
    cobrar de novo."""
    corpo = _corpo_comprar(_sql())

    assert "idempotency_key = p_idempotency_key" in corpo


def test_quem_nao_esta_na_turma_nao_compra() -> None:
    sql = _sql()

    assert "public.app_classes_do_aluno()" in sql


def test_saldo_negativo_e_impossivel_por_construcao() -> None:
    """O lock trava a carteira antes de conferir: sem ele, duas compras
    simultaneas leem o mesmo saldo e as duas passam."""
    corpo = _corpo_comprar(_sql())

    # Advisory lock, nao FOR UPDATE: o Postgres recusa FOR UPDATE com agregacao,
    # e o que precisa ser barrado e a linha que ainda nao existe.
    assert "pg_advisory_xact_lock" in corpo
    assert "saldo_insuficiente" in corpo


def test_unidade_gratuita_nao_consulta_preco_nem_saldo() -> None:
    """Ela e' de graca: consultar saldo para dar algo gratis seria negar o item
    a quem esta sem moeda -- exatamente quem a dotacao existe para proteger."""
    corpo = _corpo_comprar(_sql())

    assert "'dotacao'" in corpo


def test_o_debito_aponta_para_a_compra() -> None:
    """Sem compra_id no razao, o extrato diz que saiu moeda mas nao diz por que."""
    sql = _sql()

    assert "compra_id" in sql


def test_a_compra_nao_toca_no_xp() -> None:
    corpo = _corpo_comprar(_sql())

    assert "eventos_aluno" not in corpo


def test_troca_formato_nao_escreve_na_tabela_do_pipeline() -> None:
    """`conteudo_personalizado.formato_prioritario` e' reescrito por
    source_hash: uma regeracao apagaria o que o aluno comprou."""
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.loja_formato_escolhido" in sql
    assert "conteudo_personalizado" not in _corpo_comprar(sql)
