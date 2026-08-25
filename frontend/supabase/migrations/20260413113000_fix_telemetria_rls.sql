-- Telemetria RLS: libera fallback do mobile para o proprio aluno autenticado.
-- Idempotente e seguro para ambientes onde as tabelas ainda nao existem.

DO $$
BEGIN
  IF to_regclass('public.telemetria_sessoes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.telemetria_sessoes ENABLE ROW LEVEL SECURITY';
  END IF;

  IF to_regclass('public.telemetria_lotes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.telemetria_lotes ENABLE ROW LEVEL SECURITY';
  END IF;

  IF to_regclass('public.telemetria_eventos_app') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.telemetria_eventos_app ENABLE ROW LEVEL SECURITY';
  END IF;

  IF to_regclass('public.telemetria_time_metric_entries') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.telemetria_time_metric_entries ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.telemetria_sessoes') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'telemetria_sessoes'
        AND policyname = 'telemetria_sessoes_select_own'
    ) THEN
      EXECUTE '
        CREATE POLICY telemetria_sessoes_select_own
        ON public.telemetria_sessoes
        FOR SELECT
        TO authenticated
        USING (aluno_id = auth.uid())
      ';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'telemetria_sessoes'
        AND policyname = 'telemetria_sessoes_insert_own'
    ) THEN
      EXECUTE '
        CREATE POLICY telemetria_sessoes_insert_own
        ON public.telemetria_sessoes
        FOR INSERT
        TO authenticated
        WITH CHECK (aluno_id = auth.uid())
      ';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'telemetria_sessoes'
        AND policyname = 'telemetria_sessoes_update_own'
    ) THEN
      EXECUTE '
        CREATE POLICY telemetria_sessoes_update_own
        ON public.telemetria_sessoes
        FOR UPDATE
        TO authenticated
        USING (aluno_id = auth.uid())
        WITH CHECK (aluno_id = auth.uid())
      ';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.telemetria_lotes') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'telemetria_lotes'
        AND policyname = 'telemetria_lotes_select_own'
    ) THEN
      EXECUTE '
        CREATE POLICY telemetria_lotes_select_own
        ON public.telemetria_lotes
        FOR SELECT
        TO authenticated
        USING (aluno_id = auth.uid())
      ';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'telemetria_lotes'
        AND policyname = 'telemetria_lotes_insert_own'
    ) THEN
      EXECUTE '
        CREATE POLICY telemetria_lotes_insert_own
        ON public.telemetria_lotes
        FOR INSERT
        TO authenticated
        WITH CHECK (aluno_id = auth.uid())
      ';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.telemetria_eventos_app') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'telemetria_eventos_app'
        AND policyname = 'telemetria_eventos_app_select_own'
    ) THEN
      EXECUTE '
        CREATE POLICY telemetria_eventos_app_select_own
        ON public.telemetria_eventos_app
        FOR SELECT
        TO authenticated
        USING (aluno_id = auth.uid())
      ';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'telemetria_eventos_app'
        AND policyname = 'telemetria_eventos_app_insert_own'
    ) THEN
      EXECUTE '
        CREATE POLICY telemetria_eventos_app_insert_own
        ON public.telemetria_eventos_app
        FOR INSERT
        TO authenticated
        WITH CHECK (aluno_id = auth.uid())
      ';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'telemetria_eventos_app'
        AND policyname = 'telemetria_eventos_app_update_own'
    ) THEN
      EXECUTE '
        CREATE POLICY telemetria_eventos_app_update_own
        ON public.telemetria_eventos_app
        FOR UPDATE
        TO authenticated
        USING (aluno_id = auth.uid())
        WITH CHECK (aluno_id = auth.uid())
      ';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.telemetria_time_metric_entries') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'telemetria_time_metric_entries'
        AND policyname = 'telemetria_time_metric_entries_select_own'
    ) THEN
      EXECUTE '
        CREATE POLICY telemetria_time_metric_entries_select_own
        ON public.telemetria_time_metric_entries
        FOR SELECT
        TO authenticated
        USING (aluno_id = auth.uid())
      ';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'telemetria_time_metric_entries'
        AND policyname = 'telemetria_time_metric_entries_insert_own'
    ) THEN
      EXECUTE '
        CREATE POLICY telemetria_time_metric_entries_insert_own
        ON public.telemetria_time_metric_entries
        FOR INSERT
        TO authenticated
        WITH CHECK (aluno_id = auth.uid())
      ';
    END IF;
  END IF;
END $$;

