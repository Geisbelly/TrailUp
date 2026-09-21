-- O status da geração não define se o aluno pode ter progresso: uma geração
-- parcial/failed pode conter texto, áudio e cards já entregues e estudados.
-- Preserva corpo atual das funções (inclusive correções posteriores de tempo).
DO $migration$
DECLARE
  nome text;
  definicao text;
  filtro text := 'AND lower(coalesce(cp.status, '''')) = ''pronto''';
BEGIN
  FOREACH nome IN ARRAY ARRAY['trailup_recalcular_topico_aluno', 'trailup_recalcular_classe_aluno'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO STRICT definicao
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = nome;
    IF position(filtro IN definicao) = 0 THEN
      RAISE EXCEPTION USING MESSAGE = 'Função diferente da esperada: ' || nome;
    END IF;
    EXECUTE replace(definicao, filtro, '');
  END LOOP;
END
$migration$;
