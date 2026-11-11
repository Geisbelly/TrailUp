"""A diversidade de perfis da turma, para o console (fase 1 do roteiro de diversidade de perfis)

O console mostra um rótulo por aluno, o perfil dominante, e o rótulo esconde o que o vetor diz: em
produção (11/11), 5 de 6 alunos têm menos de 5 pontos entre o 1º e o 2º perfil. Para o professor,
a turma parece ter um perfil só quando ela é uma mistura.

`classe_diversidade_perfis(classe, margem)` devolve, num `jsonb`:

- `alunos`, `alunos_com_vetor`, `alunos_mistos` — contagens absolutas (a turma é pequena: nada de
  percentual sem o número ao lado);
- `perfis` — os 7, com a massa (média dos vetores renormalizados para 100), quantos alunos têm o
  perfil como dominante e quantos como representativo;
- `entropia_normalizada` (0 a 1, sobre ln 7) e `perfis_efetivos` (exp da entropia: "a turma se
  comporta como N perfis");
- `pares` — as combinações 1º + 2º perfil, com quantos alunos cada;
- `por_aluno` — 1º, 2º, a margem entre eles e se o aluno é misto (margem abaixo de `p_margem`).

Regras, para não divergir do resto do banco:

- o vetor vem de `app_vetor_perfil` (#1107), a regra única: ordem por afinidade e depois nome;
- os vetores legados não somam 100, então cada um é renormalizado antes de entrar na conta;
- aluno sem linha em `aluno_perfil` (ou com afinidade toda zero) aparece em `por_aluno` sem 1º
  nem margem e fica fora da massa. Aqui ele **não** vira mastermind, como em
  `app_perfil_dominante`: contar o default como dado inventaria uma diversidade que não existe;
- o 2º perfil precisa de afinidade acima de zero: um 2º com zero não torna ninguém misto.

`SECURITY INVOKER`: roda com a RLS de quem chama (`classe_aluno_posse_sel`,
`aluno_perfil_posse_sel`). Quem não é o professor da turma recebe `NULL`, conferido antes de ler,
pelo mesmo `app_classes_do_professor()` das policies. É leitura pura, então mora no banco e o
console chama por `supabase.rpc` (regra de fronteira do CLAUDE.md).

Revision ID: 20261111_03
Revises: 20261111_02
Create Date: 2026-11-11
"""

from alembic import op

revision = "20261111_03"
down_revision = "20261111_02"
branch_labels = None
depends_on = None


FUNCAO = r"""
CREATE OR REPLACE FUNCTION public.classe_diversidade_perfis(p_classe bigint, p_margem numeric DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  -- Só o professor da turma. Conferido antes de ler, e não pela lista vazia que a RLS devolveria:
  -- "turma sem aluno" e "turma que não é sua" precisam ser respostas diferentes.
  IF NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minhas(id) WHERE minhas.id = p_classe
  ) THEN
    RETURN NULL;
  END IF;

  WITH turma AS (
    SELECT DISTINCT ca.aluno_id FROM public.classe_aluno ca WHERE ca.classe_id = p_classe
  ),
  vetor AS (
    -- Renormalizado para 100. Soma zero (ou sem linha) = sem vetor: pct nulo.
    SELECT t.aluno_id, v.perfil, v.posicao, v.representativo,
           v.afinidade * 100 / NULLIF(sum(v.afinidade) OVER (PARTITION BY t.aluno_id), 0) AS pct
      FROM turma t
      CROSS JOIN LATERAL public.app_vetor_perfil(t.aluno_id) v
  ),
  alunos AS (
    SELECT t.aluno_id,
           p1.perfil AS primeiro,
           p2.perfil AS segundo,
           p1.pct - COALESCE(p2.pct, 0) AS margem,
           (p2.perfil IS NOT NULL AND p1.pct - p2.pct < p_margem) AS misto
      FROM turma t
      LEFT JOIN vetor p1 ON p1.aluno_id = t.aluno_id AND p1.posicao = 1 AND p1.pct IS NOT NULL
      LEFT JOIN vetor p2 ON p2.aluno_id = t.aluno_id AND p2.posicao = 2 AND p2.pct > 0
  ),
  n AS (
    SELECT count(*) AS total,
           count(primeiro) AS com_vetor,
           count(*) FILTER (WHERE misto) AS mistos
      FROM alunos
  ),
  perfis AS (
    SELECT nome.perfil,
           COALESCE(sum(v.pct) / NULLIF((SELECT com_vetor FROM n), 0), 0) AS massa,
           count(*) FILTER (WHERE v.posicao = 1 AND v.pct IS NOT NULL) AS dominante,
           count(*) FILTER (WHERE v.representativo) AS representativo
      FROM (VALUES ('seeker'), ('survivor'), ('daredevil'), ('mastermind'),
                   ('conqueror'), ('socializer'), ('achiever')) AS nome(perfil)
      LEFT JOIN vetor v ON v.perfil = nome.perfil
     GROUP BY nome.perfil
  ),
  entropia AS (
    -- Sobre a massa sem arredondar.
    SELECT COALESCE(-sum((massa / 100) * ln(massa / 100)) FILTER (WHERE massa > 0), 0) AS h
      FROM perfis
  ),
  pares AS (
    SELECT primeiro, segundo, count(*) AS alunos
      FROM alunos
     WHERE segundo IS NOT NULL
     GROUP BY primeiro, segundo
  )
  SELECT jsonb_build_object(
           'classe_id', p_classe,
           'margem_misto', p_margem,
           'alunos', n.total,
           'alunos_com_vetor', n.com_vetor,
           'alunos_mistos', n.mistos,
           'entropia_normalizada', round(e.h / ln(7::numeric), 3),
           'perfis_efetivos', CASE WHEN n.com_vetor = 0 THEN 0 ELSE round(exp(e.h), 2) END,
           'perfis', (
             SELECT jsonb_agg(
                      jsonb_build_object('perfil', p.perfil, 'massa', round(p.massa, 2),
                                         'dominante', p.dominante, 'representativo', p.representativo)
                      ORDER BY p.massa DESC, p.perfil)
               FROM perfis p),
           'pares', (
             SELECT COALESCE(jsonb_agg(
                      jsonb_build_object('primeiro', pr.primeiro, 'segundo', pr.segundo, 'alunos', pr.alunos)
                      ORDER BY pr.alunos DESC, pr.primeiro, pr.segundo), '[]'::jsonb)
               FROM pares pr),
           'por_aluno', (
             SELECT COALESCE(jsonb_agg(
                      jsonb_build_object('aluno_id', a.aluno_id, 'primeiro', a.primeiro,
                                         'segundo', a.segundo, 'margem', round(a.margem, 1),
                                         'misto', a.misto)
                      ORDER BY a.margem ASC NULLS LAST, a.aluno_id), '[]'::jsonb)
               FROM alunos a)
         )
    INTO v_resultado
    FROM n, entropia e;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.classe_diversidade_perfis(bigint, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classe_diversidade_perfis(bigint, numeric) TO authenticated, service_role;
"""


def upgrade() -> None:
    op.execute(FUNCAO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.classe_diversidade_perfis(bigint, numeric)")
    op.execute("NOTIFY pgrst, 'reload schema'")
