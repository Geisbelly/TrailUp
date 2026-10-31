"""As colunas antigas voltam às views de métricas, e o modelo de evasão só roda em semana com evento (F5)

## Por quê

A #728 foi mesclada antes de três commits que já estavam decididos em 31/10:

- **Nada sai das views sem confirmação.** A `20261031_05` mesclada tira `taxa_retorno_pct` e
  `taxa_abandono_pct` (por aluno e por perfil), `taxa_media_retorno_pct` e `taxa_media_abandono_pct`
  (turma) e a faixa `tempo_uso` da distribuição. A decisão de 31/10 foi manter tudo, com a conta de
  sempre. Elas voltam aqui. Nada no monorepo lê essas colunas hoje (só os tipos gerados); voltam porque
  a remoção não foi confirmada.
- **O modelo de evasão só roda em semana com evento.** A função do core foi validada no OULAD (AUC
  0,766, ECE ≤ 0,007), mas o painel de validação não tem nenhuma semana com 0 cliques: semana sem evento
  é fora do domínio dele. Sem evento na semana, a faixa vem da inatividade (30 dias = `alto`, 7 dias =
  `atencao`), e `risco_abandono_origem` diz qual dos dois decidiu (`modelo` ou `inatividade`).
- **As 4 semanas de entrada do modelo são as anteriores à corrente**, como no painel do OULAD do core
  (`sem-4 <= semana < sem`). A versão mesclada contava a semana corrente duas vezes.

As `_05` e `_08` já estão aplicadas em produção, então a correção é esta revisão nova, e não uma
edição delas. O texto das quatro views é o da ponta de `feat/f5-views-e-rpc-banco` (`_05` para a
distribuição, `_08` para as outras três), copiado sem mudança.

## Como

Mesma ordem da `_05`: derruba as quatro (colunas novas no meio não cabem em `CREATE OR REPLACE`),
recria e devolve os GRANTs. Nenhum outro objeto depende delas: a `_05` derrubou as mesmas quatro sem
`CASCADE` em produção.

## Downgrade

Volta ao que a `_05` e a `_08` definem hoje (o estado de produção antes desta revisão).

Revision ID: 20261101_01
Revises: 20261031_09
Create Date: 2026-11-01
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261101_01"
down_revision = "20261031_09"
branch_labels = None
depends_on = None

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
         min(s.dia) AS primeiro_dia,
         max(s.dia) AS ultimo_dia,
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
         -- As 4 semanas ANTERIORES à corrente, como no painel do OULAD do core
         -- (`sem-4 <= semana < sem`, docs/auditoria/scripts/64_sql.py).
         count(*) FILTER (WHERE e.occurred_at >= now() - interval '35 days'
                            AND e.occurred_at < now() - interval '7 days') AS quatro_semanas,
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
       -- Colunas antigas, mantidas com a conta de sempre (decisão de 31/10: nada sai das views sem
       -- confirmação). O console não as lê mais; o abandono do console vem do modelo do core (_08).
       (s.dias_com_sessao::numeric / GREATEST(s.ultimo_dia - s.primeiro_dia + 1, 1)::numeric * 100::numeric)::numeric
         AS taxa_retorno_pct,
       ((p.topicos_com_linha - p.topicos_concluidos)::numeric / NULLIF(p.topicos_com_linha, 0)::numeric * 100::numeric)::numeric
         AS taxa_abandono_pct,
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
         -- O modelo só foi medido em semana COM clique (no painel do OULAD não existe linha com 0
         -- cliques: mínimo 1, mediana 30). Semana sem evento é fora do domínio dele: a faixa vem da
         -- inatividade, com os mesmos limites dos sinais (30 dias = alto, 7 dias = atenção).
         WHEN COALESCE(cl.semana, 0) = 0 THEN
           CASE WHEN a.ultima_atividade_em < now() - interval '30 days' THEN 'alto'
                WHEN a.ultima_atividade_em < now() - interval '7 days' THEN 'atencao'
                ELSE 'normal' END
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
       END AS risco_abandono_faixa,
       -- De onde a faixa veio, para ninguém ler a regra de inatividade como saída do modelo.
       CASE WHEN a.ultima_atividade_em IS NULL THEN NULL
            WHEN COALESCE(cl.semana, 0) = 0 THEN 'inatividade'
            ELSE 'modelo' END AS risco_abandono_origem
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

DISTRIBUICAO = r"""
CREATE VIEW public.vw_metricas_distribuicao_turma_classe WITH (security_invoker = on) AS
WITH base AS (
  SELECT ca.classe_id,
         ca.aluno_id,
         COALESCE(ca."notaMedia", 0::numeric) AS nota_media,
         COALESCE(ca."porcentagemConcluida", 0::numeric) AS progresso_pct,
         COALESCE(eng.tempo_total_uso_seg, 0::numeric) AS tempo_uso_seg,
         eng.tempo_ativo_seg
    FROM public.classe_aluno ca
    LEFT JOIN public.vw_metricas_engajamento_aluno_classe eng
      ON eng.aluno_id = ca.aluno_id AND eng.classe_id = ca.classe_id
   WHERE ca.aluno_id IS NOT NULL
), faixas AS (
  SELECT base.classe_id, 'nota_media'::text AS metrica,
         CASE WHEN base.nota_media < 5::numeric THEN 'baixa'::text
              WHEN base.nota_media < 7::numeric THEN 'media'::text
              ELSE 'alta'::text END AS faixa
    FROM base
  UNION ALL
  -- Faixa antiga, mantida (decisão de 31/10): tempo com o app aberto, agora sem fan-out.
  SELECT base.classe_id, 'tempo_uso'::text AS metrica,
         CASE WHEN base.tempo_uso_seg < 1800::numeric THEN 'baixo'::text
              WHEN base.tempo_uso_seg < 7200::numeric THEN 'medio'::text
              ELSE 'alto'::text END AS faixa
    FROM base
  UNION ALL
  -- D-1: tempo de estudo é tempo ativo. Sem dado não é "baixo".
  SELECT base.classe_id, 'tempo_ativo'::text AS metrica,
         CASE WHEN base.tempo_ativo_seg IS NULL THEN 'sem_dado'::text
              WHEN base.tempo_ativo_seg < 1800::numeric THEN 'baixo'::text
              WHEN base.tempo_ativo_seg < 7200::numeric THEN 'medio'::text
              ELSE 'alto'::text END AS faixa
    FROM base
  UNION ALL
  SELECT base.classe_id, 'progresso'::text AS metrica,
         CASE WHEN base.progresso_pct < 40::numeric THEN 'baixo'::text
              WHEN base.progresso_pct < 80::numeric THEN 'medio'::text
              ELSE 'alto'::text END AS faixa
    FROM base
)
SELECT classe_id,
       metrica,
       faixa,
       count(*) AS total_alunos,
       round(count(*)::numeric / NULLIF(sum(count(*)) OVER (PARTITION BY classe_id, metrica), 0::numeric) * 100::numeric, 2)
         AS percentual
  FROM faixas
 GROUP BY classe_id, metrica, faixa;
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
       -- Antigas, mantidas com a conta de sempre (decisão de 31/10).
       COALESCE(avg(eng.taxa_retorno_pct), 0::numeric) AS taxa_media_retorno_pct,
       COALESCE(avg(eng.taxa_abandono_pct), 0::numeric) AS taxa_media_abandono_pct,
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
       -- Antigas, mantidas com a conta de sempre (decisão de 31/10).
       COALESCE(avg(eng.taxa_retorno_pct), 0::numeric) AS taxa_retorno_pct,
       COALESCE(avg(eng.taxa_abandono_pct), 0::numeric) AS taxa_abandono_pct,
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


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(arquivo[:-3], caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def upgrade() -> None:
    sinais = _modulo("20261031_05_views_de_metricas_retorno_e_sinais.py")
    op.execute(sinais.DERRUBA)
    op.execute(ENGAJAMENTO)
    op.execute(DISTRIBUICAO)
    op.execute(TURMA_GERAL)
    op.execute(TURMA_PERFIL)
    op.execute(sinais.GRANTS)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    sinais = _modulo("20261031_05_views_de_metricas_retorno_e_sinais.py")
    modelo = _modulo("20261031_08_abandono_pelo_modelo_do_core.py")
    op.execute(sinais.DERRUBA)
    op.execute(modelo.ENGAJAMENTO)
    op.execute(sinais.DISTRIBUICAO)
    op.execute(modelo.TURMA_GERAL)
    op.execute(modelo.TURMA_PERFIL)
    op.execute(sinais.GRANTS)
    op.execute("NOTIFY pgrst, 'reload schema'")
