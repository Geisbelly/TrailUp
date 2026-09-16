"""Expose the highest-affinity profile consistently in public profiles."""

from alembic import op

revision = "20260913_16"
down_revision = "20260913_15"
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
        AS $$
          WITH turma_compartilhada AS (
            SELECT ca.classe_id
              FROM public.classe_aluno ca
              JOIN public.classe_aluno eu
                ON eu.classe_id = ca.classe_id AND eu.aluno_id = auth.uid()
             WHERE ca.aluno_id = p_aluno_id
               AND (NULLIF(p_classe_id, 0) IS NULL OR ca.classe_id = p_classe_id)
             ORDER BY ca.classe_id
             LIMIT 1
          ), perfil_escolhido AS (
            SELECT p.nome, p.descricao
              FROM public.aluno_perfil ap
              JOIN public.perfil p ON p.id = ap.perfil_id
             WHERE ap.aluno_id = p_aluno_id
             ORDER BY ap.afinidade DESC NULLS LAST,
                      ap.atualizado_em DESC NULLS LAST,
                      ap.perfil_id ASC
             LIMIT 1
          ), perfil_principal AS (
            SELECT COALESCE(
                     NULLIF(btrim(pe.nome), ''),
                     NULLIF(btrim(a.perfil_ativo), '')
                   ) AS nome,
                   pe.descricao
              FROM public.alunos a
              LEFT JOIN perfil_escolhido pe ON TRUE
             WHERE a.id = p_aluno_id
          )
          SELECT jsonb_build_object(
            'aluno_id', a.id,
            'nome', a.nome,
            'apelido', a.apelido,
            'foto_url', a.foto_url,
            'banner_url', a.banner_url,
            'perfil_ativo', pp.nome,
            'descricao', a.descricao,
            'perfil_descricao', pp.descricao,
            'guilda', (
              SELECT jsonb_build_object(
                'id', g.id, 'nome', g.nome, 'emblema', g.emblema,
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
                'id', c.id, 'nome', c.nome, 'descricao', c.descricao,
                'icone_url', c.icone_url, 'categoria', c.categoria,
                'pontos_recompensa', c.pontos_recompensa,
                'data_conquista', ca.data_conquista
              ) ORDER BY ca.data_conquista DESC)
                FROM public.conquistas_aluno ca
                JOIN public.conquistas c ON c.id = ca.conquista_id
               WHERE ca.aluno_id = a.id
                 AND ca.concluida IS TRUE
                 AND (
                   c.escopo IS NULL OR c.escopo = 'comum'
                   OR c.perfil_alvo = pp.nome
                 )
            ), '[]'::jsonb),
            'pontos_conquistas', COALESCE((
              SELECT sum(c.pontos_recompensa)
                FROM public.conquistas_aluno ca
                JOIN public.conquistas c ON c.id = ca.conquista_id
               WHERE ca.aluno_id = a.id AND ca.concluida IS TRUE
            ), 0)
          )
            FROM public.alunos a
            CROSS JOIN turma_compartilhada tc
            CROSS JOIN perfil_principal pp
           WHERE a.id = p_aluno_id;
        $$;
        GRANT EXECUTE ON FUNCTION public.social_perfil_publico(uuid, bigint)
          TO authenticated;
        """
    )


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: manter perfil principal por afinidade")

