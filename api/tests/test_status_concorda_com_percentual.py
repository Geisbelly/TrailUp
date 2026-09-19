"""`status` e `percentual_concluido` descrevem a mesma coisa e discordavam.

Medido em producao: 1 linha de `atividade_aluno` com percentual 100 e status
'em andamento'. A causa era `Atividade.registrarVisita` mandando
`this.status ?? 'em andamento'` -- um palpite, por cima de uma linha concluida,
num caminho que nem envia o percentual. Dai a assinatura do defeito: percentual
certo, status demovido.
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
        _offline_alembic_config(output), "20260911_02:20260911_03", sql=True
    )
    return output.getvalue()


def test_as_tres_tabelas_de_progresso_sao_corrigidas() -> None:
    sql = _sql()

    for tabela in ("conteudo_aluno", "atividade_aluno", "topico_aluno"):
        assert f"UPDATE public.{tabela}" in sql, tabela


def test_o_backfill_vai_na_direcao_do_percentual() -> None:
    """O banco ja trata a linha como concluida pelo percentual -- o filtro de
    `trailup_recalcular_topico_aluno` aceita `percentual >= 100` sozinho. Levar
    o status para `concluido` alinha o rotulo ao que ja valia."""
    sql = _sql()

    assert "SET status = 'concluido'::status_atividade" in sql
    assert "WHERE COALESCE(percentual_concluido, 0) >= 100" in sql


def test_o_rotulo_do_enum_e_o_acentuado() -> None:
    """`'nao iniciado'` compila e so falha em producao, na atribuicao ao enum.
    Esta migracao nao escreve esse rotulo, e o teste guarda isso."""
    sql = _sql()

    assert "'nao iniciado'" not in sql


def test_a_direcao_contraria_nao_e_corrigida_e_sim_avisada() -> None:
    """Cravar 100 sobre uma linha marcada concluida seria INVENTAR progresso --
    a conta que vale e a do material personalizado. Hoje sao zero linhas; se
    aparecerem, o aviso diz onde olhar."""
    sql = _sql()

    assert "SET percentual_concluido" not in sql
    assert "RAISE WARNING" in sql
    assert "outra causa, nao corrigida aqui" in sql


def test_a_migracao_aborta_se_a_divergencia_sobreviver() -> None:
    sql = _sql()

    assert "RAISE EXCEPTION" in sql
    assert "ainda divergente apos o backfill" in sql


def test_a_verificacao_nao_usa_sql_dinamico() -> None:
    """`format()` com `%I`/`%s` levaria o caractere por-cento, e o renderizador
    offline do Alembic o DOBRA para o paramstyle do driver: viraria `%%I` e o
    format morreria. Com tres tabelas fixas, as checagens sao escritas a mao.

    A assercao busca a CHAMADA (`format(`), nao o nome -- o comentario Python
    da migracao cita `format` em prosa, e casar com a palavra solta seria um
    falso positivo."""
    sql = _sql()

    assert "format(" not in sql
    assert "EXECUTE format" not in sql


def test_o_sql_renderizado_nao_tem_por_cento() -> None:
    """Vale para o SQL RENDERIZADO. A prosa do docstring e os comentarios
    Python podem ter -- e tem, justamente explicando esta armadilha."""
    assert "%" not in _sql()
