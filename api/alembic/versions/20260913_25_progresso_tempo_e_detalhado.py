"""Expose topic time and persist study time when telemetry is unavailable.

The mobile study timer still runs when telemetry consent is absent.  In that
case it needs an atomic database fallback; otherwise the screen appears to
count time but nothing reaches ``tempo_gasto_min``.
"""

from alembic import op


revision = "20260913_25"
down_revision = "20260913_24"
branch_labels = None
depends_on = None


VIEW = """
CREATE OR REPLACE VIEW public.vw_aluno_classe_detalhado AS
 SELECT ta.aluno_id,
    t.id AS topico_id,
    t.classe_id,
    t.nome AS topico_nome,
    t.descricao AS topico_descricao,
    t.ordem AS topico_ordem,
    t.next AS topico_next,
    t.depende AS topico_depende,
    ta.status AS topico_status,
    ta.percentual_concluido AS topico_percentual_concluido,
    ta.ultima_atividade AS topico_ultima_atividade,
    ta.ultima_visualizacao AS topico_ultima_visualizacao,
    ta.updated_at AS topico_updated_at,
    co.id AS conteudo_id,
    co.titulo AS conteudo_titulo,
    co.tipo AS conteudo_tipo,
    co.conteudo AS conteudo_conteudo,
    co.ordem AS conteudo_ordem,
    co.metadata AS conteudo_metadata,
    ca2.status AS conteudo_status,
    ca2.percentual_concluido AS conteudo_percentual_concluido,
    ca2.tempo_gasto_min AS conteudo_tempo_gasto_min,
    ca2.ultima_visualizacao AS conteudo_ultima_visualizacao,
    a.id AS atividade_id,
    a.titulo AS atividade_titulo,
    a.descricao AS atividade_descricao,
    a.tipo AS atividade_tipo,
    a.pontuacao_maxima,
    a.data_entrega AS atividade_data_entrega,
    ac.atividade_id AS atividade_conteudo_atividade_id,
    ac.conteudo_id AS atividade_conteudo_conteudo_id,
    q.id AS questao_id,
    q.enunciado AS questao_enunciado,
    q.tipo AS questao_tipo,
    q.alternativas AS questao_alternativas,
    q.resposta_correta AS questao_resposta_correta,
    q.midia_url AS questao_midia_url,
    m.id AS midia_id,
    m.tipo AS midia_tipo,
    m.url AS midia_url,
    m.legenda AS midia_legenda,
    m.ordem AS midia_ordem,
    aa.status AS atividade_status,
    aa.percentual_concluido AS atividade_percentual_concluido,
    aa.acertos_percentual AS atividade_acertos_percentual,
    aa.tempo_gasto_min AS atividade_tempo_gasto_min,
    aa.pontuacao_obtida AS atividade_pontuacao_obtida,
    aa.ultima_visualizacao AS atividade_ultima_visualizacao,
    ta.tempo_gasto_min AS topico_tempo_gasto_min
   FROM topicos t
     JOIN topico_aluno ta ON ta.topico_id = t.id
     LEFT JOIN conteudos co ON co.topico_id = t.id
     LEFT JOIN conteudo_aluno ca2 ON ca2.conteudo_id = co.id AND ca2.aluno_id = ta.aluno_id
     LEFT JOIN atividades a ON a.topico_id = t.id
     LEFT JOIN atividade_conteudos ac ON ac.atividade_id = a.id AND ac.conteudo_id = co.id
     LEFT JOIN questoes q ON q.atividade_id = a.id
     LEFT JOIN midias m ON m.conteudo_id = co.id
     LEFT JOIN atividade_aluno aa ON aa.atividade_id = a.id AND aa.aluno_id = ta.aluno_id;

ALTER VIEW public.vw_aluno_classe_detalhado SET (security_invoker = on);
"""


TIME_RPC = """
CREATE OR REPLACE FUNCTION public.trailup_registrar_tempo_estudo(
  p_aluno uuid,
  p_topico bigint,
  p_conteudo bigint,
  p_atividade bigint,
  p_tempo_min numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_auth uuid := auth.uid();
  v_classe bigint;
BEGIN
  IF v_auth IS NULL OR p_aluno IS DISTINCT FROM v_auth THEN
    RAISE EXCEPTION 'aluno_invalido';
  END IF;
  IF p_topico IS NULL OR p_tempo_min IS NULL OR p_tempo_min <= 0 THEN
    RETURN;
  END IF;

  SELECT t.classe_id INTO v_classe FROM topicos t WHERE t.id = p_topico;
  IF v_classe IS NULL THEN RAISE EXCEPTION 'topico_invalido'; END IF;

  IF p_conteudo IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM conteudos c WHERE c.id = p_conteudo AND c.topico_id = p_topico
  ) THEN
    RAISE EXCEPTION 'conteudo_invalido';
  END IF;
  IF p_atividade IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM atividades a WHERE a.id = p_atividade AND a.topico_id = p_topico
  ) THEN
    RAISE EXCEPTION 'atividade_invalida';
  END IF;

  INSERT INTO topico_aluno (
    aluno_id, topico_id, status, percentual_concluido,
    tempo_gasto_min, ultima_visualizacao, updated_at
  ) VALUES (
    p_aluno, p_topico, 'em andamento', 0,
    p_tempo_min, now(), now()
  )
  ON CONFLICT (aluno_id, topico_id) DO UPDATE SET
    tempo_gasto_min = COALESCE(topico_aluno.tempo_gasto_min, 0) + EXCLUDED.tempo_gasto_min,
    ultima_visualizacao = now(),
    updated_at = now();

  IF p_conteudo IS NOT NULL THEN
    INSERT INTO conteudo_aluno (
      aluno_id, conteudo_id, status, percentual_concluido,
      tempo_gasto_min, ultima_visualizacao, updated_at
    ) VALUES (
      p_aluno, p_conteudo, 'em andamento', 0,
      p_tempo_min, now(), now()
    )
    ON CONFLICT (aluno_id, conteudo_id) DO UPDATE SET
      tempo_gasto_min = COALESCE(conteudo_aluno.tempo_gasto_min, 0) + EXCLUDED.tempo_gasto_min,
      ultima_visualizacao = now(),
      updated_at = now();
  END IF;

  IF p_atividade IS NOT NULL THEN
    INSERT INTO atividade_aluno (
      aluno_id, atividade_id, status, percentual_concluido,
      tempo_gasto_min, ultima_visualizacao, updated_at
    ) VALUES (
      p_aluno, p_atividade, 'em andamento', 0,
      p_tempo_min, now(), now()
    )
    ON CONFLICT (aluno_id, atividade_id) DO UPDATE SET
      tempo_gasto_min = COALESCE(atividade_aluno.tempo_gasto_min, 0) + EXCLUDED.tempo_gasto_min,
      ultima_visualizacao = now(),
      updated_at = now();
  END IF;

  PERFORM public.trailup_recalcular_topico_aluno(p_aluno, p_topico);
  PERFORM public.trailup_recalcular_classe_aluno(p_aluno, v_classe);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.trailup_registrar_tempo_estudo(uuid, bigint, bigint, bigint, numeric)
  TO authenticated;
"""


def upgrade() -> None:
    op.execute(VIEW)
    op.execute(TIME_RPC)


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: manter o contador de tempo canônico")
