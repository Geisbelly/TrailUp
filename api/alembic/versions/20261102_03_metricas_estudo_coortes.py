"""PR1 e PR2 lado a lado, antes e depois do corte, por cohort (#13)

`metricas_estudo_coortes(classe_ids[])` lê as cohorts da `20261102_02` e devolve, por turma, as
janelas `pre` (`[baseline_inicio, corte)`) e `pos` (`[corte, min(fim, hoje)]`), a série semanal
relativa ao corte (para a #19), os marcos de produto que caíram dentro do estudo e a comparação
entre braços (diferença-em-diferenças).

## Definições

- **População: pareados** = matriculados antes do corte (intenção de tratar). Quem entra depois
  do corte não tem baseline e fica fora da comparação; não estudar conta como zero, não some.
- **PR1:** soma de `active_sec` do escopo `topic` (só esse escopo: os escopos são aninhados e
  somá-los multiplica o tempo), em minutos por aluno pareado e por semana da janela.
- **PR2:**
  - conclusão = primeira conclusão do tópico (`topico_aluno_conclusao`), por aluno e semana;
  - atividades = primeira entrega por aluno e atividade (`atividade_tentativas.respondida_em`, o
    relógio do servidor da #136), por aluno e semana;
  - acerto = `questao_aluno` na 1ª tentativa (D-5: uma fonte por fato).
- **Semana** = relativa ao corte: −1 é a última do baseline, 0 a primeira depois dele. A primeira
  e a última podem ser parciais (`dias < 7`); as taxas já são por semana.

## Anonimização (TCC 09 §8)

Só agregado: nenhum `aluno_id` sai daqui. Célula com menos pareados que `n_minimo` (do
`metricas_catalogo`, padrão 5) volta `NULL` com `amostra_insuficiente = true`; o acerto exige
também `n_minimo` alunos com resposta. A comparação entre braços soma os alunos de todas as
turmas do braço antes de checar o mínimo.

## Contaminação

Ainda não existe trava que segure a personalização no baseline (PR à parte). Então a RPC acusa
em vez de supor: `material_pronto_antes_do_corte`, `alunos_expostos_pct` em cada janela (tempo
ativo no escopo `material`, que só o material personalizado grava) e, na turma de comparação,
`comparacao_recebeu_personalizacao`.

## Funções internas

`estudo_indicadores_janela` (contagens cruas) e `estudo_indicadores_publicos` (taxas e supressão)
não têm EXECUTE para cliente nenhum: o número cru de uma turma pequena é justamente o que a
supressão esconde.

Revision ID: 20261102_03
Revises: 20261102_02
Create Date: 2026-11-02
"""

from alembic import op

revision = "20261102_03"
down_revision = "20261102_02"
branch_labels = None
depends_on = None


CATALOGO = """
INSERT INTO public.metricas_catalogo
  (chave, nome, descricao, publico, unidade, janela, fonte, nulo_significa, requer_validacao, invariantes)
VALUES
  ('estudo.pr1_tempo_ativo', 'Tempo ativo por aluno e semana (estudo)',
   'Minutos ativos do escopo de tópico por aluno pareado e por semana, antes e depois do corte da cohort.',
   '{professor,dev}', 'minutos por aluno e semana', 'baseline e intervenção da cohort',
   'metricas_estudo_coortes.pr1', 'janela não começou ou amostra menor que o mínimo', 'nenhuma',
   '{I01,I02,I03,I16}'),
  ('estudo.pr2_conclusao', 'Tópicos concluídos por aluno e semana (estudo)',
   'Primeira conclusão de cada tópico por aluno pareado e por semana, antes e depois do corte.',
   '{professor,dev}', 'tópicos por aluno e semana', 'baseline e intervenção da cohort',
   'topico_aluno_conclusao', 'janela não começou ou amostra menor que o mínimo', 'nenhuma',
   '{I04,I05}'),
  ('estudo.pr2_atividades', 'Atividades entregues por aluno e semana (estudo)',
   'Primeira entrega de cada atividade por aluno pareado e por semana, pelo relógio do servidor.',
   '{professor,dev}', 'atividades por aluno e semana', 'baseline e intervenção da cohort',
   'atividade_tentativas.respondida_em', 'janela não começou ou amostra menor que o mínimo', 'nenhuma',
   '{}'),
  ('estudo.pr2_acerto', 'Acerto na primeira tentativa (estudo)',
   'Percentual de questões certas na primeira tentativa, antes e depois do corte da cohort.',
   '{professor,dev}', 'percentual', 'baseline e intervenção da cohort',
   'questao_aluno', 'menos alunos com resposta que o mínimo', 'nenhuma',
   '{I19}')
ON CONFLICT (chave) DO UPDATE SET
  nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, publico = EXCLUDED.publico, unidade = EXCLUDED.unidade,
  janela = EXCLUDED.janela, fonte = EXCLUDED.fonte, nulo_significa = EXCLUDED.nulo_significa,
  requer_validacao = EXCLUDED.requer_validacao, invariantes = EXCLUDED.invariantes;
"""


INTERNAS = r"""
-- Contagens cruas de uma janela de datas locais [p_inicio, p_fim], só dos pareados ao corte.
CREATE OR REPLACE FUNCTION public.estudo_indicadores_janela(
  p_classe_id bigint,
  p_inicio date,
  p_fim date,
  p_corte date,
  p_timezone text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
WITH
lim AS (
  SELECT p_inicio::timestamp AT TIME ZONE p_timezone AS ini,
         (p_fim + 1)::timestamp AT TIME ZONE p_timezone AS fim
),
pareados AS (
  SELECT ca.aluno_id
    FROM public.classe_aluno ca
   WHERE ca.classe_id = p_classe_id
     AND ca.aluno_id IS NOT NULL
   GROUP BY ca.aluno_id
  HAVING (min(ca.created_at) AT TIME ZONE p_timezone)::date < p_corte
),
tempo AS (
  SELECT COALESCE(sum(e.active_sec), 0)::numeric AS ativo_seg,
         count(DISTINCT e.aluno_id) FILTER (WHERE e.active_sec > 0) AS alunos_ativos
    FROM public.telemetria_time_metric_entries e
    JOIN pareados p ON p.aluno_id = e.aluno_id
    CROSS JOIN lim
   WHERE e.classe_id = p_classe_id
     AND e.scope = 'topic'
     AND e.captured_at >= lim.ini AND e.captured_at < lim.fim
),
expostos AS (
  SELECT count(DISTINCT e.aluno_id) AS alunos
    FROM public.telemetria_time_metric_entries e
    JOIN pareados p ON p.aluno_id = e.aluno_id
    CROSS JOIN lim
   WHERE e.classe_id = p_classe_id
     AND e.scope = 'material'
     AND e.active_sec > 0
     AND e.captured_at >= lim.ini AND e.captured_at < lim.fim
),
conclusoes AS (
  SELECT count(*) AS topicos
    FROM public.topico_aluno_conclusao c
    JOIN pareados p ON p.aluno_id = c.aluno_id
    CROSS JOIN lim
   WHERE c.classe_id = p_classe_id
     AND c.concluido_em >= lim.ini AND c.concluido_em < lim.fim
),
entregas AS (
  SELECT count(*) AS atividades
    FROM (
      SELECT t.aluno_id, t.atividade_id, min(t.respondida_em) AS primeira
        FROM public.atividade_tentativas t
        JOIN pareados p ON p.aluno_id = t.aluno_id
       WHERE t.classe_id = p_classe_id
         AND t.respondida_em IS NOT NULL
       GROUP BY t.aluno_id, t.atividade_id
    ) x
    CROSS JOIN lim
   WHERE x.primeira >= lim.ini AND x.primeira < lim.fim
),
respostas AS (
  SELECT count(*) AS respostas,
         count(*) FILTER (WHERE qa.correta) AS acertos,
         count(DISTINCT qa.aluno_id) AS alunos
    FROM public.questao_aluno qa
    JOIN pareados p ON p.aluno_id = qa.aluno_id
    JOIN public.atividades a ON a.id = qa.atividade_id
    JOIN public.topicos tp ON tp.id = a.topico_id
    CROSS JOIN lim
   WHERE tp.classe_id = p_classe_id
     AND qa.tentativa = 1
     AND qa.correta IS NOT NULL
     AND qa.criado_em >= lim.ini AND qa.criado_em < lim.fim
),
ciclos AS (
  SELECT count(DISTINCT cp.ciclo_id) AS ciclos
    FROM public.conteudo_personalizado cp
    CROSS JOIN lim
   WHERE cp.classe_id = p_classe_id
     AND cp.gerado_em >= lim.ini AND cp.gerado_em < lim.fim
),
plataformas AS (
  SELECT COALESCE(jsonb_object_agg(x.plataforma, x.lotes), '{}'::jsonb) AS por_plataforma
    FROM (
      SELECT COALESCE(NULLIF(btrim(l.payload -> 'cliente' ->> 'plataforma'), ''), 'sem_cliente') AS plataforma,
             count(*) AS lotes
        FROM public.telemetria_lotes l
        JOIN pareados p ON p.aluno_id = l.aluno_id
        CROSS JOIN lim
       WHERE l.classe_id = p_classe_id
         AND l.captured_at >= lim.ini AND l.captured_at < lim.fim
       GROUP BY 1
    ) x
)
SELECT jsonb_build_object(
  'inicio', p_inicio,
  'fim', p_fim,
  'dias', p_fim - p_inicio + 1,
  'pareados', (SELECT count(*) FROM pareados),
  'ativo_seg', tempo.ativo_seg,
  'alunos_ativos', tempo.alunos_ativos,
  'alunos_expostos', expostos.alunos,
  'topicos_concluidos', conclusoes.topicos,
  'atividades_entregues', entregas.atividades,
  'respostas', respostas.respostas,
  'acertos', respostas.acertos,
  'alunos_com_resposta', respostas.alunos,
  'ciclos_personalizacao', ciclos.ciclos,
  'lotes_por_plataforma', plataformas.por_plataforma
)
FROM tempo, expostos, conclusoes, entregas, respostas, ciclos, plataformas;
$fn$;

-- Taxas por aluno e semana, com supressão abaixo de n_minimo. Entrada crua, saída publicável.
CREATE OR REPLACE FUNCTION public.estudo_indicadores_publicos(p_bruto jsonb, p_n_minimo integer)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
SELECT CASE WHEN p_bruto IS NULL THEN NULL ELSE jsonb_build_object(
  'inicio', p_bruto -> 'inicio',
  'fim', p_bruto -> 'fim',
  'dias', p_bruto -> 'dias',
  'pareados', CASE WHEN b.ok THEN b.pareados END,
  'amostra_insuficiente', NOT b.ok,
  'pr1', jsonb_build_object(
    'tempo_ativo_min_por_aluno_semana',
      CASE WHEN b.ok THEN round(b.ativo_seg / 60.0 / b.aluno_semanas, 2) END,
    'alunos_ativos_pct',
      CASE WHEN b.ok THEN round(100.0 * b.alunos_ativos / b.pareados, 2) END
  ),
  'pr2', jsonb_build_object(
    'topicos_concluidos_por_aluno_semana',
      CASE WHEN b.ok THEN round(b.topicos / b.aluno_semanas, 3) END,
    'atividades_entregues_por_aluno_semana',
      CASE WHEN b.ok THEN round(b.atividades / b.aluno_semanas, 3) END,
    'acerto_primeira_tentativa_pct',
      CASE WHEN b.ok AND b.alunos_com_resposta >= p_n_minimo AND b.respostas > 0
           THEN round(100.0 * b.acertos / b.respostas, 2) END,
    'respostas_primeira_tentativa', CASE WHEN b.ok THEN b.respostas END,
    'acerto_amostra_insuficiente', NOT (b.ok AND b.alunos_com_resposta >= p_n_minimo AND b.respostas > 0)
  ),
  'exposicao', jsonb_build_object(
    'alunos_expostos_pct',
      CASE WHEN b.ok THEN round(100.0 * b.alunos_expostos / b.pareados, 2) END,
    'ciclos_personalizacao', p_bruto -> 'ciclos_personalizacao'
  ),
  'lotes_por_plataforma', p_bruto -> 'lotes_por_plataforma'
) END
FROM (
  SELECT
    COALESCE((p_bruto ->> 'pareados')::numeric, 0) AS pareados,
    COALESCE((p_bruto ->> 'pareados')::numeric, 0) >= GREATEST(p_n_minimo, 1) AS ok,
    NULLIF(COALESCE((p_bruto ->> 'pareados')::numeric, 0) * (p_bruto ->> 'dias')::numeric / 7.0, 0)
      AS aluno_semanas,
    (p_bruto ->> 'ativo_seg')::numeric AS ativo_seg,
    (p_bruto ->> 'alunos_ativos')::numeric AS alunos_ativos,
    (p_bruto ->> 'alunos_expostos')::numeric AS alunos_expostos,
    (p_bruto ->> 'topicos_concluidos')::numeric AS topicos,
    (p_bruto ->> 'atividades_entregues')::numeric AS atividades,
    (p_bruto ->> 'respostas')::numeric AS respostas,
    (p_bruto ->> 'acertos')::numeric AS acertos,
    (p_bruto ->> 'alunos_com_resposta')::numeric AS alunos_com_resposta
) b;
$fn$;

REVOKE ALL ON FUNCTION public.estudo_indicadores_janela(bigint, date, date, date, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.estudo_indicadores_publicos(jsonb, integer)
  FROM PUBLIC, anon, authenticated;
"""


RPC = r"""
CREATE OR REPLACE FUNCTION public.metricas_estudo_coortes(p_classe_ids bigint[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_n_min integer;
  c public.estudo_coorte;
  v_hoje date;
  v_ultimo date;
  v_pre jsonb;
  v_pos jsonb;
  v_semanas jsonb;
  v_semana jsonb;
  v_k integer;
  v_s_ini date;
  v_s_fim date;
  v_marcos jsonb;
  v_pronto_antes boolean;
  v_pronto_ate_fim boolean;
  v_coortes jsonb := '[]'::jsonb;
  v_brutos jsonb := '[]'::jsonb;
  v_comparacao jsonb;
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
  IF EXISTS (
    SELECT 1 FROM unnest(p_classe_ids) AS pedida(id)
     WHERE NOT EXISTS (SELECT 1 FROM public.estudo_coorte ec WHERE ec.classe_id = pedida.id)
  ) THEN
    RAISE EXCEPTION 'turma_sem_coorte' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(n_minimo), 5) INTO v_n_min
    FROM public.metricas_catalogo
   WHERE left(chave, 7) = 'estudo.';

  FOR c IN
    SELECT ec.*
      FROM (SELECT DISTINCT ON (u.id) u.id, u.ord
              FROM unnest(p_classe_ids) WITH ORDINALITY AS u(id, ord)
             ORDER BY u.id, u.ord) pedida
      JOIN public.estudo_coorte ec ON ec.classe_id = pedida.id
     ORDER BY pedida.ord
  LOOP
    v_hoje := (now() AT TIME ZONE c.timezone)::date;
    v_ultimo := LEAST(COALESCE(c.fim, v_hoje), v_hoje);

    v_pre := CASE WHEN v_hoje < c.baseline_inicio THEN NULL
                  ELSE public.estudo_indicadores_janela(
                         c.classe_id, c.baseline_inicio, LEAST(c.corte - 1, v_hoje), c.corte, c.timezone)
             END;
    v_pos := CASE WHEN v_hoje < c.corte THEN NULL
                  ELSE public.estudo_indicadores_janela(c.classe_id, c.corte, v_ultimo, c.corte, c.timezone)
             END;
    IF v_pre IS NOT NULL THEN
      v_brutos := v_brutos || jsonb_build_object('braco', c.braco, 'fase', 'pre', 'bruto', v_pre);
    END IF;
    IF v_pos IS NOT NULL THEN
      v_brutos := v_brutos || jsonb_build_object('braco', c.braco, 'fase', 'pos', 'bruto', v_pos);
    END IF;

    -- Série por semana relativa ao corte (−1 = última do baseline, 0 = primeira depois).
    v_semanas := '[]'::jsonb;
    IF v_hoje >= c.baseline_inicio THEN
      v_k := floor((c.baseline_inicio - c.corte) / 7.0)::integer;
      LOOP
        v_s_ini := GREATEST(c.corte + 7 * v_k, c.baseline_inicio);
        v_s_fim := LEAST(c.corte + 7 * v_k + 6, v_ultimo);
        EXIT WHEN v_s_ini > v_ultimo;
        v_semana := public.estudo_indicadores_publicos(
          public.estudo_indicadores_janela(c.classe_id, v_s_ini, v_s_fim, c.corte, c.timezone), v_n_min);
        v_semanas := v_semanas || (
          jsonb_build_object('semana', v_k, 'fase', CASE WHEN v_k < 0 THEN 'pre' ELSE 'pos' END)
          || v_semana
          || jsonb_build_object('marcos', (
               SELECT count(*) FROM public.marco_produto m
                WHERE (m.classe_id IS NULL OR m.classe_id = c.classe_id)
                  AND m.ocorrido_em >= (v_s_ini::timestamp AT TIME ZONE c.timezone)
                  AND m.ocorrido_em < ((v_s_fim + 1)::timestamp AT TIME ZONE c.timezone)))
        );
        v_k := v_k + 1;
      END LOOP;
    END IF;

    -- Marcos dentro do estudo: os gravados e a primeira aparição de cada versão do app.
    SELECT COALESCE(jsonb_agg(x.marco ORDER BY x.ocorrido_em, x.ordem), '[]'::jsonb) INTO v_marcos
      FROM (
        SELECT m.ocorrido_em, m.id AS ordem, jsonb_build_object(
                 'ocorrido_em', m.ocorrido_em,
                 'tipo', m.tipo,
                 'descricao', m.descricao,
                 'referencia', m.referencia,
                 'origem', m.origem,
                 'escopo', CASE WHEN m.classe_id IS NULL THEN 'global' ELSE 'turma' END,
                 'fase', CASE WHEN m.ocorrido_em < (c.corte::timestamp AT TIME ZONE c.timezone)
                              THEN 'pre' ELSE 'pos' END
               ) AS marco
          FROM public.marco_produto m
         WHERE (m.classe_id IS NULL OR m.classe_id = c.classe_id)
           AND m.ocorrido_em >= (c.baseline_inicio::timestamp AT TIME ZONE c.timezone)
           AND m.ocorrido_em < ((v_ultimo + 1)::timestamp AT TIME ZONE c.timezone)
        UNION ALL
        SELECT v.primeira, 0, jsonb_build_object(
                 'ocorrido_em', v.primeira,
                 'tipo', 'app',
                 'descricao', 'primeiro lote da versao ' || v.versao,
                 'referencia', v.versao,
                 'origem', 'derivado',
                 'escopo', 'global',
                 'fase', CASE WHEN v.primeira < (c.corte::timestamp AT TIME ZONE c.timezone)
                              THEN 'pre' ELSE 'pos' END
               )
          FROM (
            SELECT l.payload -> 'cliente' ->> 'app_version' AS versao, min(l.captured_at) AS primeira
              FROM public.telemetria_lotes l
             WHERE NULLIF(btrim(l.payload -> 'cliente' ->> 'app_version'), '') IS NOT NULL
             GROUP BY 1
          ) v
         WHERE v.primeira >= (c.baseline_inicio::timestamp AT TIME ZONE c.timezone)
           AND v.primeira < ((v_ultimo + 1)::timestamp AT TIME ZONE c.timezone)
      ) x;

    v_pronto_antes := EXISTS (
      SELECT 1 FROM public.conteudo_personalizado cp
       WHERE cp.classe_id = c.classe_id
         AND lower(COALESCE(cp.status, '')) = 'pronto'
         AND cp.gerado_em < (c.corte::timestamp AT TIME ZONE c.timezone)
    );
    v_pronto_ate_fim := EXISTS (
      SELECT 1 FROM public.conteudo_personalizado cp
       WHERE cp.classe_id = c.classe_id
         AND lower(COALESCE(cp.status, '')) = 'pronto'
         AND cp.gerado_em < ((v_ultimo + 1)::timestamp AT TIME ZONE c.timezone)
    );

    v_coortes := v_coortes || jsonb_build_object(
      'classe_id', c.classe_id,
      'estudo', c.estudo,
      'rotulo', c.rotulo,
      'braco', c.braco,
      'baseline_inicio', c.baseline_inicio,
      'corte', c.corte,
      'fim', c.fim,
      'timezone', c.timezone,
      'fase_atual', CASE
        WHEN v_hoje < c.baseline_inicio THEN 'pre_estudo'
        WHEN v_hoje < c.corte THEN 'baseline'
        WHEN c.fim IS NOT NULL AND v_hoje > c.fim THEN 'encerrado'
        ELSE c.braco
      END,
      'pre', public.estudo_indicadores_publicos(v_pre, v_n_min),
      'pos', public.estudo_indicadores_publicos(v_pos, v_n_min),
      'contaminacao', jsonb_build_object(
        'material_pronto_antes_do_corte', v_pronto_antes,
        'comparacao_recebeu_personalizacao',
          CASE WHEN c.braco = 'comparacao' THEN v_pronto_ate_fim END,
        'baseline_contaminado',
          v_pronto_antes OR COALESCE((v_pre ->> 'alunos_expostos')::integer, 0) > 0
      ),
      'marcos', v_marcos,
      'serie_semanal', v_semanas
    );
  END LOOP;

  -- Braço contra braço: soma os alunos das turmas do braço antes de checar o mínimo.
  WITH
  b AS (
    SELECT x ->> 'braco' AS braco,
           x ->> 'fase' AS fase,
           (x -> 'bruto' ->> 'pareados')::numeric AS pareados,
           (x -> 'bruto' ->> 'pareados')::numeric * (x -> 'bruto' ->> 'dias')::numeric / 7.0 AS aluno_semanas,
           (x -> 'bruto' ->> 'ativo_seg')::numeric AS ativo_seg,
           (x -> 'bruto' ->> 'topicos_concluidos')::numeric AS topicos,
           (x -> 'bruto' ->> 'atividades_entregues')::numeric AS atividades,
           (x -> 'bruto' ->> 'respostas')::numeric AS respostas,
           (x -> 'bruto' ->> 'acertos')::numeric AS acertos,
           (x -> 'bruto' ->> 'alunos_com_resposta')::numeric AS alunos_com_resposta
      FROM jsonb_array_elements(v_brutos) AS x
  ),
  celula AS (
    SELECT braco, fase,
           sum(pareados) >= v_n_min AND sum(aluno_semanas) > 0 AS ok,
           sum(alunos_com_resposta) >= v_n_min AND sum(respostas) > 0 AS ok_acerto,
           sum(ativo_seg) / 60.0 / NULLIF(sum(aluno_semanas), 0) AS tempo,
           sum(topicos) / NULLIF(sum(aluno_semanas), 0) AS topicos,
           sum(atividades) / NULLIF(sum(aluno_semanas), 0) AS atividades,
           100.0 * sum(acertos) / NULLIF(sum(respostas), 0) AS acerto
      FROM b
     GROUP BY braco, fase
  ),
  taxa AS (
    SELECT braco, fase, ok,
           CASE WHEN ok THEN tempo END AS tempo,
           CASE WHEN ok THEN topicos END AS topicos,
           CASE WHEN ok THEN atividades END AS atividades,
           CASE WHEN ok AND ok_acerto THEN acerto END AS acerto
      FROM celula
  ),
  quatro AS (
    SELECT
      max(tempo) FILTER (WHERE braco = 'intervencao' AND fase = 'pre') AS t_ip,
      max(tempo) FILTER (WHERE braco = 'intervencao' AND fase = 'pos') AS t_io,
      max(tempo) FILTER (WHERE braco = 'comparacao' AND fase = 'pre') AS t_cp,
      max(tempo) FILTER (WHERE braco = 'comparacao' AND fase = 'pos') AS t_co,
      max(topicos) FILTER (WHERE braco = 'intervencao' AND fase = 'pre') AS c_ip,
      max(topicos) FILTER (WHERE braco = 'intervencao' AND fase = 'pos') AS c_io,
      max(topicos) FILTER (WHERE braco = 'comparacao' AND fase = 'pre') AS c_cp,
      max(topicos) FILTER (WHERE braco = 'comparacao' AND fase = 'pos') AS c_co,
      max(atividades) FILTER (WHERE braco = 'intervencao' AND fase = 'pre') AS a_ip,
      max(atividades) FILTER (WHERE braco = 'intervencao' AND fase = 'pos') AS a_io,
      max(atividades) FILTER (WHERE braco = 'comparacao' AND fase = 'pre') AS a_cp,
      max(atividades) FILTER (WHERE braco = 'comparacao' AND fase = 'pos') AS a_co,
      max(acerto) FILTER (WHERE braco = 'intervencao' AND fase = 'pre') AS r_ip,
      max(acerto) FILTER (WHERE braco = 'intervencao' AND fase = 'pos') AS r_io,
      max(acerto) FILTER (WHERE braco = 'comparacao' AND fase = 'pre') AS r_cp,
      max(acerto) FILTER (WHERE braco = 'comparacao' AND fase = 'pos') AS r_co
    FROM taxa
  )
  SELECT jsonb_build_object(
    'bracos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'braco', braco,
               'fase', fase,
               'amostra_insuficiente', NOT ok,
               'tempo_ativo_min_por_aluno_semana', round(tempo, 2),
               'topicos_concluidos_por_aluno_semana', round(topicos, 3),
               'atividades_entregues_por_aluno_semana', round(atividades, 3),
               'acerto_primeira_tentativa_pct', round(acerto, 2)
             ) ORDER BY braco DESC, fase DESC)
        FROM taxa
    ), '[]'::jsonb),
    'diferenca_em_diferencas', jsonb_build_object(
      'tempo_ativo_min_por_aluno_semana', round((q.t_io - q.t_ip) - (q.t_co - q.t_cp), 2),
      'topicos_concluidos_por_aluno_semana', round((q.c_io - q.c_ip) - (q.c_co - q.c_cp), 3),
      'atividades_entregues_por_aluno_semana', round((q.a_io - q.a_ip) - (q.a_co - q.a_cp), 3),
      'acerto_primeira_tentativa_pp', round((q.r_io - q.r_ip) - (q.r_co - q.r_cp), 2)
    ),
    'cortes_alinhados', (
      SELECT count(DISTINCT ec.corte) = 1
        FROM public.estudo_coorte ec
       WHERE ec.classe_id = ANY (p_classe_ids)
    )
  )
  INTO v_comparacao
  FROM quatro q;

  RETURN jsonb_build_object(
    'versao', 1,
    'medido_em', statement_timestamp(),
    'n_minimo', v_n_min,
    'definicoes', jsonb_build_object(
      'cohort', 'turma com data de corte',
      'pre', 'de baseline_inicio ao dia anterior ao corte',
      'pos', 'do corte ao menor entre fim e hoje',
      'populacao', 'pareados, matriculados antes do corte (intencao de tratar)',
      'pr1', 'soma de active_sec do escopo topic, por aluno pareado e por semana',
      'pr2_conclusao', 'primeira conclusao do topico (topico_aluno_conclusao)',
      'pr2_atividades', 'primeira entrega por aluno e atividade (atividade_tentativas)',
      'pr2_acerto', 'questao_aluno na tentativa 1',
      'semana', 'relativa ao corte, negativa no baseline'
    ),
    'coortes', v_coortes,
    'comparacao', v_comparacao,
    'limitacoes', jsonb_build_array(
      'sem trava de personalizacao, a turma pode receber material no baseline e a de comparacao tambem; ver contaminacao',
      'tempo ativo depende de telemetria consentida; aluno pareado sem telemetria conta como zero',
      'aluno na web nao tem camera e a telemetria muda (issue 30); ver lotes_por_plataforma',
      'os topicos estudados antes e depois do corte sao outros; a turma de comparacao desconta isso',
      'conclusoes de topico anteriores a migration 20261102_02 nao tem data',
      'celula com menos alunos que n_minimo volta nula'
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.metricas_estudo_coortes(bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metricas_estudo_coortes(bigint[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
"""


DOWNGRADE = """
DROP FUNCTION IF EXISTS public.metricas_estudo_coortes(bigint[]);
DROP FUNCTION IF EXISTS public.estudo_indicadores_publicos(jsonb, integer);
DROP FUNCTION IF EXISTS public.estudo_indicadores_janela(bigint, date, date, date, text);
DELETE FROM public.metricas_catalogo
 WHERE chave IN ('estudo.pr1_tempo_ativo', 'estudo.pr2_conclusao', 'estudo.pr2_atividades', 'estudo.pr2_acerto');

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(CATALOGO)
    op.execute(INTERNAS)
    op.execute(RPC)


def downgrade() -> None:
    op.execute(DOWNGRADE)
