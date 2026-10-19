"""Economia completa: configuração, compra, uso, meta e auditoria.

Os testes renderizam o SQL da migration (modo offline), no mesmo estilo do
restante da loja. O que precisa ser verdade está no texto da função: trava,
teto, idempotência e quem pode ler.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]


def _config(output: StringIO | None = None) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = "postgresql://user:password@localhost:5432/trailup"
    return config


def _sql(de: str, ate: str) -> str:
    output = StringIO()
    migrations.command.upgrade(_config(output), f"{de}:{ate}", sql=True)
    return output.getvalue()


def concedido(
    pedido: int,
    minimo: int,
    maximo: int,
    usado_na_atividade: int,
    teto_atividade: int,
    usado_na_turma: int,
    teto_turma: int,
) -> tuple[bool, str | int]:
    """A mesma conta de `loja_usar`: aperta o pedido em [mín, máx] e recusa teto.

    Não corta em silêncio. Se não cabe, o uso inteiro é recusado.
    """
    if minimo > maximo or maximo > teto_atividade or teto_atividade > teto_turma:
        return False, "faixa_invalida"
    valor = min(max(pedido, minimo), maximo)
    if valor <= 0:
        return False, "extensao_desligada"
    if usado_na_atividade + valor > teto_atividade:
        return False, "teto_da_atividade"
    if usado_na_turma + valor > teto_turma:
        return False, "teto_da_turma"
    return True, valor


def test_a_cabeca_nova_continua_a_cadeia() -> None:
    scripts = ScriptDirectory.from_config(_config())
    heads = scripts.get_heads()
    assert heads == ["20261020_03"]
    atual = scripts.get_revision("20261020_03")
    assert atual is not None
    assert atual.down_revision == "20261020_02"
    meio = scripts.get_revision("20261020_02")
    assert meio is not None and meio.down_revision == "20261020_01"
    base = scripts.get_revision("20261020_01")
    assert base is not None and base.down_revision == "20261019_13"


def test_o_professor_deixa_de_escrever_configuracao_direto() -> None:
    sql = _sql("20261019_13", "20261020_01")
    assert "REVOKE INSERT, UPDATE, DELETE ON public.loja_config_classe FROM authenticated" in sql
    assert "REVOKE INSERT, UPDATE, DELETE ON public.eventos_pontuacao_classe FROM authenticated" in sql
    assert "REVOKE INSERT, UPDATE, DELETE ON public.loja_dotacao FROM authenticated" in sql
    assert "CREATE TABLE IF NOT EXISTS public.loja_preco_classe" in sql
    assert "CREATE TABLE IF NOT EXISTS public.economia_meta" in sql
    assert "CREATE TABLE IF NOT EXISTS public.economia_auditoria" in sql
    assert "CREATE TABLE IF NOT EXISTS public.plataforma_dev" in sql
    assert "REVOKE ALL ON public.economia_auditoria FROM PUBLIC, anon, authenticated" in sql
    assert "USING (public.app_e_dev())" in sql
    assert "GRANT SELECT ON public.economia_auditoria TO authenticated" not in sql
    assert "'tempo_extra'" in sql
    assert "prazo_extensao_min_dias <= prazo_extensao_max_dias" in sql


def test_a_compra_trava_estoque_antes_da_carteira_e_nao_deixa_saldo_negativo() -> None:
    sql = _sql("20261020_01", "20261020_02")
    estoque = sql.index("hashtextextended('estoque:'")
    carteira = sql.index("hashtextextended(v_aluno::text, 0)", estoque)
    assert estoque < carteira
    assert "saldo_insuficiente" in sql
    assert "estoque_esgotado" in sql
    assert "limite_de_compras" in sql
    assert "COALESCE(v_preco_turma.preco_base, v_item.preco_base)" in sql
    assert "WHERE aluno_id = v_aluno AND idempotency_key = p_idempotency_key" in sql


def test_o_uso_respeita_minimo_maximo_e_os_dois_tetos() -> None:
    sql = _sql("20261020_01", "20261020_02")
    assert "LEAST(GREATEST(v_pedido, v_min_dias), v_max_dias)" in sql
    assert "teto_da_atividade" in sql
    assert "teto_da_turma" in sql
    assert "extensao_desligada" in sql
    assert "CREATE TABLE IF NOT EXISTS public.atividade_prazo_aluno" in sql
    assert "CREATE TABLE IF NOT EXISTS public.atividade_tempo_aluno" in sql
    assert "UNIQUE (aluno_id, idempotency_key)" in sql
    assert "REVOKE ALL ON public.loja_uso_log FROM anon, authenticated" in sql
    assert "REVOKE ALL ON public.atividade_prazo_aluno FROM anon, authenticated" in sql
    assert "ja_usado" in sql
    assert "preco_pago, 'estorno'" in sql
    assert "'minutos_cortados', GREATEST(v_pedido - v_concedido, 0)" in sql


def test_a_conta_do_prazo_recusa_o_que_nao_cabe() -> None:
    assert concedido(1, 1, 2, 0, 2, 0, 4) == (True, 1)
    assert concedido(1, 2, 3, 0, 4, 0, 4) == (True, 2)
    assert concedido(9, 1, 2, 0, 4, 0, 4) == (True, 2)
    assert concedido(1, 1, 1, 2, 2, 2, 4) == (False, "teto_da_atividade")
    assert concedido(1, 1, 1, 0, 2, 4, 4) == (False, "teto_da_turma")
    assert concedido(1, 0, 0, 0, 2, 0, 4) == (False, "extensao_desligada")
    assert concedido(1, 3, 1, 0, 4, 0, 4) == (False, "faixa_invalida")


def test_meta_e_extrato_e_consistencia_sao_fechados() -> None:
    sql = _sql("20261020_02", "20261020_03")
    assert "ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento'" in sql
    assert "'meta_atingida'" in sql
    assert "starts_with(lower(p_tipo), 'meta_atingida')" in sql
    assert "atividade_conclusao_config" in sql
    assert "moedas_aprovacao" in sql
    assert "CREATE OR REPLACE FUNCTION public.economia_extrato" in sql
    assert "app_alunos_do_professor" in sql
    assert "app_e_dev" in sql
    assert "42501" in sql
    assert "CREATE OR REPLACE FUNCTION public.economia_consistencia" in sql
    assert "GRANT EXECUTE ON FUNCTION public.economia_consistencia() TO authenticated" not in sql
    assert "saldo_negativo" in sql
    assert "compras_sem_debito" in sql
    assert "estornos_sem_credito" in sql
    assert "REVOKE ALL ON FUNCTION public.economia_avaliar_metas_de(uuid, bigint)" in sql
    assert "FROM PUBLIC, anon, authenticated" in sql
    assert "economia_auditar" in sql
    assert "sem_permissao" in sql
    assert "current_setting('trailup.avaliando_meta', true)" in sql


def test_anonimo_nao_le_a_auditoria_e_o_dev_nao_ganha_escrita() -> None:
    sql = _sql("20261019_13", "20261020_03")
    assert "CREATE POLICY economia_auditoria_sel_dev" in sql
    assert "FOR SELECT TO authenticated" in sql
    assert "INSERT INTO public.economia_auditoria" not in sql.split("CREATE OR REPLACE FUNCTION public.economia_auditar")[0]
    assert "GRANT INSERT" not in sql or "GRANT INSERT ON public.economia_auditoria" not in sql


def _sql_down(de: str, ate: str) -> str:
    output = StringIO()
    migrations.command.downgrade(_config(output), f"{de}:{ate}", sql=True)
    return output.getvalue()


def test_o_downgrade_restaura_o_que_as_migrations_substituiram() -> None:
    meio = _sql_down("20261020_02", "20261020_01")
    assert "CREATE OR REPLACE FUNCTION public.loja_comprar" in meio
    assert "CREATE OR REPLACE FUNCTION public.loja_catalogo" in meio
    assert "GRANT EXECUTE ON FUNCTION" in meio and "loja_comprar" in meio
    assert "DROP TABLE" not in meio
    assert "DELETE FROM public.moedas_ledger" not in meio
    assert "DELETE FROM public.loja_compras" not in meio
    ponta = _sql_down("20261020_03", "20261020_02")
    assert "CREATE OR REPLACE FUNCTION public.fn_evento_creditado" in ponta
    assert "starts_with(lower(p_tipo), 'meta_atingida')" not in ponta
    assert "CREATE OR REPLACE FUNCTION public.fn_moedas_do_evento" in ponta
    assert "CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_paga_moeda" in ponta
    assert "CREATE OR REPLACE FUNCTION public.avaliar_entrega" in ponta
    assert "atividade_aprovada" in ponta
    assert "DROP TABLE" not in ponta
    assert "DROP INDEX IF EXISTS public.eventos_aluno_meta_unico" not in ponta
    assert "DELETE FROM public.moedas_ledger" not in ponta
    base = _sql_down("20261020_01", "20261019_13")
    assert "CHECK (efeito IN ('prazo_extra', 'segunda_chance', 'dica', 'troca_formato'))" in base
    assert "'tempo_extra'" in base
    assert "NOT EXISTS" in base and "item_codigo = 'tempo_extra'" in base
    assert "loja_preco_classe" in base
    assert "loja_dotacao" in base
    assert "foreign_key_violation" in base
    assert "DROP TABLE" not in base
    assert "DROP COLUMN" not in base
    assert "DELETE FROM public.loja_preco_classe" not in base
    assert "DELETE FROM public.loja_dotacao" not in base
    assert "DELETE FROM public.loja_compras" not in base
    assert "DELETE FROM public.moedas_ledger" not in base
    assert "DELETE FROM public.eventos_aluno" not in base
