"""give merge_personalizacao_materiais_v2 more time than the 8s API default

Revision ID: 20260801_01
Revises: 20260728_06

O role `authenticator` (usado pelo PostgREST/Supabase para todas as chamadas
de API, inclusive RPC) tem `statement_timeout=8s` fixado a nivel de role -
esse limite persiste mesmo depois do `SET ROLE service_role` porque GUCs de
`ALTER ROLE ... SET` sao aplicados no login (session_authorization), nao no
role corrente. Para topicos com muitos blocos (>20), o JSONB de
`p_updates` (markdown + audioScript completos, alem do array de slides)
fica grande o bastante pra o merge + UPDATE estourar esse teto sob carga
normal, sem nenhum lock preso (confirmado: pg_locks/pg_stat_activity vazios
no momento da falha) - e so a chamada sendo genuinamente maior que 8s.
Escopar o timeout maior *dentro* da funcao, via `set_config(..., true)`
(is_local), evita afrouxar o limite global de 8s que protege o resto da API
de queries descontroladas.
"""

from alembic import op

revision = "20260801_01"
down_revision = "20260728_06"
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
    # Downgrade removeria so o set_config de timeout - sem valor pratico
    # (o resto da funcao fica identico a 20260728_05) e reintroduziria o
    # estouro de 8s em topicos grandes.
    pass
