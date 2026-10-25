"""Conclusão baseada no perfil durável, sem depender da retenção da medida (#1).

Não altera afinidades, medidas ou preferências legadas. O marcador é apenas
um registro operacional; a integridade é verificada em cada consulta/retry.
A única escrita privilegiada é o helper sem argumentos que registra a conclusão
do próprio auth.uid(), após conferir seus sete perfis. A RPC de cadastro segue
SECURITY INVOKER. Não recria medidas expurgadas nem lhes inventa proveniência.
"""
from alembic import op

revision = "20261024_06"
down_revision = "20261024_05"
branch_labels = None
depends_on = None

SQL = r"""
CREATE OR REPLACE FUNCTION public.cadastro_perfis_integros(p_aluno uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.alunos WHERE id = p_aluno)
    AND COALESCE((
      SELECT count(*) = 7
        AND array_agg(p.nome::text ORDER BY p.nome::text) =
          ARRAY['achiever','conqueror','daredevil','mastermind','seeker','socializer','survivor']
        AND bool_and(ap.afinidade IS NOT NULL AND ap.afinidade BETWEEN 0 AND 100)
        AND sum(ap.afinidade) > 0
      FROM public.aluno_perfil ap LEFT JOIN public.perfil p ON p.id = ap.perfil_id
      WHERE ap.aluno_id = p_aluno
    ), false)
$function$;
-- Afinidades legadas/adaptadas são 0..100, não necessariamente uma distribuição
-- de inteiros somando 100. A entrada de uma medida v3 continua exigindo soma 100.
REVOKE ALL ON FUNCTION public.cadastro_perfis_integros(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadastro_perfis_integros(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.meu_cadastro_concluido()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL AND public.cadastro_perfis_integros(auth.uid())
$function$;
REVOKE ALL ON FUNCTION public.meu_cadastro_concluido() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meu_cadastro_concluido() TO authenticated;

-- Retirar a escrita direta impede que um cliente produza a falsa conclusão.
DROP POLICY IF EXISTS cadastro_proprio_ins ON public.aluno_cadastro_concluido;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.aluno_cadastro_concluido FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_conclusao_cadastro()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.cadastro_perfis_integros(v_uid) THEN
    RAISE EXCEPTION 'Cadastro sem os sete perfis válidos' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.aluno_cadastro_concluido (aluno_id) VALUES (v_uid)
    ON CONFLICT (aluno_id) DO NOTHING;
END;
$function$;
REVOKE ALL ON FUNCTION public.registrar_conclusao_cadastro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_conclusao_cadastro() TO authenticated;

-- Backfill estritamente operacional. Não reclassifica, normaliza ou recria medidas.
DELETE FROM public.aluno_cadastro_concluido m
  WHERE NOT public.cadastro_perfis_integros(m.aluno_id);
INSERT INTO public.aluno_cadastro_concluido (aluno_id)
  SELECT a.id FROM public.alunos a WHERE public.cadastro_perfis_integros(a.id)
  ON CONFLICT (aluno_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.concluir_cadastro_aluno(
  p_nome text, p_apelido text, p_modo_operacao text, p_modo_resposta text,
  p_perfil_ativo text, p_medida jsonb, p_data_nascimento date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(auth.jwt()->>'email');
  v_perfis text[] := ARRAY['achiever','conqueror','daredevil','mastermind','seeker','socializer','survivor'];
  v_ordem text[];
  v_chaves text[];
  v_modo bigint;
  v_perfil bigint;
  v_nome text;
  v_valor numeric;
  v_soma numeric := 0;
  v_vetor jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR coalesce(v_email, '') = '' THEN
    RAISE EXCEPTION 'Sessão ausente' USING ERRCODE = '42501';
  END IF;
  -- Mesmo aluno, duas abas ou resposta perdida: uma única conclusão.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 1));
  -- A medida pode ter expirado e o marcador pode ser legado/inconsistente.
  -- Só o vetor persistido íntegro permite encerrar sem escrever o perfil de novo.
  IF public.cadastro_perfis_integros(v_uid) THEN
    PERFORM public.registrar_conclusao_cadastro();
    RETURN v_uid;
  END IF;
  IF coalesce(length(btrim(p_nome)), 0) < 2 OR coalesce(length(btrim(p_apelido)), 0) < 2
     OR p_modo_resposta IS NULL OR p_modo_resposta NOT IN ('imediato', 'pensante')
     OR p_perfil_ativo IS NULL OR NOT (p_perfil_ativo = ANY(v_perfis)) THEN
    RAISE EXCEPTION 'Dados do cadastro inválidos' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_medida) IS DISTINCT FROM 'object'
     OR p_medida->>'aluno_id' IS DISTINCT FROM v_uid::text
     OR p_medida->>'versao_instrumento' IS DISTINCT FROM '2026-10-24-v3-exploratorio'
     OR p_medida->'confianca' IS DISTINCT FROM 'null'::jsonb
     OR p_medida#>'{qualidade,indice}' IS DISTINCT FROM 'null'::jsonb
     OR p_medida#>'{qualidade,ordenacao_confirmada}' IS DISTINCT FROM 'true'::jsonb
     OR p_medida#>>'{qualidade,interpretacao}' IS DISTINCT FROM 'exploratoria_nao_probabilistica'
     OR jsonb_typeof(p_medida->'afinidade') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_medida->'ordenacao') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Medida do perfil inválida' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(k ORDER BY k) INTO v_chaves FROM jsonb_object_keys(p_medida->'afinidade') k;
  SELECT array_agg(k ORDER BY k) INTO v_ordem FROM jsonb_array_elements_text(p_medida->'ordenacao') k;
  IF v_chaves IS DISTINCT FROM v_perfis OR v_ordem IS DISTINCT FROM v_perfis THEN
    RAISE EXCEPTION 'Informe os sete perfis sem duplicatas' USING ERRCODE = '22023';
  END IF;
  FOREACH v_nome IN ARRAY v_perfis LOOP
    IF jsonb_typeof(p_medida->'afinidade'->v_nome) IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Afinidade inválida' USING ERRCODE = '22023';
    END IF;
    v_valor := (p_medida->'afinidade'->>v_nome)::numeric;
    IF v_valor < 1 OR v_valor > 100 OR trunc(v_valor) <> v_valor THEN
      RAISE EXCEPTION 'Afinidade inválida' USING ERRCODE = '22023';
    END IF;
    v_soma := v_soma + v_valor;
    v_vetor := v_vetor || jsonb_build_array(jsonb_build_object('nome', v_nome, 'afinidade', v_valor));
  END LOOP;
  IF v_soma <> 100 THEN
    RAISE EXCEPTION 'Afinidades devem somar 100' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_medida#>'{qualidade,desvio}') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_medida#>'{qualidade,aquiescencia}') IS DISTINCT FROM 'number'
     OR (p_medida#>>'{qualidade,desvio}')::numeric < 0
     OR (p_medida#>>'{qualidade,aquiescencia}')::numeric NOT BETWEEN 0 AND 1
     OR jsonb_typeof(p_medida#>'{qualidade,motivos}') IS DISTINCT FROM 'array'
     OR (p_medida->'concordancia' IS DISTINCT FROM 'null'::jsonb AND
       (jsonb_typeof(p_medida->'concordancia') IS DISTINCT FROM 'number'
        OR (p_medida->>'concordancia')::numeric NOT BETWEEN -1 AND 1)) THEN
    RAISE EXCEPTION 'Descritores da medida inválidos' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_modo FROM public."modoOperacao" WHERE nome = p_modo_operacao;
  IF v_modo IS NULL THEN
    RAISE EXCEPTION 'Modo de operação inválido' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.alunos (id, nome, email, apelido, descricao, modooperacao_id, modo_resposta, perfil_ativo)
  VALUES (v_uid, btrim(p_nome), v_email, btrim(p_apelido), 'Novo aluno', v_modo,
          p_modo_resposta::public.modo_resposta_type, p_perfil_ativo)
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, apelido = EXCLUDED.apelido,
    modooperacao_id = EXCLUDED.modooperacao_id, modo_resposta = EXCLUDED.modo_resposta,
    perfil_ativo = EXCLUDED.perfil_ativo;

  FOREACH v_nome IN ARRAY v_perfis LOOP
    SELECT id INTO v_perfil FROM public.perfil WHERE nome = v_nome;
    IF v_perfil IS NULL THEN
      RAISE EXCEPTION 'Catálogo de perfis incompleto' USING ERRCODE = '22023';
    END IF;
    -- Repara registros parciais antigos; não presume um índice específico do schema base.
    UPDATE public.aluno_perfil SET afinidade = (p_medida->'afinidade'->>v_nome)::numeric
      WHERE aluno_id = v_uid AND perfil_id = v_perfil;
    IF NOT FOUND THEN
      INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade)
        VALUES (v_uid, v_perfil, (p_medida->'afinidade'->>v_nome)::numeric);
    END IF;
  END LOOP;
  UPDATE public."iaDescricao" SET "modoOperacao" = p_modo_operacao, "perfisDetectados" = v_vetor
    WHERE aluno_id = v_uid;
  IF NOT FOUND THEN
    INSERT INTO public."iaDescricao" (aluno_id, "recomendacaoTrilha", "modoOperacao", insights, "perfisDetectados")
      VALUES (v_uid, 'Recomendações ainda não geradas', p_modo_operacao, '{}'::json, v_vetor);
  END IF;
  INSERT INTO public.aluno_perfil_medida
    (aluno_id, versao_instrumento, ordenacao, afinidade, confianca, concordancia, qualidade)
  VALUES (v_uid, p_medida->>'versao_instrumento',
    ARRAY(SELECT jsonb_array_elements_text(p_medida->'ordenacao')),
    p_medida->'afinidade', NULL, (p_medida->>'concordancia')::numeric, p_medida->'qualidade');
  IF p_data_nascimento IS NOT NULL THEN
    PERFORM public.aluno_registrar_data_nascimento(p_data_nascimento);
  END IF;
  PERFORM public.registrar_conclusao_cadastro();
  RETURN v_uid;
END;
$function$;
REVOKE ALL ON FUNCTION public.concluir_cadastro_aluno(text,text,text,text,text,jsonb,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concluir_cadastro_aluno(text,text,text,text,text,jsonb,date) TO authenticated;
NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    raise RuntimeError(
        "Rollback da 06 reabriria a conclusão sem perfis. Reverta a aplicação "
        "mantendo esta migração ou prepare uma migração corretiva que preserve a integridade."
    )
