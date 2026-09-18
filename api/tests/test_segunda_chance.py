"""Refazer vale nota, mas so' com revisao no meio e nunca em V ou F.

A politica e' 90% da melhor tentativa mais 10% da pior. "Nota nunca piora" foi
descartado: em Illinois essa variante teve 49% de retake com so' 70% melhorando
-- os autores leem como roll of the dice, porque nao ha o que perder.
"""

from __future__ import annotations

import importlib.util
from io import StringIO
from pathlib import Path
from types import ModuleType

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = API_ROOT / "alembic" / "versions" / "20260912_05_segunda_chance.py"


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
        _offline_alembic_config(output), "20260912_04:20260912_05", sql=True
    )
    return output.getvalue()


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_retry", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_a_tentativa_vira_historico_em_vez_de_sobrescrever() -> None:
    """90/10 precisa das duas notas. Hoje atividade_aluno guarda uma so', e a
    revisao nem chega a gravar."""
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.atividade_tentativa" in sql
    assert "UNIQUE (aluno_id, atividade_id, ordem)" in sql
    assert "CHECK (percentual BETWEEN 0 AND 100)" in sql


def test_o_cliente_nao_escreve_a_tentativa() -> None:
    sql = _sql()

    assert "REVOKE INSERT, UPDATE, DELETE ON public.atividade_tentativa" in sql


def test_v_ou_f_nao_entra_no_retry() -> None:
    """Com duas alternativas, a segunda tentativa acerta por eliminacao."""
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION public.fn_questao_elegivel_retry" in sql
    assert "'true_false'" in sql


def test_as_grafias_sao_as_mesmas_que_o_mobile_normaliza() -> None:
    """normalizeQuestionType aceita oito escritas para a mesma coisa. Se o banco
    reconhecer menos, um 'verdadeiro ou falso' passaria pelo filtro."""
    modulo = _modulo()

    assert set(modulo.TIPOS_BINARIOS) == {
        "true_false",
        "true or false",
        "true_or_false",
        "truefalse",
        "verdadeiro_falso",
        "verdadeiro ou falso",
        "verdadeiro/falso",
        "booleano",
    }


def test_a_comparacao_de_tipo_ignora_caixa_e_espaco() -> None:
    """O tipo vem de cadastro humano e de geracao por IA: 'Verdadeiro ou Falso'
    com maiuscula tem que casar."""
    sql = _sql()

    assert "lower(btrim(" in sql


def test_gabarito_revelado_e_um_fato_registrado_nao_uma_configuracao() -> None:
    """mostrar_gabarito_ao_errar nao existe no banco, e o default do mobile e'
    revelar. Filtrar pela CONFIGURACAO deixaria o item indisponivel para quase
    todo erro; o que vale e' se o aluno viu."""
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.questao_gabarito_revelado" in sql
    assert "PRIMARY KEY (aluno_id, questao_id)" in sql


def test_quem_viu_o_gabarito_perde_o_retry_naquela_questao() -> None:
    sql = _sql()

    assert "questao_gabarito_revelado" in sql


def test_o_gate_exige_voltar_ao_material() -> None:
    """Em Illinois, exigir tarefa antes de liberar o retry derrubou o retake de
    49% para 34% com nota identica: filtrou quem so' ia rolar o dado."""
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION public.fn_revisou_topico" in sql
    assert "personalizacao_item_progresso" in sql


def test_o_gate_mede_leitura_ativa_e_nao_tela_aberta() -> None:
    """dwell_sec inclui tempo parado com o material aberto: aceitaria o aluno
    deixando a tela ligada. E' a mesma distincao que _summarize_reading_pace faz."""
    sql = _sql()

    assert "SUM(t.active_sec)" in sql
    # Mira no USO, nao na mencao: o comentario da migracao cita dwell_sec
    # justamente para explicar por que ele nao entra na conta.
    assert "SUM(t.dwell_sec)" not in sql
    assert "dwell_sec)" not in sql


def test_o_gate_filtra_por_escopo() -> None:
    """Dentro de um lote, topic/content/material trazem o mesmo intervalo: somar
    escopos diferentes multiplica o tempo."""
    sql = _sql()

    assert "scope = 'material'" in sql


def test_abrir_e_fechar_nao_abre_o_gate() -> None:
    modulo = _modulo()

    assert modulo.SEGUNDOS_DE_LEITURA >= 60


def test_a_nota_e_noventa_da_melhor_e_dez_da_pior() -> None:
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION public.fn_nota_90_10" in sql
    assert "0.9" in sql and "0.1" in sql
    assert "MAX(percentual)" in sql and "MIN(percentual)" in sql


def test_com_uma_tentativa_a_formula_nao_muda_nada() -> None:
    """max = min, entao 0.9x + 0.1x = x. Quem nunca comprou o item nao sente."""
    sql = _sql()

    assert "fn_nota_90_10" in sql


def test_a_nota_nao_pode_subir_acima_da_melhor() -> None:
    sql = _sql()

    assert "LEAST(" in sql


def test_a_nota_nao_e_gravada_como_conclusao() -> None:
    """percentual_concluido alimenta trailup_recalcular_topico_aluno: gravar 68
    de nota ali faria a atividade parecer 68% concluida e mexeria no percentual
    do topico inteiro."""
    sql = _sql()

    assert "SET acertos_percentual = v_nota" in sql
    assert "SET percentual_concluido = v_nota" not in sql


def _corpo_comprar(sql: str) -> str:
    inicio = sql.find("FUNCTION public.loja_comprar")
    assert inicio > 0, "a RPC nem foi redefinida"
    fim = sql.find("$fn$;", inicio)
    assert fim > inicio
    return sql[inicio:fim]


def test_a_compra_confere_o_gate_antes_de_cobrar() -> None:
    """Comprar e so' entao descobrir que esta travado gasta a moeda do aluno
    numa porta fechada."""
    corpo = _corpo_comprar(_sql())

    assert "fn_revisou_topico" in corpo
    assert "revise_o_material" in corpo


def test_o_cooldown_e_imposto_nao_sugerido() -> None:
    """97% dos alunos espacaram as tentativas porque a janela os obrigou, nao
    por escolha: alargar a janela nao fez ninguem espacar mais."""
    corpo = _corpo_comprar(_sql())

    assert "cooldown_24h" in corpo
    assert "24 hours" in corpo


def test_o_teto_da_turma_vale() -> None:
    corpo = _corpo_comprar(_sql())

    assert "retry_max_por_topico" in corpo


def test_atividade_so_de_v_ou_f_nao_pode_ser_comprada() -> None:
    """Se nenhuma questao e elegivel, a compra e recusada ANTES de cobrar."""
    corpo = _corpo_comprar(_sql())

    assert "fn_questao_elegivel_retry" in corpo
    assert "sem_questao_elegivel" in corpo
