"""`interrupcoes_sessao` marcava 106 de 106 sessoes.

A view contava `explicit_interrupt OR topicos_abertos > topicos_concluidos`.
Medido nesta base:

    sessoes                     106
    com o sinal explicito       105
    pela heuristica             105
    como a view contava         106

Nao e uma metrica, e uma constante -- e uma constante que diz ao professor que
todo aluno se interrompe em toda sessao.

A heuristica e a MESMA premissa que a `20260911_01` derrubou para abandono e
conclusao: `topic_open` e um evento por ABERTURA e `topic_complete` acontece uma
vez na vida do topico, entao comparar as contagens dentro de uma sessao compara
escalas diferentes.

Mas ela nao era a causa -- acrescentava UMA sessao sobre o sinal explicito. A
causa e o sinal explicito disparar em toda saida, e isso foi corrigido no app
(`motivoDeSaidaDaSessao`): sair de um topico CONCLUIDO passa `session_end`.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]


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
        _offline_alembic_config(output), "20260911_09:20260911_10", sql=True
    )
    return output.getvalue()


def _sql_downgrade() -> str:
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260911_10:20260911_09", sql=True
    )
    return output.getvalue()


def test_a_heuristica_sai_e_o_sinal_explicito_fica() -> None:
    sql = _sql()

    assert (
        "count(*) FILTER (WHERE session_interrupts.explicit_interrupt) "
        "AS interrupcoes_sessao" in sql
    )
    assert "a heuristica de topicos abertos continua na contagem" in sql
    assert "a view perdeu o sinal explicito de interrupcao" in sql


def test_a_substituicao_exige_ancora_unica() -> None:
    """Trocar a primeira de varias ocorrencias deixaria a view incoerente sem
    erro nenhum."""
    sql = _sql()

    assert "esperado exatamente 1" in sql


def test_a_view_e_reescrita_a_partir_da_definicao_viva() -> None:
    """E nao com o corpo inteiro copiado para a migracao: a view tem varias
    CTEs, e a copia envelheceria na primeira mudanca alheia."""
    sql = _sql()

    assert "pg_get_viewdef(" in sql
    assert "replace(v_def," in sql


def test_o_security_invoker_e_reposto_depois_do_replace() -> None:
    """**`CREATE OR REPLACE VIEW` NAO preserva `security_invoker`.** Observado
    nesta base: depois do replace, esta era a unica das nove `vw_metricas_*` sem
    a opcao -- ou seja, a unica rodando com os privilegios do dono, com as
    policies das tabelas base sem se aplicar. E o bypass que a 20260826_10
    fechou."""
    sql = _sql()

    assert "SET (security_invoker = on)" in sql
    troca = sql.index("CREATE OR REPLACE VIEW")
    reposicao = sql.index("SET (security_invoker = on)")
    assert troca < reposicao


def test_a_conferencia_guarda_o_security_invoker() -> None:
    """Sem ela o bypass voltaria calado: a view continua devolvendo numero, so'
    que sem respeitar a RLS de quem consulta."""
    sql = _sql()

    assert "'security_invoker=on' = ANY (c.reloptions)" in sql
    assert "a view perdeu security_invoker no CREATE OR REPLACE" in sql


def test_a_conferencia_guarda_a_coluna() -> None:
    """A view alimenta o console; perder a coluna quebraria a leitura la."""
    sql = _sql()

    assert "a coluna interrupcoes_sessao sumiu da view" in sql


def test_o_downgrade_tambem_repoe_o_invoker() -> None:
    """O downgrade faz outro CREATE OR REPLACE, entao derruba a opcao pelo
    mesmo caminho."""
    sql = _sql_downgrade()

    assert "SET (security_invoker = on)" in sql


def test_rodar_de_novo_nao_faz_nada() -> None:
    sql = _sql()

    assert "a heuristica ja saiu da view, nada a fazer" in sql


def test_o_sql_renderizado_esta_limpo() -> None:
    import re

    for sql in (_sql(), _sql_downgrade()):
        assert "%" not in sql
        assert not re.findall(r"(?<!:):[A-Za-z_]\w*", sql)
