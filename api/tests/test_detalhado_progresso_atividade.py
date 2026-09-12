"""A view do detalhe passa a trazer o progresso da atividade.

`vw_aluno_classe_detalhado` juntava `topico_aluno` e `conteudo_aluno` e nao
juntava `atividade_aluno`. Medido no aluno de demonstracao: 9 atividades
concluidas no banco, 0 na tela.

O dano nao parava na contagem -- `Classe.updateTopicoProgress` calculava o
percentual do topico a partir dessas atividades, que ele via como todas
pendentes, e gravava por cima de `topico_aluno` depois do trigger. A view era a
origem.
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
        _offline_alembic_config(output), "20260909_03:20260909_04", sql=True
    )
    return output.getvalue()


def test_a_view_passa_a_juntar_atividade_aluno() -> None:
    sql = _sql()

    assert (
        "LEFT JOIN atividade_aluno aa ON aa.atividade_id = a.id AND aa.aluno_id = ta.aluno_id"
        in sql
    )


def test_o_cliente_recebe_o_que_ja_esperava_ler() -> None:
    """O mapeador do app ja lia estes nomes -- a view e que nunca os entregou."""
    sql = _sql()

    for coluna in (
        "aa.status AS atividade_status",
        "aa.percentual_concluido AS atividade_percentual_concluido",
        "aa.tempo_gasto_min AS atividade_tempo_gasto_min",
        "aa.pontuacao_obtida AS atividade_pontuacao_obtida",
        "aa.acertos_percentual AS atividade_acertos_percentual",
    ):
        assert coluna in sql, coluna


def test_as_colunas_novas_entram_no_fim() -> None:
    """`CREATE OR REPLACE VIEW` so' aceita coluna acrescentada no fim.

    Se alguem inserir no meio, o upgrade falha com "cannot change name of view
    column" -- em producao, no deploy.
    """
    sql = _sql()

    ultima_antiga = sql.index("m.ordem AS midia_ordem")
    for coluna in ("atividade_status", "atividade_tempo_gasto_min"):
        assert sql.index(f"AS {coluna}") > ultima_antiga, coluna


def test_a_view_continua_respeitando_o_rls() -> None:
    """Sem `security_invoker` ela roda como dona e ignora o RLS das tabelas base
    -- foi por ai que dava para ler ranking e telemetria sem login."""
    sql = _sql()

    assert (
        "ALTER VIEW public.vw_aluno_classe_detalhado SET (security_invoker = on)" in sql
    )


def test_o_downgrade_derruba_a_view_antes_de_recria_la() -> None:
    """`CREATE OR REPLACE` nao remove coluna: voltar exige `DROP`."""
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260909_04:20260909_03", sql=True
    )
    rendered = output.getvalue()

    assert "DROP VIEW IF EXISTS public.vw_aluno_classe_detalhado" in rendered
    assert "atividade_status" not in rendered


def test_o_sql_nao_carrega_porcentagem() -> None:
    assert "%" not in _sql()
