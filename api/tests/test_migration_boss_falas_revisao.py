"""`20261102_18`: o professor vê as falas do boss e pode desligá-las; o banco esconde do aluno.

O comportamento (RLS do aluno e do professor, GRANT por coluna, carimbo de `desativada_em`) foi
exercitado num Postgres real (PGlite) com o esqueleto das tabelas: ver o PR. Aqui fica o que dá para
travar sem banco.
"""

import inspect
from io import StringIO

from alembic.script import ScriptDirectory

from app.db import migrations
from app.services import boss_falas
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261102_17:20261102_18", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261102_18:20261102_17", sql=True)
    return output.getvalue().replace("%%", "%")


def test_a_arvore_continua_com_uma_cabeca_e_vem_depois_da_17() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261102_18").down_revision == "20261102_17"


def test_o_banco_esconde_a_fala_desligada_do_aluno_e_nao_do_professor() -> None:
    sql = _upgrade_sql()
    assert "ADD COLUMN IF NOT EXISTS ativa boolean NOT NULL DEFAULT true" in sql
    assert "classe_id IN (SELECT public.app_classes_do_professor())" in sql
    assert "(ativa AND classe_id IN (SELECT public.app_classes_do_aluno()))" in sql
    # `app_minhas_classes()` deixaria o aluno ver a desligada: não pode voltar para a policy de leitura.
    leitura = sql[sql.index("CREATE POLICY boss_falas_minhas_classes_sel") : sql.index("DROP POLICY IF EXISTS boss_falas_professor_upd")]
    assert "app_minhas_classes" not in leitura


def test_o_professor_so_liga_e_desliga() -> None:
    sql = _upgrade_sql()
    assert "CREATE POLICY boss_falas_professor_upd" in sql
    assert "REVOKE UPDATE ON public.boss_falas FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT UPDATE (ativa) ON public.boss_falas TO authenticated" in sql
    # Nenhuma outra coluna entra no GRANT: nome e falas são texto validado pela API.
    assert "GRANT UPDATE (ativa)" in sql and "GRANT UPDATE (nome" not in sql and "GRANT UPDATE (falas" not in sql


def test_a_data_da_desativacao_e_do_gatilho() -> None:
    sql = _upgrade_sql()
    assert "BEFORE UPDATE OF ativa ON public.boss_falas" in sql
    assert "CASE WHEN NEW.ativa THEN NULL ELSE now() END" in sql


def test_a_api_religa_quando_escreve_texto_novo() -> None:
    fonte = inspect.getsource(boss_falas._gravar)
    assert "ON CONFLICT (conteudo_id, perfil) DO UPDATE SET" in fonte
    assert "ativa = true" in fonte


def test_o_downgrade_devolve_a_policy_antiga() -> None:
    sql = _downgrade_sql()
    assert "USING (classe_id IN (SELECT public.app_minhas_classes()))" in sql
    assert sql.index("DROP POLICY IF EXISTS boss_falas_professor_upd") < sql.index("DROP COLUMN IF EXISTS ativa")
