-- 0001_merge_personalizacao_materiais_rpc.sql
--
-- Substitui o merge JS de conteudo_personalizado.materiais por uma função
-- atômica em PL/pgSQL protegida por pg_advisory_xact_lock(personalizacao_id).
--
-- Por que: o merge JS faz read-modify-write em duas instruções separadas.
-- Duas instâncias do ApiBrainHex rodando em paralelo (ex.: deploy escalado
-- horizontalmente, ou blue-green) podem sobrescrever atualizações uma da
-- outra — ex.: áudio termina na instância A enquanto PDF termina na B,
-- ambas leem o mesmo materiais inicial e escrevem versões divergentes.
--
-- Como aplicar:
--   1. Via Supabase CLI:    supabase db push
--   2. Via SQL Editor:      cole este arquivo e execute
--   3. Via psql direto:     psql "$DATABASE_URL" -f sql/migrations/0001_...sql
--
-- Após aplicar, supabaseService.ts detecta a função e usa-a automaticamente.
-- Enquanto não aplicada, o serviço cai no fallback JS (com lock in-process).
--
-- Para REVERTER:
--   DROP FUNCTION IF EXISTS public.merge_personalizacao_materiais(BIGINT, JSONB);

CREATE OR REPLACE FUNCTION public.merge_personalizacao_materiais(
  p_id      BIGINT,
  p_updates JSONB
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_materiais JSONB;
  v_current_status    TEXT;
  v_filtered_updates  JSONB := '{}'::jsonb;
  v_merged            JSONB;
  v_new_status        TEXT;
  v_statuses          TEXT[];
  v_all_done          BOOLEAN;
  v_any_pending       BOOLEAN;
  k                   TEXT;
  v                   JSONB;
BEGIN
  -- Lock por personalização — auto-liberado no fim da transação.
  -- Granularidade: apenas chamadas para o MESMO p_id se serializam;
  -- IDs diferentes rodam em paralelo.
  PERFORM pg_advisory_xact_lock(p_id);

  SELECT cp.materiais, cp.status
    INTO v_current_materiais, v_current_status
    FROM public.conteudo_personalizado cp
   WHERE cp.id = p_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'personalizacao % não encontrada', p_id
      USING ERRCODE = 'no_data_found';
  END IF;

  v_current_materiais := COALESCE(v_current_materiais, '{}'::jsonb);

  -- Filtra: nunca sobrescreve formato com status="completed" já persistido.
  FOR k, v IN SELECT * FROM jsonb_each(p_updates) LOOP
    IF v_current_materiais -> k -> 'metadata' ->> 'status' IS DISTINCT FROM 'completed' THEN
      v_filtered_updates := v_filtered_updates || jsonb_build_object(k, v);
    END IF;
  END LOOP;

  -- Merge shallow (operator || em jsonb) — espelha o `{...current, ...filtered}` do JS.
  v_merged := v_current_materiais || v_filtered_updates;

  -- Coleta status de todos os artefatos para calcular status agregado.
  SELECT COALESCE(array_agg(s), ARRAY[]::TEXT[])
    INTO v_statuses
    FROM (
      SELECT (value -> 'metadata' ->> 'status') AS s
        FROM jsonb_each(v_merged)
    ) sub
   WHERE s IS NOT NULL AND s <> '';

  v_all_done := (
    array_length(v_statuses, 1) > 0
    AND NOT EXISTS (
      SELECT 1 FROM unnest(v_statuses) AS x
       WHERE x NOT IN ('completed', 'failed', 'failed_quality')
    )
  );

  v_any_pending := 'pending' = ANY(v_statuses);

  v_new_status := CASE
    WHEN v_current_status = 'pronto'  THEN 'pronto'
    WHEN v_all_done                   THEN 'pronto'
    WHEN v_any_pending                THEN 'processando_midias'
    ELSE v_current_status
  END;

  UPDATE public.conteudo_personalizado
     SET materiais  = v_merged,
         status     = v_new_status,
         updated_at = NOW()
   WHERE id = p_id;

  RETURN v_new_status;
END;
$$;

-- Permite que o role anon/authenticated da API chame a função.
-- Ajuste para o role real que sua service_role usa.
GRANT EXECUTE ON FUNCTION public.merge_personalizacao_materiais(BIGINT, JSONB)
  TO service_role;

COMMENT ON FUNCTION public.merge_personalizacao_materiais(BIGINT, JSONB) IS
  'Merge atômico de conteudo_personalizado.materiais com pg_advisory_xact_lock(id). '
  'Substitui o read-modify-write JS em supabaseService.ts:mergePersonalizacaoMateriais. '
  'Retorna o novo status agregado.';
