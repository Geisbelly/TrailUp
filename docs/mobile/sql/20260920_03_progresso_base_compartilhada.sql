-- A base por perfil tem aluno_id NULL. O progresso é do aluno consumidor,
-- não do registro de geração. Mantém os filtros de aluno, turma e perfil ativo.
DO $migration$
DECLARE nome text; definicao text; filtro text := 'AND cp.aluno_id = p_aluno';
BEGIN
  FOREACH nome IN ARRAY ARRAY['trailup_recalcular_topico_aluno', 'trailup_recalcular_classe_aluno'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO STRICT definicao
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=nome;
    IF position(filtro IN definicao)=0 THEN
      RAISE EXCEPTION USING MESSAGE='Função diferente da esperada: ' || nome;
    END IF;
    EXECUTE replace(definicao, filtro, 'AND (cp.aluno_id = p_aluno OR cp.aluno_id IS NULL)');
  END LOOP;
END $migration$;

-- Corrige apenas agregados de alunos que já consumiram a base compartilhada.
DO $recalculate$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT pip.aluno_id, pip.topico_id, pip.classe_id
      FROM personalizacao_item_progresso pip
      JOIN conteudo_personalizado cp ON cp.id=pip.personalizacao_id
      JOIN alunos al ON al.id=pip.aluno_id
      WHERE cp.aluno_id IS NULL AND cp.classe_id=pip.classe_id
        AND cp.brainhex_profile_key=al.perfil_ativo
  LOOP
    PERFORM public.trailup_recalcular_topico_aluno(r.aluno_id, r.topico_id);
    PERFORM public.trailup_recalcular_classe_aluno(r.aluno_id, r.classe_id);
  END LOOP;
END $recalculate$;
