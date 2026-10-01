"""merge_personalizacao_materiais_v2 confirma storage antes de aceitar completed

Revision ID: 20260922_03
Revises: 20260922_02

O BrainHexPDF chama esta RPC direto (fora do monorepo, ver
docs/superpowers/specs/2026-08-16-brainhexpdf-direct-db-write-design.md) para
gravar `materiais.<tipo>.metadata.status = "completed"` depois de gerar e
subir o arquivo no Storage. A funcao sempre confiou nessa palavra: nunca
checou se o `storage_path` reportado existe de fato em `storage.objects`.

Quando o upload falha silenciosamente do lado do BrainHexPDF (ou de qualquer
outro caller futuro) mas a chamada da RPC ainda chega com status=completed,
o registro vira "pronto" com uma URL morta - o aluno/professor so descobre ao
abrir o material (erro `{}` na tela, 400 do Supabase Storage). Foi assim que
`conteudo_personalizado.id=3680` (classe 54, topico 131, perfil seeker) ficou
preso: `materiais._geracao_falhas.streak=2` mostrava que o sistema ja tinha
detectado 2 falhas dessa mesma geracao, mas o proprio merge continuou
aceitando o "completed" mentiroso por cima, entao o status nunca virou
"failed" e o circuito de retry (`_has_completed_current_generation` em
api/app/services/personalizacao_jobs.py) nunca foi acionado de novo.

Fix, em duas partes (a primeira sem a segunda nao resolve nada - testado
contra producao antes de escrever esta versao final):

1. Quando o update recebido para um `media_kind` diz `status=completed`, a
   funcao confere em `storage.objects` (bucket + storage_path de cada parte,
   ou do proprio objeto quando nao ha `partes`) que o arquivo existe. Se
   faltar qualquer um, o `status` desse `media_kind` e reescrito para
   `failed` (com uma `metadata.error` explicando o motivo) antes do merge.

2. A checagem de "preservar o que ja esta completo" (evita que uma resposta
   duplicada/fora de ordem sobrescreva um resultado ja bom da mesma geracao)
   agora TAMBEM confere storage.objects para o que ja esta gravado, nao so
   os metadados. Sem isso, um registro que ja tinha sido marcado "completed"
   incorretamente (por qualquer causa anterior a este fix) ficava preso pra
   sempre: qualquer nova tentativa pro mesmo generation_key era descartada
   por "ja esta completo" antes de chegar na validacao do item 1 - foi
   exatamente isso que aconteceu ao tentar corrigir o id=3680 reenviando os
   proprios dados quebrados (voltava "pronto" de novo, silenciosamente, ate
   este segundo ajuste).

Com as duas partes, reenviar o `materiais` quebrado do id=3680 passou a
retornar `status=processando_midias` com os 3 media_kind marcados `failed` -
o circuito de retry ja existente (falha_streak, redisparo) assume dali.

`idx_objects_bucket_id_name` cobre as duas checagens (poucos lookups
indexados por geracao, tipicamente 1-20 partes) - custo desprezivel dentro
do statement_timeout de 30s ja usado por esta funcao.
"""

from alembic import op

revision = "20260922_03"
down_revision = "20260922_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.merge_personalizacao_materiais_v2(
          p_id BIGINT,
          p_updates JSONB,
          p_ciclo_id TEXT,
          p_source_hash TEXT
        ) RETURNS JSONB
        LANGUAGE plpgsql
        SET search_path TO 'public', 'pg_temp'
        AS $$
        DECLARE
          v_current_materiais JSONB;
          v_current_status TEXT;
          v_current_ciclo_id TEXT;
          v_current_source_hash TEXT;
          v_generation_key TEXT;
          v_filtered_updates JSONB := '{}'::jsonb;
          v_merged JSONB;
          v_new_status TEXT;
          v_all_done BOOLEAN;
          v_any_pending BOOLEAN;
          k TEXT;
          v JSONB;
          v_to_merge JSONB;
          v_storage_ok BOOLEAN;
          v_current_complete BOOLEAN;
        BEGIN
          -- Escopado a esta transacao (is_local=true): nao vaza para outras
          -- chamadas na mesma conexao pooled nem afrouxa o teto de 8s do
          -- role `authenticator` para o resto da API.
          PERFORM set_config('statement_timeout', '30000', true);

          PERFORM pg_advisory_xact_lock(p_id);

          SELECT
            COALESCE(cp.materiais, '{}'::jsonb),
            cp.status,
            COALESCE(cp.ciclo_id::text, ''),
            COALESCE(cp.source_hash, '')
          INTO
            v_current_materiais,
            v_current_status,
            v_current_ciclo_id,
            v_current_source_hash
          FROM public.conteudo_personalizado cp
          WHERE cp.id = p_id
          FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION USING MESSAGE =
              'personalizacao ' || p_id::text || ' nao encontrada';
          END IF;
          IF v_current_ciclo_id IS DISTINCT FROM COALESCE(p_ciclo_id, '')
             OR v_current_source_hash IS DISTINCT FROM COALESCE(p_source_hash, '') THEN
            RAISE EXCEPTION USING MESSAGE =
              'stale_generation para personalizacao ' || p_id::text
              || ' (ciclo/source alterados)';
          END IF;

          v_generation_key := p_ciclo_id || ':' || p_source_hash;

          FOR k, v IN SELECT * FROM jsonb_each(COALESCE(p_updates, '{}'::jsonb))
          LOOP
            -- Um resultado concluido da mesma geracao so e preservado quando
            -- usa exatamente o mesmo contrato de apresentacao do resultado
            -- recebido E quando os arquivos que ele reivindica ainda
            -- existem no Storage.
            v_current_complete := COALESCE(
              (
                v_current_materiais -> k -> 'metadata' ->> 'status' = 'completed'
                AND v_current_materiais -> k -> 'metadata' ->> 'generation_key'
                    = v_generation_key
                AND (
                  k <> 'apresentacao'
                  OR (
                    v_current_materiais -> k -> 'metadata' ->> 'engine'
                      IS NOT DISTINCT FROM
                        v -> 'metadata' ->> 'engine'
                    AND v_current_materiais -> k -> 'metadata'
                          ->> 'media_pipeline_version'
                      IS NOT DISTINCT FROM
                        v -> 'metadata' ->> 'media_pipeline_version'
                    AND v_current_materiais -> k -> 'metadata'
                          ->> 'design_system'
                      IS NOT DISTINCT FROM
                        v -> 'metadata' ->> 'design_system'
                  )
                )
              ),
              FALSE
            );

            IF v_current_complete THEN
              SELECT NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(
                  CASE
                    WHEN jsonb_typeof(v_current_materiais -> k -> 'partes') = 'array'
                      THEN v_current_materiais -> k -> 'partes'
                    ELSE jsonb_build_array(v_current_materiais -> k)
                  END
                ) AS parte
                WHERE parte ->> 'storage_path' IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1
                    FROM storage.objects so
                    WHERE so.bucket_id = COALESCE(v_current_materiais -> k ->> 'bucket', parte ->> 'bucket')
                      AND so.name = parte ->> 'storage_path'
                  )
              )
              INTO v_storage_ok;
              v_current_complete := COALESCE(v_storage_ok, TRUE);
            END IF;

            IF NOT v_current_complete THEN
              v_to_merge := v;

              -- Nunca aceita "completed" so pela palavra de quem chama a
              -- RPC: confirma contra storage.objects que os arquivos
              -- reportados existem de fato. Sem isso, um upload que falhou
              -- silenciosamente marca a personalizacao como "pronto" com
              -- uma URL morta.
              IF v -> 'metadata' ->> 'status' = 'completed' THEN
                SELECT NOT EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(
                    CASE
                      WHEN jsonb_typeof(v -> 'partes') = 'array' THEN v -> 'partes'
                      ELSE jsonb_build_array(v)
                    END
                  ) AS parte
                  WHERE parte ->> 'storage_path' IS NOT NULL
                    AND NOT EXISTS (
                      SELECT 1
                      FROM storage.objects so
                      WHERE so.bucket_id = COALESCE(v ->> 'bucket', parte ->> 'bucket')
                        AND so.name = parte ->> 'storage_path'
                    )
                )
                INTO v_storage_ok;

                IF NOT COALESCE(v_storage_ok, TRUE) THEN
                  v_to_merge := jsonb_set(
                    jsonb_set(v, '{metadata,status}', '"failed"'::jsonb),
                    '{metadata,error}',
                    to_jsonb(
                      'storage_object_ausente: geracao reportou completed mas o(s) arquivo(s) nao existem no Storage'::text
                    )
                  );
                END IF;
              END IF;

              v_filtered_updates := v_filtered_updates || jsonb_build_object(k, v_to_merge);
            END IF;
          END LOOP;

          v_merged := v_current_materiais || v_filtered_updates;

          SELECT
            bool_and(
              COALESCE(
                v_merged -> media_kind -> 'metadata' ->> 'status' = 'completed'
                AND v_merged -> media_kind -> 'metadata' ->> 'generation_key'
                    = v_generation_key,
                FALSE
              )
            ),
            bool_or(
              COALESCE(
                v_merged -> media_kind -> 'metadata' ->> 'status' = 'pending'
                AND v_merged -> media_kind -> 'metadata' ->> 'generation_key'
                    = v_generation_key,
                FALSE
              )
            )
          INTO v_all_done, v_any_pending
          FROM unnest(ARRAY['audio', 'markdown', 'apresentacao'])
            AS kinds(media_kind);

          v_new_status := CASE
            WHEN v_all_done THEN 'pronto'
            WHEN v_any_pending THEN 'processando_midias'
            WHEN v_current_status = 'pronto' THEN 'processando_midias'
            ELSE v_current_status
          END;

          UPDATE public.conteudo_personalizado
          SET materiais = v_merged,
              status = v_new_status,
              formatos_gerados = COALESCE(conteudo_personalizado.formatos_gerados, ARRAY[]::text[]) || ARRAY(
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
              updated_at = NOW()
          WHERE id = p_id;

          RETURN jsonb_build_object(
            'status', v_new_status,
            'materiais', v_merged,
            'generation_key', v_generation_key
          );
        END;
        $$;
        """
    )
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    # Downgrade removeria so a validacao contra storage.objects - sem valor
    # pratico (reintroduz o bug que este arquivo corrige) e o resto da
    # funcao fica identico ao estado atual em producao.
    pass
