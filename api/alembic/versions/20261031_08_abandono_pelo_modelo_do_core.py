"""Taxa de abandono e "crítico" pelo modelo de evasão do core-trailup (F5)

A taxa de abandono e o rótulo "crítico" **continuam no console** (decisão de 31/10): a F5 tinha
trocado a taxa antiga por sinais de dias, sem confirmação. A taxa antiga estava errada (tópicos não
concluídos ÷ tópicos com linha: um aluno no meio da trilha saía com 60%), então ela volta com a conta
do modelo que existe para isso, o de evasão do `core-trailup`.

## O modelo (copiado sem alteração)

`../core-trailup/sql/evasao.sql`, commit `bcd542a`: `trailup_risco_evasao` (regressão logística,
risco de abandono nas próximas 4 semanas) e `trailup_faixa_risco` (`alto` = p90, `atencao` = p70,
`normal`, `sem dados`). Medido no OULAD: AUC 0,767 ± 0,012 entre coortes, ECE 0,006, lift 3,4–4,1× no
top 10%. **Os coeficientes são de universitários a distância do Reino Unido**: o próprio core avisa que
transferem a forma, não os valores, e que devem ser recalibrados com dado próprio quando houver uma
coorte que termine.

As duas são aritmética pura (`IMMUTABLE`), sem tabela, e as views `security_invoker` as chamam como o
professor. Por isso o EXECUTE fica com `authenticated`, e não com `anon`.

## As entradas, tiradas do TrailUp

| entrada do modelo | de onde vem |
|---|---|
| cliques na semana / nas 4 semanas | `telemetria_eventos_app` do aluno na turma, sem `scroll` |
| semanas sem acesso | semanas inteiras desde o último evento |
| semana do curso | semanas inteiras desde a matrícula |
| nota (0–100, -1 sem nota) | `classe_aluno.notaMedia × 10`; 0 sem progresso conta como sem nota |
| entregas feitas / perdidas / taxa | atividades da turma com prazo (`fn_prazo_efetivo`) já vencido; feita = `atividade_aluno` concluída ou evento `atividade_concluida` |
| atraso médio (dias) | evento `atividade_concluida` − prazo, nas feitas com data |

## O que entra nas views (colunas no fim; nada é removido)

- `vw_metricas_engajamento_aluno_classe.risco_abandono_faixa`: só a faixa, nunca o score (core:
  LGPD #195). Quem não tem atividade nenhuma fica `sem dados`, a mesma regra de `sem_dado`.
- `vw_metricas_turma_geral_classe` e `vw_metricas_turma_perfil_classe`: `alunos_risco_alto`,
  `alunos_risco_com_dado` e `taxa_risco_abandono_pct`, que é a taxa de abandono = % dos alunos com
  dado na faixa alto. A geral também traz `alunos_risco_atencao`.
- Catálogo: `prof.risco_abandono`. Fica com `requer_validacao = 'nenhuma'` porque a decisão foi
  mostrar o número. A spec (§7) pede validação com dado próprio antes de exibir risco de modelo, e
  essa diferença fica registrada aqui.

## Downgrade

Volta às views da `20261031_05` e apaga as duas funções e a chave do catálogo.

Revision ID: 20261031_08
Revises: 20261031_07
Create Date: 2026-10-31
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261031_08"
down_revision = "20261031_07"
branch_labels = None
depends_on = None

# Copiado sem alteração de `core-trailup/sql/evasao.sql` (commit bcd542a), só com o schema qualificado.
MODELO = r"""
CREATE OR REPLACE FUNCTION public.trailup_risco_evasao(
  p_cliques_semana        numeric,   -- cliques/eventos na ultima semana
  p_cliques_4semanas      numeric,   -- soma das ultimas 4
  p_semanas_sem_acesso    numeric,   -- semanas inteiras sem nenhum acesso
  p_semana_do_curso       numeric,
  p_nota_media            numeric,   -- 0-100; -1 quando ainda nao ha nota
  p_entregas_feitas       numeric,
  p_entregas_perdidas     numeric,
  p_taxa_entrega          numeric,   -- feitas / esperadas; 1 quando nada venceu
  p_atraso_medio          numeric    -- dias; negativo = entrega adiantada
) RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT 1.0 / (1.0 + exp(-(
     -0.998883
    + (-0.239863) * ln(1 + greatest(p_cliques_semana,    0))
    + ( 0.013061) * ln(1 + greatest(p_cliques_4semanas,  0))
    + ( 0.002436) * (p_cliques_semana / (p_cliques_4semanas / 4.0 + 1))
    + (-0.000836) * p_semanas_sem_acesso     -- ~zero: os cliques da semana ja
                                             -- codificam "sumiu". A relacao
                                             -- MARGINAL e positiva e forte, mas
                                             -- condicionada aos cliques some.
    + (-0.040591) * p_semana_do_curso
    + ( 0.005945) * 76.68                    -- carga: media do corpus (sem analogo)
    + (-0.008495) * p_nota_media
    + (-0.027413) * p_entregas_feitas
    + ( 0.251735) * p_entregas_perdidas
    + (-1.688502) * p_taxa_entrega           -- o preditor mais forte depois dos cliques
    + ( 0.019125) * p_atraso_medio
  )));
$$;

CREATE OR REPLACE FUNCTION public.trailup_faixa_risco(p_risco numeric)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN p_risco IS NULL THEN 'sem dados'
    WHEN p_risco >= 0.0428 THEN 'alto'      -- p90 medido: evasao 9,96%, lift 3,8x
    WHEN p_risco >= 0.0213 THEN 'atencao'   -- p70 medido: evasao 4,24%, lift 1,6x
    ELSE 'normal'                           -- 70%: evasao 1,11%, lift 0,4x
  END;
$$;

REVOKE ALL ON FUNCTION public.trailup_risco_evasao(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trailup_risco_evasao(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.trailup_faixa_risco(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trailup_faixa_risco(numeric) TO authenticated, service_role;
"""

ENGAJAMENTO = r"""
CREATE OR REPLACE VIEW public.vw_metricas_engajamento_aluno_classe WITH (security_invoker = on) AS
WITH matriculas AS (
  SELECT DISTINCT ON (ca.aluno_id, ca.classe_id) ca.aluno_id, ca.classe_id, ca.created_at AS matriculado_em,
         ca."notaMedia" AS nota_media, ca."porcentagemConcluida" AS progresso_pct
    FROM public.classe_aluno ca
   WHERE ca.aluno_id IS NOT NULL
   ORDER BY ca.aluno_id, ca.classe_id, ca.created_at
), sessoes AS (
  -- Uma linha por (aluno, turma) ANTES de qualquer join (I16).
  SELECT s.aluno_id,
         s.classe_id,
         sum(s.tempo_sessao_seg) AS tempo_total_uso_seg,
         avg(s.tempo_sessao_seg) AS tempo_medio_sessao_seg,
         count(DISTINCT s.sessao_id) AS numero_sessoes,
         count(DISTINCT s.dia) AS dias_com_sessao,
         sum(s.tempo_ativo_seg) AS tempo_ativo_seg,
         avg(s.interacoes) AS interacoes_por_sessao,
         avg(CASE WHEN s.usou_chat THEN 1 ELSE 0 END) * 100::numeric AS taxa_uso_chat_pct
    FROM public.vw_metricas_sessoes_aluno_dia s
   GROUP BY s.aluno_id, s.classe_id
), topic_opens AS (
  SELECT e.aluno_id, e.classe_id, e.sessao_id, e.topico_id, e.occurred_at,
         row_number() OVER (PARTITION BY e.aluno_id, e.classe_id, e.sessao_id, e.topico_id ORDER BY e.occurred_at) AS rn
    FROM public.telemetria_eventos_app e
   WHERE e.event_name = 'topic_open' AND e.topico_id IS NOT NULL
), topic_completes AS (
  SELECT e.aluno_id, e.classe_id, e.sessao_id, e.topico_id, e.occurred_at,
         row_number() OVER (PARTITION BY e.aluno_id, e.classe_id, e.sessao_id, e.topico_id ORDER BY e.occurred_at) AS rn
    FROM public.telemetria_eventos_app e
   WHERE e.event_name = 'topic_complete' AND e.topico_id IS NOT NULL
), conclusoes AS (
  SELECT o.aluno_id, o.classe_id,
         avg(EXTRACT(epoch FROM c.occurred_at - o.occurred_at)) AS tempo_medio_conclusao_topico_seg
    FROM topic_opens o
    JOIN topic_completes c
      ON c.aluno_id = o.aluno_id AND c.classe_id = o.classe_id AND c.sessao_id = o.sessao_id
     AND c.topico_id = o.topico_id AND c.rn = o.rn
   GROUP BY o.aluno_id, o.classe_id
), tempo_por_topico AS (
  SELECT e.aluno_id, e.classe_id, e.topico_id,
         sum(e.active_sec) AS tempo_ativo_seg,
         min(e.captured_at) AS primeiro_contato_em
    FROM public.telemetria_time_metric_entries e
   WHERE e.scope = 'topic' AND e.topico_id IS NOT NULL
   GROUP BY e.aluno_id, e.classe_id, e.topico_id
), tempo_medio_topico AS (
  SELECT aluno_id, classe_id, avg(tempo_ativo_seg) AS tempo_medio_topico_seg
    FROM tempo_por_topico
   GROUP BY aluno_id, classe_id
), atividade AS (
  SELECT e.aluno_id, e.classe_id, max(e.captured_at) AS ultima_atividade_em
    FROM public.telemetria_time_metric_entries e
   WHERE e.scope = 'topic' AND e.active_sec > 0
   GROUP BY e.aluno_id, e.classe_id
), progresso AS (
  SELECT ta.aluno_id, t.classe_id,
         count(*) AS topicos_com_linha,
         count(*) FILTER (WHERE ta.status::text = 'concluido') AS topicos_concluidos
    FROM public.topico_aluno ta
    JOIN public.topicos t ON t.id = ta.topico_id
   GROUP BY ta.aluno_id, t.classe_id
), mediana_topico AS (
  SELECT ta.topico_id,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY ta.percentual_concluido) AS mediana_pct
    FROM public.topico_aluno ta
    JOIN public.topicos t ON t.id = ta.topico_id
    JOIN matriculas m ON m.aluno_id = ta.aluno_id AND m.classe_id = t.classe_id
   GROUP BY ta.topico_id
), ultimo_avanco AS (
  -- Avanço = concluir conteúdo ou tópico. `topico_aluno.updated_at` não serve: o gatilho de tempo
  -- da F4a o toca a cada lote, com ou sem avanço.
  SELECT e.aluno_id, e.classe_id, e.topico_id, max(e.occurred_at) AS avancou_em
    FROM public.telemetria_eventos_app e
   WHERE e.event_name IN ('content_complete', 'topic_complete') AND e.topico_id IS NOT NULL
   GROUP BY e.aluno_id, e.classe_id, e.topico_id
), estagnacao AS (
  SELECT DISTINCT ON (ta.aluno_id, t.classe_id)
         ta.aluno_id, t.classe_id, ta.topico_id,
         COALESCE(ua.avancou_em, tpt.primeiro_contato_em) AS desde
    FROM public.topico_aluno ta
    JOIN public.topicos t ON t.id = ta.topico_id
    JOIN mediana_topico md ON md.topico_id = ta.topico_id
    LEFT JOIN ultimo_avanco ua ON ua.aluno_id = ta.aluno_id AND ua.classe_id = t.classe_id AND ua.topico_id = ta.topico_id
    LEFT JOIN tempo_por_topico tpt ON tpt.aluno_id = ta.aluno_id AND tpt.classe_id = t.classe_id AND tpt.topico_id = ta.topico_id
   WHERE ta.status::text <> 'concluido'
     AND COALESCE(ta.percentual_concluido, 0) > 0
     AND COALESCE(ta.percentual_concluido, 0) < md.mediana_pct
     AND COALESCE(ua.avancou_em, tpt.primeiro_contato_em) < now() - interval '14 days'
   ORDER BY ta.aluno_id, t.classe_id, COALESCE(ua.avancou_em, tpt.primeiro_contato_em) DESC
), cliques AS (
  -- Entrada do modelo de evasão do core-trailup: "cliques" do OULAD = eventos do app. `scroll` fica
  -- de fora: é rolagem contínua, não interação com um recurso, e é a maioria dos eventos.
  SELECT e.aluno_id, e.classe_id,
         count(*) FILTER (WHERE e.occurred_at >= now() - interval '7 days') AS semana,
         count(*) FILTER (WHERE e.occurred_at >= now() - interval '28 days') AS quatro_semanas,
         max(e.occurred_at) AS ultimo_em
    FROM public.telemetria_eventos_app e
   WHERE e.event_name <> 'scroll'
   GROUP BY e.aluno_id, e.classe_id
), entregas AS (
  -- Atividades da turma com prazo (efetivo, com a extensão comprada) já vencido. Feita = concluída;
  -- a data da conclusão vem do evento `atividade_concluida` (criado_em congelado desde a F1).
  SELECT m.aluno_id, m.classe_id,
         count(*) FILTER (WHERE fc.feita) AS feitas,
         count(*) FILTER (WHERE NOT fc.feita) AS perdidas,
         avg(EXTRACT(epoch FROM fc.concluida_em - pz.prazo) / 86400.0) FILTER (WHERE fc.concluida_em IS NOT NULL)
           AS atraso_medio_dias
    FROM matriculas m
    JOIN public.topicos t ON t.classe_id = m.classe_id
    JOIN public.atividades a ON a.topico_id = t.id
    CROSS JOIN LATERAL (SELECT public.fn_prazo_efetivo(m.aluno_id, a.id) AS prazo) pz
    CROSS JOIN LATERAL (
      SELECT (SELECT min(ea.criado_em) FROM public.eventos_aluno ea
               WHERE ea.aluno_id = m.aluno_id AND ea.tipo = 'atividade_concluida'
                 AND ea.referencia = 'atividade:' || a.id::text) AS concluida_em,
             EXISTS (SELECT 1 FROM public.atividade_aluno aa
                      WHERE aa.aluno_id = m.aluno_id AND aa.atividade_id = a.id AND aa.status::text = 'concluido')
             OR EXISTS (SELECT 1 FROM public.eventos_aluno ea
                         WHERE ea.aluno_id = m.aluno_id AND ea.tipo = 'atividade_concluida'
                           AND ea.referencia = 'atividade:' || a.id::text) AS feita
    ) fc
   WHERE pz.prazo IS NOT NULL AND pz.prazo < now()
   GROUP BY m.aluno_id, m.classe_id
)
SELECT m.aluno_id,
       m.classe_id,
       s.tempo_total_uso_seg::numeric AS tempo_total_uso_seg,
       s.tempo_medio_sessao_seg::numeric AS tempo_medio_sessao_seg,
       s.numero_sessoes::bigint AS numero_sessoes,
       (s.numero_sessoes::numeric / NULLIF(s.dias_com_sessao, 0)::numeric)::numeric AS sessoes_por_dia,
       tmt.tempo_medio_topico_seg::numeric AS tempo_medio_topico_seg,
       (p.topicos_concluidos::numeric / NULLIF(p.topicos_com_linha, 0)::numeric * 100::numeric)::numeric
         AS taxa_conclusao_topicos_pct,
       s.interacoes_por_sessao::numeric AS interacoes_por_sessao,
       s.taxa_uso_chat_pct::numeric AS taxa_uso_chat_pct,
       c.tempo_medio_conclusao_topico_seg::numeric AS tempo_medio_conclusao_topico_seg,
       s.tempo_ativo_seg::numeric AS tempo_ativo_seg,
       a.ultima_atividade_em,
       (a.ultima_atividade_em IS NULL) AS sem_dado,
       CASE WHEN a.ultima_atividade_em < now() - interval '7 days' THEN a.ultima_atividade_em END
         AS inativo_desde,
       CASE WHEN a.ultima_atividade_em < now() - interval '30 days' THEN a.ultima_atividade_em END
         AS evadido_desde,
       est.topico_id AS estagnado_topico_id,
       est.desde AS estagnado_desde,
       -- Modelo de evasão do core-trailup (`trailup_risco_evasao`, faixa por `trailup_faixa_risco`).
       -- Só a FAIXA sai da view, nunca o score (core: LGPD #195). Sem dado continua sem dado.
       CASE
         WHEN a.ultima_atividade_em IS NULL THEN 'sem dados'
         ELSE public.trailup_faixa_risco(public.trailup_risco_evasao(
           COALESCE(cl.semana, 0),
           COALESCE(cl.quatro_semanas, 0),
           floor(EXTRACT(epoch FROM now() - COALESCE(cl.ultimo_em, a.ultima_atividade_em)) / 604800.0),
           floor(EXTRACT(epoch FROM now() - m.matriculado_em) / 604800.0),
           -- 0 a 100; -1 sem nota. classe_aluno grava 0 antes de qualquer correção: 0 sem
           -- progresso é "sem nota" (mesma regra do console, notaParaRisco).
           CASE WHEN m.nota_media IS NULL OR (m.nota_media = 0 AND COALESCE(m.progresso_pct, 0) = 0) THEN -1
                ELSE m.nota_media * 10 END,
           COALESCE(en.feitas, 0),
           COALESCE(en.perdidas, 0),
           CASE WHEN COALESCE(en.feitas, 0) + COALESCE(en.perdidas, 0) = 0 THEN 1
                ELSE en.feitas::numeric / (en.feitas + en.perdidas) END,
           COALESCE(en.atraso_medio_dias, 0)
         ))
       END AS risco_abandono_faixa
  FROM matriculas m
  LEFT JOIN sessoes s ON s.aluno_id = m.aluno_id AND s.classe_id = m.classe_id
  LEFT JOIN conclusoes c ON c.aluno_id = m.aluno_id AND c.classe_id = m.classe_id
  LEFT JOIN tempo_medio_topico tmt ON tmt.aluno_id = m.aluno_id AND tmt.classe_id = m.classe_id
  LEFT JOIN atividade a ON a.aluno_id = m.aluno_id AND a.classe_id = m.classe_id
  LEFT JOIN progresso p ON p.aluno_id = m.aluno_id AND p.classe_id = m.classe_id
  LEFT JOIN estagnacao est ON est.aluno_id = m.aluno_id AND est.classe_id = m.classe_id
  LEFT JOIN cliques cl ON cl.aluno_id = m.aluno_id AND cl.classe_id = m.classe_id
  LEFT JOIN entregas en ON en.aluno_id = m.aluno_id AND en.classe_id = m.classe_id;
"""

TURMA_GERAL = r"""
CREATE OR REPLACE VIEW public.vw_metricas_turma_geral_classe WITH (security_invoker = on) AS
WITH base_alunos AS (
  SELECT DISTINCT ca.classe_id, ca.aluno_id
    FROM public.classe_aluno ca
   WHERE ca.aluno_id IS NOT NULL
), chat_after_error AS (
  SELECT e.classe_id,
         e.aluno_id,
         count(*) FILTER (WHERE e.event_group = 'chat' AND e.event_name = 'chat_message') AS chat_messages_total,
         count(*) FILTER (WHERE e.event_group = 'chat' AND e.event_name = 'chat_message'
                           AND COALESCE(e.trigger_context, 'unknown') = 'after_error') AS chat_messages_after_error
    FROM public.telemetria_eventos_app e
   GROUP BY e.classe_id, e.aluno_id
), semanas AS (
  -- As 8 últimas semanas completas de Brasília (a semana corrente fica de fora).
  SELECT g::date AS inicio
    FROM generate_series(
      date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo') - interval '8 weeks',
      date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 week',
      interval '1 week'
    ) AS g
), ativo_semana AS (
  SELECT b.classe_id, b.aluno_id, w.inicio,
         EXISTS (
           SELECT 1
             FROM public.telemetria_time_metric_entries e
            WHERE e.aluno_id = b.aluno_id AND e.classe_id = b.classe_id
              AND e.scope = 'topic' AND e.active_sec > 0
              AND e.captured_at >= (w.inicio::timestamp AT TIME ZONE 'America/Sao_Paulo')
              AND e.captured_at < ((w.inicio + 7)::timestamp AT TIME ZONE 'America/Sao_Paulo')
         ) AS ativo
    FROM base_alunos b
    CROSS JOIN semanas w
), retorno AS (
  -- A regra da RPC `metricas_engajamento_turma`: dos ativos numa semana completa, quantos estavam
  -- ativos na seguinte.
  SELECT a.classe_id,
         count(*) FILTER (WHERE a.ativo) AS elegiveis,
         count(*) FILTER (WHERE a.ativo AND b.ativo) AS retornaram
    FROM ativo_semana a
    JOIN ativo_semana b ON b.classe_id = a.classe_id AND b.aluno_id = a.aluno_id AND b.inicio = a.inicio + 7
   GROUP BY a.classe_id
)
SELECT b.classe_id,
       count(DISTINCT b.aluno_id) AS total_alunos,
       avg(eng.tempo_total_uso_seg) AS tempo_medio_uso_seg,
       avg(eng.tempo_ativo_seg) AS tempo_ativo_medio_seg,
       avg(eng.numero_sessoes::numeric) AS sessoes_medias_por_aluno,
       (max(r.retornaram)::numeric / NULLIF(max(r.elegiveis), 0)::numeric * 100::numeric) AS retorno_semanal_pct,
       COALESCE(max(r.elegiveis), 0) AS retorno_semanal_elegiveis,
       count(DISTINCT b.aluno_id) FILTER (WHERE eng.inativo_desde IS NOT NULL) AS alunos_inativos,
       count(DISTINCT b.aluno_id) FILTER (WHERE eng.estagnado_topico_id IS NOT NULL) AS alunos_estagnados,
       count(DISTINCT b.aluno_id) FILTER (WHERE eng.evadido_desde IS NOT NULL) AS alunos_evadidos,
       count(DISTINCT b.aluno_id) FILTER (WHERE eng.sem_dado) AS alunos_sem_dado,
       avg(eng.taxa_conclusao_topicos_pct) AS taxa_media_conclusao_pct,
       -- Acerto, nota e comportamento: como estavam (P1 do plano; dependem da F4b).
       COALESCE(avg(des.nota_media_desempenho), 0::numeric) AS media_nota_turma,
       COALESCE(avg(des.taxa_acertos_pct), 0::numeric) AS taxa_media_acertos_pct,
       COALESCE(avg(des.taxa_acertos_sem_erro_pct), 0::numeric) AS taxa_media_acertos_sem_erro_pct,
       COALESCE(avg(des.eficiencia_aprendizagem), 0::numeric) AS eficiencia_media_aprendizagem,
       COALESCE(avg(comp.media_tentativas_por_questao), 0::numeric) AS media_tentativas_por_questao,
       COALESCE(avg(CASE WHEN COALESCE(comp.revisitas_conteudo, 0::bigint) > 0 THEN 1 ELSE 0 END) * 100::numeric,
                0::numeric) AS taxa_revisitas_pct,
       COALESCE(avg(CASE WHEN COALESCE(comp.interrupcoes_sessao, 0::bigint) > 0 THEN 1 ELSE 0 END) * 100::numeric,
                0::numeric) AS taxa_interrupcoes_pct,
       COALESCE(avg(chat.frequencia_chat_por_sessao), 0::numeric) AS frequencia_chat_media_sessao,
       COALESCE(avg(eng.taxa_uso_chat_pct), 0::numeric) AS taxa_media_uso_chat_pct,
       COALESCE(avg(chat.tempo_chat_seg), 0::numeric) AS tempo_medio_chat_seg,
       COALESCE(sum(COALESCE(cae.chat_messages_after_error, 0::bigint))
                / NULLIF(sum(COALESCE(cae.chat_messages_total, 0::bigint)), 0::numeric) * 100::numeric, 0::numeric)
         AS uso_chat_apos_erro_pct,
       -- Taxa de abandono: % dos alunos COM DADO na faixa "alto" do modelo do core.
       count(DISTINCT b.aluno_id) FILTER (WHERE eng.risco_abandono_faixa = 'alto') AS alunos_risco_alto,
       count(DISTINCT b.aluno_id) FILTER (WHERE eng.risco_abandono_faixa = 'atencao') AS alunos_risco_atencao,
       count(DISTINCT b.aluno_id) FILTER (WHERE eng.risco_abandono_faixa IN ('alto', 'atencao', 'normal'))
         AS alunos_risco_com_dado,
       (count(DISTINCT b.aluno_id) FILTER (WHERE eng.risco_abandono_faixa = 'alto'))::numeric * 100::numeric
         / NULLIF(count(DISTINCT b.aluno_id) FILTER (WHERE eng.risco_abandono_faixa IN ('alto', 'atencao', 'normal')), 0)::numeric
         AS taxa_risco_abandono_pct
  FROM base_alunos b
  LEFT JOIN public.vw_metricas_engajamento_aluno_classe eng ON eng.aluno_id = b.aluno_id AND eng.classe_id = b.classe_id
  LEFT JOIN public.vw_metricas_desempenho_aluno_classe des ON des.aluno_id = b.aluno_id AND des.classe_id = b.classe_id
  LEFT JOIN public.vw_metricas_comportamento_aluno_classe comp ON comp.aluno_id = b.aluno_id AND comp.classe_id = b.classe_id
  LEFT JOIN public.vw_metricas_chat_aluno_classe chat ON chat.aluno_id = b.aluno_id AND chat.classe_id = b.classe_id
  LEFT JOIN chat_after_error cae ON cae.aluno_id = b.aluno_id AND cae.classe_id = b.classe_id
  LEFT JOIN retorno r ON r.classe_id = b.classe_id
 GROUP BY b.classe_id;
"""

TURMA_PERFIL = r"""
CREATE OR REPLACE VIEW public.vw_metricas_turma_perfil_classe WITH (security_invoker = on) AS
WITH chat_after_error AS (
  SELECT e.classe_id,
         e.aluno_id,
         count(*) FILTER (WHERE e.event_group = 'chat' AND e.event_name = 'chat_message') AS chat_messages_total,
         count(*) FILTER (WHERE e.event_group = 'chat' AND e.event_name = 'chat_message'
                           AND COALESCE(e.trigger_context, 'unknown') = 'after_error') AS chat_messages_after_error
    FROM public.telemetria_eventos_app e
   GROUP BY e.classe_id, e.aluno_id
)
SELECT seg.classe_id,
       seg.segmento,
       seg.perfil_nome,
       count(DISTINCT seg.aluno_id) AS total_alunos_segmento,
       avg(eng.tempo_total_uso_seg) AS tempo_medio_uso_seg,
       avg(eng.tempo_ativo_seg) AS tempo_ativo_medio_seg,
       count(DISTINCT seg.aluno_id) FILTER (WHERE eng.inativo_desde IS NOT NULL) AS alunos_inativos,
       count(DISTINCT seg.aluno_id) FILTER (WHERE eng.estagnado_topico_id IS NOT NULL) AS alunos_estagnados,
       avg(eng.taxa_conclusao_topicos_pct) AS taxa_conclusao_topicos_pct,
       -- Acerto, nota e comportamento: como estavam (P1 do plano; dependem da F4b).
       COALESCE(avg(des.nota_media_desempenho), 0::numeric) AS media_nota,
       COALESCE(avg(des.taxa_acertos_pct), 0::numeric) AS taxa_acertos_pct,
       COALESCE(avg(des.taxa_acertos_sem_erro_pct), 0::numeric) AS taxa_acertos_sem_erro_pct,
       COALESCE(avg(des.eficiencia_aprendizagem), 0::numeric) AS eficiencia_aprendizagem,
       COALESCE(avg(comp.media_tentativas_por_questao), 0::numeric) AS media_tentativas_por_questao,
       COALESCE(avg(eng.taxa_uso_chat_pct), 0::numeric) AS taxa_uso_chat_pct,
       COALESCE(avg(chat.tempo_chat_seg), 0::numeric) AS tempo_chat_seg,
       COALESCE(sum(COALESCE(cae.chat_messages_after_error, 0::bigint))
                / NULLIF(sum(COALESCE(cae.chat_messages_total, 0::bigint)), 0::numeric) * 100::numeric, 0::numeric)
         AS uso_chat_apos_erro_pct,
       count(DISTINCT seg.aluno_id) FILTER (WHERE eng.risco_abandono_faixa = 'alto') AS alunos_risco_alto,
       count(DISTINCT seg.aluno_id) FILTER (WHERE eng.risco_abandono_faixa IN ('alto', 'atencao', 'normal'))
         AS alunos_risco_com_dado,
       (count(DISTINCT seg.aluno_id) FILTER (WHERE eng.risco_abandono_faixa = 'alto'))::numeric * 100::numeric
         / NULLIF(count(DISTINCT seg.aluno_id) FILTER (WHERE eng.risco_abandono_faixa IN ('alto', 'atencao', 'normal')), 0)::numeric
         AS taxa_risco_abandono_pct
  FROM public.vw_aluno_perfil_segmentos seg
  LEFT JOIN public.vw_metricas_engajamento_aluno_classe eng ON eng.aluno_id = seg.aluno_id AND eng.classe_id = seg.classe_id
  LEFT JOIN public.vw_metricas_desempenho_aluno_classe des ON des.aluno_id = seg.aluno_id AND des.classe_id = seg.classe_id
  LEFT JOIN public.vw_metricas_comportamento_aluno_classe comp ON comp.aluno_id = seg.aluno_id AND comp.classe_id = seg.classe_id
  LEFT JOIN public.vw_metricas_chat_aluno_classe chat ON chat.aluno_id = seg.aluno_id AND chat.classe_id = seg.classe_id
  LEFT JOIN chat_after_error cae ON cae.aluno_id = seg.aluno_id AND cae.classe_id = seg.classe_id
 GROUP BY seg.classe_id, seg.segmento, seg.perfil_nome;
"""

CATALOGO = """
INSERT INTO public.metricas_catalogo
  (chave, nome, descricao, publico, unidade, janela, fonte, nulo_significa, requer_validacao, invariantes)
VALUES
  ('prof.risco_abandono', 'Taxa de abandono',
   'Parcela dos alunos com dado na faixa alta do modelo de evasão do core (risco de abandonar nas próximas 4 semanas).',
   '{professor}', 'percentual', 'estado atual', 'vw_metricas_turma_geral_classe.taxa_risco_abandono_pct',
   'nenhum aluno com dado', 'nenhuma', '{I01,I02,I03}')
ON CONFLICT (chave) DO UPDATE SET
  nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, fonte = EXCLUDED.fonte, invariantes = EXCLUDED.invariantes;
"""

GRANTS = "".join(
    f"REVOKE ALL ON public.{nome} FROM anon;\nGRANT SELECT ON public.{nome} TO authenticated;\n"
    for nome in (
        "vw_metricas_engajamento_aluno_classe",
        "vw_metricas_turma_geral_classe",
        "vw_metricas_turma_perfil_classe",
    )
)


def _anterior():
    caminho = Path(__file__).with_name("20261031_05_views_de_metricas_retorno_e_sinais.py")
    spec = importlib.util.spec_from_file_location("views_de_metricas_20261031_05", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def upgrade() -> None:
    op.execute(MODELO)
    op.execute(ENGAJAMENTO)
    op.execute(TURMA_GERAL)
    op.execute(TURMA_PERFIL)
    op.execute(GRANTS)
    op.execute(CATALOGO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    anterior = _anterior()
    op.execute(anterior.DERRUBA)
    op.execute(anterior.ENGAJAMENTO)
    op.execute(anterior.DISTRIBUICAO)
    op.execute(anterior.TURMA_GERAL)
    op.execute(anterior.TURMA_PERFIL)
    op.execute(anterior.GRANTS)
    op.execute("DELETE FROM public.metricas_catalogo WHERE chave = 'prof.risco_abandono'")
    op.execute(
        "DROP FUNCTION IF EXISTS public.trailup_risco_evasao(numeric, numeric, numeric, numeric, numeric, numeric, "
        "numeric, numeric, numeric)"
    )
    op.execute("DROP FUNCTION IF EXISTS public.trailup_faixa_risco(numeric)")
    op.execute("NOTIFY pgrst, 'reload schema'")
