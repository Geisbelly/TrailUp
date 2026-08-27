"""create trilha_checkpoint_navegacao

Onde o aluno parou dentro de um topico. A tabela aparece na documentacao do
schema (docs/frontend/estrutura-banco-supabase.md, inclusive a trigger de
`updated_at`), mas nenhuma migracao a criava -- ela nasceu fora do Alembic, como
`personalizacao_item_progresso`. Reconstruida aqui a partir do unico consumidor,
`mobile/src/utils/trilhaCheckpoint.ts` (tipo `TrilhaCheckpointRow`).

Por que isso importa: `loadTrilhaCheckpoint` engole qualquer falha com
`console.warn` + `return null`, e `saveTrilhaCheckpoint` faz o mesmo. Num
ambiente sem a tabela, o app nao acusa erro -- so sempre abre o topico do
inicio. Foi exatamente o sintoma relatado em 2026-08-26.

A UNIQUE em (aluno_id, classe_id, topico_id, scope_id) nao e enfeite: o cliente
grava com `upsert(..., { onConflict: 'aluno_id,classe_id,topico_id,scope_id' })`,
e o Postgres exige um indice unico exatamente nessas colunas para resolver o
ON CONFLICT. Sem ele o upsert falha -- em silencio, pelo mesmo motivo acima.

O app escreve DIRETO nesta tabela (client Supabase, nao via API), entao ela
tambem precisa de RLS: docs/mobile/sql/20260826_01_rls_trilha_checkpoint_navegacao.sql.
Incluindo DELETE, que as politicas de `personalizacao_item_progresso` nao tem --
aqui `clearTrilhaCheckpoint` apaga a linha quando o topico conclui.

Revision ID: 20260826_01
Revises: 20260825_01
Create Date: 2026-08-26
"""

import sqlalchemy as sa

from alembic import op

revision = "20260826_01"
down_revision = "20260825_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS trilha_checkpoint_navegacao (
              id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
              aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
              classe_id BIGINT NOT NULL,
              topico_id BIGINT NOT NULL,
              scope_id TEXT NOT NULL DEFAULT 'default',
              mostrar_resumo BOOLEAN NOT NULL DEFAULT TRUE,
              block_kind TEXT,
              -- block_id aceita NEGATIVO de proposito: o material personalizado
              -- usa id negativo estavel (normalizePersonalizedStepContent no
              -- mobile). Um CHECK (block_id > 0) aqui quebraria a retomada
              -- justamente nos passos personalizados.
              block_id BIGINT,
              question_index INTEGER,
              step_index INTEGER,
              -- O cliente exige `updated_at` para aceitar a linha
              -- (normalizeCheckpoint devolve null sem ele, o que reabre o topico
              -- no inicio). DEFAULT + trigger garantem que nunca venha vazio.
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT uq_trilha_checkpoint_navegacao_alvo
                UNIQUE (aluno_id, classe_id, topico_id, scope_id),
              CONSTRAINT trilha_checkpoint_navegacao_block_kind_check
                CHECK (block_kind IS NULL OR block_kind IN ('conteudo', 'atividade')),
              CONSTRAINT trilha_checkpoint_navegacao_indices_check
                CHECK (
                  (question_index IS NULL OR question_index >= 0)
                  AND (step_index IS NULL OR step_index >= 0)
                )
            )
            """
        )
    )

    # Leitura quente do app: uma linha por (aluno, classe, topico, scope). A
    # UNIQUE ja cobre essa busca; este indice serve a limpeza por matricula
    # (trg_limpar_dados_aluno_classe opera por aluno + classe).
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS idx_trilha_checkpoint_navegacao_aluno_classe "
            "ON trilha_checkpoint_navegacao (aluno_id, classe_id)"
        )
    )

    op.execute(
        sa.text(
            """
            CREATE OR REPLACE FUNCTION set_trilha_checkpoint_navegacao_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
              NEW.updated_at = NOW();
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
            """
        )
    )
    op.execute(
        sa.text(
            "DROP TRIGGER IF EXISTS trg_trilha_checkpoint_navegacao_updated_at "
            "ON trilha_checkpoint_navegacao"
        )
    )
    op.execute(
        sa.text(
            """
            CREATE TRIGGER trg_trilha_checkpoint_navegacao_updated_at
              BEFORE INSERT OR UPDATE ON trilha_checkpoint_navegacao
              FOR EACH ROW
              EXECUTE FUNCTION set_trilha_checkpoint_navegacao_updated_at()
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DROP TRIGGER IF EXISTS trg_trilha_checkpoint_navegacao_updated_at "
            "ON trilha_checkpoint_navegacao"
        )
    )
    op.execute(
        sa.text("DROP FUNCTION IF EXISTS set_trilha_checkpoint_navegacao_updated_at()")
    )
    op.execute(sa.text("DROP TABLE IF EXISTS trilha_checkpoint_navegacao"))
