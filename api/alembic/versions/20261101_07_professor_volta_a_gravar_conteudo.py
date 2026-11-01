"""Professor volta a gravar conteúdo, mídia, questão e card pelo console

A `20261024_07` criou `trailup_caminho_arquivo(text)` e tirou o EXECUTE de `authenticated`. A
`20261024_10` usou a função em índices de expressão (`ix_conteudos_caminho_arquivo`,
`ix_midias_…`, `ix_questoes_…`, `ix_cards_…`). O Postgres calcula a expressão do índice com o papel
de quem escreve, então todo INSERT do professor nessas quatro tabelas (e todo UPDATE que regrava o
índice) passou a falhar com `permission denied for function trailup_caminho_arquivo` — 403 no
console, "Não foi possível criar o conteúdo". A API não via, porque escreve como `service_role`.

A função é pura (IMMUTABLE, sem SECURITY DEFINER, não lê tabela): só extrai o caminho de um texto.
Executá-la não dá acesso a dado nenhum, então o EXECUTE volta para `authenticated`. `anon` continua
sem, porque não escreve nessas tabelas.

Revision ID: 20261101_07
Revises: 20261101_06
Create Date: 2026-11-01
"""

from alembic import op

revision = "20261101_07"
down_revision = "20261101_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("GRANT EXECUTE ON FUNCTION public.trailup_caminho_arquivo(text) TO authenticated")


def downgrade() -> None:
    op.execute("REVOKE EXECUTE ON FUNCTION public.trailup_caminho_arquivo(text) FROM authenticated")
