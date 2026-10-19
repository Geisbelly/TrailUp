"""Fase 7: eixos no criar/resumo, params efetivos, rank de missões, painel diário."""

from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_07:20261021_08", sql=True)
    return output.getvalue()


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_08:20261021_07", sql=True)
    return output.getvalue()


def test_params_efetivos_so_por_outra_funcao() -> None:
    sql = _upgrade_sql()
    assert "CREATE OR REPLACE FUNCTION public.fn_desafio_params_efetivos" in sql
    assert (
        "REVOKE ALL ON FUNCTION public.fn_desafio_params_efetivos(text) FROM PUBLIC, anon, authenticated"
        in sql
    )
    assert "GRANT EXECUTE ON FUNCTION public.fn_desafio_params_efetivos(text) TO" not in sql
    assert "desafio_tempo_seg_dificil" in sql
    assert "app_desafio_aposta_fator" in sql


def test_criar_desafio_aceita_os_eixos() -> None:
    sql = _upgrade_sql()
    assert "DROP FUNCTION IF EXISTS public.guilda_desafio_criar(uuid, text, integer)" in sql
    assert "p_dificuldade text DEFAULT 'normal'" in sql
    assert "p_consequencia text DEFAULT 'ranqueada'" in sql
    assert "dificuldade, consequencia" in sql or "dificuldade, consequencia" in sql.replace("\n", " ")
    # Defaults preservam o que a fase 1 mediu.
    assert "DEFAULT 'ranqueada'" in sql
    assert "DEFAULT 'treino'" not in sql.split("guilda_desafio_criar")[1].split("RETURNS")[0]


def test_resumo_da_arena_devolve_os_eixos() -> None:
    """Sem isso o console não tem o que pintar no cartão do duelo."""
    sql = _upgrade_sql()
    assert "'dificuldade', d.dificuldade" in sql
    assert "'consequencia', d.consequencia" in sql


def test_rank_de_missoes_entra_no_case_e_no_catalogo() -> None:
    """A lição do #540: critério sem CASE ranqueia todo mundo em zero."""
    sql = _upgrade_sql()
    assert "WHEN 'missoes'::text THEN COALESCE(mc.pontuacao, 0::numeric)" in sql
    assert "missoes_concluidas AS" in sql
    assert "criterio = 'missoes'" in sql
    assert "'Missões'" in sql or "'Missões'" in sql


def test_painel_diario_do_professor() -> None:
    sql = _upgrade_sql()
    assert "CREATE OR REPLACE FUNCTION public.missoes_diarias_resumo" in sql
    assert "origem = 'sistema'" in sql
    assert "REVOKE ALL ON FUNCTION public.missoes_diarias_resumo(bigint, date) FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.missoes_diarias_resumo(bigint, date) TO authenticated" in sql


def test_downgrade_tira_o_criterio_e_restaura_o_criar() -> None:
    sql = _downgrade_sql()
    assert "DELETE FROM public.rank_tipo WHERE criterio = 'missoes'" in sql
    assert "DROP FUNCTION IF EXISTS public.missoes_diarias_resumo(bigint, date)" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_desafio_params_efetivos(text)" in sql
    assert "guilda_desafio_criar(uuid,text,integer)" in sql.replace(" ", "") or (
        "guilda_desafio_criar(uuid, text, integer)" in sql
    )
