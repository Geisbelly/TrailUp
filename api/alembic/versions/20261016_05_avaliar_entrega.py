"""avaliar_entrega(): o professor grava a nota e ela entra no rank

Terceiro passo do banco da tela Notas, e o que a #136 pede em "Nota do professor gera
evento e move o rank" e "`avaliacao_metadata` registra quem avaliou e quando". Molde:
`registrar_presenca_da_turma` (`20260909_03`) — `SECURITY DEFINER`, posse conferida antes
de qualquer escrita, evento creditado com `concedido_por`.

O que a função faz, nesta ordem:
1. exige sessão e que a atividade seja de uma turma **do professor** (`NOT EXISTS` sobre
   `app_classes_do_professor()`) e que o aluno esteja matriculada nela;
2. nota entre 0 e a pontuação máxima (a do aluno, senão a da atividade; sem máxima, recusa);
3. grava `pontuacao_obtida` e funde `avaliacao_metadata.professor` = {avaliado_por,
   avaliado_em, feedback, nota_anterior} — **o que a IA gravou em `avaliacao_metadata`
   fica**, só a chave `professor` é escrita;
4. emite/atualiza o evento `nota_professor` (`20261016_03`) com `valor = nota` e a
   referência `classe:<turma>:nota:<atividade>` — o formato `classe:<id>:…` é o que a view do
   rank já sabe resolver. **Corrigir de novo atualiza o mesmo evento** (índice único): a
   nota vale uma vez.

Não muda `status` nem `percentual_concluido` da atividade (o progresso do tópico é
assunto dos gatilhos de progresso). A linha de `atividade_aluno` precisa existir: o aluno
matriculado a recebe na provisão da estrutura (`provisionar_estrutura_aluno_classe`).

**Risco que não consegui descartar sem o banco:** se algum gatilho de `atividade_aluno`
recalcula `pontuacao_obtida` a partir das respostas, ele pode sobrescrever a nota do
professor. A função grava a nota e o evento do rank no mesmo comando, então o rank não
depende disso, mas vale conferir ao vivo.

Revision ID: 20261016_05
Revises: 20261016_04
Create Date: 2026-10-16
"""

from alembic import op

revision = "20261016_05"
down_revision = "20261016_04"
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
    op.execute("DROP FUNCTION IF EXISTS public.avaliar_entrega(bigint, uuid, numeric, text)")
    op.execute("NOTIFY pgrst, 'reload schema'")
