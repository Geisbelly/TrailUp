"""Return each student's selected active profile in public social profiles."""

from alembic import op


revision = "20260913_22"
down_revision = "20260913_21"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.social_perfil_publico(
          p_aluno_id uuid, p_classe_id bigint
        )
        RETURNS jsonb
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $fn$
          WITH turma_compartilhada AS (
            SELECT ca.classe_id
              FROM public.classe_aluno ca
              JOIN public.classe_aluno eu
                ON eu.classe_id = ca.classe_id
               AND eu.aluno_id = auth.uid()
             WHERE ca.aluno_id = p_aluno_id
               AND (NULLIF(p_classe_id, 0) IS NULL OR ca.classe_id = p_classe_id)
             ORDER BY ca.classe_id
             LIMIT 1
          ), perfil_escolhido AS (
            SELECT p.nome, p.descricao
              FROM public.aluno_perfil ap
              JOIN public.perfil p ON p.id = ap.perfil_id
             WHERE ap.aluno_id = p_aluno_id
             ORDER BY
               CASE WHEN lower(btrim(p.nome)) = lower(btrim((
                 SELECT a.perfil_ativo
                   FROM public.alunos a
                  WHERE a.id = p_aluno_id
               ))) THEN 0 ELSE 1 END,
               ap.afinidade DESC NULLS LAST,
               ap.atualizado_em DESC NULLS LAST,
               ap.perfil_id ASC
             LIMIT 1
          )
          SELECT jsonb_build_object(
            'aluno_id', a.id,
            'nome', a.nome,
            'apelido', a.apelido,
            'foto_url', a.foto_url,
            'banner_url', a.banner_url,
            'perfil_ativo', COALESCE(
              NULLIF(btrim(a.perfil_ativo), ''),
              p.nome
            ),
            'descricao', a.descricao,
            'perfil_descricao', p.descricao,
            'guilda', (
              SELECT jsonb_build_object(
                'id', g.id,
                'nome', g.nome,
                'emblema', g.emblema,
                'membros', g.limite_membros
              )
                FROM public.guilda_membros gm
                JOIN public.guildas g ON g.id = gm.guilda_id
               WHERE gm.aluno_id = a.id
                 AND gm.classe_id = tc.classe_id
                 AND gm.left_at IS NULL
                 AND g.ativa
               LIMIT 1
            ),
            'conquistas', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', c.id,
                'nome', c.nome,
                'descricao', c.descricao,
                'icone_url', c.icone_url,
                'categoria', c.categoria,
                'pontos_recompensa', c.pontos_recompensa,
                'data_conquista', ca.data_conquista
              ) ORDER BY ca.data_conquista DESC)
                FROM public.conquistas_aluno ca
                JOIN public.conquistas c ON c.id = ca.conquista_id
               WHERE ca.aluno_id = a.id
                 AND ca.concluida IS TRUE
                 AND (
                   c.escopo IS NULL
                   OR c.escopo = 'comum'
                   OR c.perfil_alvo = COALESCE(
                     NULLIF(btrim(a.perfil_ativo), ''),
                     p.nome
                   )
                 )
            ), '[]'::jsonb),
            'pontos_conquistas', COALESCE((
              SELECT sum(c.pontos_recompensa)
                FROM public.conquistas_aluno ca
                JOIN public.conquistas c ON c.id = ca.conquista_id
               WHERE ca.aluno_id = a.id
                 AND ca.concluida IS TRUE
            ), 0)
          )
            FROM public.alunos a
            CROSS JOIN turma_compartilhada tc
            LEFT JOIN perfil_escolhido p ON TRUE
           WHERE a.id = p_aluno_id;
        $fn$;

        GRANT EXECUTE ON FUNCTION public.social_perfil_publico(uuid, bigint)
          TO authenticated;
        """
    )


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: manter perfil ativo no perfil público")
