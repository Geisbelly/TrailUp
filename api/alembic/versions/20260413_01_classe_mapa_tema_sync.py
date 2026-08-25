"""classe_mapa_tema table and class trigger to enqueue map-theme jobs"""

from alembic import op

revision = "20260413_01"
down_revision = "20260410_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.classe_mapa_tema (
          classe_id bigint NOT NULL,
          world_name text NOT NULL,
          world_subtitle text NULL,
          world_description text NULL,
          template_id text NULL,
          palette jsonb NOT NULL DEFAULT '{}'::jsonb,
          countries jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamp with time zone NOT NULL DEFAULT NOW(),
          updated_at timestamp with time zone NOT NULL DEFAULT NOW(),
          CONSTRAINT classe_mapa_tema_pkey PRIMARY KEY (classe_id),
          CONSTRAINT classe_mapa_tema_classe_id_fkey
            FOREIGN KEY (classe_id) REFERENCES public.classe(id) ON DELETE CASCADE
        )
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_enqueue_classe_mapa_tema_job()
        RETURNS trigger
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $$
        DECLARE
          v_job_id uuid;
          v_payload jsonb;
          v_has_jobs_table boolean;
        BEGIN
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'personalizacao_jobs'
          ) INTO v_has_jobs_table;

          IF NOT v_has_jobs_table THEN
            RETURN NEW;
          END IF;

          IF TG_OP = 'UPDATE'
             AND NEW.descricao IS NOT DISTINCT FROM OLD.descricao
             AND NEW.materia_id IS NOT DISTINCT FROM OLD.materia_id THEN
            RETURN NEW;
          END IF;

          v_payload := jsonb_build_object(
            'event', LOWER(TG_OP),
            'classe_id', NEW.id,
            'classe_descricao', NEW.descricao,
            'materia_id', NEW.materia_id,
            'changed_at', NOW(),
            'changed_fields', CASE
              WHEN TG_OP = 'UPDATE' THEN (
                SELECT COALESCE(jsonb_agg(field_name), '[]'::jsonb)
                FROM (
                  SELECT 'descricao' AS field_name
                  WHERE NEW.descricao IS DISTINCT FROM OLD.descricao
                  UNION ALL
                  SELECT 'materia_id' AS field_name
                  WHERE NEW.materia_id IS DISTINCT FROM OLD.materia_id
                ) s
              )
              ELSE '[]'::jsonb
            END,
            'old', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
            'new', to_jsonb(NEW)
          );

          SELECT id
          INTO v_job_id
          FROM personalizacao_jobs
          WHERE kind = 'class_theme_sync'
            AND classe_id = NEW.id
            AND status IN ('pending', 'processing', 'partial')
          ORDER BY created_at DESC
          LIMIT 1;

          IF v_job_id IS NOT NULL THEN
            UPDATE personalizacao_jobs
            SET payload = COALESCE(payload, '{}'::jsonb) || v_payload,
                updated_at = NOW(),
                trigger_source = 'db_classe_trigger'
            WHERE id = v_job_id;
            RETURN NEW;
          END IF;

          INSERT INTO personalizacao_jobs (
            id,
            kind,
            status,
            classe_id,
            aluno_id,
            topico_id,
            conteudo_id,
            trigger_source,
            payload,
            total_targets,
            processed_targets,
            error_count,
            last_error,
            created_at,
            updated_at,
            started_at,
            finished_at
          ) VALUES (
            gen_random_uuid(),
            'class_theme_sync',
            'pending',
            NEW.id,
            NULL,
            NULL,
            NULL,
            'db_classe_trigger',
            v_payload,
            0,
            0,
            0,
            NULL,
            NOW(),
            NOW(),
            NULL,
            NULL
          );

          RETURN NEW;
        EXCEPTION
          WHEN OTHERS THEN
            RAISE NOTICE 'fn_enqueue_classe_mapa_tema_job falhou: %', SQLERRM;
            RETURN NEW;
        END;
        $$;
        """
    )

    op.execute("DROP TRIGGER IF EXISTS trg_classe_mapa_tema_job ON public.classe")
    op.execute(
        """
        CREATE TRIGGER trg_classe_mapa_tema_job
        AFTER INSERT OR UPDATE OF descricao, materia_id
        ON public.classe
        FOR EACH ROW
        EXECUTE FUNCTION public.fn_enqueue_classe_mapa_tema_job()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_classe_mapa_tema_job ON public.classe")
    op.execute("DROP FUNCTION IF EXISTS public.fn_enqueue_classe_mapa_tema_job()")
    op.execute("DROP TABLE IF EXISTS public.classe_mapa_tema")

