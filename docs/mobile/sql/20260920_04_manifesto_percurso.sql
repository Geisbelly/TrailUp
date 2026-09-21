-- Descreve os itens entregues ao aluno sem modificar o histórico de respostas.
CREATE TABLE public.personalizacao_percurso (
  aluno_id uuid NOT NULL REFERENCES public.alunos(id),
  personalizacao_id bigint NOT NULL REFERENCES public.conteudo_personalizado(id),
  classe_id bigint NOT NULL,
  topico_id bigint NOT NULL,
  item_keys jsonb NOT NULL CHECK (jsonb_typeof(item_keys) = 'array' AND jsonb_array_length(item_keys) > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, personalizacao_id)
);
ALTER TABLE public.personalizacao_percurso ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.personalizacao_percurso TO authenticated;
CREATE POLICY percurso_proprio_select ON public.personalizacao_percurso FOR SELECT TO authenticated
  USING (aluno_id=auth.uid());
CREATE POLICY percurso_proprio_insert ON public.personalizacao_percurso FOR INSERT TO authenticated
  WITH CHECK (aluno_id=auth.uid() AND EXISTS (
    SELECT 1 FROM public.conteudo_personalizado cp
    JOIN public.classe_aluno ca ON ca.classe_id=cp.classe_id AND ca.aluno_id=auth.uid()
    WHERE cp.id=personalizacao_id AND cp.classe_id=personalizacao_percurso.classe_id
      AND cp.topico_id=personalizacao_percurso.topico_id
      AND (cp.aluno_id=auth.uid() OR cp.aluno_id IS NULL)
  ));
CREATE POLICY percurso_proprio_update ON public.personalizacao_percurso FOR UPDATE TO authenticated
  USING (aluno_id=auth.uid()) WITH CHECK (aluno_id=auth.uid() AND EXISTS (
    SELECT 1 FROM public.conteudo_personalizado cp
    JOIN public.classe_aluno ca ON ca.classe_id=cp.classe_id AND ca.aluno_id=auth.uid()
    WHERE cp.id=personalizacao_id AND cp.classe_id=personalizacao_percurso.classe_id
      AND cp.topico_id=personalizacao_percurso.topico_id
      AND (cp.aluno_id=auth.uid() OR cp.aluno_id IS NULL)
  ));

CREATE FUNCTION public.trailup_progresso_percurso(p_aluno uuid, p_classe bigint)
RETURNS TABLE(topico_id bigint, total bigint, feitos bigint)
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $fn$
  WITH manifestos AS (
    SELECT DISTINCT ON (m.topico_id, cp.conteudo_id)
      m.*, cp.conteudo_id
    FROM personalizacao_percurso m
    JOIN conteudo_personalizado cp ON cp.id=m.personalizacao_id
    JOIN alunos al ON al.id=m.aluno_id
    WHERE m.aluno_id=p_aluno AND m.classe_id=p_classe
      AND cp.classe_id=m.classe_id AND cp.topico_id=m.topico_id
      AND (cp.aluno_id=p_aluno OR cp.aluno_id IS NULL)
      AND cp.brainhex_profile_key=al.perfil_ativo
    ORDER BY m.topico_id, cp.conteudo_id, m.updated_at DESC, m.personalizacao_id DESC
  ), itens AS (
    SELECT m.topico_id, coalesce(pip.percentual_concluido, 0)>=100 OR
      position('concl' IN lower(coalesce(pip.status,'')))>0 AS feito
    FROM manifestos m
    CROSS JOIN LATERAL (SELECT DISTINCT jsonb_array_elements_text(m.item_keys) AS chave) k
    LEFT JOIN personalizacao_item_progresso pip ON pip.aluno_id=m.aluno_id
      AND pip.personalizacao_id=m.personalizacao_id AND pip.item_key=k.chave
    WHERE left(k.chave,6)<>'slide:'
    UNION ALL
    -- Compatibilidade com clientes antigos, apenas onde não há manifesto.
    SELECT pip.topico_id, coalesce(pip.percentual_concluido,0)>=100 OR
      position('concl' IN lower(coalesce(pip.status,'')))>0
    FROM personalizacao_item_progresso pip
    JOIN conteudo_personalizado cp ON cp.id=pip.personalizacao_id
    JOIN alunos al ON al.id=pip.aluno_id
    WHERE pip.aluno_id=p_aluno AND pip.classe_id=p_classe
      AND cp.classe_id=pip.classe_id AND cp.topico_id=pip.topico_id
      AND (cp.aluno_id=p_aluno OR cp.aluno_id IS NULL)
      AND cp.brainhex_profile_key=al.perfil_ativo AND left(pip.item_key,6)<>'slide:'
      AND NOT EXISTS (SELECT 1 FROM manifestos m WHERE m.topico_id=pip.topico_id
        AND (m.conteudo_id IS NOT DISTINCT FROM cp.conteudo_id))
  )
  SELECT itens.topico_id, count(*), count(*) FILTER (WHERE feito)
    FROM itens GROUP BY itens.topico_id;
$fn$;

-- Substitui só a fonte do denominador. Mantém tempo, enum e demais regras.
DO $migration$
DECLARE nome text; definicao text; inicio integer; fim integer; trecho text;
BEGIN
  FOREACH nome IN ARRAY ARRAY['trailup_recalcular_topico_aluno','trailup_recalcular_classe_aluno'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO STRICT definicao
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=nome;
    inicio := position('), personalizado AS (' IN definicao);
    fim := position('), efetivo AS (' IN definicao);
    IF inicio=0 OR fim<=inicio THEN RAISE EXCEPTION USING MESSAGE='Corpo inesperado: '||nome; END IF;
    IF nome='trailup_recalcular_topico_aluno' THEN
      trecho := '), personalizado AS (SELECT coalesce(sum(total),0)::bigint AS total, coalesce(sum(feitos),0)::bigint AS feitos FROM public.trailup_progresso_percurso(p_aluno, (SELECT classe_id FROM topicos WHERE id=p_topico)) WHERE topico_id=p_topico ';
    ELSE
      trecho := '), personalizado AS (SELECT * FROM public.trailup_progresso_percurso(p_aluno, p_classe) ';
    END IF;
    EXECUTE substring(definicao FROM 1 FOR inicio-1) || trecho || substring(definicao FROM fim);
  END LOOP;
END $migration$;

CREATE FUNCTION public.trailup_percurso_recalcular() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $fn$
BEGIN
  PERFORM public.trailup_recalcular_topico_aluno(NEW.aluno_id,NEW.topico_id);
  PERFORM public.trailup_recalcular_classe_aluno(NEW.aluno_id,NEW.classe_id);
  RETURN NEW;
END $fn$;
CREATE TRIGGER percurso_recalcular AFTER INSERT OR UPDATE ON public.personalizacao_percurso
  FOR EACH ROW EXECUTE FUNCTION public.trailup_percurso_recalcular();
