-- 0002_mark_personalizacao_failed_rpc.sql
--
-- Marca uma personalização como falha de forma atômica, preservando os
-- artefatos já completados em `materiais` (apenas adiciona/sobrescreve a
-- chave "erro"). Equivalente ao markPersonalizacaoFailed JS, agora
-- protegido por pg_advisory_xact_lock para evitar race cross-instance.
--
-- Cenário de race protegido: um job está terminando uploads (chama
-- mergePersonalizacaoMateriais) enquanto outro thread/instância detecta
-- timeout do mesmo job e chama markPersonalizacaoFailed. Sem lock, a
-- ordem dos UPDATEs é não-determinística e pode perder dados.
--
-- Como aplicar / reverter: ver header de 0001_merge_personalizacao_materiais_rpc.sql.

CREATE OR REPLACE FUNCTION public.mark_personalizacao_failed(
  p_id            BIGINT,
  p_error_message TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_materiais JSONB;
  v_merged            JSONB;
BEGIN
  -- Mesmo lock usado por merge_personalizacao_materiais — qualquer combinação
  -- de chamadas para o MESMO id se serializa.
  PERFORM pg_advisory_xact_lock(p_id);

  SELECT cp.materiais
    INTO v_current_materiais
    FROM public.conteudo_personalizado cp
   WHERE cp.id = p_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'personalizacao % não encontrada', p_id
      USING ERRCODE = 'no_data_found';
  END IF;

  v_current_materiais := COALESCE(v_current_materiais, '{}'::jsonb);

  -- Adiciona/sobrescreve apenas a chave "erro" — preserva audio/markdown/
  -- apresentacao já completados em runs anteriores.
  v_merged := v_current_materiais || jsonb_build_object(
    'erro', jsonb_build_object(
      'mensagem',   p_error_message,
      'updated_at', to_jsonb(NOW())
    )
  );

  UPDATE public.conteudo_personalizado
     SET status     = 'falha',
         materiais  = v_merged,
         updated_at = NOW()
   WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_personalizacao_failed(BIGINT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.mark_personalizacao_failed(BIGINT, TEXT) IS
  'Marca personalização como falha preservando materiais já completados. '
  'Atômico via pg_advisory_xact_lock(id). Espelha markPersonalizacaoFailed em '
  'supabaseService.ts.';
