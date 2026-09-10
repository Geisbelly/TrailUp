"""Higiene das funcoes que as migracoes 20260909_* acrescentaram.

O linter do Supabase apontou tres funcoes minhas sem `SET search_path` e duas
`SECURITY DEFINER` executaveis por `anon`. Nenhuma das tres e' definer, entao
nao havia escalada -- mas o projeto ja tem 37 funcoes com `search_path` mutavel
e estas nao precisam entrar na conta.
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
    API_ROOT / "alembic" / "versions" / "20260910_01_higiene_das_funcoes_novas.py"
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
        _offline_alembic_config(output), "20260909_05:20260910_01", sql=True
    )
    return output.getvalue()


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_higiene", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_as_tres_funcoes_ganham_search_path_fixo() -> None:
    modulo = _modulo()
    sql = _sql()

    assert len(modulo.FUNCOES_SEM_SEARCH_PATH) == 3
    for assinatura in modulo.FUNCOES_SEM_SEARCH_PATH:
        assert (
            f"ALTER FUNCTION {assinatura} SET search_path TO 'public', 'pg_temp';" in sql
        ), assinatura


def test_usa_alter_e_nao_recola_os_corpos() -> None:
    """`fn_conquista_metrica_suportada` e gerada do dicionario de metricas da
    20260909_01. Recolar o corpo aqui congelaria uma copia dele nesta migracao,
    e mudar a lista la deixaria de ter efeito."""
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION" not in sql
    # Nenhum pedaco de corpo veio junto.
    assert "eventos_totais" not in sql
    assert "starts_with(lower(p_tipo)" not in sql


def test_anon_perde_as_definer_que_nao_precisa_executar() -> None:
    sql = _sql()

    for assinatura in (
        "public.app_rank_limite_visivel()",
        "public.fn_pontos_do_evento(text)",
    ):
        assert f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon;" in sql, assinatura


def test_authenticated_mantem_execute() -> None:
    """`fn_pontos_do_evento` e chamada pelo gatilho BEFORE INSERT, que e SECURITY
    INVOKER e roda como o aluno -- revogar dele quebraria toda gravacao de
    evento."""
    sql = _sql()

    assert (
        "GRANT EXECUTE ON FUNCTION public.fn_pontos_do_evento(text) TO authenticated, service_role;"
        in sql
    )
    assert (
        "GRANT EXECUTE ON FUNCTION public.app_rank_limite_visivel() TO authenticated, service_role;"
        in sql
    )


def test_a_migracao_confere_o_que_pode_ter_quebrado() -> None:
    """`SET search_path` impede inlining, e o CHECK de `conquistas` e a policy de
    INSERT de `eventos_aluno` dependem dessas funcoes. Falhar aqui e melhor que
    falhar num INSERT depois."""
    sql = _sql()

    assert "fn_conquista_metrica_suportada('dias_seguidos')" in sql
    assert "fn_conquista_metrica_suportada('metrica_que_nao_existe')" in sql
    assert "o CHECK de conquistas deixou de valer para: " in sql
    assert "fn_evento_creditado('presenca_aula')" in sql
    assert "fn_pontos_do_evento('conteudo_concluido')" in sql


def test_o_downgrade_devolve_os_grants() -> None:
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260910_01:20260909_05", sql=True
    )
    rendered = output.getvalue()

    assert "RESET search_path" in rendered
    assert "TO anon" in rendered


def test_o_sql_nao_carrega_porcentagem() -> None:
    assert "%" not in _sql()
