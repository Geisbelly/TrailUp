"""sugestao de material por aluno: estado atual + log append-only

Duas tabelas, porque as perguntas sao diferentes: o app le o ESTADO ATUAL
(1 linha por aluno/topico/conteudo, leitura quente) e a metrica de efetividade
precisa do HISTORICO COMPLETO, sem UPDATE por cima. Guardar historico dentro da
mesma linha (array que cresce) inviabilizaria as duas coisas ao mesmo tempo.

`evidencia` e snapshot, nao referencia: a telemetria continua mudando depois, e
uma decisao precisa ser auditavel com os numeros que ela realmente viu.

Ver docs/superpowers/specs/2026-08-25-sugestao-de-material-por-aluno-design.md.

Revision ID: 20260825_01
Revises: 20260821_01
Create Date: 2026-08-25
"""

from alembic import op

revision = "20260825_01"
down_revision = "20260821_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS personalizacao_sugestao (
          id               bigserial PRIMARY KEY,
          aluno_id         uuid        NOT NULL,
          classe_id        bigint      NULL,
          topico_id        bigint      NOT NULL,
          conteudo_id      bigint      NULL,
          formato_inicial  text        NULL,
          ordem            jsonb       NOT NULL DEFAULT '[]'::jsonb,
          versao           integer     NOT NULL DEFAULT 1,
          origem           text        NOT NULL DEFAULT 'inicial',
          evidencia        jsonb       NOT NULL DEFAULT '{}'::jsonb,
          criado_em        timestamptz NOT NULL DEFAULT now(),
          atualizado_em    timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT personalizacao_sugestao_origem_check
            CHECK (origem IN ('inicial', 'revisao'))
        )
        """
    )

    # conteudo_id e NULL quando a sugestao vale pro topico inteiro; COALESCE no
    # indice unico porque NULL nao colide com NULL em UNIQUE comum - sem isso
    # daria pra criar sugestao duplicada pro mesmo (aluno, topico).
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS personalizacao_sugestao_alvo_uidx
          ON personalizacao_sugestao (aluno_id, topico_id, COALESCE(conteudo_id, -1))
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS personalizacao_sugestao_classe_idx
          ON personalizacao_sugestao (classe_id)
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS personalizacao_sugestao_log (
          id            bigserial PRIMARY KEY,
          sugestao_id   bigint      NULL
                          REFERENCES personalizacao_sugestao (id) ON DELETE SET NULL,
          aluno_id      uuid        NOT NULL,
          classe_id     bigint      NULL,
          topico_id     bigint      NOT NULL,
          conteudo_id   bigint      NULL,
          versao        integer     NOT NULL,
          acao          text        NOT NULL,
          ordem_antes   jsonb       NULL,
          ordem_depois  jsonb       NULL,
          motivos       jsonb       NOT NULL DEFAULT '[]'::jsonb,
          evidencia     jsonb       NOT NULL DEFAULT '{}'::jsonb,
          criado_em     timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT personalizacao_sugestao_log_acao_check
            CHECK (acao IN ('criada', 'revisada', 'mantida'))
        )
        """
    )

    # ON DELETE SET NULL e nao CASCADE: apagar a sugestao atual nao pode apagar
    # o historico - e justamente dele que sai a metrica de efetividade.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS personalizacao_sugestao_log_aluno_idx
          ON personalizacao_sugestao_log (aluno_id, topico_id, criado_em DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS personalizacao_sugestao_log_classe_idx
          ON personalizacao_sugestao_log (classe_id, criado_em DESC)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS personalizacao_sugestao_log")
    op.execute("DROP TABLE IF EXISTS personalizacao_sugestao")
