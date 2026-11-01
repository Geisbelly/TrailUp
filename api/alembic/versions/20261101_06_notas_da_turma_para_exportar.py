"""Notas e XP da turma, uma linha por aluno, para o professor exportar em CSV (#146)

`professor_notas_da_turma(p_classe_id)` devolve, para cada aluno matriculado: nome, e-mail, XP,
nota média, progresso e o que já foi avaliado. O console só baixa o resultado como CSV.

- **XP** é a soma de `eventos_aluno.valor` do aluno naquela turma — a mesma conta do critério
  `pontuacao` do rank (`20261021_06`), com a turma do evento resolvida por
  `fn_eventos_aluno_resolve_classe_id` quando a linha antiga não a gravou.
- **Nota média** e **progresso** são as colunas de `classe_aluno` que o console já mostra.
- **Avaliadas**: atividades da turma com `pontuacao_obtida`, e os pontos obtidos sobre os máximos.

Leitura pura, sem modelo de linguagem: fica no banco (regra de fronteira). `SECURITY DEFINER`
porque soma `eventos_aluno` de vários alunos; a posse é conferida antes (`42501` para quem não é o
professor da turma). Não escreve nada.

Revision ID: 20261101_06
Revises: 20261101_05
Create Date: 2026-11-01
"""

from alembic import op

revision = "20261101_06"
down_revision = "20261101_05"
branch_labels = None
depends_on = None

FUNCAO = r"""
CREATE OR REPLACE FUNCTION public.professor_notas_da_turma(p_classe_id bigint)
RETURNS TABLE (
  aluno_id uuid,
  nome text,
  email text,
  xp numeric,
  nota_media numeric,
  progresso_pct numeric,
  atividades_avaliadas integer,
  pontos_obtidos numeric,
  pontos_maximos numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'turma_nao_encontrada_ou_sem_permissao' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH matriculas AS (
    SELECT ca.aluno_id, ca."notaMedia" AS nota_media, ca."porcentagemConcluida" AS progresso
      FROM public.classe_aluno ca
     WHERE ca.classe_id = p_classe_id
  ), xp AS (
    SELECT ea.aluno_id, sum(ea.valor) AS total
      FROM public.eventos_aluno ea
     WHERE ea.aluno_id IN (SELECT m.aluno_id FROM matriculas m)
       AND COALESCE(ea.classe_id, public.fn_eventos_aluno_resolve_classe_id(ea.tipo, ea.referencia)) = p_classe_id
     GROUP BY ea.aluno_id
  ), avaliadas AS (
    SELECT aa.aluno_id,
           count(*)::integer AS quantas,
           sum(aa.pontuacao_obtida) AS obtidos,
           sum(aa.pontuacao_maxima) AS maximos
      FROM public.atividade_aluno aa
      JOIN public.atividades a ON a.id = aa.atividade_id
      JOIN public.topicos t ON t.id = a.topico_id
     WHERE t.classe_id = p_classe_id
       AND aa.pontuacao_obtida IS NOT NULL
       AND aa.aluno_id IN (SELECT m.aluno_id FROM matriculas m)
     GROUP BY aa.aluno_id
  )
  SELECT m.aluno_id,
         COALESCE(NULLIF(btrim(al.nome), ''), 'Aluno'),
         al.email,
         COALESCE(x.total, 0),
         m.nota_media,
         m.progresso,
         COALESCE(av.quantas, 0),
         av.obtidos,
         av.maximos
    FROM matriculas m
    LEFT JOIN public.alunos al ON al.id = m.aluno_id
    LEFT JOIN xp x ON x.aluno_id = m.aluno_id
    LEFT JOIN avaliadas av ON av.aluno_id = m.aluno_id
   ORDER BY lower(COALESCE(al.nome, '')), m.aluno_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.professor_notas_da_turma(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.professor_notas_da_turma(bigint) TO authenticated, service_role;
"""


def upgrade() -> None:
    op.execute(FUNCAO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.professor_notas_da_turma(bigint)")
    op.execute("NOTIFY pgrst, 'reload schema'")
