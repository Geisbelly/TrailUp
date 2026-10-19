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
    # O que importa aqui e' head UNICA e a cadeia de economia intacta -- nao que ela seja a
    # ponta. Fixar `heads == ["20261020_06"]` quebrava para quem encadeasse depois, e foi o
    # que aconteceu quando `20261021_01` (fase 1 dos modos) entrou em cima.
    assert len(heads) == 1, f"a cadeia tem de ter head unica: {heads}"
    na_cadeia = {r.revision for r in scripts.iterate_revisions(heads[0], "base")}
    assert "20261020_06" in na_cadeia, "a cadeia de economia saiu do caminho da head"
    quantidade = scripts.get_revision("20261020_06")
    assert quantidade is not None and quantidade.down_revision == "20261020_05"
    aprovacao = scripts.get_revision("20261020_05")
    assert aprovacao is not None and aprovacao.down_revision == "20261020_04"
    correcao = scripts.get_revision("20261020_04")
    assert correcao is not None and correcao.down_revision == "20261020_03"
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


def test_correcoes_do_ponta_a_ponta() -> None:
    """20261020_04: o que o e2e contra banco real achou (ver test_e2e_economia_banco)."""
    sql = _sql("20261020_03", "20261020_04")
    # prazo comprado entra no prazo que o atraso julga
    assert "CREATE OR REPLACE FUNCTION public.fn_prazo_efetivo" in sql
    assert "LEFT JOIN public.atividade_prazo_aluno p" in sql
    # meta de nota mínima só com a nota do professor (evento creditado)
    assert "e.tipo = 'nota_professor'" in sql
    assert "aa.pontuacao_obtida" not in sql
    # ganho exige matrícula na turma que paga
    assert sql.count("FROM public.classe_aluno ca") >= 3
    # excluir a turma não trava no log de uso nem na dica
    assert sql.count("REFERENCES public.loja_compras(id) ON DELETE CASCADE") == 2


def test_downgrade_das_correcoes_volta_ao_estado_anterior() -> None:
    sql = _sql_down("20261020_04", "20261020_03")
    assert "SELECT a.data_entrega" in sql and "atividade_prazo_aluno p" not in sql
    assert "aa.pontuacao_obtida" in sql  # volta o METAS de 20261020_03
    assert "ON DELETE CASCADE" not in sql
    assert "DELETE FROM" not in sql and "DROP TABLE" not in sql


def test_conclusao_so_paga_com_aprovacao_do_professor() -> None:
    """20261020_05: concluir é autodeclarado; a moeda sai em avaliar_entrega."""
    sql = _sql("20261020_04", "20261020_05")
    # concluir sozinho não paga mais
    assert "DROP TRIGGER IF EXISTS trg_atividade_aluno_moedas_conclusao" in sql
    assert "CREATE TRIGGER trg_atividade_aluno_moedas_conclusao" not in sql
    assert "IF NEW.tipo <> 'atividade_concluida' THEN" in sql
    # aprovação vira registro do professor, que o cliente só lê
    assert "CREATE TABLE IF NOT EXISTS public.atividade_aprovacao" in sql
    assert "ALTER TABLE public.atividade_aprovacao ENABLE ROW LEVEL SECURITY" in sql
    assert "REVOKE ALL ON public.atividade_aprovacao FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT SELECT ON public.atividade_aprovacao TO authenticated" in sql
    assert "GRANT INSERT" not in sql and "GRANT UPDATE" not in sql
    assert "CREATE POLICY atividade_aprovacao_sel" in sql
    # avaliar_entrega paga a conclusão uma vez, só se aprovou e com matrícula
    avaliar = sql.split("CREATE OR REPLACE FUNCTION public.avaliar_entrega")[1].split("$function$;")[0]
    assert "v_aprovada := p_nota >= v_max * 0.6" in avaliar
    assert "'atividade_conclusao_config'" in avaliar
    assert "l.evento_tipo = 'atividade_concluida'" in avaliar  # quem já recebeu não recebe de novo
    assert "FROM public.classe_aluno ca" in avaliar
    assert avaliar.index("INSERT INTO public.atividade_aprovacao") < avaliar.index("INSERT INTO public.eventos_aluno")
    # metas: só aprovada conta; nota mínima é a última nota do professor; trava solta
    metas = sql.split("CREATE OR REPLACE FUNCTION public.economia_avaliar_metas_de")[1].split("$fn$;")[0]
    assert "FROM public.atividade_aprovacao ap" in metas and "ap.aprovada" in metas
    assert "a.status" not in metas and "aa.status" not in metas
    assert "set_config('trailup.avaliando_meta', '0', true)" in metas
    assert "FROM public.classe_aluno ca" in metas


def test_downgrade_da_aprovacao_preserva_os_dados() -> None:
    sql = _sql_down("20261020_05", "20261020_04")
    assert "CREATE TRIGGER trg_atividade_aluno_moedas_conclusao" in sql
    assert "CREATE OR REPLACE FUNCTION public.avaliar_entrega" in sql
    assert "CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_paga_moeda" in sql
    assert "CREATE OR REPLACE FUNCTION public.economia_avaliar_metas_de" in sql
    assert "e.tipo = 'nota_professor'" in sql  # volta o METAS de 20261020_04
    assert "DROP TABLE" not in sql and "DELETE FROM" not in sql and "TRUNCATE" not in sql


def test_varias_unidades_e_limite_de_uso_por_situacao() -> None:
    """20261020_06: comprar várias do mesmo item e limitar o uso por situação."""
    sql = _sql("20261020_05", "20261020_06")
    comprar = sql.split("CREATE FUNCTION public.loja_comprar(")[1].split("$fn$;")[0]
    # quantidade, tudo ou nada, uma linha por unidade, lote idempotente
    assert "p_quantidade      integer DEFAULT 1" in comprar
    assert "quantidade_invalida" in comprar
    assert "lote_chave = p_idempotency_key" in comprar
    assert "FOR i IN 1..p_quantidade LOOP" in comprar
    assert comprar.index("saldo_insuficiente") < comprar.index("INSERT INTO public.loja_compras")
    assert "v_compradas + v_qtd_paga > v_preco_turma.uso_max_por_aluno" in comprar
    assert "COALESCE(v_vendidas, 0) + v_qtd_paga > v_preco_turma.estoque" in comprar
    assert "COALESCE(v_preco_turma.preco_fator, v_item.preco_fator, 1)" in comprar
    catalogo = sql.split("CREATE FUNCTION public.loja_catalogo(")[1].split("$fn$;")[0]
    assert "WHERE p_classe_id IN (SELECT public.app_minhas_classes())" in catalogo  # só a própria turma
    assert comprar.index("pg_advisory_xact_lock(\n    hashtextextended('estoque:'") < comprar.index(
        "pg_advisory_xact_lock(hashtextextended(v_aluno::text, 0))"
    )
    # uso: FIFO, limite por situação com o motivo, e o log com a situação
    item = sql.split("CREATE OR REPLACE FUNCTION public.loja_usar_item(")[1].split("$fn$;")[0]
    assert "ORDER BY criado_em, id" in item and "sem_unidade" in item
    for motivo in ("limite_por_questao", "limite_por_atividade", "limite_por_topico",
                   "limite_por_dia", "limite_por_semana", "limite_por_turma"):
        assert f"'{motivo}'" in sql
    usar = sql.split("CREATE OR REPLACE FUNCTION public.loja_usar(")[1].split("$fn$;")[0]
    assert "limite_de_uso" not in usar and "teto_do_topico" not in usar
    assert usar.count("public.fn_loja_checa_limite(") == 3  # atividade, dica, troca de formato
    assert "v_atividade, v_topico, v_questao);" in usar
    assert "America/Sao_Paulo" in sql
    # tabela nova só se lê; quem escreve é a RPC auditada
    assert "CREATE TABLE IF NOT EXISTS public.loja_limite_uso" in sql
    assert "ALTER TABLE public.loja_limite_uso ENABLE ROW LEVEL SECURITY" in sql
    assert "REVOKE ALL ON public.loja_limite_uso FROM PUBLIC, anon, authenticated" in sql
    assert "'config_limite_uso'" in sql
    for fn in ("fn_loja_limites", "fn_loja_checa_limite"):
        assert f"REVOKE ALL ON FUNCTION public.{fn}(" in sql
    for fn in ("loja_usar_item", "loja_usos_permitidos", "loja_inventario", "loja_comprar"):
        assert f"GRANT EXECUTE ON FUNCTION public.{fn}(" in sql


def test_downgrade_da_quantidade_preserva_dados() -> None:
    sql = _sql_down("20261020_06", "20261020_05")
    assert "DROP FUNCTION IF EXISTS public.loja_usar_item" in sql
    assert "CREATE OR REPLACE FUNCTION public.loja_comprar(" in sql
    assert "GRANT EXECUTE ON FUNCTION public.loja_comprar(text, bigint, text, text, bigint, text) TO authenticated" in sql
    assert "CREATE OR REPLACE FUNCTION public.economia_salvar_preco_classe(" in sql
    assert "limite_de_uso" in sql  # volta o loja_usar de 20261020_02
    assert "DROP TABLE" not in sql and "DROP COLUMN" not in sql and "DELETE FROM public.loja_limite_uso" not in sql
    assert "DELETE FROM public.loja_compras" not in sql and "DELETE FROM public.loja_uso_log" not in sql
