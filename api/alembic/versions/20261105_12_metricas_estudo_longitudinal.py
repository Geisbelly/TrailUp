"""Análise longitudinal por ciclo: ganho sustentado × pico isolado (#19)

`metricas_estudo_longitudinal(classe_ids[])` lê as mesmas contagens de `metricas_estudo_coortes`
(#13) e acrescenta o que a fase 3 da metodologia pede (TCC 09 §4 e §10: "manutenção do ganho por
mais de um ciclo"):

- **ciclo = semana relativa ao corte** (decisão C-7 da #13; o `ciclo_id` da personalização é
  irregular por aluno);
- **três níveis**: o braço (turmas do braço somadas), cada turma e o braço por perfil BrainHex
  dominante (heterogeneidade, TCC 10 §10);
- por semana depois do corte, o **ganho sobre o baseline** do grupo e, na intervenção, a
  **diferença-em-diferenças** contra a comparação na mesma semana relativa;
- a **classificação** de cada indicador (`estudo_classificar_serie`): `sustentado`,
  `ganho_nao_mantido`, `pico_isolado`, `sem_ganho` ou `amostra_insuficiente`. O limiar é o
  desvio-padrão semanal do baseline do grupo;
- os **marcos de produto** de cada semana, listados na própria série.

O perfil entra por um parâmetro novo e opcional em `estudo_indicadores_janela` (`p_perfil`, padrão
NULL): a conta é uma só, e o número por perfil não pode divergir do total. A função de 5 argumentos
sai e entra a de 6; quem chama com 5 (a RPC da #13) continua igual pelo padrão. A troca de texto
segue o padrão da `20261104_04`: falha alto se o trecho mudou.

Mesma supressão da #13: célula com menos pareados que `n_minimo` volta nula, e nenhum `aluno_id`
sai. Desenho em `docs/superpowers/specs/2026-11-05-analise-longitudinal-design.md`.

Revision ID: 20261105_12
Revises: 20261105_11
Create Date: 2026-11-05
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261105_12"
down_revision = "20261105_11"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()

PERFIL_DOMINANTE = (
    "(SELECT lower(pf.nome) FROM public.aluno_perfil ap JOIN public.perfil pf ON pf.id = ap.perfil_id"
    " WHERE ap.aluno_id = ca.aluno_id AND pf.nome IS NOT NULL"
    " ORDER BY ap.afinidade DESC NULLS LAST, lower(pf.nome) LIMIT 1)"
)

ELEGIVEIS = "     AND EXISTS (SELECT 1 FROM public.vw_alunos_pesquisa_elegiveis el WHERE el.aluno_id = ca.aluno_id)\n"

TROCAS_JANELA = (
    ("  p_timezone text\n)\n", "  p_timezone text,\n  p_perfil text DEFAULT NULL\n)\n"),
    (ELEGIVEIS, ELEGIVEIS + f"     AND (p_perfil IS NULL OR p_perfil = {PERFIL_DOMINANTE})\n"),
)

JANELA_5 = "public.estudo_indicadores_janela(bigint, date, date, date, text)"
JANELA_6 = "public.estudo_indicadores_janela(bigint, date, date, date, text, text)"


def _load(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_05_10", AQUI.with_name(nome))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def janela_anterior() -> str:
    """`estudo_indicadores_janela` (5 argumentos) como a `20261104_04` a deixou."""
    m = _load("20261104_04_agregados_so_quem_consentiu.py")
    return m._trocar(m.janela_anterior(), m.TROCAS_JANELA, "estudo_indicadores_janela")


def janela_nova() -> str:
    texto = janela_anterior()
    for antigo, novo in TROCAS_JANELA:
        if texto.count(antigo) != 1:
            raise RuntimeError("estudo_indicadores_janela mudou de forma; revise a 20261105_12")
        texto = texto.replace(antigo, novo)
    return texto


RPC = r"""
-- Classifica a sequência de ganhos das semanas depois do corte (ordem da série).
-- NULL = semana sem amostra: não conta como observação e não quebra a sequência.
CREATE OR REPLACE FUNCTION public.estudo_classificar_serie(p_ganhos numeric[], p_limiar numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_lim numeric := GREATEST(COALESCE(p_limiar, 0), 0);
  v_obs integer := 0;
  v_seq integer := 0;
  v_max integer := 0;
  g numeric;
BEGIN
  IF p_ganhos IS NULL THEN
    RETURN 'amostra_insuficiente';
  END IF;
  FOREACH g IN ARRAY p_ganhos LOOP
    CONTINUE WHEN g IS NULL;
    v_obs := v_obs + 1;
    IF g > v_lim THEN
      v_seq := v_seq + 1;
    ELSE
      v_seq := 0;
    END IF;
    v_max := GREATEST(v_max, v_seq);
  END LOOP;
  IF v_obs < 2 THEN
    RETURN 'amostra_insuficiente';
  ELSIF v_max = 0 THEN
    RETURN 'sem_ganho';
  ELSIF v_seq >= 2 THEN
    RETURN 'sustentado';
  ELSIF v_max >= 2 THEN
    RETURN 'ganho_nao_mantido';
  END IF;
  RETURN 'pico_isolado';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.metricas_estudo_longitudinal(p_classe_ids bigint[])
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
  v_k integer;
  v_s_ini date;
  v_s_fim date;
  v_perfis text[];
  v_p text;
  v_brutos jsonb := '[]'::jsonb;
  v_marcos jsonb := '[]'::jsonb;
  v_grupos jsonb;
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

  SELECT array_agg(DISTINCT lower(p.nome) ORDER BY lower(p.nome)) INTO v_perfis
    FROM public.perfil p
   WHERE p.nome IS NOT NULL;

  -- Contagens cruas por turma × semana relativa ao corte × (turma inteira | perfil dominante).
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
    CONTINUE WHEN v_hoje < c.baseline_inicio;

    v_k := floor((c.baseline_inicio - c.corte) / 7.0)::integer;
    LOOP
      v_s_ini := GREATEST(c.corte + 7 * v_k, c.baseline_inicio);
      v_s_fim := LEAST(c.corte + 7 * v_k + 6, v_ultimo);
      EXIT WHEN v_s_ini > v_ultimo;

      v_brutos := v_brutos || jsonb_build_object(
        'classe_id', c.classe_id, 'braco', c.braco, 'perfil', NULL, 'semana', v_k,
        'bruto', public.estudo_indicadores_janela(c.classe_id, v_s_ini, v_s_fim, c.corte, c.timezone, NULL));
      FOREACH v_p IN ARRAY COALESCE(v_perfis, '{}'::text[]) LOOP
        v_brutos := v_brutos || jsonb_build_object(
          'classe_id', c.classe_id, 'braco', c.braco, 'perfil', v_p, 'semana', v_k,
          'bruto', public.estudo_indicadores_janela(c.classe_id, v_s_ini, v_s_fim, c.corte, c.timezone, v_p));
      END LOOP;

      v_marcos := v_marcos || COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', m.id,
                 'classe_id', c.classe_id,
                 'braco', c.braco,
                 'semana', v_k,
                 'ocorrido_em', m.ocorrido_em,
                 'tipo', m.tipo,
                 'descricao', m.descricao,
                 'escopo', CASE WHEN m.classe_id IS NULL THEN 'global' ELSE 'turma' END
               ) ORDER BY m.ocorrido_em, m.id)
          FROM public.marco_produto m
         WHERE (m.classe_id IS NULL OR m.classe_id = c.classe_id)
           AND m.ocorrido_em >= (v_s_ini::timestamp AT TIME ZONE c.timezone)
           AND m.ocorrido_em < ((v_s_fim + 1)::timestamp AT TIME ZONE c.timezone)
      ), '[]'::jsonb);

      v_k := v_k + 1;
    END LOOP;
  END LOOP;

  WITH
  bruto AS (
    SELECT (x ->> 'classe_id')::bigint AS classe_id,
           x ->> 'braco' AS braco,
           x ->> 'perfil' AS perfil,
           (x ->> 'semana')::integer AS semana,
           (x -> 'bruto' ->> 'pareados')::numeric AS pareados,
           (x -> 'bruto' ->> 'pareados')::numeric * (x -> 'bruto' ->> 'dias')::numeric / 7.0 AS aluno_semanas,
           (x -> 'bruto' ->> 'ativo_seg')::numeric AS ativo_seg,
           (x -> 'bruto' ->> 'alunos_ativos')::numeric AS alunos_ativos,
           (x -> 'bruto' ->> 'topicos_concluidos')::numeric AS topicos,
           (x -> 'bruto' ->> 'atividades_entregues')::numeric AS atividades,
           (x -> 'bruto' ->> 'respostas')::numeric AS respostas,
           (x -> 'bruto' ->> 'acertos')::numeric AS acertos,
           (x -> 'bruto' ->> 'alunos_com_resposta')::numeric AS alunos_com_resposta
      FROM jsonb_array_elements(v_brutos) AS x
  ),
  -- Três níveis: o braço (turmas somadas), cada turma e o braço por perfil dominante.
  celula AS (
    SELECT 'braco'::text AS nivel, braco, NULL::bigint AS classe_id, NULL::text AS perfil, semana,
           sum(pareados) AS pareados, sum(aluno_semanas) AS aluno_semanas, sum(ativo_seg) AS ativo_seg,
           sum(alunos_ativos) AS alunos_ativos, sum(topicos) AS topicos, sum(atividades) AS atividades,
           sum(respostas) AS respostas, sum(acertos) AS acertos, sum(alunos_com_resposta) AS alunos_com_resposta
      FROM bruto WHERE perfil IS NULL
     GROUP BY braco, semana
    UNION ALL
    SELECT 'turma', braco, classe_id, NULL, semana,
           sum(pareados), sum(aluno_semanas), sum(ativo_seg), sum(alunos_ativos), sum(topicos),
           sum(atividades), sum(respostas), sum(acertos), sum(alunos_com_resposta)
      FROM bruto WHERE perfil IS NULL
     GROUP BY braco, classe_id, semana
    UNION ALL
    SELECT 'perfil', braco, NULL, perfil, semana,
           sum(pareados), sum(aluno_semanas), sum(ativo_seg), sum(alunos_ativos), sum(topicos),
           sum(atividades), sum(respostas), sum(acertos), sum(alunos_com_resposta)
      FROM bruto WHERE perfil IS NOT NULL
     GROUP BY braco, perfil, semana
  ),
  taxa AS (
    SELECT nivel, braco, classe_id, perfil, semana, pareados,
           pareados >= v_n_min AND aluno_semanas > 0 AS ok,
           CASE WHEN pareados >= v_n_min AND aluno_semanas > 0 THEN ativo_seg / 60.0 / aluno_semanas END AS tempo,
           CASE WHEN pareados >= v_n_min AND aluno_semanas > 0 THEN 100.0 * alunos_ativos / pareados END AS ativos,
           CASE WHEN pareados >= v_n_min AND aluno_semanas > 0 THEN topicos / aluno_semanas END AS topicos,
           CASE WHEN pareados >= v_n_min AND aluno_semanas > 0 THEN atividades / aluno_semanas END AS atividades,
           CASE WHEN pareados >= v_n_min AND aluno_semanas > 0
                 AND alunos_com_resposta >= v_n_min AND respostas > 0
                THEN 100.0 * acertos / respostas END AS acerto
      FROM celula
  ),
  -- Baseline: as semanas antes do corte somadas, e o desvio-padrão entre elas (o limiar do ganho).
  -- `alunos_com_resposta` entra pelo maior valor semanal: a soma contaria o mesmo aluno várias vezes.
  pre AS (
    SELECT nivel, braco, classe_id, perfil,
           max(pareados) AS pareados, sum(aluno_semanas) AS aluno_semanas, sum(ativo_seg) AS ativo_seg,
           sum(topicos) AS topicos, sum(atividades) AS atividades, sum(respostas) AS respostas,
           sum(acertos) AS acertos, max(alunos_com_resposta) AS alunos_com_resposta
      FROM celula WHERE semana < 0
     GROUP BY nivel, braco, classe_id, perfil
  ),
  dp AS (
    SELECT nivel, braco, classe_id, perfil,
           count(*) FILTER (WHERE ok) AS semanas_ok,
           stddev_samp(tempo) AS tempo, stddev_samp(topicos) AS topicos,
           stddev_samp(atividades) AS atividades, stddev_samp(acerto) AS acerto
      FROM taxa WHERE semana < 0
     GROUP BY nivel, braco, classe_id, perfil
  ),
  base AS (
    SELECT p.nivel, p.braco, p.classe_id, p.perfil,
           p.pareados >= v_n_min AND p.aluno_semanas > 0 AS ok,
           CASE WHEN p.pareados >= v_n_min AND p.aluno_semanas > 0 THEN p.pareados END AS pareados,
           CASE WHEN p.pareados >= v_n_min AND p.aluno_semanas > 0 THEN p.ativo_seg / 60.0 / p.aluno_semanas END AS tempo,
           CASE WHEN p.pareados >= v_n_min AND p.aluno_semanas > 0 THEN p.topicos / p.aluno_semanas END AS topicos,
           CASE WHEN p.pareados >= v_n_min AND p.aluno_semanas > 0 THEN p.atividades / p.aluno_semanas END AS atividades,
           CASE WHEN p.pareados >= v_n_min AND p.aluno_semanas > 0
                 AND p.alunos_com_resposta >= v_n_min AND p.respostas > 0
                THEN 100.0 * p.acertos / p.respostas END AS acerto,
           d.semanas_ok,
           d.tempo AS dp_tempo, d.topicos AS dp_topicos, d.atividades AS dp_atividades, d.acerto AS dp_acerto
      FROM pre p
      LEFT JOIN dp d
        ON d.nivel = p.nivel AND d.braco = p.braco
       AND d.classe_id IS NOT DISTINCT FROM p.classe_id AND d.perfil IS NOT DISTINCT FROM p.perfil
  ),
  ganho AS (
    SELECT t.*,
           t.tempo - b.tempo AS g_tempo,
           t.topicos - b.topicos AS g_topicos,
           t.atividades - b.atividades AS g_atividades,
           t.acerto - b.acerto AS g_acerto
      FROM taxa t
      LEFT JOIN base b
        ON b.nivel = t.nivel AND b.braco = t.braco
       AND b.classe_id IS NOT DISTINCT FROM t.classe_id AND b.perfil IS NOT DISTINCT FROM t.perfil
  ),
  -- Na intervenção, a mesma semana da comparação (mesmo nível e perfil) desconta o que mudou nos dois.
  serie AS (
    SELECT g.*,
           CASE WHEN g.braco = 'intervencao' THEN g.g_tempo - cmp.g_tempo END AS d_tempo,
           CASE WHEN g.braco = 'intervencao' THEN g.g_topicos - cmp.g_topicos END AS d_topicos,
           CASE WHEN g.braco = 'intervencao' THEN g.g_atividades - cmp.g_atividades END AS d_atividades,
           CASE WHEN g.braco = 'intervencao' THEN g.g_acerto - cmp.g_acerto END AS d_acerto
      FROM ganho g
      LEFT JOIN ganho cmp
        ON g.nivel IN ('braco', 'perfil') AND cmp.nivel = g.nivel AND cmp.braco = 'comparacao'
       AND cmp.perfil IS NOT DISTINCT FROM g.perfil AND cmp.semana = g.semana
  ),
  arrays AS (
    SELECT nivel, braco, classe_id, perfil,
           array_agg(g_tempo ORDER BY semana) FILTER (WHERE semana >= 0) AS g_tempo,
           array_agg(d_tempo ORDER BY semana) FILTER (WHERE semana >= 0) AS d_tempo,
           array_agg(g_topicos ORDER BY semana) FILTER (WHERE semana >= 0) AS g_topicos,
           array_agg(d_topicos ORDER BY semana) FILTER (WHERE semana >= 0) AS d_topicos,
           array_agg(g_atividades ORDER BY semana) FILTER (WHERE semana >= 0) AS g_atividades,
           array_agg(d_atividades ORDER BY semana) FILTER (WHERE semana >= 0) AS d_atividades,
           array_agg(g_acerto ORDER BY semana) FILTER (WHERE semana >= 0) AS g_acerto,
           array_agg(d_acerto ORDER BY semana) FILTER (WHERE semana >= 0) AS d_acerto
      FROM serie
     GROUP BY nivel, braco, classe_id, perfil
  ),
  -- Usa a diferença-em-diferenças quando ela existe em alguma semana; senão, o ganho dentro do braço.
  escolha AS (
    SELECT a.nivel, a.braco, a.classe_id, a.perfil,
           cardinality(array_remove(a.d_tempo, NULL)) > 0 AS did_tempo,
           cardinality(array_remove(a.d_topicos, NULL)) > 0 AS did_topicos,
           cardinality(array_remove(a.d_atividades, NULL)) > 0 AS did_atividades,
           cardinality(array_remove(a.d_acerto, NULL)) > 0 AS did_acerto,
           a.g_tempo, a.d_tempo, a.g_topicos, a.d_topicos, a.g_atividades, a.d_atividades, a.g_acerto, a.d_acerto
      FROM arrays a
  ),
  classif AS (
    SELECT e.nivel, e.braco, e.classe_id, e.perfil,
           jsonb_build_object(
             'tempo_ativo_min_por_aluno_semana', jsonb_build_object(
               'resultado', public.estudo_classificar_serie(CASE WHEN e.did_tempo THEN e.d_tempo ELSE e.g_tempo END, b.dp_tempo),
               'comparado_com', CASE WHEN e.did_tempo THEN 'diferenca_em_diferencas' ELSE 'baseline_do_proprio_grupo' END,
               'limiar', round(b.dp_tempo, 2)),
             'topicos_concluidos_por_aluno_semana', jsonb_build_object(
               'resultado', public.estudo_classificar_serie(CASE WHEN e.did_topicos THEN e.d_topicos ELSE e.g_topicos END, b.dp_topicos),
               'comparado_com', CASE WHEN e.did_topicos THEN 'diferenca_em_diferencas' ELSE 'baseline_do_proprio_grupo' END,
               'limiar', round(b.dp_topicos, 3)),
             'atividades_entregues_por_aluno_semana', jsonb_build_object(
               'resultado', public.estudo_classificar_serie(CASE WHEN e.did_atividades THEN e.d_atividades ELSE e.g_atividades END, b.dp_atividades),
               'comparado_com', CASE WHEN e.did_atividades THEN 'diferenca_em_diferencas' ELSE 'baseline_do_proprio_grupo' END,
               'limiar', round(b.dp_atividades, 3)),
             'acerto_primeira_tentativa_pct', jsonb_build_object(
               'resultado', public.estudo_classificar_serie(CASE WHEN e.did_acerto THEN e.d_acerto ELSE e.g_acerto END, b.dp_acerto),
               'comparado_com', CASE WHEN e.did_acerto THEN 'diferenca_em_diferencas' ELSE 'baseline_do_proprio_grupo' END,
               'limiar', round(b.dp_acerto, 2))
           ) AS classificacao
      FROM escolha e
      LEFT JOIN base b
        ON b.nivel = e.nivel AND b.braco = e.braco
       AND b.classe_id IS NOT DISTINCT FROM e.classe_id AND b.perfil IS NOT DISTINCT FROM e.perfil
  ),
  marcos AS (
    SELECT DISTINCT (m ->> 'id')::bigint AS id, (m ->> 'classe_id')::bigint AS classe_id, m ->> 'braco' AS braco,
           (m ->> 'semana')::integer AS semana, m ->> 'ocorrido_em' AS ocorrido_em, m ->> 'tipo' AS tipo,
           m ->> 'descricao' AS descricao, m ->> 'escopo' AS escopo
      FROM jsonb_array_elements(v_marcos) AS m
  ),
  grupos AS (
    SELECT s.nivel, s.braco, s.classe_id, s.perfil,
           jsonb_agg(jsonb_build_object(
             'semana', s.semana,
             'fase', CASE WHEN s.semana < 0 THEN 'pre' ELSE 'pos' END,
             'amostra_insuficiente', NOT s.ok,
             'pareados', CASE WHEN s.ok THEN s.pareados END,
             'tempo_ativo_min_por_aluno_semana', round(s.tempo, 2),
             'alunos_ativos_pct', round(s.ativos, 2),
             'topicos_concluidos_por_aluno_semana', round(s.topicos, 3),
             'atividades_entregues_por_aluno_semana', round(s.atividades, 3),
             'acerto_primeira_tentativa_pct', round(s.acerto, 2),
             'ganho_sobre_baseline', CASE WHEN s.semana >= 0 THEN jsonb_build_object(
               'tempo_ativo_min_por_aluno_semana', round(s.g_tempo, 2),
               'topicos_concluidos_por_aluno_semana', round(s.g_topicos, 3),
               'atividades_entregues_por_aluno_semana', round(s.g_atividades, 3),
               'acerto_primeira_tentativa_pp', round(s.g_acerto, 2)) END,
             'diferenca_em_diferencas', CASE WHEN s.semana >= 0 AND s.braco = 'intervencao' AND s.nivel <> 'turma'
                    AND num_nonnulls(s.d_tempo, s.d_topicos, s.d_atividades, s.d_acerto) > 0
               THEN jsonb_build_object(
                 'tempo_ativo_min_por_aluno_semana', round(s.d_tempo, 2),
                 'topicos_concluidos_por_aluno_semana', round(s.d_topicos, 3),
                 'atividades_entregues_por_aluno_semana', round(s.d_atividades, 3),
                 'acerto_primeira_tentativa_pp', round(s.d_acerto, 2)) END,
             'marcos', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'ocorrido_em', mm.ocorrido_em, 'tipo', mm.tipo, 'descricao', mm.descricao,
                        'escopo', mm.escopo) ORDER BY mm.ocorrido_em, mm.id)
                 FROM (SELECT DISTINCT ON (m.id) m.*
                         FROM marcos m
                        WHERE m.semana = s.semana AND m.braco = s.braco
                          AND (s.classe_id IS NULL OR m.classe_id = s.classe_id)
                        ORDER BY m.id) mm
             ), '[]'::jsonb)
           ) ORDER BY s.semana) AS serie
      FROM serie s
     GROUP BY s.nivel, s.braco, s.classe_id, s.perfil
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'nivel', g.nivel,
           'braco', g.braco,
           'classe_id', g.classe_id,
           'perfil', g.perfil,
           'baseline', jsonb_build_object(
             'amostra_insuficiente', NOT COALESCE(b.ok, false),
             'pareados', b.pareados,
             'semanas_com_amostra', COALESCE(b.semanas_ok, 0),
             'tempo_ativo_min_por_aluno_semana', round(b.tempo, 2),
             'topicos_concluidos_por_aluno_semana', round(b.topicos, 3),
             'atividades_entregues_por_aluno_semana', round(b.atividades, 3),
             'acerto_primeira_tentativa_pct', round(b.acerto, 2)),
           'classificacao', cl.classificacao,
           'serie', g.serie
         ) ORDER BY CASE g.nivel WHEN 'braco' THEN 0 WHEN 'turma' THEN 1 ELSE 2 END,
                    g.braco DESC, g.classe_id, g.perfil), '[]'::jsonb)
    INTO v_grupos
    FROM grupos g
    LEFT JOIN base b
      ON b.nivel = g.nivel AND b.braco = g.braco
     AND b.classe_id IS NOT DISTINCT FROM g.classe_id AND b.perfil IS NOT DISTINCT FROM g.perfil
    LEFT JOIN classif cl
      ON cl.nivel = g.nivel AND cl.braco = g.braco
     AND cl.classe_id IS NOT DISTINCT FROM g.classe_id AND cl.perfil IS NOT DISTINCT FROM g.perfil;

  RETURN jsonb_build_object(
    'versao', 1,
    'medido_em', statement_timestamp(),
    'n_minimo', v_n_min,
    'definicoes', jsonb_build_object(
      'ciclo', 'semana relativa ao corte da turma; negativa no baseline (decisao C-7 da #13)',
      'populacao', 'pareados com consentimento de pesquisa vigente (vw_alunos_pesquisa_elegiveis), matriculados antes do corte',
      'niveis', 'braco (turmas do braco somadas), turma, e perfil (braco por perfil BrainHex dominante)',
      'perfil', 'dominante = maior afinidade em aluno_perfil, desempate pelo nome; aluno sem perfil fica fora do nivel perfil',
      'ganho', 'taxa da semana menos a taxa do baseline do mesmo grupo',
      'diferenca_em_diferencas', 'na intervencao, ganho da semana menos o ganho da comparacao na mesma semana relativa',
      'limiar', 'desvio-padrao das taxas semanais do baseline do grupo; sem duas semanas com amostra, vale 0',
      'sustentado', 'acima do limiar em 2 ou mais semanas seguidas, incluindo a ultima semana observada',
      'ganho_nao_mantido', 'teve 2 semanas seguidas acima do limiar, mas a ultima observada nao esta acima',
      'pico_isolado', 'acima do limiar, mas nunca em 2 semanas seguidas',
      'sem_ganho', 'nenhuma semana acima do limiar',
      'amostra_insuficiente', 'menos de 2 semanas depois do corte com amostra',
      'semana_sem_amostra', 'nao conta como observacao e nao quebra a sequencia'
    ),
    'grupos', v_grupos,
    'cortes_alinhados', (
      SELECT count(DISTINCT ec.corte) = 1
        FROM public.estudo_coorte ec
       WHERE ec.classe_id = ANY (p_classe_ids)
    ),
    'limitacoes', jsonb_build_array(
      'a classificacao e descritiva, nao um teste de significancia: o limiar e a variacao semanal do baseline',
      'baseline curto (1 ou 2 semanas) deixa o limiar instavel ou nulo; ver semanas_com_amostra',
      'com cortes desalinhados, a mesma semana relativa cai em datas diferentes em cada turma',
      'o perfil dominante e o de hoje; quem refez o quiz durante o estudo aparece no perfil novo',
      'sazonalidade (provas, feriados) e mudancas de produto nao sao descontadas; ver marcos de cada semana',
      'a mesma conta de metricas_estudo_coortes: telemetria consentida, conteudo diferente antes e depois do corte, celula pequena nula',
      'aluno matriculado em duas turmas do mesmo braco conta duas vezes no nivel braco'
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.estudo_classificar_serie(numeric[], numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estudo_classificar_serie(numeric[], numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.metricas_estudo_longitudinal(bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metricas_estudo_longitudinal(bigint[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(f"DROP FUNCTION IF EXISTS {JANELA_5};")
    op.execute(janela_nova())
    op.execute(f"REVOKE ALL ON FUNCTION {JANELA_6} FROM PUBLIC, anon, authenticated;")
    op.execute(RPC)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.metricas_estudo_longitudinal(bigint[]);")
    op.execute("DROP FUNCTION IF EXISTS public.estudo_classificar_serie(numeric[], numeric);")
    op.execute(f"DROP FUNCTION IF EXISTS {JANELA_6};")
    op.execute(janela_anterior())
    op.execute(f"REVOKE ALL ON FUNCTION {JANELA_5} FROM PUBLIC, anon, authenticated;")
    op.execute("NOTIFY pgrst, 'reload schema';")
