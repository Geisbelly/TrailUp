-- RLS for direct app access on trilha_checkpoint_navegacao
-- Date: 2026-08-26
-- Purpose: allow authenticated users to read/write/delete only their own
--          navigation checkpoint rows.
--
-- Roda DEPOIS da migracao 20260826_01, que cria a tabela.
--
-- Inclui DELETE, ao contrario das politicas de personalizacao_item_progresso:
-- `clearTrilhaCheckpoint` (mobile/src/utils/trilhaCheckpoint.ts) apaga a linha
-- quando o topico e concluido. Sem a politica de DELETE o app nao acusa erro --
-- so deixa checkpoint velho para tras, e o topico concluido reabre no meio.

BEGIN;

ALTER TABLE public.trilha_checkpoint_navegacao ENABLE ROW LEVEL SECURITY;

-- Privilegios de tabela (o RLS ainda restringe o escopo das linhas).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trilha_checkpoint_navegacao TO authenticated;

-- SELECT: own rows only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trilha_checkpoint_navegacao'
      AND policyname = 'p_trilha_checkpoint_select_own'
  ) THEN
    CREATE POLICY p_trilha_checkpoint_select_own
      ON public.trilha_checkpoint_navegacao
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
      AND tablename = 'trilha_checkpoint_navegacao'
      AND policyname = 'p_trilha_checkpoint_insert_own'
  ) THEN
    CREATE POLICY p_trilha_checkpoint_insert_own
      ON public.trilha_checkpoint_navegacao
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = aluno_id);
  END IF;
END
$$;

-- UPDATE: can update only own rows and keep own aluno_id
-- (o app grava via upsert; sem esta politica o ON CONFLICT falha no caminho
--  de atualizacao, que e o caso comum a partir da segunda gravacao)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trilha_checkpoint_navegacao'
      AND policyname = 'p_trilha_checkpoint_update_own'
  ) THEN
    CREATE POLICY p_trilha_checkpoint_update_own
      ON public.trilha_checkpoint_navegacao
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = aluno_id)
      WITH CHECK (auth.uid() = aluno_id);
  END IF;
END
$$;

-- DELETE: own rows only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trilha_checkpoint_navegacao'
      AND policyname = 'p_trilha_checkpoint_delete_own'
  ) THEN
    CREATE POLICY p_trilha_checkpoint_delete_own
      ON public.trilha_checkpoint_navegacao
      FOR DELETE
      TO authenticated
      USING (auth.uid() = aluno_id);
  END IF;
END
$$;

COMMIT;
