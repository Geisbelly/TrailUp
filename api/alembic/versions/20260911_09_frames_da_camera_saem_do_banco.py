"""apaga os frames da camera que ficaram gravados antes da sanitizacao

Revision ID: 20260911_09
Revises: 20260911_08

As #92 e #93 fecharam os dois caminhos de escrita: a API passou a gravar
`persisted_payload` (sanitizado) tambem no log de decisao, e o fallback do app
passou por `sanitizarCameraParaBanco`. **Ninguem limpou o que ja estava
gravado.**

Medido nesta base, depois das duas correcoes:

    telemetria_lotes                         162 linhas
      com frame_b64 dentro de camera.frames   54 linhas
      peso dessas linhas                     132 MB
      janela                        2026-08-31 a 2026-09-10
    ia_decision_logs                           5 linhas
      com frame_b64                            0

Ou seja: a correcao no codigo parou a hemorragia e a leitura de "issue fechada"
escondeu que o dado continuava la. Sao ate 30 JPEG por lote, da camera frontal
-- imagens do rosto do aluno.

## Por que apagar e' seguro

Nada le esse campo de volta. O unico SELECT sobre `telemetria_lotes` pega
`id, sessao_id, analysis_ciclo_id` (`repositories/telemetria.py`), nao ha view
nem funcao sobre a tabela, e o proprio `services/r2_storage.py` documenta isso
como a premissa da mudanca para o R2. Os consumidores de `frame_b64`
(`agente_emocao`, `adapters/*_emocao`) leem o frame do payload **em voo**, na
requisicao, nunca da tabela.

O resto de cada frame -- carimbo de tempo e metadados -- fica. O que sai e' a
imagem.

## O espaco nao volta sozinho

`UPDATE` em JSONB grande deixa a versao antiga na tabela ate o VACUUM. Um
`VACUUM FULL` recuperaria os 132 MB, mas nao roda dentro de transacao e esta
migracao roda em uma -- entao ele fica de fora, de proposito. O autovacuum
libera o espaco para reuso; recuperar o arquivo exige o comando a mao.

Create Date: 2026-09-11
"""

from alembic import op

revision = "20260911_09"
down_revision = "20260911_08"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $limpa$
        DECLARE
          v_antes bigint;
          v_bytes_antes bigint;
          v_depois bigint;
          v_bytes_depois bigint;
        BEGIN
          SELECT count(*), COALESCE(sum(length(payload::text)), 0)
            INTO v_antes, v_bytes_antes
            FROM public.telemetria_lotes
           WHERE jsonb_path_exists(payload, '$.camera.frames[*].frame_b64')
              OR payload->'camera' ? 'frame_b64';

          IF v_antes = 0 THEN
            RAISE NOTICE USING MESSAGE =
              'nenhum lote com frame da camera gravado, nada a limpar';
            RETURN;
          END IF;

          -- Reconstroi `camera.frames` sem a imagem, PRESERVANDO a ordem.
          -- `jsonb_agg` sobre `jsonb_array_elements` sem `ORDER BY` nao promete
          -- ordem; a ordinalidade e' o que garante que o lote continue sendo a
          -- mesma sequencia de instantes.
          UPDATE public.telemetria_lotes AS t
             SET payload = jsonb_set(
                   t.payload,
                   '{camera,frames}',
                   COALESCE(
                     (
                       SELECT jsonb_agg(elem.f - 'frame_b64' ORDER BY elem.ord)
                         FROM jsonb_array_elements(t.payload->'camera'->'frames')
                              WITH ORDINALITY AS elem(f, ord)
                     ),
                     '[]'::jsonb
                   )
                 )
           WHERE jsonb_path_exists(t.payload, '$.camera.frames[*].frame_b64');

          -- O de cima da estrutura: zero linhas hoje, mas a limpeza tem de
          -- cobrir as duas formas, senao volta a ser verdade pela metade.
          UPDATE public.telemetria_lotes AS t
             SET payload = jsonb_set(
                   t.payload,
                   '{camera}',
                   (t.payload->'camera') - 'frame_b64'
                 )
           WHERE t.payload->'camera' ? 'frame_b64';

          SELECT count(*), COALESCE(sum(length(payload::text)), 0)
            INTO v_depois, v_bytes_depois
            FROM public.telemetria_lotes
           WHERE jsonb_path_exists(payload, '$.camera.frames[*].frame_b64')
              OR payload->'camera' ? 'frame_b64';

          IF v_depois > 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'ainda restam ' || v_depois::text || ' lotes com frame da camera';
          END IF;

          RAISE NOTICE USING MESSAGE =
            'frames apagados de ' || v_antes::text || ' lote(s); '
            || pg_size_pretty(v_bytes_antes) || ' de payload viraram '
            || pg_size_pretty(
                 COALESCE((SELECT sum(length(payload::text))::bigint
                             FROM public.telemetria_lotes), 0)
               )
            || ' no total da tabela';
        END
        $limpa$;
        """
    )

    # O log de decisao ja nasce sanitizado desde a #92, mas a limpeza cobre o
    # que possa ter entrado antes -- a tabela e' o mesmo tipo de deposito.
    op.execute(
        """
        DO $limpa_log$
        DECLARE
          v_afetados bigint;
        BEGIN
          UPDATE public.ia_decision_logs AS l
             SET input_summary = jsonb_set(
                   l.input_summary::jsonb,
                   '{telemetria,camera,frames}',
                   COALESCE(
                     (
                       SELECT jsonb_agg(elem.f - 'frame_b64' ORDER BY elem.ord)
                         FROM jsonb_array_elements(
                                l.input_summary::jsonb->'telemetria'->'camera'->'frames'
                              ) WITH ORDINALITY AS elem(f, ord)
                     ),
                     '[]'::jsonb
                   )
                 )
           WHERE jsonb_path_exists(
                   l.input_summary::jsonb, '$.telemetria.camera.frames[*].frame_b64'
                 );

          GET DIAGNOSTICS v_afetados = ROW_COUNT;
          RAISE NOTICE USING MESSAGE =
            'ia_decision_logs limpos: ' || v_afetados::text;
        END
        $limpa_log$;
        """
    )

    op.execute(
        """
        DO $confere$
        DECLARE
          v_lotes bigint;
          v_logs bigint;
        BEGIN
          -- `position()` e nao `LIKE`: o padrao do LIKE precisaria de
          -- por-cento, e o renderizador offline do Alembic o dobra -- o texto
          -- chegaria ao Postgres procurando um por-cento literal e a conferencia
          -- passaria trivialmente, sempre em zero.
          SELECT count(*) INTO v_lotes FROM public.telemetria_lotes
           WHERE position('frame_b64' IN payload::text) > 0;

          SELECT count(*) INTO v_logs FROM public.ia_decision_logs
           WHERE position('frame_b64' IN input_summary::text) > 0;

          IF v_lotes > 0 OR v_logs > 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'ainda ha frame_b64: ' || v_lotes::text || ' lote(s) e '
              || v_logs::text || ' log(s)';
          END IF;

          RAISE NOTICE USING MESSAGE =
            'CONFERE: nenhum frame da camera resta em telemetria_lotes nem em ia_decision_logs';
        END
        $confere$;
        """
    )


def downgrade() -> None:
    # Nao ha volta: a imagem foi apagada, e restaurar exigiria um backup. E' o
    # comportamento desejado -- ela nunca deveria ter sido gravada.
    pass
