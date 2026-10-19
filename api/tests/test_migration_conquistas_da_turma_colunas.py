from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261013_03:20261016_01", sql=True)
    return output.getvalue()


def test_reproduz_colunas_existentes_sem_quebrar_onde_ja_existem() -> None:
    sql = _upgrade_sql()

    assert "ADD COLUMN IF NOT EXISTS classe_id bigint REFERENCES public.classe(id) ON DELETE CASCADE" in sql
    assert "ADD COLUMN IF NOT EXISTS criado_por uuid" in sql
    assert "ADD COLUMN IF NOT EXISTS ativa boolean NOT NULL DEFAULT true" in sql


def test_ativa_nasce_verdadeira_para_nao_desativar_as_27_globais() -> None:
    sql = _upgrade_sql()
    assert "DEFAULT true" in sql
    assert "UPDATE public.conquistas" not in sql


def test_teto_por_turma_e_publico_e_nao_sobrescreve() -> None:
    sql = _upgrade_sql()
    trecho = sql[sql.index("'conquistas_por_turma_max'") :]
    assert "'20'" in trecho
    assert "true" in trecho[: trecho.index("ON CONFLICT")]
    assert "ON CONFLICT (chave) DO NOTHING" in trecho


def test_nao_reescreve_o_gatilho_de_avaliacao() -> None:
    sql = _upgrade_sql()
    assert "trg_eventos_aluno_after_iud" not in sql
    assert "CREATE OR REPLACE FUNCTION" not in sql


def test_downgrade_nao_remove_colunas_que_ja_existiam_em_producao() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261016_01:20261013_03", sql=True)
    sql = output.getvalue()
    assert "DROP COLUMN IF EXISTS ativa" in sql
    assert "DROP COLUMN IF EXISTS classe_id" not in sql
    assert "DROP COLUMN IF EXISTS criado_por" not in sql
