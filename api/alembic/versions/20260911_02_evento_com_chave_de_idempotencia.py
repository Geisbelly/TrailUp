"""evento de pontos aceita chave de idempotencia, para retentativa segura

Revision ID: 20260911_02
Revises: 20260911_01

## Por que

`registrarEventoPontos` no mobile faz `INSERT` em `eventos_aluno` e nao tem
fila durável: se a rede cai ou o sistema mata o app, o ponto se perde em
silencio. Dar fila a ele exige que RETENTAR seja seguro, e hoje isso depende
do tipo:

  - `presenca_aula`, `participacao_aula`, `conquista_desbloqueada` -- seguro,
    o indice parcial `eventos_aluno_creditado_unico` rejeita a repeticao;
  - `conteudo_concluido`, `atividade_concluida` -- paga uma vez, porque o
    gatilho de 20260910_04 zera a repeticao (a linha entra, com valor 0);
  - qualquer outro tipo, incluindo `atividade` -- que e justamente o DEFAULT
    de `registrarEventoPontos` -- duplica a linha E paga duas vezes.

Tornar `(aluno_id, tipo, referencia)` unico para todo tipo NAO serve: o
CLAUDE.md registra que rever e um ato repetivel por natureza, e
`atividade_revisada` deve poder acontecer de novo. Uma regra que proibisse a
repeticao legitima trocaria um defeito por outro.

## O que esta migracao faz

Coluna `idempotencia_key uuid` anulavel, com indice unico PARCIAL onde ela nao
e nula. A chave e do cliente e identifica a TENTATIVA, nao o par
(tipo, referencia):

  - retentativa da mesma escrita reusa a chave -> o indice rejeita, e a fila
    trata isso como "ja entregue";
  - repeticao legitima e uma escrita nova, com chave nova -> passa.

Anulavel de proposito: quem nao manda chave -- todo caller existente, e o SQL
direto -- se comporta exatamente como hoje, porque NULL nao colide com NULL em
indice unico. Nada do que ja existe muda de comportamento.

A coluna nao entra em nenhuma conta de pontuacao: o valor continua saindo de
`fn_pontos_do_evento` e dos gatilhos. Ela e so a identidade da tentativa.

Create Date: 2026-09-11
"""

from alembic import op

revision = "20260911_02"
down_revision = "20260911_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE public.eventos_aluno
          ADD COLUMN IF NOT EXISTS idempotencia_key uuid
        """
    )

    # PARCIAL: so onde a chave existe. Sem o WHERE, o indice trataria as
    # milhares de linhas historicas (todas com NULL) como candidatas, e em
    # Postgres NULL nao colide -- entao o indice funcionaria, mas carregaria
    # sem motivo todo o historico. Com o WHERE ele indexa apenas o que precisa
    # de protecao.
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS eventos_aluno_idempotencia_unico
          ON public.eventos_aluno (idempotencia_key)
          WHERE idempotencia_key IS NOT NULL
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN public.eventos_aluno.idempotencia_key IS
          'Identidade da TENTATIVA de escrita, gerada pelo cliente, para a fila '
          'durável do mobile poder retentar sem duplicar ponto. Anulável: quem '
          'não manda chave se comporta como antes. Não entra em cálculo de '
          'pontuação -- o valor continua saindo de fn_pontos_do_evento.'
        """
    )

    op.execute(
        """
        DO $confere$
        DECLARE
          v_tem_coluna BOOLEAN;
          v_tem_indice BOOLEAN;
          v_parcial BOOLEAN;
        BEGIN
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'eventos_aluno'
               AND column_name = 'idempotencia_key'
          ) INTO v_tem_coluna;
          IF NOT v_tem_coluna THEN
            RAISE EXCEPTION USING MESSAGE = 'coluna idempotencia_key nao criada';
          END IF;

          SELECT EXISTS (
            SELECT 1 FROM pg_indexes
             WHERE tablename = 'eventos_aluno'
               AND indexname = 'eventos_aluno_idempotencia_unico'
          ) INTO v_tem_indice;
          IF NOT v_tem_indice THEN
            RAISE EXCEPTION USING MESSAGE = 'indice de idempotencia nao criado';
          END IF;

          -- O indice TEM de ser parcial: sem o WHERE, ele nao protegeria
          -- melhor e indexaria o historico inteiro por nada.
          SELECT position('WHERE (idempotencia_key IS NOT NULL)' IN indexdef) > 0
            INTO v_parcial
            FROM pg_indexes
           WHERE tablename = 'eventos_aluno'
             AND indexname = 'eventos_aluno_idempotencia_unico';
          IF NOT COALESCE(v_parcial, FALSE) THEN
            RAISE EXCEPTION USING MESSAGE =
              'o indice de idempotencia nao esta parcial';
          END IF;

          RAISE NOTICE USING MESSAGE =
            'CONFERE: eventos_aluno aceita chave de idempotencia, indice parcial';
        END
        $confere$;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS public.eventos_aluno_idempotencia_unico")
    op.execute(
        "ALTER TABLE public.eventos_aluno DROP COLUMN IF EXISTS idempotencia_key"
    )
