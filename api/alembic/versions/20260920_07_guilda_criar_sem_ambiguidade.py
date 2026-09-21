"""guilda_criar: derruba a sobrecarga de 4 argumentos, que tornava a RPC ambigua

Revision ID: 20260920_07
Revises: 20260920_06
Create Date: 2026-09-20

`guilda_criar` existia em duas assinaturas:

    guilda_criar(bigint, text, text, text)                        -- 4, delega
    guilda_criar(bigint, text, text, text, text, text, text)      -- 7, o corpo

As tres ultimas da segunda tem DEFAULT, entao ela tambem aceita 4 argumentos --
e o Postgres nao consegue escolher. Medido nesta base, em transacao revertida,
ANTES desta migracao:

    guilda_criar(32, 'X', 'y', 'constellation')
      -> 42725  function public.guilda_criar(bigint, text, text, text) is not unique

    guilda_criar(p_classe_id => 32, p_nome => 'X',
                 p_descricao => 'y', p_emblema => 'constellation')
      -> 42725  function public.guilda_criar(p_classe_id => integer, ...) is not unique

**As DUAS formas falham**, inclusive a nomeada -- que e a que o cliente usa
(`guildService.ts`: `action("guilda_criar", { p_classe_id, p_nome, p_descricao,
p_emblema })`). O PostgREST faz a propria resolucao antes de chegar ao Postgres
e pode escolher uma, entao nao da para afirmar que "Criar guilda" esta quebrado
em producao sem exercitar o caminho REST; o que da para afirmar e que a chamada
e ambigua no banco, e que isso depende de um detalhe de implementacao de outra
camada para funcionar.

A de 4 argumentos e um `SELECT` de uma linha que chama a de 7 com
`NULL, 'misto', NULL` -- exatamente os DEFAULTs da de 7. Entao derrubar a de 4
nao muda comportamento nenhum: medido depois do DROP, a mesma chamada nomeada
grava `modo=misto | limite=10 | logo=nulo | alvo=nulo` e poe o criador como
membro, igual ao que a delegacao produzia.

Varri o catalogo atras de outros pares assim: **e o unico** no codigo da
aplicacao. O que mais aparece sao funcoes do `pgvector` (`cosine_distance`,
`array_to_vector`...), que se distinguem por TIPO de argumento e nao sao
ambiguas; e `social_listar_pessoas`, cujas versoes de 0 e 1 argumento nao se
sobrepoem.

A licao vale para a proxima: **ao dar uma assinatura nova a uma RPC existente,
derrube a antiga na mesma migracao.** A `20260920_06` ja fez isso com
`arena_desafio_criar` quando ela ganhou `p_guilda_rival`.
"""

from alembic import op

revision = "20260920_07"
down_revision = "20260920_06"
branch_labels = None
depends_on = None


_ASSINATURA_CURTA = "public.guilda_criar(bigint, text, text, text)"
_ASSINATURA_LONGA = "public.guilda_criar(bigint, text, text, text, text, text, text)"


def upgrade() -> None:
    # Prova, no proprio banco, que a curta e mesmo so uma delegacao antes de
    # derruba-la. Se alguem tiver posto regra dentro dela, a migracao para aqui
    # em vez de apagar a regra calada -- e a mesma disciplina que a
    # `20260912_01` aplicou a `trg_eventos_aluno_valor_do_banco`.
    op.execute(
        """
        DO $confere$
        DECLARE v_corpo text;
        BEGIN
          SELECT regexp_replace(p.prosrc, '\\s+', ' ', 'g') INTO v_corpo
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'guilda_criar'
             AND p.pronargs = 4;

          IF v_corpo IS NULL THEN
            -- Ja foi derrubada: nada a fazer, e nada a perder.
            RETURN;
          END IF;

          IF position('guilda_criar' in v_corpo) = 0
             OR position('misto' in v_corpo) = 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'a guilda_criar de 4 argumentos nao e mais uma delegacao simples; '
              || 'corpo vivo: ' || v_corpo;
          END IF;
        END
        $confere$;
        """
    )

    op.execute(f"DROP FUNCTION IF EXISTS {_ASSINATURA_CURTA}")

    # A longa continua sendo a unica, e continua fora do alcance do `anon`
    # (`20260920_04`). Reafirmar e barato e protege contra um replace futuro.
    op.execute(f"REVOKE ALL ON FUNCTION {_ASSINATURA_LONGA} FROM PUBLIC, anon")
    op.execute(f"GRANT EXECUTE ON FUNCTION {_ASSINATURA_LONGA} TO authenticated")

    op.execute(
        """
        DO $confere$
        DECLARE v_n integer;
        BEGIN
          SELECT count(*) INTO v_n
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'guilda_criar';

          IF v_n <> 1 THEN
            RAISE EXCEPTION USING MESSAGE =
              'guilda_criar deveria ter uma assinatura so, tem ' || v_n::text;
          END IF;
        END
        $confere$;
        """
    )


def downgrade() -> None:
    # Recria a delegacao exatamente como estava -- inclusive os tres valores
    # que ela passava explicitamente, que sao os DEFAULTs da versao longa.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.guilda_criar(
          p_classe_id bigint,
          p_nome text,
          p_descricao text DEFAULT NULL,
          p_emblema text DEFAULT 'constellation'
        ) RETURNS jsonb
          LANGUAGE sql SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
          SELECT public.guilda_criar(p_classe_id, p_nome, p_descricao, p_emblema,
                                     NULL, 'misto', NULL);
        $fn$
        """
    )
    op.execute(f"REVOKE ALL ON FUNCTION {_ASSINATURA_CURTA} FROM PUBLIC, anon")
    op.execute(f"GRANT EXECUTE ON FUNCTION {_ASSINATURA_CURTA} TO authenticated")
