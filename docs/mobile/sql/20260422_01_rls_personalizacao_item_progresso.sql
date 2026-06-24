-- RLS fix for direct app writes on personalizacao_item_progresso
-- Date: 2026-04-22
-- Purpose: allow authenticated users to read/write only their own progress rows.

BEGIN;

ALTER TABLE public.personalizacao_item_progresso ENABLE ROW LEVEL SECURITY;

-- Ensure role has table privileges (RLS still restricts row scope).
GRANT SELECT, INSERT, UPDATE ON TABLE public.personalizacao_item_progresso TO authenticated;

-- SELECT: own rows only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personalizacao_item_progresso'
      AND policyname = 'p_item_prog_select_own'
  ) THEN
    CREATE POLICY p_item_prog_select_own
      ON public.personalizacao_item_progresso
      FOR SELECT
      TO authenticated
      USING (auth.uid() = aluno_id);
  END IF;
END
$$;

-- INSERT: can insert only with own aluno_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personalizacao_item_progresso'
      AND policyname = 'p_item_prog_insert_own'
  ) THEN
    CREATE POLICY p_item_prog_insert_own
      ON public.personalizacao_item_progresso
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = aluno_id);
  END IF;
END
$$;

-- UPDATE: can update only own rows and keep own aluno_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personalizacao_item_progresso'
      AND policyname = 'p_item_prog_update_own'
  ) THEN
    CREATE POLICY p_item_prog_update_own
      ON public.personalizacao_item_progresso
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = aluno_id)
      WITH CHECK (auth.uid() = aluno_id);
  END IF;
END
$$;

COMMIT;
