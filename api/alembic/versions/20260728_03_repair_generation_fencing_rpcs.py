"""repair missing BrainHex generation fencing RPCs

Revision ID: 20260728_03
Revises: 20260728_02

Some environments reached ``20260728_02`` without retaining the RPCs added
to that revision. A new revision is required because Alembic never reruns a
revision that is already recorded in ``alembic_version``.
"""

from alembic import op

revision = "20260728_03"
down_revision = "20260728_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # CREATE OR REPLACE makes this repair safe both for drifted databases and
    # for databases where 20260728_02 was applied completely.
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
            IF NOT COALESCE(
              (
                v_current_materiais -> k -> 'metadata' ->> 'status' = 'completed'
                AND v_current_materiais -> k -> 'metadata' ->> 'generation_key'
                    = v_generation_key
                AND (
                  k <> 'apresentacao'
                  OR (
                    v_current_materiais -> k -> 'metadata' ->> 'engine'
                      = 'puppeteer-html-v2'
                    AND v_current_materiais -> k -> 'metadata'
                      ->> 'media_pipeline_version' = '2026-07-28.3'
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
                    = v_generation_key
                AND (
                  media_kind <> 'apresentacao'
                  OR (
                    v_merged -> media_kind -> 'metadata' ->> 'engine'
                      = 'puppeteer-html-v2'
                    AND v_merged -> media_kind -> 'metadata'
                      ->> 'media_pipeline_version' = '2026-07-28.3'
                  )
                ),
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
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.mark_personalizacao_failed_v2(
          p_id BIGINT,
          p_error_message TEXT,
          p_ciclo_id TEXT,
          p_source_hash TEXT
        ) RETURNS BOOLEAN
        LANGUAGE plpgsql
        AS $$
        DECLARE
          v_materiais JSONB;
          v_current_ciclo_id TEXT;
          v_current_source_hash TEXT;
          v_generation_key TEXT;
          v_all_completed BOOLEAN;
        BEGIN
          PERFORM pg_advisory_xact_lock(p_id);

          SELECT
            COALESCE(cp.materiais, '{}'::jsonb),
            COALESCE(cp.ciclo_id::text, ''),
            COALESCE(cp.source_hash, '')
          INTO v_materiais, v_current_ciclo_id, v_current_source_hash
          FROM public.conteudo_personalizado cp
          WHERE cp.id = p_id
          FOR UPDATE;

          IF NOT FOUND THEN
            RETURN FALSE;
          END IF;
          IF v_current_ciclo_id IS DISTINCT FROM COALESCE(p_ciclo_id, '')
             OR v_current_source_hash IS DISTINCT FROM COALESCE(p_source_hash, '') THEN
            RETURN FALSE;
          END IF;

          v_generation_key := p_ciclo_id || ':' || p_source_hash;
          v_all_completed := (
            SELECT bool_and(
              COALESCE(
                v_materiais -> media_kind -> 'metadata' ->> 'status' = 'completed'
                AND v_materiais -> media_kind -> 'metadata' ->> 'generation_key'
                    = v_generation_key
                AND (
                  media_kind <> 'apresentacao'
                  OR (
                    v_materiais -> media_kind -> 'metadata' ->> 'engine'
                      = 'puppeteer-html-v2'
                    AND v_materiais -> media_kind -> 'metadata'
                      ->> 'media_pipeline_version' = '2026-07-28.3'
                  )
                ),
                FALSE
              )
            )
            FROM unnest(ARRAY['audio', 'markdown', 'apresentacao'])
              AS kinds(media_kind)
          );

          IF COALESCE(v_all_completed, FALSE) THEN
            RETURN FALSE;
          END IF;

          UPDATE public.conteudo_personalizado
          SET status = 'failed',
              materiais = v_materiais || jsonb_build_object(
                'erro',
                jsonb_build_object(
                  'mensagem', p_error_message,
                  'generation_key', v_generation_key,
                  'updated_at', NOW()
                )
              ),
              updated_at = NOW()
          WHERE id = p_id;
          RETURN TRUE;
        END;
        $$;
        """
    )
    op.execute(
        """
        REVOKE ALL ON FUNCTION public.merge_personalizacao_materiais_v2(
          BIGINT, JSONB, TEXT, TEXT
        ) FROM PUBLIC
        """
    )
    op.execute(
        """
        REVOKE ALL ON FUNCTION public.mark_personalizacao_failed_v2(
          BIGINT, TEXT, TEXT, TEXT
        ) FROM PUBLIC
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            GRANT EXECUTE ON FUNCTION public.merge_personalizacao_materiais_v2(
              BIGINT, JSONB, TEXT, TEXT
            ) TO service_role;
          END IF;
        END;
        $$
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            GRANT EXECUTE ON FUNCTION public.mark_personalizacao_failed_v2(
              BIGINT, TEXT, TEXT, TEXT
            ) TO service_role;
          END IF;
        END;
        $$
        """
    )
    # Supabase/PostgREST may otherwise keep the old routine cache briefly
    # after the transactional DDL commits.
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    # 20260728_02 already declares these RPCs as part of its target schema.
    # Removing them here would make a downgrade to that revision inconsistent.
    pass
