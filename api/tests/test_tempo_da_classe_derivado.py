"""`classe_aluno."tempoGastoMin"` era um fossil.

Medido em producao, classe 32: a soma de `topico_aluno.tempo_gasto_min` dava
2,17 min e a coluna dizia 0,39 -- e e' a coluna que alimenta o rank "Tempo de
Estudo". Nada escrevia nela: nem mobile, nem API, nem frontend, nem funcao do
banco.
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
        _offline_alembic_config(output), "20260910_02:20260910_03", sql=True
    )
    return output.getvalue()


def test_o_tempo_e_soma_e_o_percentual_continua_media() -> None:
    """Cada topico vale o mesmo para o percentual, entao media. O tempo e quanto
    o aluno passou estudando -- isso acumula."""
    sql = _sql()

    assert "SUM(GREATEST(0, COALESCE(ta.tempo_gasto_min, 0)))" in sql
    assert "AVG(GREATEST(0, LEAST(100, COALESCE(ta.percentual_concluido, 0))))" in sql


def test_a_fonte_do_tempo_e_a_mesma_que_a_trilha_le() -> None:
    """`topico_aluno.tempo_gasto_min` ja e derivado da telemetria por gatilho."""
    assert "FROM topicos t" in _sql()
    assert "LEFT JOIN topico_aluno ta" in _sql()


def test_descobre_a_coluna_nos_dois_dialetos() -> None:
    """`classe_aluno` existe em camelCase e em minusculo neste projeto; gravar na
    coluna errada falharia so no outro ambiente."""
    sql = _sql()

    assert "column_name IN ('tempoGastoMin', 'tempogastomin')" in sql
    assert "column_name IN ('porcentagemConcluida', 'porcentagemconcluida')" in sql
    # A coluna de tempo entra no UPDATE so quando existe.
    assert "IF v_col_tempo IS NOT NULL THEN" in sql


def test_usa_quote_ident_e_nao_format() -> None:
    """O placeholder de identificador do `format` carrega um por-cento, que
    sofre o mesmo escape do renderizador e quebraria a citacao."""
    sql = _sql()

    assert "quote_ident(v_col_tempo)" in sql
    assert "format(" not in sql


def test_o_fossil_e_recalculado_para_todas_as_matriculas() -> None:
    """A funcao so roda quando ha progresso novo: sem backfill, quem parou de
    estudar ficaria com o valor congelado para sempre."""
    sql = _sql()

    assert "FROM public.classe_aluno ca" in sql
    assert "PERFORM public.trailup_recalcular_classe_aluno(r.aluno_id, r.classe_id)" in sql


def test_a_migracao_aborta_se_o_tempo_continuar_divergindo() -> None:
    assert "classe_aluno com tempo divergente da soma dos topicos: " in _sql()


def test_a_funcao_ganha_search_path_fixo() -> None:
    assert "SET search_path TO 'public', 'pg_temp'" in _sql()


def test_o_downgrade_devolve_a_funcao_sem_o_tempo() -> None:
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260910_03:20260910_02", sql=True
    )
    rendered = output.getvalue()

    assert "trailup_recalcular_classe_aluno" in rendered
    assert "tempoGastoMin" not in rendered


def test_o_sql_nao_carrega_porcentagem() -> None:
    assert "%" not in _sql()
