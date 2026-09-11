"""status e percentual param de discordar na mesma linha

Revision ID: 20260911_03
Revises: 20260911_02

## O defeito

Medido em producao: 1 linha de `atividade_aluno` com
`percentual_concluido = 100` e `status = 'em andamento'`. Os dois campos
descrevem a MESMA coisa e discordavam.

A causa esta no cliente, e ja foi corrigida junto com esta migracao:
`Atividade.registrarVisita` mandava `status: this.status ?? 'em andamento'`.
Registrar visita nao sabe o status -- e quando o modelo local estava sem o
rotulo carregado, o palpite ia por cima da linha concluida. O
`percentual_concluido` nao era enviado por esse caminho, entao ele ficava em
100 e so o status caia. Dai a assinatura: percentual certo, status demovido.

O gravador agora usa `statusConhecido`, que **nunca inventa 'em andamento'**:
se o rotulo e reconhecivel vale ele, se o percentual prova conclusao vale
`concluido`, e senao a coluna simplesmente nao entra no upsert.

## Por que o backfill vai na direcao do percentual

Porque o banco JA trata a linha como concluida por ele. O filtro de
`trailup_recalcular_topico_aluno` e

    position('concl' in lower(coalesce(status::text,''))) > 0
      OR coalesce(percentual_concluido, 0) >= 100

ou seja, o percentual sozinho basta. O percentual do topico, portanto, sempre
esteve certo -- a divergencia nao alterou nenhum numero derivado, mas aparecia
para o aluno como uma atividade aberta com a barra cheia, e para o professor
como aluno com item pendente.

A direcao contraria (`status = 'concluido'` com percentual < 100) tem ZERO
linhas hoje e NAO e corrigida aqui de proposito: cravar 100 sobre ela seria
inventar progresso, e a conta que vale e a do material personalizado, nao esta.
Se aparecer, e outro defeito, com outra causa.

Create Date: 2026-09-11
"""

from alembic import op

revision = "20260911_03"
down_revision = "20260911_02"
branch_labels = None
depends_on = None


# As tres tabelas tem o mesmo par de colunas e o mesmo enum. `topico_aluno`
# entra na lista por simetria: hoje tem zero divergencia (o gatilho escreve os
# dois campos de uma vez), e se algum dia tiver, e o mesmo defeito.
_TABELAS = ("conteudo_aluno", "atividade_aluno", "topico_aluno")


def upgrade() -> None:
    for tabela in _TABELAS:
        op.execute(
            f"""
            UPDATE public.{tabela}
               SET status = 'concluido'::status_atividade
             WHERE COALESCE(percentual_concluido, 0) >= 100
               AND position('concl' in lower(COALESCE(status::text, ''))) = 0
            """
        )

    # Sem `format()` nem `EXECUTE`: os especificadores `%I`/`%s` levam o
    # caractere por-cento, e o renderizador offline do Alembic o DOBRA para o
    # paramstyle do driver -- viraria `%%I` e o format morreria. Com tres
    # tabelas fixas, escrever as tres a mao custa menos que a armadilha.
    op.execute(
        """
        DO $confere$
        DECLARE
          v_divergentes BIGINT;
          v_ao_contrario BIGINT;
        BEGIN
          SELECT
            (SELECT count(*) FROM public.conteudo_aluno
              WHERE COALESCE(percentual_concluido, 0) >= 100
                AND position('concl' in lower(COALESCE(status::text, ''))) = 0)
          + (SELECT count(*) FROM public.atividade_aluno
              WHERE COALESCE(percentual_concluido, 0) >= 100
                AND position('concl' in lower(COALESCE(status::text, ''))) = 0)
          + (SELECT count(*) FROM public.topico_aluno
              WHERE COALESCE(percentual_concluido, 0) >= 100
                AND position('concl' in lower(COALESCE(status::text, ''))) = 0)
            INTO v_divergentes;

          IF v_divergentes > 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'ainda divergente apos o backfill: linha com percentual 100 e status nao concluido';
          END IF;

          -- A direcao contraria nao e corrigida, mas e MEDIDA: se aparecer, o
          -- aviso diz onde olhar em vez de passar em silencio.
          SELECT
            (SELECT count(*) FROM public.conteudo_aluno
              WHERE position('concl' in lower(COALESCE(status::text, ''))) > 0
                AND COALESCE(percentual_concluido, 0) < 100)
          + (SELECT count(*) FROM public.atividade_aluno
              WHERE position('concl' in lower(COALESCE(status::text, ''))) > 0
                AND COALESCE(percentual_concluido, 0) < 100)
          + (SELECT count(*) FROM public.topico_aluno
              WHERE position('concl' in lower(COALESCE(status::text, ''))) > 0
                AND COALESCE(percentual_concluido, 0) < 100)
            INTO v_ao_contrario;

          IF v_ao_contrario > 0 THEN
            RAISE WARNING USING MESSAGE =
              'CONFERE: ha linha marcada concluido com percentual abaixo de 100 -- outra causa, nao corrigida aqui';
          END IF;

          RAISE NOTICE USING MESSAGE =
            'CONFERE: status e percentual concordam nas tres tabelas de progresso';
        END
        $confere$;
        """
    )


def downgrade() -> None:
    # Backfill de dado nao tem volta: nao ha registro de qual era o status
    # anterior de cada linha, e ele era o valor ERRADO. Reverter seria
    # reintroduzir a divergencia sem saber em quais linhas.
    pass
