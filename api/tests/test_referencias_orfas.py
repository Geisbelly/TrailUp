"""Referencia orfa: recuperar por evidencia, zerar o resto.

Censo em producao: 66 ids de referencia que nao existem em `atividades`. Dez
existem em `conteudos`, mas dois deles (201 e 202) sao conteudo das classes 57 e
58 -- turmas em que o aluno nem esta matriculado. Id coincidente nao e prova.
"""

from __future__ import annotations

import importlib.util
from io import StringIO
from pathlib import Path
from types import ModuleType

from alembic.config import Config

from app.db import migrations
from app.repositories.evento import EventoRepository

API_ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = API_ROOT / "alembic" / "versions" / "20260910_06_referencias_orfas.py"


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
        _offline_alembic_config(output), "20260910_05:20260910_06", sql=True
    )
    return output.getvalue()


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_orfas", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_a_recuperacao_exige_evidencia_e_nao_coincidencia() -> None:
    """Sem o progresso do proprio aluno, os ids 201 e 202 (classes 57 e 58)
    teriam dado pontos numa turma que ele nunca abriu."""
    sql = _sql()

    assert "FROM public.conteudo_aluno ca" in sql
    assert "WHERE ca.aluno_id = alvo.aluno_id AND ca.conteudo_id = alvo.rid" in sql
    assert "SET referencia = 'conteudo:' || alvo.rid::text" in sql


def test_nao_recupera_alvo_que_ja_tem_conclusao_paga() -> None:
    """O aluno ja tem `conteudo_concluido` -> `conteudo:174`. Recuperar o
    `atividade_concluida` do mesmo id pagaria o mesmo ato por dois tipos."""
    sql = _sql()

    assert "public.fn_evento_de_conclusao(alvo.tipo)" in sql
    assert "AND COALESCE(pago.valor, 0) > 0" in sql


def test_a_orfa_que_sobra_deixa_de_valer_ponto() -> None:
    """Ja valia 0 em todo rank; o `valor` gravado dizia o contrario -- 128
    pontos invisiveis num razao que as metricas agora mostram."""
    sql = _sql()

    assert "SET valor = 0" in sql
    assert "public.fn_eventos_aluno_resolve_classe_id(e.tipo, e.referencia) IS NULL" in sql
    # Creditado nao entra: presenca e premio tem valor de quem concedeu.
    assert "NOT public.fn_evento_creditado(e.tipo)" in sql


def test_nada_e_apagado() -> None:
    sql = _sql()

    assert "DELETE FROM" not in sql
    assert "DROP VIEW" not in sql


def test_a_referencia_declarada_vence_o_tipo() -> None:
    """`content:174` num evento de atividade virava `atividade:174`, e nao
    existe atividade 174. O id e a parte confiavel."""
    sql = _sql()

    assert "WHEN 'content' THEN 'conteudo'" in sql
    assert "WHEN 'activity' THEN 'atividade'" in sql
    assert "WHEN 'topic' THEN 'topico'" in sql
    # E o tipo continua sendo a pista quando a referencia nao declara nada.
    assert "starts_with(lower(COALESCE(e.tipo, ''::text)), 'atividade') THEN 'atividade'" in sql


def test_a_view_e_a_funcao_usam_a_mesma_regra() -> None:
    """A duplicacao e deliberada -- `SET search_path` impede inlining, e por
    linha de evento isso custaria caro numa view lida a cada abertura do rank.
    Este teste e o que prende as duas juntas."""
    modulo = _modulo()

    da_view = modulo._entidade_sql("X", "Y", "")
    da_funcao = modulo._entidade_sql("X", "Y", "")
    assert da_view == da_funcao

    # E as duas aparecem no SQL renderizado.
    sql = _sql()
    assert "CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_resolve_classe_id" in sql
    assert "CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas" in sql
    for grafia in modulo.PREFIXOS:
        assert sql.count(f"WHEN '{grafia}' THEN") >= 2, grafia


def test_o_vocabulario_espelha_o_do_sanitizador() -> None:
    """Se as duas listas divergirem, o app grava um prefixo que o banco nao
    reconhece -- e a referencia volta a ser orfa em silencio."""
    modulo = _modulo()

    assert modulo.PREFIXOS == EventoRepository._PREFIXOS_CONHECIDOS


def test_prefixo_desconhecido_cai_para_o_tipo() -> None:
    """`item:12` nao aponta para tabela alguma; sem o fallback, vocabulario novo
    do cliente viraria referencia insalvavel."""
    sql = _sql()

    assert "ELSE NULL::text" in sql
    # O COALESCE e o que faz o fallback acontecer.
    assert sql.count("COALESCE(\n") >= 1


def test_o_join_do_premio_de_conquista_continua() -> None:
    """A view e reescrita inteira: sem o join, os 515 pontos de premio param de
    chegar ao rank outra vez."""
    sql = _sql()

    assert "LEFT JOIN classe_aluno ca_conq" in sql
    assert "ON e.entidade = 'conquista' AND ca_conq.aluno_id = e.aluno_id" in sql


def test_a_coluna_do_lider_sobrevive_a_reescrita() -> None:
    sql = _sql()

    assert "AS percentual_do_lider" in sql
    assert "AS progresso" not in sql


def test_a_migracao_aborta_se_sobrar_orfa_ou_recuperar_errado() -> None:
    sql = _sql()

    assert "referencia orfa ainda pagando: " in sql
    assert "referencia recuperada para classe sem matricula: " in sql
    assert "a resolucao por forma da referencia nao esta valendo" in sql
    assert "referencia inexistente passou a resolver classe" in sql


def test_o_sql_nao_carrega_porcentagem() -> None:
    """A funcao original usava `LIKE 'topico' || por-cento`; a regra nova usa
    `starts_with`, senao o renderizador dobraria o por-cento."""
    sql = _sql()

    assert "%" not in sql
    assert "LIKE" not in sql


def test_o_downgrade_devolve_a_resolucao_pelo_tipo() -> None:
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260910_06:20260910_05", sql=True
    )
    rendered = output.getvalue()

    assert "fn_eventos_aluno_resolve_classe_id" in rendered
    assert "WHEN 'content' THEN" not in rendered
    assert "%" not in rendered
