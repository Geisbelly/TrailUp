"""A 20260910_03 consertou o retrato e deixou a deriva voltar.

Ela tornou `classe_aluno."tempoGastoMin"` derivado, e o backfill fez a coluna
bater com a soma no momento em que rodou. Dias depois, classe 32: coluna 2,90,
soma dos topicos 2,26 -- 0,64 min de deriva.

A causa: `trailup_recalcular_classe_aluno` era chamada por um caminho so,
`trailup_progresso_after_item`, cujos gatilhos vivem em tabelas de PROGRESSO.
Quem escreve o tempo e outro gatilho, sobre telemetria, e ele nao chamava a
recalculacao.
"""

from __future__ import annotations

import importlib.util
from io import StringIO
from pathlib import Path
from types import ModuleType

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = (
    API_ROOT / "alembic" / "versions" / "20260910_09_tempo_da_classe_nao_desanda.py"
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
        _offline_alembic_config(output), "20260910_08:20260910_09", sql=True
    )
    return output.getvalue()


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_deriva", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_o_gatilho_de_telemetria_passa_a_recalcular_a_classe() -> None:
    """Fecha o laco: quem escreve o tempo tambem atualiza o agregado."""
    sql = _sql()

    assert "PERFORM public.trailup_recalcular_classe_aluno(alvo.aluno_id, alvo.classe_id)" in sql
    assert "trailup_recalcular_classe_aluno nao chama a recalculacao" not in sql


def test_reusa_a_funcao_em_vez_de_somar_num_segundo_lugar() -> None:
    """Duas contas para a mesma coisa e o defeito que esta sequencia toda vem
    desfazendo. A funcao tambem recalcula percentual e isComplete no caminho --
    trabalho a mais, idempotente, e garante que as colunas nao discordem sobre a
    fonte."""
    sql = _sql()

    assert "SUM(GREATEST(0, COALESCE(ta.tempo_gasto_min, 0)))" not in _modulo().CHAMADA
    assert "trailup_recalcular_classe_aluno" in sql


def test_so_o_escopo_topic_dispara() -> None:
    """`trailup_recalcular_classe_aluno` soma `topico_aluno`, e essa tabela e
    atualizada apenas pelo ramo `scope = 'topic'`. Lote com so `content` ou
    `activity` nao muda o total da classe."""
    modulo = _modulo()

    assert "WHERE n.scope = 'topic'" in modulo.CHAMADA
    assert "'content'" not in modulo.CHAMADA
    assert "'activity'" not in modulo.CHAMADA


def test_a_chamada_e_por_conjunto_e_nao_por_linha() -> None:
    """O gatilho e STATEMENT-level com tabela de transicao: uma chamada por
    (aluno, classe) distinto do lote, nao por linha de telemetria."""
    modulo = _modulo()

    assert "SELECT DISTINCT n.aluno_id, t.classe_id" in modulo.CHAMADA
    assert "FROM novas n" in modulo.CHAMADA


def test_usa_substituicao_e_nao_recola_o_corpo() -> None:
    """Sao 1286 bytes escritos a mao; reproduzi-los de memoria e como se
    introduz defeito."""
    sql = _sql()

    assert "SELECT p.prosrc INTO v_src" in sql
    assert "|| v_novo ||" in sql
    # Nenhum dos tres UPDATEs originais veio recolado.
    assert "UPDATE conteudo_aluno ca" not in sql
    assert "trailup_tempo_telemetria_min" not in sql


def test_a_substituicao_e_idempotente() -> None:
    sql = _sql()

    assert "ja aplicado" in sql
    assert "position('trailup_recalcular_classe_aluno' in v_src) > 0" in sql


def test_o_search_path_e_fixado_e_o_definer_preservado() -> None:
    """A funcao referencia `topico_aluno`, `conteudo_aluno` e `atividade_aluno`
    SEM prefixo `public.`, entao o parametro decide onde resolvem. E ela e
    SECURITY DEFINER -- perder isso no CREATE OR REPLACE quebraria o gatilho."""
    sql = _sql()

    assert "SECURITY DEFINER" in sql
    assert "SET search_path TO ''public'', ''pg_temp''" in sql
    assert "ficou sem search_path fixo" in sql


def test_a_deriva_existente_e_corrigida() -> None:
    """A funcao roda no proximo lote; ate la a coluna segue errada."""
    sql = _sql()

    assert "FROM public.classe_aluno LOOP" in sql
    assert "PERFORM public.trailup_recalcular_classe_aluno(r.aluno_id, r.classe_id)" in sql


def test_a_migracao_aborta_se_a_deriva_sobrar_ou_o_gatilho_cair() -> None:
    sql = _sql()

    assert "classe_aluno com tempo divergente da soma dos topicos: " in sql
    assert "o gatilho de tempo por telemetria desapareceu" in sql


def test_o_downgrade_tira_a_chamada_mas_nao_o_valor() -> None:
    """Voltar a um numero errado nao e reversao, e regressao."""
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260910_09:20260910_08", sql=True
    )
    rendered = output.getvalue()

    assert "replace(v_src," in rendered
    assert "UPDATE public.classe_aluno" not in rendered


def test_o_sql_nao_carrega_porcentagem() -> None:
    assert "%" not in _sql()
