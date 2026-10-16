"""Indice duplicado sai; o que sustenta a unicidade fica.

Nas tabelas de progresso havia ate QUATRO indices sobre as mesmas colunas,
porque a UNIQUE CONSTRAINT cobre as mesmas colunas de um indice comum e o
linter nao compara os dois tipos. Essas tabelas sao reescritas por trigger a
cada evento de progresso, entao indice redundante ali e custo de escrita no
caminho mais quente do app.

O que estes testes protegem:

1. **O indice que sustenta a unicidade nao pode cair.** Dropar
   `atividade_aluno_aluno_id_atividade_id_key` & cia. tiraria a garantia de
   uma linha por (aluno, item) -- o progresso passaria a duplicar -- e
   quebraria todo `ON CONFLICT` sobre essas colunas.
2. **`expo_tokens_token_uidx` fica.** E o indice que o `ON CONFLICT (token)`
   de `20260826_07` resolve; sem ele a conciliacao de push quebra.
3. **O downgrade recria com as MESMAS colunas.** Recriar
   `idx_topico_edges_from` apontando para outra coluna seria pior que nao
   recriar.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]

DEVEM_CAIR = (
    "idx_atividade_aluno_lookup",
    "idx_atividade_aluno_user_act",
    "idx_atividade_aluno_user_activity",
    "idx_conteudo_aluno_lookup",
    "idx_conteudo_aluno_user_cont",
    "idx_conteudo_aluno_user_content",
    "idx_topico_aluno_lookup",
    "idx_topico_aluno_user_topic",
    "idx_classe_aluno_user_class",
    "idx_classe_perfil_summary_classe",
    "idx_checkpoints_thread",
    "topico_edges_classe_id_idx",
    "topico_edges_from_id_idx",
    "topico_edges_to_id_idx",
)

# Indices unicos que passam a atender sozinhos as buscas. Nenhum pode ser
# tocado: eles sao a garantia de unicidade e o alvo dos ON CONFLICT.
INTOCAVEIS = (
    "atividade_aluno_aluno_id_atividade_id_key",
    "conteudo_aluno_aluno_id_conteudo_id_key",
    "topico_aluno_aluno_id_topico_id_key",
    "ux_classe_aluno",
    "uq_classe_perfil_summary_classe",
    "checkpoints_thread_id_idx",
    "expo_tokens_token_uidx",
    "expo_tokens_aluno_id_token_key",
)

COLUNAS = {
    "idx_atividade_aluno_lookup": "(aluno_id, atividade_id)",
    "idx_conteudo_aluno_user_content": "(aluno_id, conteudo_id)",
    "idx_topico_aluno_user_topic": "(aluno_id, topico_id)",
    "idx_classe_aluno_user_class": "(aluno_id, classe_id)",
    "idx_checkpoints_thread": "(thread_id)",
    "topico_edges_from_id_idx": "(from_id)",
    "topico_edges_to_id_idx": "(to_id)",
    "topico_edges_classe_id_idx": "(classe_id)",
}


def _render(intervalo: str, *, downgrade: bool = False) -> str:
    output = StringIO()
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(config, intervalo, sql=True)
    return output.getvalue()


def test_derruba_todos_os_duplicados() -> None:
    sql = _render("20261003_05:20261003_06")
    for nome in DEVEM_CAIR:
        assert f"DROP INDEX IF EXISTS public.{nome}" in sql, f"{nome} ficaria"


def test_nao_toca_no_que_sustenta_unicidade() -> None:
    sql = _render("20261003_05:20261003_06")
    for nome in INTOCAVEIS:
        assert f"DROP INDEX IF EXISTS public.{nome}" not in sql, (
            f"{nome} e a garantia de unicidade / alvo de ON CONFLICT"
        )
        assert f"DROP CONSTRAINT IF EXISTS {nome}" not in sql, nome


def test_so_a_constraint_com_nome_errado_do_expo_tokens_cai() -> None:
    sql = _render("20261003_05:20261003_06")
    assert "DROP CONSTRAINT IF EXISTS expo_tokens_user_id_token_key" in sql
    assert "expo_tokens_aluno_id_token_key" not in sql, (
        "a que descreve a coluna de verdade tem de ficar"
    )


def test_downgrade_recria_com_as_mesmas_colunas() -> None:
    sql = _render("20261003_06:20261003_05", downgrade=True)
    for nome in DEVEM_CAIR:
        assert f"CREATE INDEX IF NOT EXISTS {nome}" in sql, f"{nome} nao volta"
    for nome, colunas in COLUNAS.items():
        linha = next(cand for cand in sql.splitlines() if f"INDEX IF NOT EXISTS {nome} " in cand)
        assert colunas in linha, f"{nome} voltaria com colunas erradas: {linha}"
    assert "ADD CONSTRAINT expo_tokens_user_id_token_key UNIQUE (aluno_id, token)" in sql
