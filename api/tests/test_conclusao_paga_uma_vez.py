"""Concluir paga uma vez, e o que foi concluido tem evento.

Medido em producao: 3 conteudos concluidos e 15 eventos `conteudo_concluido`,
com DUAS referencias distintas -- 13 anonimas e uma repetida. Do outro lado, 9
atividades concluidas e so 5 eventos, 7 delas sem evento com a referencia certa.
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
    API_ROOT / "alembic" / "versions" / "20260910_04_conclusao_paga_uma_vez.py"
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
        _offline_alembic_config(output), "20260910_03:20260910_04", sql=True
    )
    return output.getvalue()


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_conclusao", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_rever_nao_entra_no_dedupe() -> None:
    """Concluir e um estado; rever e um ato repetivel por natureza."""
    modulo = _modulo()

    assert "conteudo_concluido" in modulo.TIPOS_DE_CONCLUSAO
    assert "atividade_concluida" in modulo.TIPOS_DE_CONCLUSAO
    assert "atividade_revisada" not in modulo.TIPOS_DE_CONCLUSAO


def test_a_linha_e_gravada_e_a_repeticao_vale_zero() -> None:
    """Um `RETURN NULL` quebraria o cliente: ele faz
    `.insert().select().single()` e uma linha nao inserida estoura com
    "no rows returned"."""
    sql = _sql()

    assert "NEW.valor := 0;" in sql
    assert "RETURN NULL;" not in sql
    assert "IF TG_OP = 'INSERT' AND public.fn_evento_de_conclusao(NEW.tipo) THEN" in sql


def test_o_dedupe_e_gatilho_e_nao_indice_unico() -> None:
    """Indice unico rejeitaria o INSERT com erro na cara do aluno. O gatilho roda
    em todo INSERT, inclusive SQL direto -- mesma garantia, sem quebrar nada."""
    sql = _sql()

    assert "CREATE UNIQUE INDEX" not in sql
    assert "EXISTS (" in sql
    assert "AND e.referencia = NEW.referencia" in sql


def test_conclusao_sem_referencia_nao_paga() -> None:
    """Nenhum rank consegue atribui-la: eram 130 dos 150 pontos de
    `conteudo_concluido`, inflando o razao sem aparecer em lugar nenhum."""
    sql = _sql()

    assert "NULLIF(TRIM(BOTH FROM COALESCE(NEW.referencia, '')), '') IS NULL" in sql
    assert "NULLIF(TRIM(BOTH FROM COALESCE(e.referencia, '')), '') IS NULL" in sql


def test_a_repeticao_antiga_e_zerada_com_desempate_estavel() -> None:
    """Sem `id` no ORDER BY, duas linhas com o mesmo `criado_em` escolheriam a
    sobrevivente ao acaso e o resultado mudaria a cada execucao."""
    sql = _sql()

    assert "PARTITION BY e.aluno_id, e.tipo, e.referencia" in sql
    assert "ORDER BY e.criado_em, e.id" in sql
    assert "AND o.ordem > 1" in sql


def test_nada_e_apagado() -> None:
    """Apagar historico mexeria em `dias_seguidos` e `eventos_totais`, que sao
    metricas de conquista."""
    sql = _sql()

    assert "DELETE FROM public.eventos_aluno" not in sql
    assert "DELETE FROM" not in sql


def test_os_eventos_que_faltavam_saem_da_tabela_de_progresso() -> None:
    """`conteudo_aluno` e `atividade_aluno` sao mantidas por gatilho e tem FK
    viva -- ao contrario da referencia do evento, que se perdeu."""
    sql = _sql()

    assert "FROM public.conteudo_aluno ca" in sql
    assert "FROM public.atividade_aluno aa" in sql
    assert "'conteudo:' || ca.conteudo_id::text" in sql
    assert "'atividade:' || aa.atividade_id::text" in sql
    # O valor sai da tabela de pontuacao, nao de um literal.
    assert "public.fn_pontos_do_evento('conteudo_concluido')" in sql
    assert "public.fn_pontos_do_evento('atividade_concluida')" in sql


def test_o_status_e_comparado_com_starts_with() -> None:
    """`LIKE 'concl' || por-cento` nao cabe: o renderizador dobra o por-cento.
    E os rotulos do enum tem acento -- comparar o prefixo evita escreve-los."""
    sql = _sql()

    assert "starts_with(ca.status::text, 'concl')" in sql
    assert "starts_with(aa.status::text, 'concl')" in sql
    assert "LIKE" not in sql


def test_a_data_vem_do_progresso_sem_conversao_escondida() -> None:
    """`ultima_visualizacao` e `criado_em` sao os dois `timestamp` sem tz."""
    sql = _sql()

    assert "COALESCE(ca.ultima_visualizacao, now()::timestamp)" in sql
    assert "COALESCE(aa.ultima_visualizacao, now()::timestamp)" in sql


def test_a_migracao_aborta_se_sobrar_repeticao_ou_faltar_evento() -> None:
    sql = _sql()

    assert "conclusao repetida ainda pagando: " in sql
    assert "conclusao sem referencia ainda pagando: " in sql
    assert "conteudo concluido sem evento: " in sql
    assert "atividade concluida sem evento: " in sql


def test_o_creditado_continua_com_valor_de_quem_concedeu() -> None:
    """Presenca vem da RPC e o premio de `conquistas.pontos_recompensa`: o
    dedupe de conclusao nao pode passar na frente disso."""
    sql = _sql()

    creditado = sql.index("IF public.fn_evento_creditado(NEW.tipo) THEN")
    conclusao = sql.index("IF TG_OP = 'INSERT' AND public.fn_evento_de_conclusao")
    assert creditado < conclusao


def test_anon_nao_executa_a_funcao_nova() -> None:
    sql = _sql()

    assert "REVOKE ALL ON FUNCTION public.fn_evento_de_conclusao(text) FROM PUBLIC, anon;" in sql
    assert (
        "GRANT EXECUTE ON FUNCTION public.fn_evento_de_conclusao(text) TO authenticated, service_role;"
        in sql
    )


def test_o_sql_nao_carrega_porcentagem() -> None:
    assert "%" not in _sql()
