"""avaliar_entrega() passa a creditar as moedas da atividade depois da aprovação do professor

Decisão da coordenação (2026-10-16, pergunta 2 do levantamento da análise 05): as moedas de uma
missão/atividade só entram **depois de aprovado** quando há correção pendente. Onde ficam: em
`atividades.metadata.moedas` (inteiro; a coluna `metadata` já existe, nenhuma coluna nova). Quando
entram: ao `avaliar_entrega`, se a nota for >= 60 por cento do máximo (padrão PROVISÓRIO — o mesmo
corte de `correta` na correção por IA). Crédito em `moedas_ledger` (motivo `evento`, tipo
`atividade_aprovada`, referência `atividade:<id>`); o índice único `moedas_ledger_ganho_unico`
garante que reavaliar a nota não paga duas vezes — e também que uma nota inicial baixa, depois
subida, ainda paga uma vez.

O resto da função é idêntico à de `20261016_05`.

Revision ID: 20261017_07
Revises: 20261017_06
Create Date: 2026-10-17
"""

from alembic import op

revision = "20261017_07"
down_revision = "20261017_06"
branch_labels = None
depends_on = None

SQL = r"""
CREATE OR REPLACE FUNCTION public.avaliar_entrega(
  p_atividade_id bigint,
  p_aluno_id     uuid,
  p_nota         numeric,
  p_feedback     text DEFAULT NULL
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_professor uuid := auth.uid();
  v_classe    bigint;
  v_max_ativ  numeric;
  v_max_aluno numeric;
  v_max       numeric;
  v_antes     numeric;
  v_meta      jsonb;
  v_feedback  text := nullif(btrim(coalesce(p_feedback, '')), '');
  v_moedas    numeric;
BEGIN
  SELECT t.classe_id, a.pontuacao_maxima,
         CASE WHEN a.metadata ->> 'moedas' ~ '^[0-9]+$' THEN (a.metadata ->> 'moedas')::numeric ELSE 0 END
    INTO v_classe, v_max_ativ, v_moedas
    FROM public.atividades a
    JOIN public.topicos t ON t.id = a.topico_id
   WHERE a.id = p_atividade_id;

  IF v_professor IS NULL OR v_classe IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_classe
  ) THEN
    RAISE EXCEPTION 'Atividade não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.classe_aluno ca WHERE ca.classe_id = v_classe AND ca.aluno_id = p_aluno_id
  ) THEN
    RAISE EXCEPTION 'O aluno não está nesta turma.' USING ERRCODE = '42501';
  END IF;

  SELECT aa.pontuacao_maxima, aa.pontuacao_obtida, coalesce(aa.avaliacao_metadata, '{}'::jsonb)
    INTO v_max_aluno, v_antes, v_meta
    FROM public.atividade_aluno aa
   WHERE aa.aluno_id = p_aluno_id AND aa.atividade_id = p_atividade_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O aluno ainda não tem registro nesta atividade.' USING ERRCODE = '22023';
  END IF;

  v_max := coalesce(v_max_aluno, v_max_ativ);
  IF v_max IS NULL OR v_max <= 0 THEN
    RAISE EXCEPTION 'A atividade não tem pontuação máxima definida.' USING ERRCODE = '22023';
  END IF;
  IF p_nota IS NULL OR p_nota < 0 OR p_nota > v_max THEN
    RAISE EXCEPTION 'A nota vai de 0 a %.', v_max USING ERRCODE = '22023';
  END IF;
  IF v_feedback IS NOT NULL AND length(v_feedback) > 2000 THEN
    RAISE EXCEPTION 'O feedback passa de 2000 caracteres.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.atividade_aluno
     SET pontuacao_obtida = p_nota,
         pontuacao_maxima = v_max,
         avaliacao_metadata = v_meta || jsonb_build_object(
           'professor', jsonb_build_object(
             'avaliado_por', v_professor,
             'avaliado_em', now(),
             'feedback', v_feedback,
             'nota_anterior', v_antes
           )
         )
   WHERE aluno_id = p_aluno_id AND atividade_id = p_atividade_id;

  INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em, concedido_por)
  VALUES (p_aluno_id, 'nota_professor', 'classe:' || v_classe::text || ':nota:' || p_atividade_id::text, p_nota, now(), v_professor)
  ON CONFLICT (aluno_id, tipo, referencia)
    WHERE tipo IN ('presenca_aula', 'participacao_aula', 'conquista_desbloqueada', 'nota_professor')
    DO UPDATE SET valor = EXCLUDED.valor, concedido_por = EXCLUDED.concedido_por;

  -- Moedas da atividade (`atividades.metadata.moedas`): só DEPOIS da aprovação do professor
  -- (decisão da coordenação, 16/10). Aprovada = nota >= 60% do máximo (o mesmo corte da correção
  -- por IA). O índice único `moedas_ledger_ganho_unico` faz a primeira aprovação valer: corrigir a
  -- nota depois não paga duas vezes.
  IF v_moedas > 0 AND p_nota >= v_max * 0.6 THEN
    INSERT INTO public.moedas_ledger (aluno_id, delta, motivo, evento_tipo, referencia, classe_id)
    VALUES (p_aluno_id, v_moedas, 'evento', 'atividade_aprovada', 'atividade:' || p_atividade_id::text, v_classe)
    ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento' DO NOTHING;
  END IF;

  RETURN p_nota;
END;
$function$;

REVOKE ALL ON FUNCTION public.avaliar_entrega(bigint, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avaliar_entrega(bigint, uuid, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
"""

ANTERIOR_SQL = r"""
CREATE OR REPLACE FUNCTION public.avaliar_entrega(
  p_atividade_id bigint,
  p_aluno_id     uuid,
  p_nota         numeric,
  p_feedback     text DEFAULT NULL
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_professor uuid := auth.uid();
  v_classe    bigint;
  v_max_ativ  numeric;
  v_max_aluno numeric;
  v_max       numeric;
  v_antes     numeric;
  v_meta      jsonb;
  v_feedback  text := nullif(btrim(coalesce(p_feedback, '')), '');
BEGIN
  SELECT t.classe_id, a.pontuacao_maxima
    INTO v_classe, v_max_ativ
    FROM public.atividades a
    JOIN public.topicos t ON t.id = a.topico_id
   WHERE a.id = p_atividade_id;

  IF v_professor IS NULL OR v_classe IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_classe
  ) THEN
    RAISE EXCEPTION 'Atividade não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.classe_aluno ca WHERE ca.classe_id = v_classe AND ca.aluno_id = p_aluno_id
  ) THEN
    RAISE EXCEPTION 'O aluno não está nesta turma.' USING ERRCODE = '42501';
  END IF;

  SELECT aa.pontuacao_maxima, aa.pontuacao_obtida, coalesce(aa.avaliacao_metadata, '{}'::jsonb)
    INTO v_max_aluno, v_antes, v_meta
    FROM public.atividade_aluno aa
   WHERE aa.aluno_id = p_aluno_id AND aa.atividade_id = p_atividade_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O aluno ainda não tem registro nesta atividade.' USING ERRCODE = '22023';
  END IF;

  v_max := coalesce(v_max_aluno, v_max_ativ);
  IF v_max IS NULL OR v_max <= 0 THEN
    RAISE EXCEPTION 'A atividade não tem pontuação máxima definida.' USING ERRCODE = '22023';
  END IF;
  IF p_nota IS NULL OR p_nota < 0 OR p_nota > v_max THEN
    RAISE EXCEPTION 'A nota vai de 0 a %.', v_max USING ERRCODE = '22023';
  END IF;
  IF v_feedback IS NOT NULL AND length(v_feedback) > 2000 THEN
    RAISE EXCEPTION 'O feedback passa de 2000 caracteres.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.atividade_aluno
     SET pontuacao_obtida = p_nota,
         pontuacao_maxima = v_max,
         avaliacao_metadata = v_meta || jsonb_build_object(
           'professor', jsonb_build_object(
             'avaliado_por', v_professor,
             'avaliado_em', now(),
             'feedback', v_feedback,
             'nota_anterior', v_antes
           )
         )
   WHERE aluno_id = p_aluno_id AND atividade_id = p_atividade_id;

  INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em, concedido_por)
  VALUES (p_aluno_id, 'nota_professor', 'classe:' || v_classe::text || ':nota:' || p_atividade_id::text, p_nota, now(), v_professor)
  ON CONFLICT (aluno_id, tipo, referencia)
    WHERE tipo IN ('presenca_aula', 'participacao_aula', 'conquista_desbloqueada', 'nota_professor')
    DO UPDATE SET valor = EXCLUDED.valor, concedido_por = EXCLUDED.concedido_por;

  RETURN p_nota;
END;
$function$;

REVOKE ALL ON FUNCTION public.avaliar_entrega(bigint, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avaliar_entrega(bigint, uuid, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(ANTERIOR_SQL)
