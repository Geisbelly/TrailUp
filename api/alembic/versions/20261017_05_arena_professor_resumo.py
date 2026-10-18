"""arena_professor_resumo(): o professor enxerga os duelos de guilda da turma e o ranking de vitórias

Banco da tela Rank de batalhas. Conferido no banco real (2026-10-16, somente leitura): a arena é
`guilda_desafios` + `desafio_participantes` + `guilda_desafio_*`, sem policy alguma (RLS fechada,
acesso só por RPC), e `arena_listar` só devolve duelos DOS QUAIS O CHAMADOR PARTICIPA — o
professor nunca vê nada por ela. Esta função é a leitura do professor, só leitura, e confere a
**posse da turma antes de tocar em qualquer linha** (`NOT EXISTS` sobre `app_classes_do_professor()`).

Devolve `{duelos, ranking}`:
- `duelos`: os 40 mais recentes da turma (título, formato, modo, status, resultado, guildas,
  vencedor, quantos aceitaram e a pontuação por equipe via `fn_arena_equipes`).
- `ranking`: por guilda, `vitorias`, `empates` e `duelos` encerrados. Regra (espelha `arena_encerrar`):
  duelo contra rival — `vencedor_equipe` 1 é vitória de `guilda_id`, 2 de `guilda_rival_id`,
  `empate` conta para as duas; duelo cooperativo (sem rival) com `vitoria` conta para a guilda;
  `sem_adversario` não conta para ninguém. **Nunca devolve derrota/valor negativo** (o protótipo
  pede "nada de valor negativo"): aproveitamento sai de vitórias e empates sobre os duelos.

Nome e foto de aluno NÃO saem daqui: o professor já os lê por `alunos`, e a tela só precisa de
guildas e contagens.

Revision ID: 20261017_05
Revises: 20261017_04
Create Date: 2026-10-17
"""

from alembic import op

revision = "20261017_05"
down_revision = "20261017_04"
branch_labels = None
depends_on = None


SQL = r"""
CREATE OR REPLACE FUNCTION public.arena_professor_resumo(p_classe_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'duelos', COALESCE((
      SELECT jsonb_agg(x.item ORDER BY x.created_at DESC)
      FROM (
        SELECT d.created_at,
               jsonb_build_object(
                 'id', d.id,
                 'titulo', d.titulo,
                 'formato', d.formato,
                 'modo', d.modo,
                 'status', d.status,
                 'resultado', d.resultado,
                 'vencedor_equipe', d.vencedor_equipe,
                 'guilda_id', d.guilda_id,
                 'guilda_nome', g.nome,
                 'guilda_rival_id', d.guilda_rival_id,
                 'guilda_rival_nome', gr.nome,
                 'created_at', d.created_at,
                 'encerrado_em', d.encerrado_em,
                 'aceitaram', (SELECT count(*) FROM public.desafio_participantes p WHERE p.desafio_id = d.id AND p.estado = 'aceito'),
                 'equipes', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object('equipe', e.equipe, 'pontos', e.pontos, 'integrantes', e.integrantes) ORDER BY e.equipe)
                   FROM public.fn_arena_equipes(d.id) e
                 ), '[]'::jsonb)
               ) AS item
        FROM public.guilda_desafios d
        LEFT JOIN public.guildas g ON g.id = d.guilda_id
        LEFT JOIN public.guildas gr ON gr.id = d.guilda_rival_id
        WHERE d.classe_id = p_classe_id
        ORDER BY d.created_at DESC
        LIMIT 40
      ) x
    ), '[]'::jsonb),
    'ranking', COALESCE((
      SELECT jsonb_agg(r.item ORDER BY r.vitorias DESC, r.empates DESC, r.duelos ASC, r.nome)
      FROM (
        SELECT t.guilda_id, g.nome,
               count(*) FILTER (WHERE t.desfecho = 'vitoria')::integer AS vitorias,
               count(*) FILTER (WHERE t.desfecho = 'empate')::integer AS empates,
               count(*)::integer AS duelos,
               jsonb_build_object(
                 'guilda_id', t.guilda_id,
                 'nome', g.nome,
                 'vitorias', count(*) FILTER (WHERE t.desfecho = 'vitoria'),
                 'empates', count(*) FILTER (WHERE t.desfecho = 'empate'),
                 'duelos', count(*)
               ) AS item
        FROM (
          SELECT d.guilda_id AS guilda_id,
                 CASE
                   WHEN d.resultado = 'empate' THEN 'empate'
                   WHEN d.guilda_rival_id IS NULL AND d.resultado = 'vitoria' THEN 'vitoria'
                   WHEN d.vencedor_equipe = 1 THEN 'vitoria'
                   ELSE 'outro'
                 END AS desfecho
          FROM public.guilda_desafios d
          WHERE d.classe_id = p_classe_id AND d.status = 'encerrado' AND d.formato = 'guilda'
            AND d.guilda_id IS NOT NULL AND d.resultado IS DISTINCT FROM 'sem_adversario'
          UNION ALL
          SELECT d.guilda_rival_id,
                 CASE
                   WHEN d.resultado = 'empate' THEN 'empate'
                   WHEN d.vencedor_equipe = 2 THEN 'vitoria'
                   ELSE 'outro'
                 END
          FROM public.guilda_desafios d
          WHERE d.classe_id = p_classe_id AND d.status = 'encerrado' AND d.formato = 'guilda'
            AND d.guilda_rival_id IS NOT NULL AND d.resultado IS DISTINCT FROM 'sem_adversario'
        ) t
        JOIN public.guildas g ON g.id = t.guilda_id
        GROUP BY t.guilda_id, g.nome
      ) r
    ), '[]'::jsonb)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.arena_professor_resumo(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arena_professor_resumo(bigint) TO authenticated;
"""

DOWNGRADE_SQL = r"""
DROP FUNCTION IF EXISTS public.arena_professor_resumo(bigint);
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
