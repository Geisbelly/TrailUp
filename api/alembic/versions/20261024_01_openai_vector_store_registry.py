"""registra arquivos do RAG hospedados no OpenAI Vector Store

O conteúdo indexado, o chunking e os embeddings passam a ser gerenciados pela
OpenAI. Esta tabela mantém somente a referência operacional local, o escopo
autorizado e o hash usado para deduplicação/reindexação.

Revision ID: 20261024_01
Revises: 20261022_05
Create Date: 2026-10-24
"""

from alembic import op

revision = "20261024_01"
down_revision = "20261022_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS rag_openai_files (
          id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          fonte_id                   bigint NULL,
          vector_store_id            text NOT NULL,
          openai_file_id             text NOT NULL,
          openai_vector_store_file_id text NULL,
          scope                      text NOT NULL
            CHECK (scope IN ('publico', 'turma', 'aluno')),
          classe_id                  bigint NULL,
          aluno_id                   uuid NULL,
          source_hash                text NOT NULL,
          attributes                 jsonb NOT NULL DEFAULT '{}'::jsonb,
          status                     text NOT NULL DEFAULT 'in_progress'
            CHECK (status IN ('in_progress', 'completed', 'failed', 'cancelled')),
          last_error                 text NULL,
          created_at                 timestamptz NOT NULL DEFAULT now(),
          updated_at                 timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT chk_rag_openai_scope_turma_tem_classe
            CHECK (scope <> 'turma' OR classe_id IS NOT NULL),
          CONSTRAINT chk_rag_openai_scope_aluno_tem_aluno
            CHECK (scope <> 'aluno' OR aluno_id IS NOT NULL),
          CONSTRAINT uq_rag_openai_files_store_file
            UNIQUE (vector_store_id, openai_file_id)
        )
        """
    )
    # Registro so' do backend (conexao direta/service role). RLS ligada sem
    # policy fecha a tabela para anon/authenticated via PostgREST, como as
    # demais tabelas novas da main.
    op.execute("ALTER TABLE rag_openai_files ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_rag_openai_files_fonte_id "
        "ON rag_openai_files (fonte_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_rag_openai_files_scope "
        "ON rag_openai_files (scope, classe_id, aluno_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_rag_openai_files_source_hash "
        "ON rag_openai_files (source_hash)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_rag_openai_files_source_hash")
    op.execute("DROP INDEX IF EXISTS idx_rag_openai_files_scope")
    op.execute("DROP INDEX IF EXISTS idx_rag_openai_files_fonte_id")
    op.execute("DROP TABLE IF EXISTS rag_openai_files")
