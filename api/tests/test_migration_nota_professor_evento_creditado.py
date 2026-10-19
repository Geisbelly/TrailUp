from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _sql(origem: str, destino: str, baixar: bool = False) -> str:
    output = StringIO()
    comando = migrations.command.downgrade if baixar else migrations.command.upgrade
    comando(_offline_alembic_config(output), f"{origem}:{destino}", sql=True)
    return output.getvalue()


def _upgrade_sql() -> str:
    return _sql("20261016_02", "20261016_03")


def test_funcao_mantem_os_tres_prefixos_de_antes_e_acrescenta_um() -> None:
    sql = _upgrade_sql()

    assert "CREATE OR REPLACE FUNCTION public.fn_evento_creditado(p_tipo text)" in sql
    for prefixo in ("presenca", "participacao", "conquista", "nota_professor"):
        assert f"starts_with(lower(p_tipo), '{prefixo}')" in sql
    assert "IMMUTABLE" in sql


def test_prefixo_novo_e_especifico_para_nao_capturar_tipo_de_estudo() -> None:
    sql = _upgrade_sql()
    # "nota" solto capturaria qualquer evento futuro que comece assim
    assert "starts_with(lower(p_tipo), 'nota')" not in sql.replace("'nota_professor'", "")


def test_indice_unico_inclui_o_tipo_novo_e_continua_parcial() -> None:
    sql = _upgrade_sql()

    assert "DROP INDEX IF EXISTS public.eventos_aluno_creditado_unico" in sql
    criacao = sql[sql.index("CREATE UNIQUE INDEX eventos_aluno_creditado_unico") :]
    assert "(aluno_id, tipo, referencia)" in criacao
    assert "WHERE tipo IN ('presenca_aula', 'participacao_aula', 'conquista_desbloqueada', 'nota_professor')" in criacao


def test_downgrade_devolve_funcao_e_indice_de_antes() -> None:
    sql = _sql("20261016_03", "20261016_02", baixar=True)

    assert "nota_professor" not in sql
    assert "WHERE tipo IN ('presenca_aula', 'participacao_aula', 'conquista_desbloqueada')" in sql


def test_nao_mexe_em_dados_de_eventos() -> None:
    sql = _upgrade_sql()
    for proibido in ("DELETE FROM public.eventos_aluno", "UPDATE public.eventos_aluno", "INSERT INTO public.eventos_aluno"):
        assert proibido not in sql
