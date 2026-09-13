"""O saldo de moedas sai de um razao append-only, nao de uma coluna mutavel.

Coluna de saldo perde o historico: sem ele nao ha como auditar de onde veio a
moeda nem provar que ninguem a fabricou. E' o aceite do #142.
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
        _offline_alembic_config(output), "20260909_05:20260912_01", sql=True
    )
    return output.getvalue()


def test_o_razao_e_append_only_e_guarda_a_origem() -> None:
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.moedas_ledger" in sql
    # `delta <> 0`: linha de valor zero e' ruido que nao muda saldo nenhum.
    assert "CHECK (delta <> 0)" in sql
    # A origem precisa sobreviver: sem motivo nao da' para auditar.
    assert "motivo" in sql
    assert "'evento','dotacao','compra','estorno','concessao'" in sql


def test_o_mesmo_ganho_nao_paga_duas_vezes() -> None:
    """Sem isto, reabrir a mesma atividade e' a forma mais barata de enriquecer:
    sao 86 eventos de revisao num unico aluno de demonstracao."""
    sql = _sql()

    assert "CREATE UNIQUE INDEX" in sql
    assert "moedas_ledger_ganho_unico" in sql
    assert "(aluno_id, evento_tipo, referencia)" in sql
    # Parcial: so' o ganho e' idempotente. Duas compras iguais sao legitimas.
    assert "WHERE motivo = 'evento'" in sql


def test_o_cliente_nao_escreve_no_razao() -> None:
    """RLS e' a unica barreira, e moeda digitavel pelo cliente e' o mesmo
    defeito que o #164 corrigiu no rank."""
    sql = _sql()

    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "REVOKE INSERT, UPDATE, DELETE ON public.moedas_ledger" in sql
    assert "FROM anon, authenticated" in sql


def test_o_aluno_le_so_o_proprio_extrato() -> None:
    sql = _sql()

    assert "CREATE POLICY moedas_ledger_sel_proprio" in sql
    assert "aluno_id = auth.uid()" in sql
    # Anonimo nao le nada.
    assert "TO authenticated" in sql


def test_o_professor_le_o_razao_dos_alunos_dele() -> None:
    """Via helper SECURITY DEFINER: policy que consulta a propria tabela
    entraria em recursao de RLS."""
    sql = _sql()

    assert "CREATE POLICY moedas_ledger_sel_professor" in sql
    assert "aluno_id IN (SELECT public.app_alunos_do_professor())" in sql


def test_o_saldo_e_somado_no_banco_nunca_no_cliente() -> None:
    """Percentual do topico, tempo de estudo e ranking ja foram calculados no
    app, e nas tres vezes o numero do cliente passou por cima do certo."""
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION public.loja_saldo()" in sql
    # Sem linha nenhuma o saldo e' zero, nao NULL: NULL vira "—" na tela.
    assert "COALESCE(SUM(delta), 0)" in sql


def test_o_saldo_e_do_chamador_e_de_mais_ninguem() -> None:
    sql = _sql()

    assert "WHERE aluno_id = auth.uid()" in sql


def test_o_extrato_diz_de_onde_veio_cada_moeda() -> None:
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION public.loja_extrato" in sql
    assert "p_limite integer DEFAULT 50" in sql
