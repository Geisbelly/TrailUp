"""Contrato da RPC de KPIs de engajamento.

O teste do SQL renderizado protege as definições. Os cenários com linhas de
verdade ficam em ``test_e2e_kpis_engajamento_banco.py`` e só rodam contra um
Postgres local descartável.
"""

from __future__ import annotations

import importlib.util
from io import StringIO
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRATION = API_ROOT / "alembic" / "versions" / "20261026_01_kpis_engajamento_turma.py"


def _modulo():
    spec = importlib.util.spec_from_file_location("kpis_engajamento_migration", MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _config(output: StringIO | None = None) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    return config


def _sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_config(output), "20261025_04:20261026_01", sql=True)
    return output.getvalue()


def test_migration_e_a_cabeca_unica() -> None:
    scripts = ScriptDirectory.from_config(_config())
    assert scripts.get_heads() == ["20261026_01"]
    assert scripts.get_revision("20261026_01").down_revision == "20261025_04"


def test_rpc_exige_professor_dono_da_turma() -> None:
    sql = _sql()
    assert "auth.uid() IS NULL" in sql
    assert "app_classes_do_professor()" in sql
    assert "ERRCODE = '42501'" in sql
    assert (
        "GRANT EXECUTE ON FUNCTION public.metricas_engajamento_turma"
        in sql
    )
    assert "TO authenticated" in sql
    assert "FROM PUBLIC, anon" in sql


def test_periodo_tem_limite_timezone_e_fim_exclusivo() -> None:
    sql = _sql()
    assert "p_fim < p_inicio" in sql
    assert "p_fim - p_inicio > 366" in sql
    assert "pg_catalog.pg_timezone_names" in sql
    assert "(p_fim + 1)::timestamp AT TIME ZONE p_timezone" in sql


def test_tempo_ativo_usa_um_unico_escopo() -> None:
    sql = _sql()
    assert "e.scope = 'topic'" in sql
    assert "sum(e.active_sec)" in sql
    assert "sum(e.dwell_sec)" in sql
    assert "sum(e.idle_sec)" in sql
    assert "scope IN" not in sql


def test_usuarios_ativos_nao_sao_chamados_de_retorno() -> None:
    sql = _sql()
    assert "'usuarios_ativos', usuarios_ativos" in sql
    assert "'taxa_atividade_pct'" in sql
    assert "'sessoes_media_por_aluno_ativo'" in sql
    assert "'retornaram'" in sql
    assert "'elegiveis'" in sql
    assert "a.ativo AND b.ativo" in sql


def test_retorno_so_compara_semanas_completas_consecutivas() -> None:
    sql = _sql()
    assert "g::date + 6 <= p_fim" in sql
    assert "b.inicio = a.inicio + 7" in sql
    assert "WHERE a.completa AND b.completa" in sql
    assert "WHEN COALESCE((SELECT elegiveis FROM pares_retorno), 0) = 0 THEN NULL" in sql


def test_sessao_aberta_nao_vira_abandono() -> None:
    sql = _sql()
    assert "ended_at IS NOT NULL AND NOT concluiu_topico" in sql
    assert "ended_at IS NULL" in sql
    assert "'encerradas_sem_conclusao'" in sql
    assert "'em_aberto'" in sql


def test_conclusao_e_cobertura_sao_estado_atual() -> None:
    sql = _sql()
    assert "'estado_atual'" in sql
    assert "'historico_disponivel', false" in sql
    assert "topico_aluno" in sql
    assert "COALESCE(ta.status::text, '') = 'concluido'" in sql


@pytest.mark.parametrize(
    "perfil",
    [
        "seeker",
        "survivor",
        "daredevil",
        "mastermind",
        "conqueror",
        "socializer",
        "achiever",
    ],
)
def test_resposta_sempre_declara_os_sete_perfis(perfil: str) -> None:
    assert f"('{perfil}'" in _modulo().SQL or f", '{perfil}'" in _modulo().SQL


def test_perfil_secundario_so_e_elegivel_acima_de_vinte() -> None:
    sql = _sql()
    assert "r.posicao = 2" in sql
    assert "COALESCE(r.afinidade, 0) > 20" in sql
    assert "ap.afinidade DESC NULLS LAST" in sql


def test_aluno_sem_perfil_cai_no_mastermind_sem_sumir() -> None:
    sql = _sql()
    assert "SELECT m.aluno_id, 'mastermind'" in sql
    assert "NOT EXISTS" in sql


def test_material_compartilhado_e_individual_cobrem_o_alvo() -> None:
    sql = _sql()
    assert "cp.aluno_id IS NULL OR cp.aluno_id = a.aluno_id" in sql
    assert "'compartilhado'" in sql
    assert "'individual'" in sql
    assert "ORDER BY (cp.aluno_id IS NOT NULL) DESC" in sql


def test_material_failed_quality_nunca_conta_como_disponivel() -> None:
    sql = _sql()
    assert "mat.payload #>> '{metadata,status}'" in sql
    assert "mat.payload ->> 'status'" in sql
    assert "'failed_quality'" in sql
    assert "NOT IN (" in sql


def test_taxas_sem_denominador_ficam_nulas() -> None:
    sql = _sql()
    assert "WHEN tempo.alunos_ativos = 0 THEN NULL" in sql
    assert "WHEN alvos = 0 THEN NULL" in sql


def test_downgrade_remove_so_a_funcao() -> None:
    source = MIGRATION.read_text(encoding="utf-8")
    downgrade = source.split("def downgrade()", 1)[1]
    assert "DROP FUNCTION IF EXISTS" in downgrade
    assert "DROP TABLE" not in downgrade
    assert "DELETE FROM" not in downgrade
