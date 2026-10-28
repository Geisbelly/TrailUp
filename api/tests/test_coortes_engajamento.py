"""Contrato auditável das coortes descritivas da issue #13."""

from __future__ import annotations

import importlib.util
from io import StringIO
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRATION = (
    API_ROOT
    / "alembic"
    / "versions"
    / "20261027_01_coortes_engajamento_por_perfil.py"
)


def _modulo():
    spec = importlib.util.spec_from_file_location("coortes_engajamento_migration", MIGRATION)
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
    migrations.command.upgrade(_config(output), "20261026_02:20261027_01", sql=True)
    return output.getvalue()


def test_migration_e_a_cabeca_unica() -> None:
    scripts = ScriptDirectory.from_config(_config())
    assert scripts.get_heads() == ["20261027_01"]
    assert scripts.get_revision("20261027_01").down_revision == "20261026_02"


def test_rpc_repete_a_barreira_de_sessao_e_posse() -> None:
    sql = _sql()
    assert "auth.uid() IS NULL" in sql
    assert "app_classes_do_professor()" in sql
    assert "ERRCODE = '42501'" in sql
    assert "FROM PUBLIC, anon" in sql
    assert "TO authenticated" in sql


def test_agregado_geral_reusa_o_contrato_da_issue_12() -> None:
    sql = _sql()
    assert "public.metricas_engajamento_turma(" in sql
    assert "'geral', v_geral" in sql
    assert "'periodo', v_geral -> 'periodo'" in sql


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
def test_coortes_declaram_os_sete_perfis(perfil: str) -> None:
    assert perfil in _modulo().SQL


def test_dominantes_sao_disjuntos_e_aluno_sem_vetor_nao_some() -> None:
    sql = _sql()
    assert "WHERE posicao = 1" in sql
    assert "SELECT m.aluno_id, 'mastermind'" in sql
    assert "NOT EXISTS (" in sql
    assert "'dominante'::text AS tipo" in sql


def test_secundario_e_um_segmento_sobreposto_com_limiar_explicito() -> None:
    sql = _sql()
    assert "'secundario_elegivel'::text, true" in sql
    assert "r.posicao = 2" in sql
    assert "COALESCE(r.afinidade, 0) > 20" in sql
    assert "'sobreposta', m.sobreposta" in sql


def test_perfil_atual_nao_finge_ser_snapshot_historico() -> None:
    sql = _sql()
    assert "'historico_perfil_disponivel', false" in sql
    assert "'comparacao_causal', false" in sql
    assert "'medida_em', statement_timestamp()" in sql


def test_amostra_pequena_e_sinalizada_sem_fabricar_privacidade() -> None:
    sql = _sql()
    assert "'amostra_pequena', m.alunos > 0 AND m.alunos < 5" in sql
    assert "CASE WHEN m.alunos = 0 THEN NULL" in sql


def test_tempo_filtra_scope_topic_e_periodo() -> None:
    sql = _sql()
    assert "e.scope = 'topic'" in sql
    assert "e.captured_at >= v_inicio" in sql
    assert "e.captured_at < v_fim_exclusivo" in sql


def test_retorno_mantem_semanas_completas_consecutivas() -> None:
    sql = _sql()
    assert "g::date + 6 <= p_fim" in sql
    assert "b.inicio = a.inicio + 7" in sql
    assert "WHERE a.completa AND b.completa" in sql
    assert "WHEN m.retorno_elegiveis = 0 THEN NULL" in sql


def test_sessao_aberta_nao_e_encerrada_sem_conclusao() -> None:
    sql = _sql()
    assert "s.ended_at IS NULL" in sql
    assert "s.ended_at IS NOT NULL" in sql
    assert "'encerradas_sem_conclusao'" in sql
    assert "'em_aberto'" in sql


def test_conclusao_continua_identificada_como_estado_atual() -> None:
    sql = _sql()
    assert "'estado_atual'" in sql
    assert "topico_aluno" in sql
    assert "COALESCE(ta.status::text, '') = 'concluido'" in sql


def test_downgrade_nao_apaga_dados() -> None:
    downgrade = MIGRATION.read_text(encoding="utf-8").split("def downgrade()", 1)[1]
    assert "DROP FUNCTION IF EXISTS" in downgrade
    assert "DROP TABLE" not in downgrade
    assert "DELETE FROM" not in downgrade
