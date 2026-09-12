"""formatos_gerados passa a refletir a midia que EXISTE em materiais

Backfill do defeito corrigido em `media_generation_jobs.persistir_parte_em_materiais`.

## O que estava errado

`formatos_gerados` nao e um espelho do status: e o INDICE que o app consulta
para saber o que existe. No mobile, `inferHeroFormat` le o PRIMEIRO item para
eleger o formato principal da tela, e `PersonalizedNodeHint.formatos` leva a
lista para o no da trilha.

Ele so era atualizado quando a Fase B fechava INTEIRA (audio E apresentacao
completos com o mesmo generation_key). Uma midia que falhava deixava o indice
congelado no valor da Fase A -- `{cards}`.

Medido em producao antes desta migracao:

    registros                                   27
    formatos_gerados = {cards}                  26
    markdown com arquivo_url                    27  (100 por cento)
    audio com arquivo_url                       21
    apresentacao com arquivo_url                23
    status = failed                             12

O material estava no Storage, publico e servivel -- conferido: o gateway
`storage-redirect` responde 302 e o arquivo final devolve 200 com 105 KB de
markdown. O app simplesmente nao sabia que existia, porque o indice dizia que so
havia cards. Era isso que aparecia na tela do aluno.

## O que esta migracao faz

Recalcula `formatos_gerados` como a UNIAO do que ja estava com os tipos de
midia presentes em `materiais` que tenham `arquivo_url`.

Uniao, e nao substituicao, por dois motivos:

  - `cards` vem da Fase A e NAO esta em `materiais`; sobrescrever apagaria o
    unico formato que o app conseguia enxergar;
  - `formato_prioritario` e o plano podem referenciar formato que nao virou
    arquivo, e nao cabe a este backfill decidir remover.

As chaves de controle de `materiais` ficam de fora por lista explicita:
`erro` e `_geracao_falhas` sao registro de falha, nao midia -- e estao presentes
em 17 e 19 registros. Sem o filtro, `erro` viraria o formato "heroi" de metade
dos registros, que e pior que o defeito original.

`status` NAO e tocado: ele continua significando "o ciclo fechou inteiro", e
afrouxar isso e outra decisao.

Revision ID: 20260831_02
Revises: 20260831_01
Create Date: 2026-08-31
"""

from alembic import op

revision = "20260831_02"
down_revision = "20260831_01"
branch_labels = None
depends_on = None


# Lista explicita: so estes sao formato de midia consumivel pelo app. Derivar
# por exclusao ("tudo que nao e erro") deixaria qualquer chave de controle nova
# entrar no indice sem ninguem perceber.
FORMATOS_DE_MIDIA = ("markdown", "audio", "apresentacao")


def upgrade() -> None:
    op.execute(
        f"""
        WITH presentes AS (
          SELECT cp.id,
                 ARRAY(
                   SELECT tipo
                     FROM unnest(ARRAY[{", ".join(f"'{f}'" for f in FORMATOS_DE_MIDIA)}]) AS tipo
                    WHERE cp.materiais -> tipo ->> 'arquivo_url' IS NOT NULL
                 ) AS com_arquivo
            FROM conteudo_personalizado cp
           WHERE cp.materiais IS NOT NULL
        )
        UPDATE conteudo_personalizado cp
           SET formatos_gerados = (
                 SELECT ARRAY(
                   SELECT DISTINCT f
                     FROM unnest(
                            COALESCE(cp.formatos_gerados, ARRAY[]::text[]) || p.com_arquivo
                          ) AS f
                    WHERE f IS NOT NULL AND btrim(f) <> ''
                    ORDER BY f
                 )
               )
          FROM presentes p
         WHERE p.id = cp.id
           AND cardinality(p.com_arquivo) > 0
           -- Só onde a união muda algo, para não tocar linha por tocar.
           AND NOT (p.com_arquivo <@ COALESCE(cp.formatos_gerados, ARRAY[]::text[]))
        """
    )


def downgrade() -> None:
    # Sem volta: o valor anterior era justamente o indice incompleto, e nao ha
    # como reconstrui-lo sem saber quais midias ja existiam no momento em que
    # cada registro foi congelado. Reverter tambem nao restauraria o bug de
    # forma util -- ele vivia no codigo, nao no dado.
    pass
