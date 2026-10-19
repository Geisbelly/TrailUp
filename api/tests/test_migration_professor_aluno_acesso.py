from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261018_05:20261019_01", sql=True)
    return output.getvalue()


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261019_01:20261018_05", sql=True)
    return output.getvalue()


def test_ligar_has_acesso_exige_aluno_de_turma_do_professor() -> None:
    sql = _upgrade_sql()

    # As duas policies que deixavam o professor virar o flag sozinho.
    for policy in ("professor_aluno_posse_upd", "professor_aluno_posse_ins"):
        assert f"DROP POLICY IF EXISTS {policy} ON public.professor_aluno;" in sql
        assert f"CREATE POLICY {policy} ON public.professor_aluno" in sql

    # O vínculo real: turma criada pelo professor.
    assert "JOIN public.app_classes_do_professor() AS minha(id) ON minha.id = ca.classe_id" in sql
    assert "WHERE ca.aluno_id = professor_aluno.aluno_id" in sql
    assert sql.count("EXISTS (") >= 2, "o predicado vale para UPDATE e para INSERT"


def test_revogar_continua_livre_e_cobre_nulo() -> None:
    """`has_acesso` é nullable. `NOT has_acesso` seria NULL para NULL, o AND viraria NULL e o
    WITH CHECK reprovaria — o professor perderia a capacidade de gravar linha neutra. Esta base
    já pagou caro por três-valores (20261018_02, o `NOT IN` das funções de cópia)."""
    sql = _upgrade_sql()

    assert "has_acesso IS NOT TRUE" in sql
    assert "NOT has_acesso" not in sql


def test_nao_usa_in_sobre_o_helper() -> None:
    """A casa usa EXISTS com os helpers SECURITY DEFINER para não depender da propagação de
    NULL dentro de uma lista."""
    sql = _upgrade_sql()

    assert "IN (SELECT public.app_classes_do_professor" not in sql
    assert "NOT IN" not in sql


def test_update_ainda_exige_ser_dono_da_linha() -> None:
    sql = _upgrade_sql()

    # USING continua só posse: o professor enxerga e mexe nas linhas dele.
    assert "USING (professor_id = auth.uid())" in sql
    # WITH CHECK é o que ficou mais estrito.
    assert "WITH CHECK (\n    professor_id = auth.uid()" in sql


def test_downgrade_restaura_o_predicado_frouxo() -> None:
    sql = _downgrade_sql()

    assert "WITH CHECK (professor_id = auth.uid());" in sql
    assert "app_classes_do_professor" not in sql
