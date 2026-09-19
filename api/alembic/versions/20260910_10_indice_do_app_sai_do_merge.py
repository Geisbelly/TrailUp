"""a RPC de merge passa a manter `formatos_gerados`, o indice que o app le

Revision ID: 20260910_10
Revises: 20260910_09

## O que estava errado

`formatos_gerados` nao e espelho do status: e o INDICE que o cliente consulta
para saber o que EXISTE (ver 20260831_02_formatos_gerados_reflete_o_que_existe,
que backfillou o dado uma vez e explica o contrato).

`merge_personalizacao_materiais_v2` e o ponto unico por onde passa TODA
geracao de midia -- o microservice chama a RPC, e o BrainHexPDF grava parte a
parte pela mesma RPC. E o UPDATE dela tocava apenas tres colunas:

    UPDATE public.conteudo_personalizado
    SET materiais = v_merged,
        status = v_new_status,
        updated_at = NOW()
    WHERE id = p_id;

`formatos_gerados` nunca era atualizado. O 20260831_02 corrigiu isso no
caminho granular da API (`persistir_parte_em_materiais`) e backfillou o
historico, mas o caminho da RPC recongela o indice na proxima geracao.

Medido no topico 128 (classe 32), com as tres midias do perfil mastermind
`completed` e servidas do Storage:

    perfil       markdown  audio  apresentacao   formatos_gerados
    mastermind   12/12     12/12  12/12          {cards}

O material existia, publico e servivel; o app simplesmente nao sabia, porque o
indice dizia que so havia cards.

## O que esta migracao faz

Insere a derivacao no proprio UPDATE da RPC, cobrindo os dois gravadores de
uma vez. Encanamento no banco, sem modelo de linguagem no meio -- a regra de
fronteira do CLAUDE.md.

Tres decisoes que nao sao acidentais:

1. **UNIAO preservando a ordem, nunca substituicao.** `cards` vem da Fase A e
   NAO esta em `materiais`; sobrescrever apagaria o unico formato que o app
   enxergava. E o 20260831_02 ordenava alfabeticamente (`ORDER BY f`), o que
   move quem fica em primeiro -- aqui o novo formato entra no FIM. O primeiro
   item importa: `montarPersonalizacao` no mobile usa
   `inferHeroFormat(formatos_gerados[0])` como terceiro fallback do formato
   heroi (depois de `record.formato_prioritario` e `plano.formato_prioritario`).
   Acrescentar no fim garante que esta correcao nao troca o heroi de ninguem.

2. **Lista explicita de midia** (`markdown`, `audio`, `apresentacao`), igual ao
   20260831_02. Derivar por exclusao ("tudo que nao e `erro`") deixaria
   qualquer chave de controle nova -- `_geracao_falhas`, por exemplo -- entrar
   no indice sem ninguem perceber.

3. **Conta tambem `partes[].arquivo_url`**, e nao so o `arquivo_url` do topo
   como o backfill fazia. Um deck cujo agregado ainda nao fechou tem partes
   com URL servivel; ignora-las esconderia material que existe. Uma parte com
   URL e material entregavel.

`status` continua saindo da conta que ja estava ali. Esta migracao nao mexe no
significado dele.

Create Date: 2026-09-10
"""

from alembic import op

revision = "20260910_10"
down_revision = "20260910_09"
branch_labels = None
depends_on = None


# Substituicao no corpo VIVO (`pg_get_functiondef`), nao um CREATE OR REPLACE
# com o texto de 20260801_01 colado aqui: se alguma migracao posterior -- ou um
# hotfix -- tiver mexido na funcao, reescrever a partir do texto antigo
# reverteria a mudanca em silencio. `pg_get_functiondef` devolve a definicao
# completa (LANGUAGE, volatilidade, SECURITY, `SET`), entao nada disso se
# perde, e `CREATE OR REPLACE` preserva os GRANTs.
#
# A ancora e uma linha unica (`updated_at = NOW()`), nao o UPDATE inteiro:
# casar varias linhas exigiria reproduzir a indentacao exata que o
# `pg_get_functiondef` imprime.
_ANCORA = "updated_at = NOW()"

_DERIVACAO = """formatos_gerados = COALESCE(conteudo_personalizado.formatos_gerados, ARRAY[]::text[]) || ARRAY(
                SELECT kinds.media_kind
                  FROM unnest(ARRAY['markdown', 'audio', 'apresentacao'])
                    AS kinds(media_kind)
                 WHERE (
                         v_merged -> kinds.media_kind ->> 'arquivo_url' IS NOT NULL
                         OR (
                           jsonb_typeof(v_merged -> kinds.media_kind -> 'partes') = 'array'
                           AND EXISTS (
                             SELECT 1
                               FROM jsonb_array_elements(
                                      v_merged -> kinds.media_kind -> 'partes'
                                    ) AS parte
                              WHERE parte ->> 'arquivo_url' IS NOT NULL
                           )
                         )
                       )
                   AND NOT (
                         kinds.media_kind = ANY(
                           COALESCE(conteudo_personalizado.formatos_gerados, ARRAY[]::text[])
                         )
                       )
              ),
              updated_at = NOW()"""


def upgrade() -> None:
    op.execute(
        f"""
        DO $migracao$
        DECLARE
          v_def TEXT;
          v_novo TEXT;
          v_ancora TEXT := $ancora${_ANCORA}$ancora$;
          v_troca TEXT := $troca${_DERIVACAO}$troca$;
          v_ocorrencias INT;
          v_oid OID;
        BEGIN
          -- `to_regprocedure` casa por TIPO de argumento e devolve NULL quando
          -- nao acha, em vez de estourar. `pg_get_function_identity_arguments`
          -- nao serve aqui: ela inclui os NOMES dos parametros
          -- ('p_id bigint, p_updates jsonb, ...'), nao so os tipos.
          v_oid := to_regprocedure(
            'public.merge_personalizacao_materiais_v2(bigint,jsonb,text,text)'
          );
          IF v_oid IS NULL THEN
            RAISE EXCEPTION USING MESSAGE =
              'merge_personalizacao_materiais_v2(bigint,jsonb,text,text) nao encontrada';
          END IF;

          v_def := pg_get_functiondef(v_oid);

          -- Idempotente: reaplicar a migracao nao duplica a derivacao.
          IF position('formatos_gerados' IN v_def) > 0 THEN
            RAISE NOTICE 'merge_personalizacao_materiais_v2 ja mantem formatos_gerados';
            RETURN;
          END IF;

          -- `replace` troca TODAS as ocorrencias. A ancora precisa ser unica,
          -- senao a derivacao entraria em lugar que nao e o UPDATE.
          v_ocorrencias := (length(v_def) - length(replace(v_def, v_ancora, '')))
                           / length(v_ancora);
          IF v_ocorrencias <> 1 THEN
            RAISE EXCEPTION USING MESSAGE =
              'esperava 1 ocorrencia da ancora no corpo vivo, achei '
              || v_ocorrencias::text;
          END IF;

          v_novo := replace(v_def, v_ancora, v_troca);
          IF v_novo = v_def THEN
            RAISE EXCEPTION USING MESSAGE = 'substituicao nao alterou a definicao';
          END IF;

          EXECUTE v_novo;
        END
        $migracao$;
        """
    )

    # Backfill: corrigir a funcao sem isto deixaria invisivel o material que
    # JA existe. Medido antes desta migracao: 34 registros com `materiais`, 33
    # com midia servivel, 6 com midia FORA do indice -- em cinco topicos
    # diferentes (128, 129, 133, 134, 153), entao nao e caso isolado. O mais
    # claro: id 3609 (conqueror, topico 128) estava `pronto`, com markdown,
    # audio e apresentacao servivies, e indice em {cards}.
    #
    # Mesma regra da derivacao, e a mesma do 20260831_02 -- uniao, nunca
    # substituicao. A diferenca e a ordem: aqui o formato novo entra no FIM,
    # para nao mexer em quem e o primeiro (ver a decisao 1 no topo).
    op.execute(
        """
        UPDATE public.conteudo_personalizado cp
           SET formatos_gerados =
                 COALESCE(cp.formatos_gerados, ARRAY[]::text[]) || novos.faltando
          FROM (
            SELECT c.id,
                   ARRAY(
                     SELECT kinds.media_kind
                       FROM unnest(ARRAY['markdown', 'audio', 'apresentacao'])
                         AS kinds(media_kind)
                      WHERE (
                              c.materiais -> kinds.media_kind ->> 'arquivo_url'
                                IS NOT NULL
                              OR (
                                jsonb_typeof(c.materiais -> kinds.media_kind -> 'partes')
                                  = 'array'
                                AND EXISTS (
                                  SELECT 1
                                    FROM jsonb_array_elements(
                                           c.materiais -> kinds.media_kind -> 'partes'
                                         ) AS parte
                                   WHERE parte ->> 'arquivo_url' IS NOT NULL
                                )
                              )
                            )
                        AND NOT (
                              kinds.media_kind = ANY(
                                COALESCE(c.formatos_gerados, ARRAY[]::text[])
                              )
                            )
                   ) AS faltando
              FROM public.conteudo_personalizado c
             WHERE c.materiais IS NOT NULL
          ) novos
         WHERE novos.id = cp.id
           -- So onde a uniao muda algo, para nao tocar linha por tocar.
           AND cardinality(novos.faltando) > 0
        """
    )

    # CONFERE: a funcao viva passou a derivar o indice, e a expressao de fato
    # compila e produz array sensato sobre o dado real (SELECT, nao UPDATE).
    op.execute(
        """
        DO $confere$
        DECLARE
          v_tem BOOLEAN;
          v_amostra INT;
        BEGIN
          v_tem := position(
            'formatos_gerados' IN pg_get_functiondef(
              to_regprocedure(
                'public.merge_personalizacao_materiais_v2(bigint,jsonb,text,text)'
              )
            )
          ) > 0;

          IF NOT COALESCE(v_tem, FALSE) THEN
            RAISE EXCEPTION USING MESSAGE =
              'a funcao viva nao contem a derivacao de formatos_gerados';
          END IF;

          -- Depois do backfill nao pode sobrar NENHUM registro com midia
          -- servivel fora do indice. Isto tambem exercita a expressao sobre
          -- todos os shapes de `materiais` que existem hoje: se ela nao
          -- compilasse, ou estourasse com `partes` vindo como objeto em vez de
          -- array, falharia aqui e nao em producao.
          SELECT count(*)
            INTO v_amostra
            FROM public.conteudo_personalizado cp
           WHERE cp.materiais IS NOT NULL
             AND NOT (
                   ARRAY(
                     SELECT kinds.media_kind
                       FROM unnest(ARRAY['markdown', 'audio', 'apresentacao'])
                         AS kinds(media_kind)
                      WHERE (
                              cp.materiais -> kinds.media_kind ->> 'arquivo_url' IS NOT NULL
                              OR (
                                jsonb_typeof(cp.materiais -> kinds.media_kind -> 'partes')
                                  = 'array'
                                AND EXISTS (
                                  SELECT 1
                                    FROM jsonb_array_elements(
                                           cp.materiais -> kinds.media_kind -> 'partes'
                                         ) AS parte
                                   WHERE parte ->> 'arquivo_url' IS NOT NULL
                                )
                              )
                            )
                   ) <@ COALESCE(cp.formatos_gerados, ARRAY[]::text[])
                 );

          IF v_amostra <> 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'midia servivel fora do indice apos o backfill: '
              || v_amostra::text || ' registro(s)';
          END IF;
        END
        $confere$;
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        DO $volta$
        DECLARE
          v_def TEXT;
          v_novo TEXT;
          v_oid OID;
        BEGIN
          v_oid := to_regprocedure(
            'public.merge_personalizacao_materiais_v2(bigint,jsonb,text,text)'
          );
          IF v_oid IS NULL THEN
            RETURN;
          END IF;

          v_def := pg_get_functiondef(v_oid);

          v_novo := replace(v_def, $troca${_DERIVACAO}$troca$, $ancora${_ANCORA}$ancora$);
          IF v_novo = v_def THEN
            RAISE NOTICE 'derivacao nao encontrada; nada a reverter';
            RETURN;
          END IF;

          EXECUTE v_novo;
        END
        $volta$;
        """
    )
