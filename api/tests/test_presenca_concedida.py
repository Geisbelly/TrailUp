"""Presenca e participacao concedidas pelo professor.

Os quatro bloqueios que esta migracao fecha, e que estes testes guardam:

1. o evento chegaria ao banco e **nao ao rank** -- a view resolvia classe por
   prefixo do tipo, e `presenca_aula` nao casava com nenhum;
2. presenca contaria como uso do app e destravaria conquista de estudo;
3. conceder para a turma inteira dispararia o motor de conquistas por aluno;
4. `eventos_aluno_posse_ins` deixava o aluno inserir qualquer tipo para si --
   presenca viraria auto-servico.
"""

from __future__ import annotations

import importlib.util
from io import StringIO
from pathlib import Path
from types import ModuleType

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = API_ROOT / "alembic" / "versions" / "20260909_03_presenca_concedida.py"


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
        _offline_alembic_config(output), "20260909_02:20260909_03", sql=True
    )
    return output.getvalue()


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_presenca", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_a_view_resolve_pela_forma_da_referencia_e_nao_pelo_tipo() -> None:
    """Bloqueio 1.

    Amarrar a resolucao ao prefixo do tipo obrigaria a mexer na view a cada tipo
    creditado novo -- e esquecer disso descarta o evento em silencio, porque o
    `WHERE ... IS NOT NULL` corta sem erro.
    """
    sql = _sql()

    assert "starts_with(lower(e.referencia_bruta), 'classe:')" in sql
    # O ramo antigo, preso ao tipo, tem que ter saido.
    assert "starts_with(lower(COALESCE(e.tipo, ''::text)), 'conquista')" not in sql

    # Os tres prefixos legitimos continuam: eles resolvem por tabela propria.
    for prefixo in ("topico", "conteudo", "atividade"):
        assert f"starts_with(lower(COALESCE(e.tipo, ''::text)), '{prefixo}')" in sql


def test_evento_creditado_nao_conta_como_uso_do_app() -> None:
    """Bloqueio 2.

    `eventos_totais` destrava "Primeiro Passo" com um unico evento; sem excluir,
    presenca daria a conquista a quem nunca abriu o app. E `dias_seguidos` conta
    dias de plataforma -- estar em aula nao e' usar a plataforma.
    """
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION public.fn_evento_creditado" in sql
    assert "IMMUTABLE" in sql
    assert "NOT public.fn_evento_creditado(tipo)" in sql


def test_conceder_para_a_turma_nao_avalia_conquista() -> None:
    """Bloqueio 3: a guarda de recursao vira guarda de evento creditado."""
    sql = _sql()

    assert "IF public.fn_evento_creditado(v_tipo) THEN" in sql


def test_o_aluno_nao_pode_se_dar_presenca() -> None:
    """Bloqueio 4.

    A policy de INSERT precisa continuar existindo -- o app grava os eventos de
    estudo pelo cliente do proprio aluno. O que muda e o tipo permitido.
    """
    sql = _sql()

    assert (
        "WITH CHECK (aluno_id = auth.uid() AND NOT public.fn_evento_creditado(tipo))"
        in sql
    )


def test_a_rpc_confere_a_posse_da_classe_e_o_tipo() -> None:
    modulo = _modulo()
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION public.registrar_presenca_da_turma" in sql
    assert "SECURITY DEFINER" in sql

    # Sem isto, um professor daria presenca na turma de outro.
    assert "p_classe_id NOT IN (SELECT public.app_classes_do_professor())" in sql

    # Conjunto fechado: `conquista_desbloqueada` e do sistema e nao entra.
    for tipo in modulo.TIPOS_CONCEDIVEIS:
        assert f"'{tipo}'" in sql
    assert "p_tipo NOT IN (" in sql

    # So o professor executa; `anon` perde ate o padrao do Supabase.
    assert "GRANT EXECUTE ON FUNCTION public.registrar_presenca_da_turma" in sql
    assert "FROM PUBLIC, anon" in sql


def test_conceder_duas_vezes_no_mesmo_dia_nao_paga_em_dobro() -> None:
    """Dois cliques do professor sao um caso real de sala de aula."""
    sql = _sql()

    assert "CREATE UNIQUE INDEX IF NOT EXISTS eventos_aluno_creditado_unico" in sql

    # `ON CONFLICT` sobre indice PARCIAL exige repetir o predicado, senao o
    # Postgres nao casa o indice e levanta "no unique or exclusion constraint
    # matching".
    assert "ON CONFLICT (aluno_id, tipo, referencia)" in sql
    assert sql.count("WHERE tipo IN (") >= 2

    # A data entra na referencia para o indice deduplicar por dia, e o
    # `split_part(..., ':', 2)` da view continua achando o id da classe.
    assert "'classe:' || p_classe_id::text || ':' || to_char(v_data, 'YYYY-MM-DD')" in sql


def test_o_premio_da_conquista_passa_a_identificar_a_conquista() -> None:
    """Sem isto o indice unico deixaria o aluno receber uma conquista por classe.

    A referencia vira `classe:<id>:conquista:<conquista_id>` -- o `split_part`
    da view continua devolvendo `<id>`.
    """
    sql = _sql()

    # Aspas dobradas: a substituicao vive dentro de um literal SQL.
    assert "'':conquista:'' || v_conquista.id::text" in sql


def test_o_gatilho_e_alterado_por_substituicao_e_nao_recolado() -> None:
    """Recolar 200 linhas geradas desfaria em silencio ajustes de outra migracao."""
    sql = _sql()

    assert "SELECT p.prosrc INTO v_src" in sql
    assert "Nao encontrei o ponto de insercao" in sql
    # Idempotente: rodar de novo nao reescreve.
    assert "IF position('fn_evento_creditado' in v_src) > 0 THEN" in sql

    # O corpo nao aparece colado aqui.
    assert "FOR v_conquista IN SELECT" not in sql


def test_a_auditoria_registra_quem_concedeu() -> None:
    sql = _sql()

    assert "ADD COLUMN IF NOT EXISTS concedido_por uuid" in sql
    assert "v_professor" in sql


def test_o_sql_nao_carrega_porcentagem() -> None:
    assert "%" not in _sql()
