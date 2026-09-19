"""Higiene do que as 20260909_* / 20260910_* mexeram.

O linter aponta 32 funcoes com `search_path` mutavel no projeto. Duas delas
entram na minha conta: `trg_eventos_aluno_after_iud` (reescrita tres vezes por
substituicao de `prosrc`) e `fn_eventos_aluno_referencia_id` (nao era minha, mas
a resolucao de classe passou a chama-la em todo INSERT). E sobrou corpo morto:
`trg_eventos_aluno_after_ins`, 11.929 bytes sem gatilho algum.
"""

from __future__ import annotations

import importlib.util
from io import StringIO
from pathlib import Path
from types import ModuleType

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = API_ROOT / "alembic" / "versions" / "20260910_08_higiene_do_que_eu_mexi.py"


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
        _offline_alembic_config(output), "20260910_07:20260910_08", sql=True
    )
    return output.getvalue()


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_higiene2", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_as_duas_funcoes_ganham_search_path_fixo() -> None:
    modulo = _modulo()
    sql = _sql()

    assert len(modulo.FUNCOES_SEM_SEARCH_PATH) == 2
    for assinatura in modulo.FUNCOES_SEM_SEARCH_PATH:
        assert (
            f"ALTER FUNCTION {assinatura} SET search_path TO 'public', 'pg_temp';" in sql
        ), assinatura


def test_usa_alter_e_nao_recola_o_corpo_gerado() -> None:
    """`trg_eventos_aluno_after_iud` tem 11.929 bytes e e GERADA do dicionario de
    metricas da 20260909_01, com tres substituicoes depois. Recolar congelaria
    uma copia disso aqui."""
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION" not in sql
    # Nenhum pedaco de corpo veio junto.
    assert "v_conquista" not in sql
    assert "v_posicao_ant" not in sql
    assert "eventos_totais" not in sql


def test_o_corpo_morto_e_removido() -> None:
    """0 gatilhos, 0 dependencias, 0 citacoes -- e e a versao ANTIGA da avaliacao
    de conquistas, com a materializacao de posicao que o CLAUDE.md registra como
    abandonada. Corpo morto que sombreia a logica viva e armadilha."""
    sql = _sql()

    assert "DROP FUNCTION IF EXISTS public.trg_eventos_aluno_after_ins();" in sql
    # A viva nao pode cair junto -- os nomes sao parecidos de proposito.
    assert "DROP FUNCTION IF EXISTS public.trg_eventos_aluno_after_iud" not in sql


def test_a_migracao_confere_que_os_gatilhos_continuam_apontados() -> None:
    """Dropar a funcao errada, ou dropar a certa e perder um gatilho, sao os dois
    jeitos de esta migracao quebrar o sistema de conquistas em silencio."""
    sql = _sql()

    assert "esperava 3 gatilhos em trg_eventos_aluno_after_iud, achei " in sql
    assert "trg_eventos_aluno_after_ins continua existindo" in sql


def test_a_migracao_confere_o_que_o_search_path_pode_quebrar() -> None:
    """`SET search_path` impede inlining, e a resolucao de classe roda em todo
    INSERT de evento desde a 20260910_07: se ela parar de resolver, o rank para
    de contar."""
    sql = _sql()

    assert "fn_eventos_aluno_resolve_classe_id('conteudo_concluido', 'conteudo:174')" in sql
    assert "fn_eventos_aluno_referencia_id('conteudo:174') <> 174" in sql
    assert "funcao com search_path ainda mutavel: " in sql


def test_o_downgrade_devolve_o_search_path_mas_nao_o_corpo_morto() -> None:
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260910_08:20260910_07", sql=True
    )
    rendered = output.getvalue()

    assert "RESET search_path" in rendered
    # Recriar 11.929 bytes de logica abandonada seria pior que nao ter downgrade.
    assert "trg_eventos_aluno_after_ins" not in rendered


def test_o_sql_nao_carrega_porcentagem() -> None:
    assert "%" not in _sql()
