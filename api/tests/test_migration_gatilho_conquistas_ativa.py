from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _sql(origem: str, destino: str, *, down: bool = False) -> str:
    output = StringIO()
    cfg = _offline_alembic_config(output)
    (migrations.command.downgrade if down else migrations.command.upgrade)(cfg, f"{origem}:{destino}", sql=True)
    return output.getvalue()


def test_o_laco_so_percorre_conquistas_ativas_e_mantem_o_filtro_de_turma() -> None:
    sql = _sql("20261017_05", "20261017_06")

    assert "AND c.ativa IS NOT FALSE" in sql
    assert sql.count("AND c.ativa IS NOT FALSE") == 1
    # o filtro de turma e o de perfil que já existiam continuam
    assert "c.classe_id IS NULL" in sql
    assert "lower(COALESCE(c.escopo, 'comum')) <> 'perfil'" in sql
    assert sql.index("c.classe_id IS NULL") < sql.index("AND c.ativa IS NOT FALSE") < sql.index("LOOP")


def test_guarda_a_recursao_e_as_metricas_da_funcao_original() -> None:
    sql = _sql("20261017_05", "20261017_06")

    assert "IF public.fn_evento_creditado(v_tipo) THEN" in sql
    for metrica in ("eventos_totais", "dias_seguidos", "minutos_totais", "atividade_rapida", "topicos_visitados"):
        assert f"v_metrica = '{metrica}'" in sql
    assert "SECURITY DEFINER" in sql and "SET search_path TO 'public', 'pg_temp'" in sql


def test_upgrade_tem_guarda_contra_funcao_diferente_da_esperada() -> None:
    sql = _sql("20261017_05", "20261017_06")

    assert "trg_eventos_aluno_after_iud mudou: revise esta migration antes de aplicar." in sql
    assert sql.index("mudou: revise") < sql.index("CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud")


def test_downgrade_restaura_a_funcao_sem_o_filtro() -> None:
    sql = _sql("20261017_06", "20261017_05", down=True)

    assert "CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud" in sql
    assert "c.ativa" not in sql
