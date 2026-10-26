"""Conclusão atômica e repetível do cadastro (#1).

A conta Auth já existe/está confirmada. Esta RPC não cria conta, turma ou vínculo
com professor. SECURITY INVOKER mantém as policies existentes. O marcador por
aluno serializa retries e impede que repetir o cadastro substitua adaptações
posteriores do perfil. Sem DELETE/UPDATE do marcador pelos clientes.
"""
from alembic import op

revision = "20261024_05"
down_revision = "20261024_04"
branch_labels = None
depends_on = None

SQL = r"""
CREATE TABLE IF NOT EXISTS public.aluno_cadastro_concluido (
  aluno_id uuid PRIMARY KEY REFERENCES public.alunos(id) ON DELETE CASCADE,
  concluido_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.aluno_cadastro_concluido ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cadastro_proprio_sel ON public.aluno_cadastro_concluido;
CREATE POLICY cadastro_proprio_sel ON public.aluno_cadastro_concluido
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());
DROP POLICY IF EXISTS cadastro_proprio_ins ON public.aluno_cadastro_concluido;
CREATE POLICY cadastro_proprio_ins ON public.aluno_cadastro_concluido
  FOR INSERT TO authenticated WITH CHECK (aluno_id = auth.uid());
GRANT SELECT, INSERT ON public.aluno_cadastro_concluido TO authenticated;

CREATE TABLE IF NOT EXISTS public.aluno_introducao (
  aluno_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  etapa text NOT NULL CHECK (etapa IN ('perfil', 'sessao', 'turma')),
  concluido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, etapa)
);
ALTER TABLE public.aluno_introducao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS introducao_propria_sel ON public.aluno_introducao;
CREATE POLICY introducao_propria_sel ON public.aluno_introducao
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());
DROP POLICY IF EXISTS introducao_propria_ins ON public.aluno_introducao;
CREATE POLICY introducao_propria_ins ON public.aluno_introducao
  FOR INSERT TO authenticated WITH CHECK (aluno_id = auth.uid());
GRANT SELECT, INSERT ON public.aluno_introducao TO authenticated;

-- Dados operacionais da conta: mesmos prazos de aluno_perfil/progresso (#195).
-- O CASCADE acima remove ambos quando a conta é excluída.
INSERT INTO public.retencao_politica (tabela, acao, categoria, motivo) VALUES
  ('aluno_cadastro_concluido', 'vida_da_conta', 'vida_da_conta', 'marcador de conclusão para retries; removido com a conta'),
  ('aluno_introducao', 'vida_da_conta', 'vida_da_conta', 'progresso da introdução; removido com a conta')
ON CONFLICT (tabela, acao) DO NOTHING;

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
  IF EXISTS (SELECT 1 FROM public.aluno_cadastro_concluido WHERE aluno_id = v_uid) THEN
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
  INSERT INTO public.aluno_cadastro_concluido (aluno_id) VALUES (v_uid);
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
    # Preservar o marcador evita que reimplantar permita sobrescrever perfis já adaptados.
    # Rollback da aplicação é possível sem apagar contas/medidas ou estes dados.
    op.execute("DROP FUNCTION IF EXISTS public.concluir_cadastro_aluno(text,text,text,text,text,jsonb,date)")
