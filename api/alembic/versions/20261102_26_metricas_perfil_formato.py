"""PR3: qual perfil BrainHex responde melhor a cada formato (#20)

`metricas_perfil_formato(classe_ids[], inicio, fim)` cruza perfil BrainHex, formato do material
personalizado e desempenho, numa janela de datas locais (padrão: os últimos 90 dias). Não decide
nada: é leitura agregada para o professor e para o TCC. A conclusão volta para o grafo por um
caminho manual, documentado na spec (`2026-11-02-perfil-formato-pr3-design.md`).

## Definições

- **População** = alunos matriculados nas turmas pedidas. Sem linha em `aluno_perfil`, o aluno fica
  fora do cruzamento e é contado em `populacao.sem_perfil`. Não vira `mastermind` como no console
  (`listar_alunos_classe_com_perfil_dominante`): aqui inventar o perfil contaminaria a resposta.
- **Perfil dominante** = maior `afinidade`, desempate pelo nome (o mesmo `ORDER BY` do console).
- **Uso** = `active_sec` do escopo `material` em itens personalizados (`item_key` com
  `:personalization:`), por `material_tipo`. O material do professor tem outro `item_key` e fica
  de fora: ele não é escolha do grafo.
- **Engajamento** por perfil × formato, sobre os alunos do perfil que usaram algum material
  personalizado na janela: `uso_pct` (quantos usaram o formato), `tempo_ativo_min_por_aluno` e
  `fatia_do_tempo_pct` (média, por aluno, da fatia do formato no tempo personalizado dele; um
  aluno que estuda muito não puxa a média sozinho).
- **Desempenho**: em cada aluno × tópico, o formato dominante é o de mais tempo ativo. O resultado
  é o acerto na 1ª tentativa (`questao_aluno.tentativa = 1`) nas atividades daquele tópico, com
  intervalo de Wilson a 95%.
- **Decisão do grafo**: `prioritario_pct` = fatia das personalizações atuais do perfil com aquele
  `formato_prioritario` (estado de hoje, sem janela: é o que o aluno recebe agora).
- **Vetor de afinidades** (`por_afinidade`): cada aluno entra em todos os perfis, com peso
  `afinidade / 100`. O tamanho de amostra é o n efetivo de Kish, `(Σw)² / Σw²`.

## Anonimização

Só agregado: nenhum `aluno_id` sai daqui. Abaixo de `n_minimo` (do `metricas_catalogo`, chaves
`pr3.%`, padrão 5), a célula volta com todos os números nulos e `amostra_insuficiente = true`.
Fica só a contagem de alunos, que o console já mostra na distribuição de perfis.

Revision ID: 20261102_26
Revises: 20261102_25
Create Date: 2026-11-02
"""

from alembic import op

revision = "20261102_26"
down_revision = "20261102_25"
branch_labels = None
depends_on = None


CATALOGO = """
INSERT INTO public.metricas_catalogo
  (chave, nome, descricao, publico, unidade, janela, fonte, nulo_significa, requer_validacao, invariantes)
VALUES
  ('pr3.engajamento_formato', 'Engajamento por perfil e formato (PR3)',
   'Uso, tempo ativo e fatia do tempo de cada formato do material personalizado, por perfil BrainHex dominante e pelo vetor de afinidades.',
   '{professor,dev}', 'percentual e minutos por aluno', 'janela de datas pedida (padrão: 90 dias)',
   'telemetria_time_metric_entries (escopo material, item personalizado)',
   'menos alunos com uso, ou n efetivo menor, que o mínimo', 'nenhuma', '{}'),
  ('pr3.acerto_formato', 'Acerto por perfil e formato dominante do tópico (PR3)',
   'Acerto na primeira tentativa nas atividades do tópico, agrupado pelo formato em que o aluno mais estudou aquele tópico.',
   '{professor,dev}', 'percentual com intervalo de confiança de 95 por cento', 'janela de datas pedida (padrão: 90 dias)',
   'questao_aluno', 'menos alunos com resposta, ou n efetivo menor, que o mínimo', 'nenhuma', '{I19}')
ON CONFLICT (chave) DO UPDATE SET
  nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, publico = EXCLUDED.publico, unidade = EXCLUDED.unidade,
  janela = EXCLUDED.janela, fonte = EXCLUDED.fonte, nulo_significa = EXCLUDED.nulo_significa,
  requer_validacao = EXCLUDED.requer_validacao, invariantes = EXCLUDED.invariantes;
"""


RPC = r"""
CREATE OR REPLACE FUNCTION public.metricas_perfil_formato(
  p_classe_ids bigint[],
  p_inicio date DEFAULT NULL,
  p_fim date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_tz constant text := 'America/Sao_Paulo';
  v_inicio date;
  v_fim date;
  v_n_min integer;
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR p_classe_ids IS NULL
     OR cardinality(p_classe_ids) = 0
     OR EXISTS (
       SELECT 1 FROM unnest(p_classe_ids) AS pedida(id)
        WHERE pedida.id IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = pedida.id
           )
     ) THEN
    RAISE EXCEPTION 'turma_nao_encontrada_ou_sem_permissao' USING ERRCODE = '42501';
  END IF;
  IF cardinality(p_classe_ids) > 20 THEN
    RAISE EXCEPTION 'turmas_demais' USING ERRCODE = '22023';
  END IF;

  v_fim := COALESCE(p_fim, (now() AT TIME ZONE v_tz)::date);
  v_inicio := COALESCE(p_inicio, v_fim - 89);
  IF v_inicio > v_fim OR v_fim - v_inicio > 365 THEN
    RAISE EXCEPTION 'janela_invalida' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(n_minimo), 5) INTO v_n_min
    FROM public.metricas_catalogo
   WHERE left(chave, 4) = 'pr3.';

  WITH
  lim AS (
    SELECT v_inicio::timestamp AT TIME ZONE v_tz AS ini,
           (v_fim + 1)::timestamp AT TIME ZONE v_tz AS fim
  ),
  turmas AS (
    SELECT DISTINCT u.id FROM unnest(p_classe_ids) AS u(id)
  ),
  alunos AS (
    SELECT DISTINCT ca.aluno_id
      FROM public.classe_aluno ca
      JOIN turmas t ON t.id = ca.classe_id
     WHERE ca.aluno_id IS NOT NULL
  ),
  perfis AS (
    SELECT p.id, lower(p.nome) AS nome FROM public.perfil p WHERE p.nome IS NOT NULL
  ),
  -- Vetor completo: cada aluno com cada perfil que tem, peso em [0, 1].
  afinidades AS (
    SELECT ap.aluno_id, pf.nome AS perfil, ap.afinidade,
           LEAST(GREATEST(COALESCE(ap.afinidade, 0), 0), 100) / 100.0 AS peso
      FROM public.aluno_perfil ap
      JOIN alunos a ON a.aluno_id = ap.aluno_id
      JOIN perfis pf ON pf.id = ap.perfil_id
  ),
  dominante AS (
    SELECT DISTINCT ON (af.aluno_id) af.aluno_id, af.perfil, af.afinidade
      FROM afinidades af
     ORDER BY af.aluno_id, af.afinidade DESC NULLS LAST, af.perfil
  ),
  -- Segundos ativos por aluno × tópico × formato, só do material personalizado.
  uso AS (
    SELECT e.aluno_id, e.topico_id, e.material_tipo AS formato, sum(e.active_sec)::numeric AS seg
      FROM public.telemetria_time_metric_entries e
      JOIN alunos a ON a.aluno_id = e.aluno_id
      JOIN turmas t ON t.id = e.classe_id
      CROSS JOIN lim
     WHERE e.scope = 'material'
       AND e.item_key ~ '[:]personalization[:]'  -- sem porcento nem dois-pontos colado: ver os testes
       AND e.material_tipo IS NOT NULL
       AND e.topico_id IS NOT NULL
       AND e.captured_at >= lim.ini AND e.captured_at < lim.fim
     GROUP BY e.aluno_id, e.topico_id, e.material_tipo
    HAVING sum(e.active_sec) > 0
  ),
  -- O que o grafo escolheu: personalizações atuais dos alunos, nas turmas pedidas.
  prioritario AS (
    SELECT cp.aluno_id, lower(cp.formato_prioritario) AS formato, count(*) AS n
      FROM public.conteudo_personalizado cp
      JOIN alunos a ON a.aluno_id = cp.aluno_id
      JOIN turmas t ON t.id = cp.classe_id
     WHERE NULLIF(btrim(cp.formato_prioritario), '') IS NOT NULL
     GROUP BY cp.aluno_id, lower(cp.formato_prioritario)
  ),
  formatos AS (
    SELECT formato FROM uso UNION SELECT formato FROM prioritario
  ),
  uso_aluno AS (
    SELECT aluno_id, formato, sum(seg) AS seg FROM uso GROUP BY aluno_id, formato
  ),
  total_aluno AS (
    SELECT aluno_id, sum(seg) AS seg FROM uso_aluno GROUP BY aluno_id
  ),
  -- Fatia de cada formato no tempo personalizado do aluno; zero quando ele não usou.
  fatia AS (
    SELECT t.aluno_id, f.formato, COALESCE(u.seg, 0) AS seg, COALESCE(u.seg, 0) / t.seg AS fatia
      FROM total_aluno t
     CROSS JOIN formatos f
      LEFT JOIN uso_aluno u ON u.aluno_id = t.aluno_id AND u.formato = f.formato
  ),
  dom_topico AS (
    SELECT DISTINCT ON (aluno_id, topico_id) aluno_id, topico_id, formato
      FROM uso
     ORDER BY aluno_id, topico_id, seg DESC, formato
  ),
  respostas AS (
    SELECT qa.aluno_id, a.topico_id, count(*) AS n, count(*) FILTER (WHERE qa.correta) AS acertos
      FROM public.questao_aluno qa
      JOIN alunos al ON al.aluno_id = qa.aluno_id
      JOIN public.atividades a ON a.id = qa.atividade_id
      JOIN public.topicos tp ON tp.id = a.topico_id
      JOIN turmas t ON t.id = tp.classe_id
      CROSS JOIN lim
     WHERE qa.tentativa = 1
       AND qa.correta IS NOT NULL
       AND qa.criado_em >= lim.ini AND qa.criado_em < lim.fim
     GROUP BY qa.aluno_id, a.topico_id
  ),
  -- Por aluno × formato dominante: quantos tópicos, quantas respostas, quantos acertos.
  pares AS (
    SELECT d.aluno_id, d.formato, count(*) AS topicos, sum(r.n) AS n, sum(r.acertos) AS acertos
      FROM dom_topico d
      JOIN respostas r ON r.aluno_id = d.aluno_id AND r.topico_id = d.topico_id
     GROUP BY d.aluno_id, d.formato
  ),
  dom_n AS (
    SELECT d.perfil, count(*) AS alunos, count(t.aluno_id) AS com_uso, avg(d.afinidade) AS afinidade_media
      FROM dominante d
      LEFT JOIN total_aluno t ON t.aluno_id = d.aluno_id
     GROUP BY d.perfil
  ),
  dom_eng AS (
    SELECT d.perfil, fa.formato, count(*) FILTER (WHERE fa.seg > 0) AS usaram, sum(fa.seg) AS seg,
           avg(fa.fatia) AS fatia
      FROM fatia fa
      JOIN dominante d ON d.aluno_id = fa.aluno_id
     GROUP BY d.perfil, fa.formato
  ),
  dom_des AS (
    SELECT d.perfil, p.formato, count(*) AS alunos, sum(p.topicos) AS topicos, sum(p.n) AS n,
           sum(p.acertos) AS acertos
      FROM pares p
      JOIN dominante d ON d.aluno_id = p.aluno_id
     GROUP BY d.perfil, p.formato
  ),
  dom_pri AS (
    SELECT d.perfil, pr.formato, sum(pr.n) AS n
      FROM prioritario pr
      JOIN dominante d ON d.aluno_id = pr.aluno_id
     GROUP BY d.perfil, pr.formato
  ),
  dom_pri_tot AS (
    SELECT d.perfil, count(DISTINCT pr.aluno_id) AS alunos, sum(pr.n) AS n
      FROM prioritario pr
      JOIN dominante d ON d.aluno_id = pr.aluno_id
     GROUP BY d.perfil
  ),
  af_eng AS (
    SELECT af.perfil, fa.formato,
           sum(af.peso * fa.fatia) / NULLIF(sum(af.peso), 0) AS fatia,
           power(sum(af.peso), 2) / NULLIF(sum(power(af.peso, 2)), 0) AS n_efetivo
      FROM fatia fa
      JOIN afinidades af ON af.aluno_id = fa.aluno_id
     GROUP BY af.perfil, fa.formato
  ),
  af_des AS (
    SELECT af.perfil, p.formato,
           sum(af.peso * p.acertos) / NULLIF(sum(af.peso * p.n), 0) AS acerto,
           power(sum(af.peso), 2) / NULLIF(sum(power(af.peso, 2)), 0) AS n_efetivo
      FROM pares p
      JOIN afinidades af ON af.aluno_id = p.aluno_id
     GROUP BY af.perfil, p.formato
  )
  SELECT jsonb_build_object(
    'janela', jsonb_build_object('inicio', v_inicio, 'fim', v_fim, 'timezone', v_tz),
    'n_minimo', v_n_min,
    'populacao', jsonb_build_object(
      'alunos', (SELECT count(*) FROM alunos),
      'com_perfil', (SELECT count(*) FROM dominante),
      'sem_perfil', (SELECT count(*) FROM alunos) - (SELECT count(*) FROM dominante),
      'com_uso_personalizado', (SELECT count(*) FROM total_aluno)
    ),
    'formatos', COALESCE((SELECT jsonb_agg(f.formato ORDER BY f.formato) FROM formatos f), '[]'::jsonb),
    'por_perfil_dominante', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'perfil', pf.nome,
                 'alunos', COALESCE(dn.alunos, 0),
                 'alunos_com_uso', COALESCE(dn.com_uso, 0),
                 'amostra_insuficiente', COALESCE(dn.com_uso, 0) < v_n_min,
                 'afinidade_media', CASE WHEN COALESCE(dn.com_uso, 0) >= v_n_min
                                         THEN round(dn.afinidade_media, 1) END,
                 'formatos', COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'formato', f.formato,
                              'uso_pct', CASE WHEN COALESCE(dn.com_uso, 0) >= v_n_min
                                              THEN round(100.0 * COALESCE(de.usaram, 0) / dn.com_uso, 2) END,
                              'tempo_ativo_min_por_aluno', CASE WHEN COALESCE(dn.com_uso, 0) >= v_n_min
                                              THEN round(COALESCE(de.seg, 0) / 60.0 / dn.com_uso, 2) END,
                              'fatia_do_tempo_pct', CASE WHEN COALESCE(dn.com_uso, 0) >= v_n_min
                                              THEN round(100 * COALESCE(de.fatia, 0), 2) END,
                              'prioritario_pct', CASE WHEN COALESCE(dpt.alunos, 0) >= v_n_min
                                              THEN round(100.0 * COALESCE(dp.n, 0) / dpt.n, 2) END,
                              'desempenho', jsonb_build_object(
                                'alunos', COALESCE(dd.alunos, 0),
                                'amostra_insuficiente', COALESCE(dd.alunos, 0) < v_n_min,
                                'topicos', CASE WHEN dd.alunos >= v_n_min THEN dd.topicos END,
                                'respostas', CASE WHEN dd.alunos >= v_n_min THEN dd.n END,
                                'acerto_primeira_tentativa_pct',
                                  CASE WHEN dd.alunos >= v_n_min THEN round(100.0 * dd.acertos / dd.n, 2) END,
                                'ic95_pct', CASE WHEN dd.alunos >= v_n_min THEN jsonb_build_array(
                                  round(100 * GREATEST(w.centro - w.meia, 0), 2),
                                  round(100 * LEAST(w.centro + w.meia, 1), 2)) END
                              )
                            )
                            ORDER BY f.formato)
                     FROM formatos f
                     LEFT JOIN dom_eng de ON de.perfil = pf.nome AND de.formato = f.formato
                     LEFT JOIN dom_pri dp ON dp.perfil = pf.nome AND dp.formato = f.formato
                     LEFT JOIN dom_des dd ON dd.perfil = pf.nome AND dd.formato = f.formato
                     LEFT JOIN LATERAL (
                       -- Intervalo de Wilson, z = 1,96.
                       SELECT (dd.acertos::numeric / dd.n + 1.9208 / dd.n) / (1 + 3.8416 / dd.n) AS centro,
                              1.96 * sqrt((dd.acertos::numeric / dd.n) * (1 - dd.acertos::numeric / dd.n) / dd.n
                                          + 0.9604 / (dd.n::numeric * dd.n)) / (1 + 3.8416 / dd.n) AS meia
                        WHERE dd.n > 0
                     ) w ON true
                 ), '[]'::jsonb)
               )
               ORDER BY pf.nome)
        FROM perfis pf
        LEFT JOIN dom_n dn ON dn.perfil = pf.nome
        LEFT JOIN dom_pri_tot dpt ON dpt.perfil = pf.nome
    ), '[]'::jsonb),
    'por_afinidade', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'perfil', pf.nome,
                 'formatos', COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'formato', f.formato,
                              'n_efetivo', round(COALESCE(ae.n_efetivo, 0), 2),
                              'amostra_insuficiente', COALESCE(ae.n_efetivo, 0) < v_n_min,
                              'fatia_do_tempo_pct', CASE WHEN ae.n_efetivo >= v_n_min
                                                         THEN round(100 * ae.fatia, 2) END,
                              'desempenho', jsonb_build_object(
                                'n_efetivo', round(COALESCE(ad.n_efetivo, 0), 2),
                                'amostra_insuficiente', COALESCE(ad.n_efetivo, 0) < v_n_min,
                                'acerto_primeira_tentativa_pct', CASE WHEN ad.n_efetivo >= v_n_min
                                                                      THEN round(100 * ad.acerto, 2) END
                              )
                            )
                            ORDER BY f.formato)
                     FROM formatos f
                     LEFT JOIN af_eng ae ON ae.perfil = pf.nome AND ae.formato = f.formato
                     LEFT JOIN af_des ad ON ad.perfil = pf.nome AND ad.formato = f.formato
                 ), '[]'::jsonb)
               )
               ORDER BY pf.nome)
        FROM perfis pf
    ), '[]'::jsonb),
    'definicoes', jsonb_build_object(
      'populacao', 'alunos matriculados nas turmas; sem aluno_perfil fica fora e conta em sem_perfil',
      'perfil_dominante', 'maior afinidade, desempate pelo nome',
      'uso', 'active_sec do escopo material em item personalizado, por material_tipo',
      'fatia_do_tempo', 'media por aluno da fatia do formato no tempo personalizado dele',
      'desempenho', 'acerto na 1a tentativa no topico, pelo formato de mais tempo ativo no topico; ic95 de Wilson',
      'prioritario', 'formato_prioritario das personalizacoes atuais (sem janela)',
      'por_afinidade', 'cada aluno em todos os perfis com peso afinidade/100; n efetivo de Kish'
    ),
    'limitacoes', jsonb_build_array(
      'observacional: o formato nao foi sorteado, entao o resultado mostra associacao, nao causa',
      'o formato dominante depende do que o grafo ofereceu; perfil que nunca recebeu um formato nao o usa',
      'as respostas de um aluno nao sao independentes; o IC trata cada resposta como independente e sai estreito demais',
      'a telemetria depende do consentimento e do app; aluno sem telemetria nao entra no uso',
      'o consentimento de pesquisa ainda nao filtra a populacao (issue 17)',
      'celula com menos alunos (ou n efetivo) que n_minimo volta nula'
    )
  )
  INTO v_resultado;

  RETURN v_resultado;
END;
$fn$;

REVOKE ALL ON FUNCTION public.metricas_perfil_formato(bigint[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metricas_perfil_formato(bigint[], date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
"""


DOWNGRADE = """
DROP FUNCTION IF EXISTS public.metricas_perfil_formato(bigint[], date, date);
DELETE FROM public.metricas_catalogo WHERE chave IN ('pr3.engajamento_formato', 'pr3.acerto_formato');

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(CATALOGO)
    op.execute(RPC)


def downgrade() -> None:
    op.execute(DOWNGRADE)
