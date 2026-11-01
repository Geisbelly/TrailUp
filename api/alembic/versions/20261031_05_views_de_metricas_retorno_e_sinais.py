"""Retorno semanal e os três sinais (inatividade, estagnação e evasão) no lugar da taxa de abandono (F5, Task 3)

## O que estava errado

- **"Abandono"** era `tópicos não concluídos ÷ tópicos com linha`. Mede "ainda não terminou": um aluno no
  meio da trilha saía com 60%, e `risco.ts` o marcava "crítico" (spec §1). A spec proíbe exibir esse
  "crítico" (§6.2) e define o risco por três construtos (§7): inatividade, estagnação e evasão.
- **"Retorno"** era `dias ativos ÷ intervalo de dias`. Um único dia de uso dava 100%.
- A view de engajamento só tinha linha para quem teve sessão, então quem nunca estudou não aparecia
  para ser sinalizado.

## O que muda

- **`vw_metricas_engajamento_aluno_classe`:**
  - parte de `classe_aluno`, com uma linha por matrícula; as métricas de sessão ficam `NULL` para quem
    não teve sessão;
  - **saem** `taxa_retorno_pct` e `taxa_abandono_pct`. O nome não é reaproveitado com outro sentido
    (P4 do plano), e quem lê a coluna antiga quebra alto;
  - **entram:**
    - `ultima_atividade_em`: o último lote com tempo ativo, escopo `topic`;
    - `sem_dado`: nenhuma atividade registrada. Pelo §6.2, quem recusou telemetria, está em modo
      restrito ou nunca estudou **não** conta como inativo: aparece como "sem dado";
    - `inativo_desde` (7 dias) e `evadido_desde` (30 dias): a data da última atividade, quando passou
      do limite;
    - `estagnado_topico_id` e `estagnado_desde`: o tópico em andamento (não concluído, percentual > 0)
      sem avanço há 14 dias e com percentual **abaixo da mediana** da turma nele. Havendo mais de um,
      vale o último em que o aluno avançou.
- **`vw_metricas_turma_geral_classe`:**
  - `taxa_media_retorno_pct` e `taxa_media_abandono_pct` saem;
  - entram `retorno_semanal_pct` e `retorno_semanal_elegiveis`, `alunos_inativos`,
    `alunos_estagnados`, `alunos_evadidos`, `alunos_sem_dado` e `tempo_ativo_medio_seg`;
  - `tempo_medio_uso_seg` fica `NULL` quando ninguém teve sessão.
- **`vw_metricas_turma_perfil_classe`:** `taxa_retorno_pct` e `taxa_abandono_pct` saem; entram
  `alunos_inativos` e `alunos_estagnados`.
- **`vw_metricas_distribuicao_turma_classe`:**
  - a faixa `tempo_uso` (presença) vira `tempo_ativo` (D-1), com os mesmos limites;
  - quem não tem dado cai na faixa `sem_dado`, e não em `baixo`.

Acerto, nota e comportamento continuam como estavam (P1: dependem da F4b).

## Três definições que não são óbvias

- **"Sem avanço" vem da telemetria, não de `topico_aluno.updated_at`.** O plano previa
  `updated_at`, mas desde a F4a (`20261030_01`) o gatilho de tempo o atualiza a cada lote, então um
  aluno parado lendo o mesmo tópico nunca pareceria estagnado. O avanço é a última conclusão de
  conteúdo ou de tópico (`content_complete`, `topic_complete`). Sem nenhuma conclusão, conta o
  primeiro contato com o tópico.
  - **Limite conhecido:** concluir uma atividade não gera evento de telemetria hoje (o coletor emite
    só `activity_start`), então isso não conta como avanço.
- **Retorno semanal** usa a regra da RPC `metricas_engajamento_turma` (`20261026_01`): dos alunos
  ativos numa semana completa, quantos estavam ativos na seguinte. Contam as 8 últimas semanas
  completas de Brasília. Sem nenhum par de semanas com aluno ativo, o resultado é `NULL`, não 0% nem
  100%.
- **"Agora"** é o `now()` da consulta: os sinais são estado atual, não histórico. Os limites (7, 14 e
  30 dias) são dias corridos. "Dias letivos" (§6.2) precisaria de calendário, que não existe.

## Downgrade

Volta às views da `20261031_04`, com as colunas antigas, na ordem de dependência.

Revision ID: 20261031_05
Revises: 20261031_04
Create Date: 2026-10-31
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261031_05"
down_revision = "20261031_04"
branch_labels = None
depends_on = None

INATIVO_DIAS = 7
ESTAGNADO_DIAS = 14
EVADIDO_DIAS = 30
SEMANAS_RETORNO = 8

DERRUBA = """
DROP VIEW IF EXISTS public.vw_metricas_turma_perfil_classe;
DROP VIEW IF EXISTS public.vw_metricas_turma_geral_classe;
DROP VIEW IF EXISTS public.vw_metricas_distribuicao_turma_classe;
DROP VIEW IF EXISTS public.vw_metricas_engajamento_aluno_classe;
"""

ENGAJAMENTO = rf"""
CREATE VIEW public.vw_metricas_engajamento_aluno_classe WITH (security_invoker = on) AS
WITH matriculas AS (
  SELECT DISTINCT ON (ca.aluno_id, ca.classe_id) ca.aluno_id, ca.classe_id, ca.created_at AS matriculado_em
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
     AND COALESCE(ua.avancou_em, tpt.primeiro_contato_em) < now() - interval '{ESTAGNADO_DIAS} days'
   ORDER BY ta.aluno_id, t.classe_id, COALESCE(ua.avancou_em, tpt.primeiro_contato_em) DESC
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
       CASE WHEN a.ultima_atividade_em < now() - interval '{INATIVO_DIAS} days' THEN a.ultima_atividade_em END
         AS inativo_desde,
       CASE WHEN a.ultima_atividade_em < now() - interval '{EVADIDO_DIAS} days' THEN a.ultima_atividade_em END
         AS evadido_desde,
       est.topico_id AS estagnado_topico_id,
       est.desde AS estagnado_desde
  FROM matriculas m
  LEFT JOIN sessoes s ON s.aluno_id = m.aluno_id AND s.classe_id = m.classe_id
  LEFT JOIN conclusoes c ON c.aluno_id = m.aluno_id AND c.classe_id = m.classe_id
  LEFT JOIN tempo_medio_topico tmt ON tmt.aluno_id = m.aluno_id AND tmt.classe_id = m.classe_id
  LEFT JOIN atividade a ON a.aluno_id = m.aluno_id AND a.classe_id = m.classe_id
  LEFT JOIN progresso p ON p.aluno_id = m.aluno_id AND p.classe_id = m.classe_id
  LEFT JOIN estagnacao est ON est.aluno_id = m.aluno_id AND est.classe_id = m.classe_id;
"""

DISTRIBUICAO = r"""
CREATE VIEW public.vw_metricas_distribuicao_turma_classe WITH (security_invoker = on) AS
WITH base AS (
  SELECT ca.classe_id,
         ca.aluno_id,
         COALESCE(ca."notaMedia", 0::numeric) AS nota_media,
         COALESCE(ca."porcentagemConcluida", 0::numeric) AS progresso_pct,
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

TURMA_GERAL = rf"""
CREATE VIEW public.vw_metricas_turma_geral_classe WITH (security_invoker = on) AS
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
  -- As {SEMANAS_RETORNO} últimas semanas completas de Brasília (a semana corrente fica de fora).
  SELECT g::date AS inicio
    FROM generate_series(
      date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo') - interval '{SEMANAS_RETORNO} weeks',
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
         AS uso_chat_apos_erro_pct
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
CREATE VIEW public.vw_metricas_turma_perfil_classe WITH (security_invoker = on) AS
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
         AS uso_chat_apos_erro_pct
  FROM public.vw_aluno_perfil_segmentos seg
  LEFT JOIN public.vw_metricas_engajamento_aluno_classe eng ON eng.aluno_id = seg.aluno_id AND eng.classe_id = seg.classe_id
  LEFT JOIN public.vw_metricas_desempenho_aluno_classe des ON des.aluno_id = seg.aluno_id AND des.classe_id = seg.classe_id
  LEFT JOIN public.vw_metricas_comportamento_aluno_classe comp ON comp.aluno_id = seg.aluno_id AND comp.classe_id = seg.classe_id
  LEFT JOIN public.vw_metricas_chat_aluno_classe chat ON chat.aluno_id = seg.aluno_id AND chat.classe_id = seg.classe_id
  LEFT JOIN chat_after_error cae ON cae.aluno_id = seg.aluno_id AND cae.classe_id = seg.classe_id
 GROUP BY seg.classe_id, seg.segmento, seg.perfil_nome;
"""

FAMILIA = (
    "vw_metricas_engajamento_aluno_classe",
    "vw_metricas_distribuicao_turma_classe",
    "vw_metricas_turma_geral_classe",
    "vw_metricas_turma_perfil_classe",
)
GRANTS = "".join(
    f"REVOKE ALL ON public.{nome} FROM anon;\nGRANT SELECT ON public.{nome} TO authenticated;\n" for nome in FAMILIA
)


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(arquivo[:-3], caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def upgrade() -> None:
    op.execute(DERRUBA)
    op.execute(ENGAJAMENTO)
    op.execute(DISTRIBUICAO)
    op.execute(TURMA_GERAL)
    op.execute(TURMA_PERFIL)
    op.execute(GRANTS)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    espelho = _modulo("20261031_03_views_de_metricas_no_alembic.py")
    tempo = _modulo("20261031_04_views_de_metricas_tempo_e_sessoes.py")
    op.execute(DERRUBA)
    op.execute(tempo.ENGAJAMENTO)
    for nome, corpo in espelho.VIEWS:
        if nome in FAMILIA[1:]:
            op.execute(espelho._criar(nome, corpo))
    op.execute(GRANTS)
    op.execute("NOTIFY pgrst, 'reload schema'")
