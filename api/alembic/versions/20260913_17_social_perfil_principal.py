"""Use the public dominant profile in Social people listings."""

from alembic import op

revision = "20260913_17"
down_revision = "20260913_16"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.social_listar_pessoas(p_classe_id bigint)
        RETURNS TABLE(
          aluno_id uuid, nome text, apelido text, foto_url text,
          perfil_ativo text, status text, relationship_id uuid,
          guilda_id uuid, guilda_nome text
        )
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $fn$
          WITH perfil_principal AS (
            SELECT a.id,
                   COALESCE(
                     NULLIF(btrim((
                       SELECT p.nome
                         FROM public.aluno_perfil ap
                         JOIN public.perfil p ON p.id = ap.perfil_id
                        WHERE ap.aluno_id = a.id
                        ORDER BY ap.afinidade DESC NULLS LAST,
                                 ap.atualizado_em DESC NULLS LAST,
                                 ap.perfil_id ASC
                        LIMIT 1
                     )), ''),
                     NULLIF(btrim(a.perfil_ativo), '')
                   ) AS perfil_ativo
              FROM public.alunos a
          )
          SELECT CASE WHEN r.aluno_a_id = auth.uid() THEN r.aluno_b_id ELSE r.aluno_a_id END,
                 a.nome, a.apelido, a.foto_url, pp.perfil_ativo,
                 CASE WHEN r.status = 'accepted' THEN 'friend'
                      WHEN r.status = 'pending' AND r.solicitante_id = auth.uid() THEN 'outgoing'
                      WHEN r.status = 'pending' THEN 'incoming'
                      WHEN r.status = 'blocked' THEN 'blocked' END,
                 r.id, gm.guilda_id, g.nome
            FROM public.social_relacionamentos r
            JOIN public.alunos a ON a.id = CASE
              WHEN r.aluno_a_id = auth.uid() THEN r.aluno_b_id ELSE r.aluno_a_id END
            JOIN perfil_principal pp ON pp.id = a.id
            LEFT JOIN public.guilda_membros gm
              ON gm.aluno_id = a.id AND gm.classe_id = p_classe_id AND gm.left_at IS NULL
            LEFT JOIN public.guildas g ON g.id = gm.guilda_id AND g.ativa
           WHERE (r.aluno_a_id = auth.uid() OR r.aluno_b_id = auth.uid())
             AND public.guilda_e_colega(a.id, p_classe_id)
          UNION ALL
          SELECT a.id, a.nome, a.apelido, a.foto_url, pp.perfil_ativo,
                 'candidate', NULL, gm.guilda_id, g.nome
            FROM public.alunos a
            JOIN perfil_principal pp ON pp.id = a.id
            LEFT JOIN public.guilda_membros gm
              ON gm.aluno_id = a.id AND gm.classe_id = p_classe_id AND gm.left_at IS NULL
            LEFT JOIN public.guildas g ON g.id = gm.guilda_id AND g.ativa
           WHERE a.id IN (
             SELECT ca.aluno_id FROM public.classe_aluno ca
              WHERE ca.classe_id = p_classe_id AND ca.aluno_id <> auth.uid()
           )
             AND public.guilda_e_colega(auth.uid(), p_classe_id)
             AND NOT EXISTS (
               SELECT 1 FROM public.social_relacionamentos r
                WHERE r.aluno_a_id = LEAST(auth.uid(), a.id)
                  AND r.aluno_b_id = GREATEST(auth.uid(), a.id)
             );
        $fn$;
        GRANT EXECUTE ON FUNCTION public.social_listar_pessoas(bigint) TO authenticated;
        """
    )


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: manter perfil principal no Social")

