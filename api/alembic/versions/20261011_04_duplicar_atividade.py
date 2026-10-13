"""duplicar_atividade: copia uma atividade, suas questões e o vínculo, numa transação

Fase 4 do redesign da tela Trilhas (docs/frontend/redesign-fase-2/04-analise-trilhas.md,
seção 4). O protótipo pede "Duplicar" em cada atividade vinculada a um conteúdo;
o console não tinha. Pelo mesmo motivo de duplicar_classe/duplicar_topico a cópia
é uma função transacional (atividade + questões + vínculo), não três INSERTs
soltos no cliente.

Copia a atividade (título com "(cópia)", descrição, tipo, pontuação máxima,
prazo, metadata) e TODAS as questões dela (enunciado, tipo, alternativas,
resposta, mídia, nota estabelecida). Vincula a cópia ao conteúdo informado, que
precisa ser do MESMO tópico. Não copia respostas de aluno nem progresso. O
gabarito é espelhado pelo trigger trg_questoes_espelha_gabarito, como em qualquer
questão criada pelo console.

Posse conferida antes de copiar: a turma do tópico da atividade precisa ser do
professor (app_classes_do_professor, o mesmo helper de excluir_classe).

Revision ID: 20261011_04
Revises: 20261011_03
Create Date: 2026-10-11
"""

from alembic import op

revision = "20261011_04"
down_revision = "20261011_03"
branch_labels = None
depends_on = None


SQL = r"""
CREATE OR REPLACE FUNCTION public.duplicar_atividade(p_atividade_id bigint, p_conteudo_id bigint DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_professor uuid := auth.uid();
  v_origem    public.atividades%ROWTYPE;
  v_classe    bigint;
  v_novo      bigint;
BEGIN
  SELECT * INTO v_origem FROM public.atividades WHERE id = p_atividade_id FOR SHARE;
  IF v_professor IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'Atividade não encontrada ou sem permissão para duplicar.' USING ERRCODE = '42501';
  END IF;
  SELECT t.classe_id INTO v_classe FROM public.topicos t WHERE t.id = v_origem.topico_id;
  -- NOT EXISTS (e não NOT IN) pelo NULL; posse antes de copiar qualquer linha.
  IF NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_classe
  ) THEN
    RAISE EXCEPTION 'Atividade não encontrada ou sem permissão para duplicar.' USING ERRCODE = '42501';
  END IF;
  IF p_conteudo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conteudos c WHERE c.id = p_conteudo_id AND c.topico_id = v_origem.topico_id
  ) THEN
    RAISE EXCEPTION 'O conteúdo não pertence ao tópico da atividade.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.atividades (topico_id, titulo, descricao, tipo, pontuacao_maxima, data_entrega, metadata)
  VALUES (
    v_origem.topico_id,
    regexp_replace(coalesce(v_origem.titulo, 'Atividade'), '\s*\(cópia\)$', '') || ' (cópia)',
    v_origem.descricao, v_origem.tipo, v_origem.pontuacao_maxima, v_origem.data_entrega, v_origem.metadata
  )
  RETURNING id INTO v_novo;

  INSERT INTO public.questoes (atividade_id, enunciado, tipo, alternativas, resposta_correta, midia_url, nota_estabelecida)
  SELECT v_novo, q.enunciado, q.tipo, q.alternativas, q.resposta_correta, q.midia_url, q.nota_estabelecida
    FROM public.questoes q
   WHERE q.atividade_id = p_atividade_id
   ORDER BY q.id;

  IF p_conteudo_id IS NOT NULL THEN
    INSERT INTO public.atividade_conteudos (atividade_id, conteudo_id) VALUES (v_novo, p_conteudo_id);
  END IF;

  RETURN v_novo;
END;
$function$;
REVOKE ALL ON FUNCTION public.duplicar_atividade(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicar_atividade(bigint, bigint) TO authenticated;
NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.duplicar_atividade(bigint, bigint)")
    op.execute("NOTIFY pgrst, 'reload schema'")
