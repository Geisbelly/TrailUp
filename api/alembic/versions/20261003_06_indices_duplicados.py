"""Indice duplicado nas tabelas de progresso

O linter do Supabase aponta 8 grupos de indices identicos. Olhando de perto, o
problema e maior do que ele diz: nas tabelas de progresso existe uma UNIQUE
CONSTRAINT sobre exatamente as mesmas colunas, e o linter nao compara indice
comum com indice de constraint. Entao `atividade_aluno` nao tinha 3 indices
iguais -- tinha **quatro**:

    atividade_aluno_aluno_id_atividade_id_key  (aluno_id, atividade_id) UNIQUE
    idx_atividade_aluno_lookup                 (aluno_id, atividade_id)
    idx_atividade_aluno_user_act               (aluno_id, atividade_id)
    idx_atividade_aluno_user_activity          (aluno_id, atividade_id)

Um btree unico atende a mesma busca que o nao-unico: para `WHERE aluno_id = ?
AND atividade_id = ?` os quatro sao intercambiaveis. Os tres nao-unicos sao
puro custo de escrita. O mesmo vale para `conteudo_aluno` (4 -> 1),
`topico_aluno` (3 -> 1), `classe_aluno` e `classe_perfil_summary` (2 -> 1).

E isto importa justamente nessas tabelas: elas sao reescritas por trigger a
cada evento de progresso (`trailup_recalcular_topico_aluno`,
`trailup_progresso_after_item`), ou seja, no caminho mais quente do app.

**Honestidade sobre o ganho: nao ha lentidao medida hoje.** Conferi as
contagens no banco de producao -- `atividade_aluno`, `topico_aluno`,
`conteudo_aluno` e `topico_edges` estao com **0 linhas**, `classe_aluno` com 2.
Com tabela vazia, indice duplicado nao custa nada mensuravel. O ganho e
futuro, e e exatamente por isso que a hora de fazer e agora: `DROP INDEX` em
tabela vazia e instantaneo e sem risco, enquanto manter os duplicados faria
cada escrita pagar por quatro indices iguais desde a primeira turma real.

Pelo mesmo motivo, **nao** mexo no que o linter chama de `unused_index` (41):
"sem uso" num banco sem trafego nao quer dizer inutil, e dropar com base
nisso apagaria indice legitimo.

Conferido ao vivo, em transacao revertida: depois dos drops, a busca por
`(aluno_id, classe_id)` em `classe_aluno` -- a unica dessas tabelas com linhas
de verdade -- segue indexada, agora pelo indice unico:

    Index Scan using ux_classe_aluno on classe_aluno
      Index Cond: ((aluno_id = ...) AND (classe_id = 56))

e o plano de `atividade_aluno` fica identico antes e depois.

Nenhum dos nomes removidos esta em `ON CONFLICT`: o unico `ON CONFLICT` sobre
`expo_tokens` e por coluna (`ON CONFLICT (token)`, em `20260826_07`), que
resolve para `expo_tokens_token_uidx` e nao e tocado aqui. Nao existe
`ON CONFLICT ON CONSTRAINT` em nenhum lugar do repo -- conferido.

`expo_tokens` tinha DUAS unique constraints sobre `(aluno_id, token)`:
`expo_tokens_aluno_id_token_key` e `expo_tokens_user_id_token_key`. A segunda
tem `user_id` no nome e indexa `aluno_id` -- sobra de renomeacao de coluna.
Fica a que descreve a realidade.

Todos esses nomes, menos `idx_checkpoints_thread`, vieram de schema nao
versionado. Em `checkpoints` o duplicado e o NOSSO
(`idx_checkpoints_thread`, 0 scans): o indice que trabalha e o
`checkpoints_thread_id_idx`, criado pelo proprio LangGraph, com 399 linhas na
tabela e scans de verdade. Entao e o nosso que sai.

Revision ID: 20261003_06
Revises: 20261003_05
Create Date: 2026-10-06
"""

from alembic import op

revision = "20261003_06"
down_revision = "20261003_05"
branch_labels = None
depends_on = None

# indice -> definicao, para o downgrade recriar identico ao que havia.
INDICES = {
    "idx_atividade_aluno_lookup": "public.atividade_aluno (aluno_id, atividade_id)",
    "idx_atividade_aluno_user_act": "public.atividade_aluno (aluno_id, atividade_id)",
    "idx_atividade_aluno_user_activity": "public.atividade_aluno (aluno_id, atividade_id)",
    "idx_conteudo_aluno_lookup": "public.conteudo_aluno (aluno_id, conteudo_id)",
    "idx_conteudo_aluno_user_cont": "public.conteudo_aluno (aluno_id, conteudo_id)",
    "idx_conteudo_aluno_user_content": "public.conteudo_aluno (aluno_id, conteudo_id)",
    "idx_topico_aluno_lookup": "public.topico_aluno (aluno_id, topico_id)",
    "idx_topico_aluno_user_topic": "public.topico_aluno (aluno_id, topico_id)",
    "idx_classe_aluno_user_class": "public.classe_aluno (aluno_id, classe_id)",
    "idx_classe_perfil_summary_classe": "public.classe_perfil_summary (classe_id)",
    "idx_checkpoints_thread": "public.checkpoints (thread_id)",
    "topico_edges_classe_id_idx": "public.topico_edges (classe_id)",
    "topico_edges_from_id_idx": "public.topico_edges (from_id)",
    "topico_edges_to_id_idx": "public.topico_edges (to_id)",
}

CONSTRAINT_DUPLICADA = ("expo_tokens", "expo_tokens_user_id_token_key")


def upgrade() -> None:
    for nome in INDICES:
        op.execute(f"DROP INDEX IF EXISTS public.{nome}")
    tabela, constraint = CONSTRAINT_DUPLICADA
    op.execute(f"ALTER TABLE public.{tabela} DROP CONSTRAINT IF EXISTS {constraint}")


def downgrade() -> None:
    for nome, alvo in INDICES.items():
        op.execute(f"CREATE INDEX IF NOT EXISTS {nome} ON {alvo}")
    tabela, constraint = CONSTRAINT_DUPLICADA
    op.execute(
        f"ALTER TABLE public.{tabela} ADD CONSTRAINT {constraint} UNIQUE (aluno_id, token)"
    )
