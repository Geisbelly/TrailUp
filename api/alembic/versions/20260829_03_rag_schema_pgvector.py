"""habilita pgvector e cria schema de RAG

Cria as tres tabelas da camada de evidencias do RAG:

- `rag_chunks`: chunks enriquecidos com embedding vector(1536) e metadados.
- `rag_relacoes`: relacionamentos semanticos/pedagogicos entre chunks.
- `intervencoes`: intervencoes psicopedagogicas sugeridas pela IA.

Inclui trigger de `updated_at` para `rag_chunks` e RLS para que alunos e
professores vejam apenas o que
tem permissao; a API (camada de IA) escreve como service_role. As colunas
que referenciam tabelas mestras (`classe`, `topicos`, `conteudos`,
`fontes_personalizacao`, `alunos`) sao mantidas nullable e sem FK, porque
essas tabelas pertencem ao servico web/mobile e nao sao garantidas pelo
schema da API.

Vector store: Postgres + pgvector, conforme ADR-0001.

Revision ID: 20260829_03
Revises: 20260829_02
Create Date: 2026-08-29
"""

from alembic import op

revision = "20260829_03"
down_revision = "20260829_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Extensao pgvector
    # ------------------------------------------------------------------
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ------------------------------------------------------------------
    # 2. rag_chunks
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS rag_chunks (
          id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
          fonte_id      bigint        NULL,
          classe_id     bigint        NULL,
          topico_id     bigint        NULL,
          conteudo_id   bigint        NULL,
          aluno_id      uuid          NULL,
          scope         text          NOT NULL
            CHECK (scope IN ('publico', 'turma', 'aluno')),
          texto         text          NOT NULL,
          embedding     vector(1536)  NULL,
          metadata      jsonb         NOT NULL DEFAULT '{}'::jsonb,
          source_hash   text          NULL,
          created_at    timestamptz   NOT NULL DEFAULT now(),
          updated_at    timestamptz   NOT NULL DEFAULT now(),
          CONSTRAINT chk_rag_chunks_scope_turma_tem_classe
            CHECK (scope <> 'turma' OR classe_id IS NOT NULL),
          CONSTRAINT chk_rag_chunks_scope_aluno_tem_aluno
            CHECK (scope <> 'aluno' OR aluno_id IS NOT NULL)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding_hnsw
          ON rag_chunks USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64)
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_rag_chunks_fonte_id ON rag_chunks (fonte_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_rag_chunks_classe_id ON rag_chunks (classe_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_rag_chunks_topico_id ON rag_chunks (topico_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_rag_chunks_conteudo_id ON rag_chunks (conteudo_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_rag_chunks_aluno_id ON rag_chunks (aluno_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_rag_chunks_scope ON rag_chunks (scope)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_rag_chunks_source_hash ON rag_chunks (source_hash)")

    # ------------------------------------------------------------------
    # 3. rag_relacoes
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS rag_relacoes (
          origem_id   uuid  NOT NULL REFERENCES rag_chunks(id) ON DELETE CASCADE,
          destino_id  uuid  NOT NULL REFERENCES rag_chunks(id) ON DELETE CASCADE,
          tipo        text  NOT NULL
            CHECK (tipo IN ('prereq', 'sucessor', 'similar')),
          PRIMARY KEY (origem_id, destino_id, tipo)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_rag_relacoes_destino ON rag_relacoes (destino_id)")

    # ------------------------------------------------------------------
    # 4. intervencoes
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS intervencoes (
          id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
          aluno_id    uuid          NOT NULL,
          tipo        text          NOT NULL
            CHECK (tipo IN ('pedagogica', 'emocional', 'engajamento', 'notificacao')),
          motivo      text          NULL,
          contexto    jsonb         NOT NULL DEFAULT '{}'::jsonb,
          acao        text          NULL,
          status      text          NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'applied', 'dismissed')),
          created_at  timestamptz   NOT NULL DEFAULT now(),
          resolved_at timestamptz   NULL
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_intervencoes_aluno_id ON intervencoes (aluno_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_intervencoes_status ON intervencoes (status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_intervencoes_created_at ON intervencoes (created_at)")

    # ------------------------------------------------------------------
    # 5. Trigger de updated_at para rag_chunks
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_rag_chunks_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute("DROP TRIGGER IF EXISTS trg_rag_chunks_updated_at ON rag_chunks")
    op.execute(
        """
        CREATE TRIGGER trg_rag_chunks_updated_at
          BEFORE INSERT OR UPDATE ON rag_chunks
          FOR EACH ROW
          EXECUTE FUNCTION set_rag_chunks_updated_at()
        """
    )

    # ------------------------------------------------------------------
    # 6. RLS
    # ------------------------------------------------------------------
    # Leitura de chunks: publico para todos; turma para quem esta na classe;
    # aluno so para o proprio aluno. Escrita fica com a API (service_role).
    op.execute("ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS rag_chunks_sel ON rag_chunks")
    op.execute(
        """
        CREATE POLICY rag_chunks_sel ON rag_chunks
          FOR SELECT TO authenticated
          USING (
            scope = 'publico'
            OR (scope = 'turma' AND classe_id IN (SELECT public.app_minhas_classes()))
            OR (scope = 'aluno' AND aluno_id = auth.uid())
          )
        """
    )

    # Relacoes sao legiveis apenas se o usuario pode ler AMBOS os chunks.
    op.execute("ALTER TABLE rag_relacoes ENABLE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS rag_relacoes_sel ON rag_relacoes")
    op.execute(
        r"""
        CREATE POLICY rag_relacoes_sel ON rag_relacoes
          FOR SELECT TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM rag_chunks c
               WHERE c.id = rag_relacoes.origem_id
                 AND (
                   c.scope = 'publico'
                   OR (c.scope = 'turma' AND c.classe_id IN (SELECT public.app_minhas_classes()))
                   OR (c.scope = 'aluno' AND c.aluno_id = auth.uid())
                 )
            )
            AND EXISTS (
              SELECT 1 FROM rag_chunks c
               WHERE c.id = rag_relacoes.destino_id
                 AND (
                   c.scope = 'publico'
                   OR (c.scope = 'turma' AND c.classe_id IN (SELECT public.app_minhas_classes()))
                   OR (c.scope = 'aluno' AND c.aluno_id = auth.uid())
                 )
            )
          )
        """
    )

    # Intervencoes: aluno ve as proprias; professor ve seus alunos.
    op.execute("ALTER TABLE intervencoes ENABLE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS intervencoes_sel ON intervencoes")
    op.execute(
        """
        CREATE POLICY intervencoes_sel ON intervencoes
          FOR SELECT TO authenticated
          USING (
            aluno_id = auth.uid()
            OR aluno_id IN (SELECT public.app_alunos_do_professor())
          )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS intervencoes_sel ON intervencoes")
    op.execute("DROP POLICY IF EXISTS rag_relacoes_sel ON rag_relacoes")
    op.execute("DROP POLICY IF EXISTS rag_chunks_sel ON rag_chunks")

    op.execute("DROP TRIGGER IF EXISTS trg_rag_chunks_updated_at ON rag_chunks")
    op.execute("DROP FUNCTION IF EXISTS set_rag_chunks_updated_at()")

    op.execute("DROP INDEX IF EXISTS idx_intervencoes_created_at")
    op.execute("DROP INDEX IF EXISTS idx_intervencoes_status")
    op.execute("DROP INDEX IF EXISTS idx_intervencoes_aluno_id")
    op.execute("DROP TABLE IF EXISTS intervencoes")

    op.execute("DROP INDEX IF EXISTS idx_rag_relacoes_destino")
    op.execute("DROP TABLE IF EXISTS rag_relacoes")

    op.execute("DROP INDEX IF EXISTS idx_rag_chunks_source_hash")
    op.execute("DROP INDEX IF EXISTS idx_rag_chunks_scope")
    op.execute("DROP INDEX IF EXISTS idx_rag_chunks_aluno_id")
    op.execute("DROP INDEX IF EXISTS idx_rag_chunks_conteudo_id")
    op.execute("DROP INDEX IF EXISTS idx_rag_chunks_topico_id")
    op.execute("DROP INDEX IF EXISTS idx_rag_chunks_classe_id")
    op.execute("DROP INDEX IF EXISTS idx_rag_chunks_fonte_id")
    op.execute("DROP INDEX IF EXISTS idx_rag_chunks_embedding_hnsw")
    op.execute("DROP TABLE IF EXISTS rag_chunks")

    # So remove a extensao se nenhuma outra coluna no banco ainda usar o tipo
    # vector; assim o downgrade nao quebra outros schemas que compartilhem a
    # mesma instancia do Postgres.
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_attribute a
            JOIN pg_type t ON a.atttypid = t.oid
            WHERE t.typname = 'vector'
              AND a.attnum > 0
              AND NOT a.attisdropped
          ) THEN
            EXECUTE 'DROP EXTENSION IF EXISTS vector';
          END IF;
        END $$
        """
    )
