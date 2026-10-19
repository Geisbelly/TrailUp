"""notas_fila(): a fila de correção do professor, uma linha por aluno e atividade dissertativa

Segundo passo do banco da tela Notas. Hoje o professor não tem como ver "o que o aluno
respondeu" em dissertativas: `questao_aluno` e `atividade_aluno` são do aluno (RLS), e
lê-las uma a uma do cliente seria N consultas por turma. A função junta numa leitura só,
depois de conferir a **posse da turma** (`NOT EXISTS` sobre `app_classes_do_professor()`,
antes de tocar em qualquer linha de aluno).

Entra na fila, para cada aluno matriculado e cada atividade `essay` dos tópicos da turma:
- quem **respondeu** (a resposta mais recente de `questao_aluno`), e
- quem **não respondeu e o prazo (`data_entrega`) já venceu** — o protótipo exige que
  esse aluno apareça, porque o professor precisa decidir o que fazer com ele.

A função devolve os DADOS; "pendente × corrigida × sem entrega" é calculado no console
(`notas/fila.ts`) a partir de `avaliado_em`, para a definição de produto — ainda a
confirmar — morar num lugar só e fácil de mudar. `avaliado_em` e `feedback` saem de
`atividade_aluno.avaliacao_metadata -> 'professor'`, onde `avaliar_entrega()` (próxima
migration) os grava. Trabalho com arquivo não entra: o app do aluno não tem entrega de arquivo.

Revision ID: 20261016_04
Revises: 20261016_03
Create Date: 2026-10-16
"""

from alembic import op

revision = "20261016_04"
down_revision = "20261016_03"
branch_labels = None
depends_on = None


SQL = r"""
CREATE OR REPLACE FUNCTION public.notas_fila(p_classe_id bigint)
RETURNS TABLE (
  aluno_id uuid,
  aluno_nome text,
  atividade_id bigint,
  topico_id bigint,
  titulo text,
  enunciado text,
  gabarito text,
  resposta text,
  entregue_em timestamptz,
  prazo timestamptz,
  pontuacao_maxima numeric,
  pontuacao_obtida numeric,
  avaliado_em timestamptz,
  feedback text
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ca.aluno_id,
         coalesce(al.nome, '')::text,
         a.id::bigint,
         a.topico_id::bigint,
         a.titulo::text,
         coalesce(q.enunciado, a.descricao, '')::text,
         q.resposta_correta::text,
         ult.resposta::text,
         ult.criado_em::timestamptz,
         a.data_entrega::timestamptz,
         coalesce(aa.pontuacao_maxima, a.pontuacao_maxima)::numeric,
         aa.pontuacao_obtida::numeric,
         nullif(aa.avaliacao_metadata #>> '{professor,avaliado_em}', '')::timestamptz,
         aa.avaliacao_metadata #>> '{professor,feedback}'
    FROM public.classe_aluno ca
    JOIN public.topicos t ON t.classe_id = ca.classe_id
    JOIN public.atividades a ON a.topico_id = t.id AND a.tipo = 'essay'
    LEFT JOIN public.alunos al ON al.id = ca.aluno_id
    LEFT JOIN public.atividade_aluno aa ON aa.aluno_id = ca.aluno_id AND aa.atividade_id = a.id
    LEFT JOIN LATERAL (
      SELECT q1.enunciado, q1.resposta_correta
        FROM public.questoes q1
       WHERE q1.atividade_id = a.id
       ORDER BY q1.id
       LIMIT 1
    ) q ON true
    LEFT JOIN LATERAL (
      SELECT qa.resposta, qa.criado_em
        FROM public.questao_aluno qa
       WHERE qa.aluno_id = ca.aluno_id AND qa.atividade_id = a.id
       ORDER BY qa.criado_em DESC NULLS LAST, qa.id DESC
       LIMIT 1
    ) ult ON true
   WHERE ca.classe_id = p_classe_id
     AND (ult.resposta IS NOT NULL
          OR (a.data_entrega IS NOT NULL AND a.data_entrega::timestamptz < now()))
   ORDER BY a.id, al.nome;
END;
$function$;

REVOKE ALL ON FUNCTION public.notas_fila(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notas_fila(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.notas_fila(bigint)")
    op.execute("NOTIFY pgrst, 'reload schema'")
