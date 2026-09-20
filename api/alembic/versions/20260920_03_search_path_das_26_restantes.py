"""fixa o search_path nas 26 funcoes que ainda o tinham mutavel

Revision ID: 20260920_03
Revises: 20260920_02
Create Date: 2026-09-20

A `20260920_02` fixou duas funcoes de telemetria. Elas nao eram as unicas: o
linter aponta `function_search_path_mutable` com **28** achados, e os outros 26
estao aqui -- gatilhos de `updated_at`, o motor de notificacoes, os
`*_after_insert` da trilha, e duas `SECURITY DEFINER`.

## `ALTER FUNCTION`, e nao `CREATE OR REPLACE`

A `20260920_02` reescreveu o corpo inteiro das duas para acrescentar uma
clausula, e teve de provar depois, por md5, que nao tinha perdido nada no
caminho -- a armadilha que a `20260912_01` documentou. Era desnecessario:

    ALTER FUNCTION f(args) SET search_path TO 'public', 'pg_temp'

muda a configuracao SEM TOCAR no corpo. Medido numa transacao revertida sobre
as 26: `prosrc`, `proacl`, `prosecdef` e `provolatile` ficaram **identicos** nas
26; so `proconfig` mudou. Nenhum corpo passa por aqui, entao nao ha o que
perder.

## Por que e seguro fixar em `public, pg_temp`

Nenhuma das 26 referencia, sem qualificar, objeto que viva fora de
`public`/`pg_catalog`. Conferido varrendo cada corpo contra TODOS os nomes
(funcao, tipo e tabela) de `extensions`, `auth`, `net`, `storage`, `vault`,
`graphql`, `realtime` e `cron`. Os dois unicos casos que o varredor acusou eram
falso positivo: `email` e coluna de `public.alunos` em
`fn_cadastrar_aluno_com_perfis`, e `role` aparece dentro de um COMENTARIO em
`merge_personalizacao_materiais_v2`.

Depois disso, ainda com o caminho ja fixo e dentro da transacao revertida,
exercitei os gatilhos de verdade: INSERT em `topicos`, `conteudos` e
`atividades` (os tres `*_after_insert`), UPDATE em `topico_aluno`,
`conteudo_aluno` e `atividade_aluno` (`atualiza_updated_at`,
`update_updated_at_column` e `trailup_progresso_after_item`), e chamada direta
das cinco `notificacoes_*` e de `social_par`. Todos passaram.

## Uma coisa que esta sonda achou e NAO conserta

`fn_trilha_by_classe(uuid, bigint)` -- `SECURITY DEFINER` -- le
`public.v_trilha_topicos`, **que nao existe nesta base**. Qualquer chamada
estoura com 42P01, e nao e por causa do `search_path`: a referencia esta
qualificada. Nao ha um unico chamador no monorepo (conferido em `mobile/src`,
`frontend/src`, `api/app` e `docs/**/sql`), entao e funcao morta exposta em
`/rest/v1/rpc/`. Fica pinada junto com as outras -- pinar funcao quebrada nao
custa nada -- mas derruba-la ou recriar a view e decisao de quem conhece a
intencao original, nao desta migracao.
"""

from alembic import op

revision = "20260920_03"
down_revision = "20260920_02"
branch_labels = None
depends_on = None


# Assinatura COMPLETA, e nao so o nome: `ALTER FUNCTION` precisa dela para
# desambiguar sobrecarga, e escrever o nome cru faria a migracao quebrar no dia
# em que alguem criar uma segunda versao da funcao.
_FUNCOES = (
    "atualiza_updated_at()",
    "fn_cadastrar_aluno_com_perfis(uuid,text,text,text,text,jsonb)",
    "fn_rank_rebuild_for_classe(bigint)",
    "fn_trilha_by_classe(uuid,bigint)",
    "inscrever_aluno_em_classe(uuid,bigint)",
    "mark_personalizacao_failed_v2(bigint,text,text,text)",
    "merge_personalizacao_materiais_v2(bigint,jsonb,text,text)",
    "notificacoes_dedupe_key(text,text,date)",
    "notificacoes_dia_local(text,timestamp with time zone)",
    "notificacoes_em_silencio(text,timestamp with time zone)",
    "notificacoes_proxima_ocorrencia(text,timestamp with time zone,smallint,smallint,text)",
    "notificacoes_tz(text)",
    "prevent_topico_cycle()",
    "set_rag_chunks_updated_at()",
    "set_trilha_checkpoint_navegacao_updated_at()",
    "set_updated_at_timestamp()",
    "social_par(uuid,uuid)",
    "trailup_progresso_after_item()",
    "trg_alunos_after_insert()",
    "trg_atividades_after_insert()",
    "trg_classe_aluno_after_insert()",
    "trg_conteudos_after_insert()",
    "trg_limpar_dados_aluno_classe()",
    "trg_professor_after_insert()",
    "trg_topicos_after_insert()",
    "update_updated_at_column()",
)


def _aplicar(clausula: str) -> None:
    for assinatura in _FUNCOES:
        # `IF EXISTS` de proposito NAO: uma funcao que sumiu da base e' sinal de
        # que a lista envelheceu, e seguir em silencio deixaria o caminho
        # mutavel de volta sem ninguem perceber. Falhar aqui e barato -- a
        # migracao e' uma transacao.
        op.execute(f"ALTER FUNCTION public.{assinatura} {clausula}")


def upgrade() -> None:
    _aplicar("SET search_path TO 'public', 'pg_temp'")

    # A conferencia final e' o ponto da migracao: nao "as 26 que eu listei", e
    # sim NENHUMA sobrando. Se alguem criar funcao nova sem a clausula entre a
    # escrita e a aplicacao disto, e' aqui que aparece.
    op.execute(
        """
        DO $guarda$
        DECLARE
          v_faltando text;
        BEGIN
          SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.proname)
            INTO v_faltando
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            JOIN pg_language l ON l.oid = p.prolang
           WHERE n.nspname = 'public'
             AND p.proconfig IS NULL
             AND l.lanname IN ('sql', 'plpgsql');

          IF v_faltando IS NOT NULL THEN
            RAISE EXCEPTION
              'funcao(oes) de public ainda com search_path mutavel: %', v_faltando;
          END IF;
        END
        $guarda$
        """
    )


def downgrade() -> None:
    _aplicar("RESET search_path")
