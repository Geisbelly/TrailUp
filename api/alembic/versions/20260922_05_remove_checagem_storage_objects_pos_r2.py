"""remove a checagem de storage.objects, que reprovava toda geracao nova pos-R2

Desfaz o que a `20260922_03` fez. Aquela revisao passou a exigir que
`merge_personalizacao_materiais_v2` confirmasse em `storage.objects` que os
arquivos reportados existem antes de aceitar `status = "completed"`, marcando
`failed` quando nao existissem.

## Por que a checagem esta errada

Depois da migracao para o Cloudflare R2 (spec
`docs/superpowers/specs/2026-08-29-r2-gateway-design.md`), **escrita nova vai
so' para o R2**; `storage.objects` guarda apenas o que ja' estava la' antes.
O Postgres nao alcanca o R2, entao nao ha consulta possivel que confirme a
existencia do arquivo. A checagem nao reprovava um caso raro: reprovava
**100% das geracoes novas**. Medido em producao no dia: das 6 linhas de
material com `arquivo_url`, as 6 tinham o objeto ausente de `storage.objects`,
e 3 ja haviam sido marcadas `failed` (ids 3675, 3680, 3832) — os tres arquivos
existiam, com 4411, 4500 e 3357 bytes de conteudo real, baixados pelo gateway.
O professor via "A geracao deste material falhou" em material perfeito.

## Por que o diagnostico da 20260922_03 estava errado

Ela foi escrita para explicar por que `id=3680` aparecia no console como
"nao foi possivel carregar ... {}" com 400 do Storage, e concluiu que o upload
tinha falhado em silencio e a RPC aceitara um `completed` mentiroso. Nao era
isso. O arquivo estava no R2, inteiro; quem procurava no lugar errado era o
FRONTEND, que baixava o material com `supabase.storage.from(...).download(...)`
em vez de passar pelo gateway. Esse era o bug, corrigido em
`htmlDeckSource.ts`/`PerfilConteudoView.tsx`.

A licao, que vale para qualquer checagem futura: **`storage.objects` nao e'
mais fonte de verdade sobre a existencia de material.** Quem sabe se o upload
deu certo e' quem sobe o arquivo (microservice/BrainHexPDF), no momento em que
sobe — nao o banco, depois. Validar isso em SQL nao e' defesa em profundidade,
e' um falso negativo garantido.

## O que esta revisao faz

  1. Reescreve a funcao SEM a checagem, nos dois pontos onde a `20260922_03` a
     tinha posto (no update recebido e no ramo de "preservar o que ja esta
     completo"), preservando o que nao tem relacao com isso — `SET search_path`
     e o acumulo de `formatos_gerados`.
  2. Repara as linhas marcadas por este motivo. O filtro e' o texto exato do
     erro que so' a `20260922_03` escrevia, entao nao ha risco de ressuscitar
     falha legitima (quota da IA, limite de resposta, upload que de fato nao
     aconteceu) — essas tem `error` diferente ou nenhum.

Ambos os passos ja foram aplicados a mao no banco de producao antes deste
arquivo existir; o SQL descreve o estado final, entao rodar sobre o banco ja
corrigido e' inocuo.

Revision ID: 20260922_05
Revises: 20260922_04
Create Date: 2026-09-22
"""

from alembic import op

revision = "20260922_05"
down_revision = "20260922_04"
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
            -- recebido. Assim um deploy novo substitui o artefato antigo sem
            -- congelar versoes de pipeline dentro da funcao SQL.
            --
            -- NAO acrescente aqui (nem no merge abaixo) uma checagem de que o
            -- arquivo existe em `storage.objects`: depois do R2 esse catalogo
            -- nao ve a escrita nova, entao a checagem reprova toda geracao
            -- valida. Ver o docstring desta revisao.
            IF NOT COALESCE(
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
            ) THEN
              v_filtered_updates := v_filtered_updates || jsonb_build_object(k, v);
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

    # Repara so' o que a 20260922_03 marcou: o texto do erro e' exclusivo dela.
    # Falha legitima (quota da IA, limite de resposta, upload que realmente
    # nao aconteceu) tem outro `error`, ou nenhum, e fica intocada.
    op.execute(
        """
        UPDATE public.conteudo_personalizado cp
           SET materiais = (
                 SELECT jsonb_object_agg(
                          tipo.k,
                          CASE
                            WHEN jsonb_typeof(tipo.v) = 'object'
                             AND tipo.v -> 'metadata' ->> 'error'
                                 LIKE 'storage_object_ausente%'
                            THEN jsonb_set(
                                   tipo.v,
                                   '{metadata}',
                                   (tipo.v -> 'metadata' #- '{error}')
                                     || jsonb_build_object('status', 'completed')
                                 )
                            ELSE tipo.v
                          END
                        )
                   FROM jsonb_each(cp.materiais) AS tipo(k, v)
               ),
               updated_at = NOW()
         WHERE EXISTS (
                 SELECT 1
                   FROM jsonb_each(cp.materiais) AS tipo(k, v)
                  WHERE jsonb_typeof(tipo.v) = 'object'
                    AND tipo.v -> 'metadata' ->> 'error'
                        LIKE 'storage_object_ausente%'
               )
        """
    )

    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    raise RuntimeError(
        "Downgrade reintroduziria a checagem contra storage.objects, que "
        "reprova toda geracao nova depois da migracao para o R2."
    )
