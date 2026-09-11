"""Backfill do tempo e do progresso fossilizados nas tabelas derivadas.

`tempo_gasto_min` e derivado da telemetria pelo gatilho
`trg_telemetria_tempo_gasto`, que RECALCULA o total a cada INSERT -- nao soma
incremental. Logo toda linha tocada por telemetria nova fica correta, e o que
sobra errado e linha FOSSIL: gravada por codigo que nao existe mais, ou com
telemetria anterior ao gatilho, e nunca mais recalculada.

Medido antes do backfill:

    tabela            linhas  fora  soma gravada  soma telemetria
    topico_aluno           9     3          0.66             2.37
    conteudo_aluno         9     2          2.35             2.37
    atividade_aluno       68     8          0.59             0.05

`topico_aluno` subcontava 3.6x -- e e dele que sai o `tempoGastoMin` de
`classe_aluno`, que o rank "Tempo de Estudo" e as metricas do perfil leem. O
tempo do aluno aparecia como 0.66 min em vez de 2.37. Depois: 0 divergentes
nas tres tabelas, e `classe_aluno` batendo com a soma dos topicos.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = (
    API_ROOT / "alembic" / "versions" / "20260910_12_tempo_e_progresso_fossil.py"
)


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
        _offline_alembic_config(output), "20260910_11:20260910_12", sql=True
    )
    return output.getvalue()


def test_o_tempo_do_topico_e_feito_explicitamente() -> None:
    """`trailup_recalcular_topico_aluno` se ABSTEM de `tempo_gasto_min` -- o
    corpo dela diz "nao toca em tempo_gasto_min: e contador incremental do
    app". A justificativa envelheceu, mas a funcao continua abstendo-se.

    A primeira versao desta migracao confiou nela para o tempo do topico e o
    CONFERE abortou com "ainda divergente apos o backfill -- topico: 3". Este
    teste tranca o UPDATE explicito no lugar."""
    sql = _sql()

    assert "UPDATE public.topico_aluno ta" in sql
    assert "ta.aluno_id, 'topic', ta.topico_id, NULL, NULL" in sql


def test_usa_a_mesma_expressao_do_gatilho_em_cada_escopo() -> None:
    """Reimplementar a conta aqui criaria uma segunda autoridade para o mesmo
    numero. O escopo certo por tabela importa: telemetria e INCLUSIVA, e somar
    escopos diferentes multiplica o tempo (ver CLAUDE.md)."""
    sql = _sql()

    assert "ca.aluno_id, 'content', NULL, ca.conteudo_id, NULL" in sql
    assert "aa.aluno_id, 'activity', NULL, NULL, aa.atividade_id" in sql
    assert "ta.aluno_id, 'topic', ta.topico_id, NULL, NULL" in sql


def test_o_progresso_sai_das_funcoes_existentes() -> None:
    """Para o PERCENTUAL as funcoes sao a autoridade, e chama-las evita uma
    terceira copia dessa conta."""
    sql = _sql()

    assert "trailup_recalcular_topico_aluno(r.aluno_id, r.topico_id)" in sql
    assert "trailup_recalcular_classe_aluno(r.aluno_id, r.classe_id)" in sql


def test_a_ordem_e_de_baixo_para_cima() -> None:
    """Cada nivel le o de baixo: conteudo e atividade, depois topico, e a
    classe por ultimo -- ela soma o tempo dos topicos."""
    sql = _sql()

    pos_conteudo = sql.index("UPDATE public.conteudo_aluno ca")
    pos_topico = sql.index("UPDATE public.topico_aluno ta")
    pos_classe = sql.index("trailup_recalcular_classe_aluno")

    assert pos_conteudo < pos_topico < pos_classe


def test_e_so_backfill_nao_mexe_em_funcao() -> None:
    """O gatilho ja esta correto. Se esta migracao redefinisse funcao, estaria
    resolvendo o problema errado -- e arriscando reverter 20260910_09, que
    tambem mexeu nesse caminho."""
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION" not in sql
    assert "pg_get_functiondef" not in sql
    assert "DROP FUNCTION" not in sql


def test_so_toca_linha_divergente() -> None:
    """`WHERE abs(...) > 0.01` evita reescrever linha que ja esta certa --
    sem isso todo `updated_at` do banco mudaria por nada."""
    sql = _sql()

    assert sql.count("WHERE abs(") >= 3


def test_confere_aborta_se_sobrar_divergencia() -> None:
    """Backfill sem verificacao e' esperanca. O CONFERE ja provou seu valor:
    foi ele que pegou a primeira versao errada desta migracao."""
    sql = _sql()

    assert "ainda divergente apos o backfill" in sql
    assert "RAISE EXCEPTION" in sql
    # E confere tambem o nivel de cima, que e o que o rank le.
    assert 'cl."tempoGastoMin"' in sql


def test_nao_usa_sinal_de_porcentagem() -> None:
    """O renderer offline do Alembic dobra o caractere."""
    assert "%" not in MIGRACAO.read_text(encoding="utf-8")
    assert "%" not in _sql()
