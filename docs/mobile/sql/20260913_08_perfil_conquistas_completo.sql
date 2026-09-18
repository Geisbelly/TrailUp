BEGIN;

CREATE OR REPLACE FUNCTION public.social_perfil_publico(p_aluno_id uuid, p_classe_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT jsonb_build_object(
    'aluno_id',a.id,'nome',a.nome,'apelido',a.apelido,'foto_url',a.foto_url,'banner_url',a.banner_url,
    'perfil_ativo',a.perfil_ativo,'descricao',a.descricao,'perfil_descricao',p.descricao,
    'guilda', (SELECT jsonb_build_object('id',g.id,'nome',g.nome,'emblema',g.emblema,'membros',
      (SELECT count(*)::integer FROM public.guilda_membros x WHERE x.guilda_id=g.id AND x.left_at IS NULL))
      FROM public.guilda_membros gm JOIN public.guildas g ON g.id=gm.guilda_id
      WHERE gm.aluno_id=a.id AND gm.classe_id=p_classe_id AND gm.left_at IS NULL AND g.ativa
      ORDER BY gm.joined_at DESC LIMIT 1),
    'conquistas', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,'nome',c.nome,'descricao',c.descricao,'icone_url',c.icone_url,
      'categoria',c.categoria,'pontos_recompensa',c.pontos_recompensa,'data_conquista',ca.data_conquista)
      ORDER BY ca.data_conquista DESC, c.id)
      FROM public.conquistas_aluno ca JOIN public.conquistas c ON c.id=ca.conquista_id
      WHERE ca.aluno_id=a.id AND ca.concluida IS TRUE), '[]'::jsonb),
    'pontos_conquistas', COALESCE((SELECT sum(c.pontos_recompensa) FROM public.conquistas_aluno ca
      JOIN public.conquistas c ON c.id=ca.conquista_id WHERE ca.aluno_id=a.id AND ca.concluida IS TRUE),0)
  )
  FROM public.alunos a
  LEFT JOIN public.aluno_perfil ap ON ap.aluno_id=a.id
    AND a.perfil_ativo=(SELECT nome FROM public.perfil WHERE id=ap.perfil_id LIMIT 1)
  LEFT JOIN public.perfil p ON p.id=ap.perfil_id
  WHERE a.id=p_aluno_id AND public.guilda_e_colega(auth.uid(),p_classe_id)
    AND public.guilda_e_colega(a.id,p_classe_id);
$fn$;

COMMIT;
