"""As views de métricas entram no Alembic com o texto exato de produção (F5, Task 1)

Primeira migration da F5 (`docs/superpowers/plans/2026-10-31-f5-views-e-rpc.md`). **Não muda
comportamento:** espelha, sem corrigir, as dez views que existiam só no banco vivo (schema não
versionado, `docs/architecture/schema-nao-versionado.md`). As correções vêm nas migrations seguintes,
cada uma com a sua medição. É o molde da `20261021_21`: espelhar primeiro, estreitar depois.

## O que foi medido (produção, 31/10, só leitura)

As dez views têm `security_invoker = on`, `SELECT` para `authenticated` e nenhum privilégio para
`anon`. O corpo de cada uma é o de `pg_get_viewdef(oid, true)`, e o md5 dele está na tabela abaixo. O
teste confere o md5 de cada constante deste módulo, e o e2e confere que, aplicada sobre o esqueleto,
cada view devolve o mesmo texto.

| view | md5 do corpo |
|---|---|
| `vw_aluno_perfil_segmentos` | `843202053be4e82a7d3e4b2450074c6a` |
| `vw_metricas_sessoes_aluno_dia` | `af2ef2d4583a08d23d03766bf6f7221d` |
| `vw_metricas_chat_aluno_classe` | `cbb9b8420b60d61aa3b64faf10d7abf7` |
| `vw_metricas_comportamento_aluno_classe` | `555fc6b1af177cc293a58e736edf6eee` |
| `vw_metricas_desempenho_aluno_classe` | `8e32d5ce4dcf851c788b059279d385ea` |
| `vw_metricas_evolucao_desempenho_aluno_dia` | `43bbbc00f4f1fad8d11ec0e712f4ae89` |
| `vw_metricas_engajamento_aluno_classe` | `ee2685a936afa182aebb3763fde24cae` |
| `vw_metricas_distribuicao_turma_classe` | `5e155e24bc4bebc7ec187fc1d4614816` |
| `vw_metricas_turma_geral_classe` | `f6e0b3c1e70354ebf115fe90d0bf1bfc` |
| `vw_metricas_turma_perfil_classe` | `3527e505c6d9bd20294beb983e3182e8` |

`vw_aluno_perfil_segmentos` não é da família `vw_metricas_*`, mas entra porque `turma_perfil` depende
dela: sem ela, nenhum banco novo cria a `turma_perfil`. A `vw_metricas_disponibilidade` já estava
versionada (F0) e não entra.

## Ordem

Uma view só nasce depois daquelas que ela lê. A ordem é segmentos, sessões, chat, comportamento,
desempenho, evolução, engajamento (lê sessões), distribuição (lê engajamento), turma geral e turma por
perfil (leem engajamento, desempenho, comportamento e chat).

## Downgrade não remove nada

As dez existiam antes desta revisão. Remover derrubaria o console para desfazer um commit que não
mudou comportamento. É a mesma decisão da `20261021_21`.

Revision ID: 20261031_03
Revises: 20261031_02
Create Date: 2026-10-31
"""

from alembic import op

revision = "20261031_03"
down_revision = "20261031_02"
branch_labels = None
depends_on = None

# Corpo exato de `pg_get_viewdef(oid, true)` na produção (31/10). Não editar sem medir de novo: o
# teste confere o md5 de cada um.
VW_ALUNO_PERFIL_SEGMENTOS = r""" WITH ranking AS (
         SELECT ap.aluno_id,
            ap.perfil_id,
            p.nome AS perfil_nome,
            COALESCE(ap.afinidade, 0::numeric) AS afinidade,
            row_number() OVER (PARTITION BY ap.aluno_id ORDER BY (COALESCE(ap.afinidade, 0::numeric)) DESC, ap.perfil_id) AS ordem_perfil
           FROM aluno_perfil ap
             LEFT JOIN perfil p ON p.id = ap.perfil_id
        ), segmentos AS (
         SELECT ranking.aluno_id,
            ranking.perfil_id,
            COALESCE(ranking.perfil_nome, 'Sem perfil'::text) AS perfil_nome,
            ranking.afinidade,
            'majoritario'::text AS segmento
           FROM ranking
          WHERE ranking.ordem_perfil = 1
        UNION ALL
         SELECT ranking.aluno_id,
            ranking.perfil_id,
            COALESCE(ranking.perfil_nome, 'Sem perfil'::text) AS perfil_nome,
            ranking.afinidade,
            'segundo'::text AS segmento
           FROM ranking
          WHERE ranking.ordem_perfil = 2
        UNION ALL
         SELECT ranking.aluno_id,
            ranking.perfil_id,
            COALESCE(ranking.perfil_nome, 'Sem perfil'::text) AS perfil_nome,
            ranking.afinidade,
            'afinidade_20_plus'::text AS segmento
           FROM ranking
          WHERE ranking.afinidade >= 20::numeric
        )
 SELECT DISTINCT ca.classe_id,
    s.aluno_id,
    s.perfil_id,
    s.perfil_nome,
    s.afinidade,
    s.segmento
   FROM segmentos s
     JOIN classe_aluno ca ON ca.aluno_id = s.aluno_id;"""

VW_METRICAS_SESSOES_ALUNO_DIA = r""" WITH session_lotes AS (
         SELECT s.id AS sessao_id,
            s.aluno_id,
            s.classe_id,
            date(s.started_at) AS dia,
            COALESCE(EXTRACT(epoch FROM COALESCE(s.ended_at, max(l.captured_at), s.started_at) - s.started_at), 0::numeric) AS tempo_sessao_raw_seg,
            COALESCE(sum(l.active_sec), 0::numeric) AS tempo_ativo_lotes_seg,
            COALESCE(sum(l.idle_sec), 0::numeric) AS tempo_ocioso_lotes_seg,
            COALESCE(sum(l.screen_dwell_sec), 0::numeric) AS tempo_dwell_lotes_seg,
            COALESCE(sum(l.touch_count), 0::bigint) AS toques_lote
           FROM telemetria_sessoes s
             LEFT JOIN telemetria_lotes l ON l.sessao_id = s.id
          GROUP BY s.id, s.aluno_id, s.classe_id, (date(s.started_at)), s.started_at, s.ended_at
        ), session_time_entries AS (
         SELECT telemetria_time_metric_entries.sessao_id,
            COALESCE(sum(telemetria_time_metric_entries.active_sec), 0::numeric) AS tempo_ativo_entries_seg,
            COALESCE(sum(telemetria_time_metric_entries.idle_sec), 0::numeric) AS tempo_ocioso_entries_seg,
            COALESCE(sum(telemetria_time_metric_entries.dwell_sec), 0::numeric) AS tempo_dwell_entries_seg
           FROM telemetria_time_metric_entries
          WHERE telemetria_time_metric_entries.scope = 'topic'::text
          GROUP BY telemetria_time_metric_entries.sessao_id
        ), session_events AS (
         SELECT e.sessao_id,
            count(*) FILTER (WHERE e.event_group = 'interaction'::text) AS interacoes,
            count(*) FILTER (WHERE e.event_group = 'chat'::text AND e.event_name = 'chat_message'::text) AS mensagens_chat,
            count(*) FILTER (WHERE e.event_group = 'chat'::text AND e.event_name = 'chat_open'::text) AS aberturas_chat,
            bool_or(e.event_group = 'chat'::text) AS usou_chat
           FROM telemetria_eventos_app e
          GROUP BY e.sessao_id
        )
 SELECT sl.dia,
    sl.aluno_id,
    sl.classe_id,
    sl.sessao_id,
    COALESCE(NULLIF(sl.tempo_sessao_raw_seg, 0::numeric), NULLIF(ste.tempo_dwell_entries_seg, 0::numeric), sl.tempo_dwell_lotes_seg, 0::numeric) AS tempo_sessao_seg,
    COALESCE(NULLIF(ste.tempo_ativo_entries_seg, 0::numeric), sl.tempo_ativo_lotes_seg, 0::numeric) AS tempo_ativo_seg,
    COALESCE(NULLIF(ste.tempo_ocioso_entries_seg, 0::numeric), sl.tempo_ocioso_lotes_seg, 0::numeric) AS tempo_ocioso_seg,
    COALESCE(se.interacoes, 0::bigint) AS interacoes,
    COALESCE(se.mensagens_chat, 0::bigint) AS mensagens_chat,
    COALESCE(se.aberturas_chat, 0::bigint) AS aberturas_chat,
    COALESCE(se.usou_chat, false) AS usou_chat
   FROM session_lotes sl
     LEFT JOIN session_time_entries ste ON ste.sessao_id = sl.sessao_id
     LEFT JOIN session_events se ON se.sessao_id = sl.sessao_id;"""

VW_METRICAS_CHAT_ALUNO_CLASSE = r""" WITH chat_messages AS (
         SELECT e.aluno_id,
            e.classe_id,
            e.sessao_id,
            count(*) FILTER (WHERE e.event_name = 'chat_message'::text) AS mensagens_chat,
            count(*) FILTER (WHERE e.event_name = 'chat_open'::text) AS aberturas_chat
           FROM telemetria_eventos_app e
          WHERE e.event_group = 'chat'::text
          GROUP BY e.aluno_id, e.classe_id, e.sessao_id
        ), chat_opens AS (
         SELECT e.aluno_id,
            e.classe_id,
            e.sessao_id,
            e.occurred_at,
            row_number() OVER (PARTITION BY e.sessao_id ORDER BY e.occurred_at) AS rn
           FROM telemetria_eventos_app e
          WHERE e.event_name = 'chat_open'::text
        ), chat_closes AS (
         SELECT e.sessao_id,
            e.occurred_at,
            row_number() OVER (PARTITION BY e.sessao_id ORDER BY e.occurred_at) AS rn
           FROM telemetria_eventos_app e
          WHERE e.event_name = 'chat_close'::text
        ), chat_durations AS (
         SELECT o.aluno_id,
            o.classe_id,
            o.sessao_id,
            COALESCE(EXTRACT(epoch FROM c.occurred_at - o.occurred_at), 0::numeric) AS tempo_chat_seg
           FROM chat_opens o
             LEFT JOIN chat_closes c ON c.sessao_id = o.sessao_id AND c.rn = o.rn
        ), context_counts AS (
         SELECT e.aluno_id,
            e.classe_id,
            COALESCE(e.trigger_context, 'unknown'::text) AS trigger_context,
            count(*) AS total
           FROM telemetria_eventos_app e
          WHERE e.event_group = 'chat'::text AND e.event_name = 'chat_message'::text
          GROUP BY e.aluno_id, e.classe_id, (COALESCE(e.trigger_context, 'unknown'::text))
        ), context_json AS (
         SELECT context_counts.aluno_id,
            context_counts.classe_id,
            jsonb_object_agg(context_counts.trigger_context, context_counts.total ORDER BY context_counts.trigger_context) AS momento_uso_chat
           FROM context_counts
          GROUP BY context_counts.aluno_id, context_counts.classe_id
        )
 SELECT cm.aluno_id,
    cm.classe_id,
    COALESCE(sum(cm.mensagens_chat), 0::numeric) AS numero_interacoes_chat,
    COALESCE(sum(cd.tempo_chat_seg), 0::numeric) AS tempo_chat_seg,
    COALESCE(cj.momento_uso_chat, '{}'::jsonb) AS momento_uso_chat,
    COALESCE(avg(cm.mensagens_chat::numeric), 0::numeric) AS frequencia_chat_por_sessao,
    COALESCE(avg(cm.aberturas_chat::numeric), 0::numeric) AS aberturas_chat_por_sessao
   FROM chat_messages cm
     LEFT JOIN chat_durations cd ON cd.aluno_id = cm.aluno_id AND cd.classe_id = cm.classe_id AND cd.sessao_id = cm.sessao_id
     LEFT JOIN context_json cj ON cj.aluno_id = cm.aluno_id AND cj.classe_id = cm.classe_id
  GROUP BY cm.aluno_id, cm.classe_id, cj.momento_uso_chat;"""

VW_METRICAS_COMPORTAMENTO_ALUNO_CLASSE = r""" WITH interaction_stats AS (
         SELECT e.aluno_id,
            e.classe_id,
            avg(e.time_since_prev_sec) FILTER (WHERE e.time_since_prev_sec IS NOT NULL) AS media_tempo_entre_interacoes_seg,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (e.time_since_prev_sec::double precision)) FILTER (WHERE e.time_since_prev_sec IS NOT NULL) AS mediana_tempo_entre_interacoes_seg,
            count(*) FILTER (WHERE e.event_name = 'content_revisit'::text) AS revisitas_conteudo
           FROM telemetria_eventos_app e
          GROUP BY e.aluno_id, e.classe_id
        ), tentativas_por_questao AS (
         SELECT qa.aluno_id,
            t_1.classe_id,
            qa.questao_id,
            count(*) AS tentativas
           FROM questao_aluno qa
             JOIN questoes q ON q.id = qa.questao_id
             JOIN atividades a ON a.id = q.atividade_id
             JOIN topicos t_1 ON t_1.id = a.topico_id
          GROUP BY qa.aluno_id, t_1.classe_id, qa.questao_id
        ), tentativa_stats AS (
         SELECT tentativas_por_questao.aluno_id,
            tentativas_por_questao.classe_id,
            avg(tentativas_por_questao.tentativas::numeric) AS media_tentativas_por_questao,
            sum(tentativas_por_questao.tentativas) AS total_tentativas
           FROM tentativas_por_questao
          GROUP BY tentativas_por_questao.aluno_id, tentativas_por_questao.classe_id
        ), session_interrupts AS (
         SELECT e.aluno_id,
            e.classe_id,
            e.sessao_id,
            bool_or(e.event_name = 'session_interrupt'::text) AS explicit_interrupt,
            count(*) FILTER (WHERE e.event_name = 'topic_open'::text) AS topicos_abertos,
            count(*) FILTER (WHERE e.event_name = 'topic_complete'::text) AS topicos_concluidos
           FROM telemetria_eventos_app e
          GROUP BY e.aluno_id, e.classe_id, e.sessao_id
        ), interrupt_stats AS (
         SELECT session_interrupts.aluno_id,
            session_interrupts.classe_id,
            count(*) FILTER (WHERE session_interrupts.explicit_interrupt) AS interrupcoes_sessao
           FROM session_interrupts
          GROUP BY session_interrupts.aluno_id, session_interrupts.classe_id
        )
 SELECT COALESCE(i.aluno_id, t.aluno_id, s.aluno_id) AS aluno_id,
    COALESCE(i.classe_id, t.classe_id, s.classe_id) AS classe_id,
    COALESCE(i.media_tempo_entre_interacoes_seg, 0::numeric) AS media_tempo_entre_interacoes_seg,
    COALESCE(i.mediana_tempo_entre_interacoes_seg, 0::numeric::double precision) AS mediana_tempo_entre_interacoes_seg,
    COALESCE(t.media_tentativas_por_questao, 0::numeric) AS media_tentativas_por_questao,
    COALESCE(t.total_tentativas, 0::numeric) AS total_tentativas,
    COALESCE(i.revisitas_conteudo, 0::bigint) AS revisitas_conteudo,
    COALESCE(s.interrupcoes_sessao, 0::bigint) AS interrupcoes_sessao
   FROM interaction_stats i
     FULL JOIN tentativa_stats t ON t.aluno_id = i.aluno_id AND t.classe_id = i.classe_id
     FULL JOIN interrupt_stats s ON s.aluno_id = COALESCE(i.aluno_id, t.aluno_id) AND s.classe_id = COALESCE(i.classe_id, t.classe_id);"""

VW_METRICAS_DESEMPENHO_ALUNO_CLASSE = r""" WITH questao_base AS (
         SELECT qa.aluno_id,
            t.classe_id,
            qa.questao_id,
            qa.correta,
            qa.criado_em,
            row_number() OVER (PARTITION BY qa.aluno_id, qa.questao_id ORDER BY qa.tentativa, qa.criado_em, qa.id) AS ordem_tentativa
           FROM questao_aluno qa
             JOIN questoes q ON q.id = qa.questao_id
             JOIN atividades a ON a.id = q.atividade_id
             JOIN topicos t ON t.id = a.topico_id
        ), questao_stats AS (
         SELECT qb.aluno_id,
            qb.classe_id,
            count(*) AS total_tentativas,
            count(*) FILTER (WHERE qb.correta IS TRUE) AS total_acertos,
            count(DISTINCT qb.questao_id) AS total_questoes,
            count(DISTINCT qb.questao_id) FILTER (WHERE qb.ordem_tentativa = 1 AND qb.correta IS TRUE) AS acertos_primeira_tentativa
           FROM questao_base qb
          GROUP BY qb.aluno_id, qb.classe_id
        ), topic_opens AS (
         SELECT e.aluno_id,
            e.classe_id,
            e.sessao_id,
            e.topico_id,
            e.occurred_at,
            row_number() OVER (PARTITION BY e.aluno_id, e.classe_id, e.sessao_id, e.topico_id ORDER BY e.occurred_at) AS rn
           FROM telemetria_eventos_app e
          WHERE e.event_name = 'topic_open'::text AND e.topico_id IS NOT NULL
        ), topic_completes AS (
         SELECT e.aluno_id,
            e.classe_id,
            e.sessao_id,
            e.topico_id,
            e.occurred_at,
            row_number() OVER (PARTITION BY e.aluno_id, e.classe_id, e.sessao_id, e.topico_id ORDER BY e.occurred_at) AS rn
           FROM telemetria_eventos_app e
          WHERE e.event_name = 'topic_complete'::text AND e.topico_id IS NOT NULL
        ), topic_durations AS (
         SELECT o.aluno_id,
            o.classe_id,
            COALESCE(EXTRACT(epoch FROM c.occurred_at - o.occurred_at), 0::numeric) AS tempo_conclusao_topico_seg
           FROM topic_opens o
             LEFT JOIN topic_completes c ON c.aluno_id = o.aluno_id AND c.classe_id = o.classe_id AND c.sessao_id = o.sessao_id AND c.topico_id = o.topico_id AND c.rn = o.rn
        ), active_time_entries AS (
         SELECT telemetria_time_metric_entries.aluno_id,
            telemetria_time_metric_entries.classe_id,
            sum(telemetria_time_metric_entries.active_sec) AS tempo_ativo_seg
           FROM telemetria_time_metric_entries
          WHERE telemetria_time_metric_entries.scope = 'topic'::text
          GROUP BY telemetria_time_metric_entries.aluno_id, telemetria_time_metric_entries.classe_id
        ), active_time_lotes AS (
         SELECT telemetria_lotes.aluno_id,
            telemetria_lotes.classe_id,
            sum(telemetria_lotes.active_sec) AS tempo_ativo_seg
           FROM telemetria_lotes
          GROUP BY telemetria_lotes.aluno_id, telemetria_lotes.classe_id
        ), active_time AS (
         SELECT COALESCE(e.aluno_id, l.aluno_id) AS aluno_id,
            COALESCE(e.classe_id, l.classe_id) AS classe_id,
            COALESCE(e.tempo_ativo_seg, l.tempo_ativo_seg, 0::numeric) AS tempo_ativo_seg
           FROM active_time_entries e
             FULL JOIN active_time_lotes l ON l.aluno_id = e.aluno_id AND l.classe_id = e.classe_id
        )
 SELECT ca.aluno_id,
    ca.classe_id,
    COALESCE(ca."notaMedia", 0::numeric) AS nota_media_desempenho,
    COALESCE(qs.total_acertos::numeric / NULLIF(qs.total_tentativas, 0)::numeric * 100::numeric, 0::numeric) AS taxa_acertos_pct,
    COALESCE(qs.acertos_primeira_tentativa::numeric / NULLIF(qs.total_questoes, 0)::numeric * 100::numeric, 0::numeric) AS taxa_acertos_sem_erro_pct,
    COALESCE(avg(td.tempo_conclusao_topico_seg), 0::numeric) AS tempo_medio_conclusao_topico_seg,
    COALESCE(qs.total_acertos::numeric / NULLIF(at.tempo_ativo_seg / 3600::numeric, 0::numeric), 0::numeric) AS eficiencia_aprendizagem,
    COALESCE(ca."porcentagemConcluida", 0::numeric) AS progresso_trilha_pct
   FROM classe_aluno ca
     LEFT JOIN questao_stats qs ON qs.aluno_id = ca.aluno_id AND qs.classe_id = ca.classe_id
     LEFT JOIN topic_durations td ON td.aluno_id = ca.aluno_id AND td.classe_id = ca.classe_id
     LEFT JOIN active_time at ON at.aluno_id = ca.aluno_id AND at.classe_id = ca.classe_id
  GROUP BY ca.aluno_id, ca.classe_id, ca."notaMedia", qs.total_acertos, qs.total_tentativas, qs.acertos_primeira_tentativa, qs.total_questoes, at.tempo_ativo_seg, ca."porcentagemConcluida";"""

VW_METRICAS_EVOLUCAO_DESEMPENHO_ALUNO_DIA = r""" WITH questao_base AS (
         SELECT qa.aluno_id,
            t.classe_id,
            date(qa.criado_em) AS dia,
            qa.questao_id,
            qa.correta,
            row_number() OVER (PARTITION BY qa.aluno_id, qa.questao_id, (date(qa.criado_em)) ORDER BY qa.tentativa, qa.criado_em, qa.id) AS ordem_tentativa
           FROM questao_aluno qa
             JOIN questoes q ON q.id = qa.questao_id
             JOIN atividades a ON a.id = q.atividade_id
             JOIN topicos t ON t.id = a.topico_id
        ), questao_dia AS (
         SELECT qb.aluno_id,
            qb.classe_id,
            qb.dia,
            count(*) AS total_tentativas,
            count(*) FILTER (WHERE qb.correta IS TRUE) AS total_acertos,
            count(DISTINCT qb.questao_id) AS total_questoes,
            count(DISTINCT qb.questao_id) FILTER (WHERE qb.ordem_tentativa = 1 AND qb.correta IS TRUE) AS acertos_primeira_tentativa
           FROM questao_base qb
          GROUP BY qb.aluno_id, qb.classe_id, qb.dia
        ), tempo_dia_entries AS (
         SELECT telemetria_time_metric_entries.aluno_id,
            telemetria_time_metric_entries.classe_id,
            date(telemetria_time_metric_entries.captured_at) AS dia,
            sum(telemetria_time_metric_entries.active_sec) AS tempo_ativo_seg
           FROM telemetria_time_metric_entries
          WHERE telemetria_time_metric_entries.scope = 'topic'::text
          GROUP BY telemetria_time_metric_entries.aluno_id, telemetria_time_metric_entries.classe_id, (date(telemetria_time_metric_entries.captured_at))
        ), tempo_dia_lotes AS (
         SELECT telemetria_lotes.aluno_id,
            telemetria_lotes.classe_id,
            date(telemetria_lotes.captured_at) AS dia,
            sum(telemetria_lotes.active_sec) AS tempo_ativo_seg
           FROM telemetria_lotes
          GROUP BY telemetria_lotes.aluno_id, telemetria_lotes.classe_id, (date(telemetria_lotes.captured_at))
        ), tempo_dia AS (
         SELECT COALESCE(e.aluno_id, l.aluno_id) AS aluno_id,
            COALESCE(e.classe_id, l.classe_id) AS classe_id,
            COALESCE(e.dia, l.dia) AS dia,
            COALESCE(e.tempo_ativo_seg, l.tempo_ativo_seg, 0::numeric) AS tempo_ativo_seg
           FROM tempo_dia_entries e
             FULL JOIN tempo_dia_lotes l ON l.aluno_id = e.aluno_id AND l.classe_id = e.classe_id AND l.dia = e.dia
        ), base_dias AS (
         SELECT questao_dia.aluno_id,
            questao_dia.classe_id,
            questao_dia.dia
           FROM questao_dia
        UNION
         SELECT tempo_dia.aluno_id,
            tempo_dia.classe_id,
            tempo_dia.dia
           FROM tempo_dia
        )
 SELECT b.aluno_id,
    b.classe_id,
    b.dia,
    COALESCE(ca."notaMedia", 0::numeric) AS nota_media_desempenho,
    COALESCE(qd.total_acertos::numeric / NULLIF(qd.total_tentativas, 0)::numeric * 100::numeric, 0::numeric) AS taxa_acertos_pct,
    COALESCE(qd.acertos_primeira_tentativa::numeric / NULLIF(qd.total_questoes, 0)::numeric * 100::numeric, 0::numeric) AS taxa_acertos_sem_erro_pct,
    COALESCE(qd.total_acertos::numeric / NULLIF(td.tempo_ativo_seg / 3600::numeric, 0::numeric), 0::numeric) AS eficiencia_aprendizagem,
    COALESCE(ca."porcentagemConcluida", 0::numeric) AS progresso_trilha_pct
   FROM base_dias b
     LEFT JOIN questao_dia qd ON qd.aluno_id = b.aluno_id AND qd.classe_id = b.classe_id AND qd.dia = b.dia
     LEFT JOIN tempo_dia td ON td.aluno_id = b.aluno_id AND td.classe_id = b.classe_id AND td.dia = b.dia
     LEFT JOIN classe_aluno ca ON ca.aluno_id = b.aluno_id AND ca.classe_id = b.classe_id;"""

VW_METRICAS_ENGAJAMENTO_ALUNO_CLASSE = r""" WITH session_base AS (
         SELECT vw_metricas_sessoes_aluno_dia.dia,
            vw_metricas_sessoes_aluno_dia.aluno_id,
            vw_metricas_sessoes_aluno_dia.classe_id,
            vw_metricas_sessoes_aluno_dia.sessao_id,
            vw_metricas_sessoes_aluno_dia.tempo_sessao_seg,
            vw_metricas_sessoes_aluno_dia.tempo_ativo_seg,
            vw_metricas_sessoes_aluno_dia.tempo_ocioso_seg,
            vw_metricas_sessoes_aluno_dia.interacoes,
            vw_metricas_sessoes_aluno_dia.mensagens_chat,
            vw_metricas_sessoes_aluno_dia.aberturas_chat,
            vw_metricas_sessoes_aluno_dia.usou_chat
           FROM vw_metricas_sessoes_aluno_dia
        ), topic_events AS (
         SELECT e.aluno_id,
            e.classe_id,
            count(*) FILTER (WHERE e.event_name = 'topic_open'::text) AS topicos_iniciados,
            count(*) FILTER (WHERE e.event_name = 'topic_complete'::text) AS topicos_concluidos
           FROM telemetria_eventos_app e
          WHERE e.event_group = 'navigation'::text
          GROUP BY e.aluno_id, e.classe_id
        ), topic_opens AS (
         SELECT e.aluno_id,
            e.classe_id,
            e.sessao_id,
            e.topico_id,
            e.occurred_at,
            row_number() OVER (PARTITION BY e.aluno_id, e.classe_id, e.sessao_id, e.topico_id ORDER BY e.occurred_at) AS rn
           FROM telemetria_eventos_app e
          WHERE e.event_name = 'topic_open'::text AND e.topico_id IS NOT NULL
        ), topic_completes AS (
         SELECT e.aluno_id,
            e.classe_id,
            e.sessao_id,
            e.topico_id,
            e.occurred_at,
            row_number() OVER (PARTITION BY e.aluno_id, e.classe_id, e.sessao_id, e.topico_id ORDER BY e.occurred_at) AS rn
           FROM telemetria_eventos_app e
          WHERE e.event_name = 'topic_complete'::text AND e.topico_id IS NOT NULL
        ), topic_durations AS (
         SELECT o.aluno_id,
            o.classe_id,
            o.topico_id,
            COALESCE(EXTRACT(epoch FROM c.occurred_at - o.occurred_at), 0::numeric) AS tempo_conclusao_topico_seg
           FROM topic_opens o
             LEFT JOIN topic_completes c ON c.aluno_id = o.aluno_id AND c.classe_id = o.classe_id AND c.sessao_id = o.sessao_id AND c.topico_id = o.topico_id AND c.rn = o.rn
        ), topic_time_entries AS (
         SELECT telemetria_time_metric_entries.aluno_id,
            telemetria_time_metric_entries.classe_id,
            telemetria_time_metric_entries.topico_id,
            sum(telemetria_time_metric_entries.active_sec) AS tempo_ativo_seg
           FROM telemetria_time_metric_entries
          WHERE telemetria_time_metric_entries.scope = 'topic'::text AND telemetria_time_metric_entries.topico_id IS NOT NULL
          GROUP BY telemetria_time_metric_entries.aluno_id, telemetria_time_metric_entries.classe_id, telemetria_time_metric_entries.topico_id
        ), topic_time_lotes AS (
         SELECT l.aluno_id,
            t.classe_id,
            l.topico_id,
            sum(l.active_sec) AS tempo_ativo_seg
           FROM telemetria_lotes l
             JOIN topicos t ON t.id = l.topico_id
          WHERE l.topico_id IS NOT NULL
          GROUP BY l.aluno_id, t.classe_id, l.topico_id
        ), topic_time_union AS (
         SELECT e.aluno_id,
            e.classe_id,
            e.topico_id,
            e.tempo_ativo_seg
           FROM topic_time_entries e
        UNION ALL
         SELECT l.aluno_id,
            l.classe_id,
            l.topico_id,
            l.tempo_ativo_seg
           FROM topic_time_lotes l
          WHERE NOT (EXISTS ( SELECT 1
                   FROM topic_time_entries e
                  WHERE e.aluno_id = l.aluno_id AND e.classe_id = l.classe_id AND e.topico_id = l.topico_id))
        ), topic_time_metrics AS (
         SELECT topic_time_union.aluno_id,
            topic_time_union.classe_id,
            avg(topic_time_union.tempo_ativo_seg) AS tempo_medio_topico_seg
           FROM topic_time_union
          GROUP BY topic_time_union.aluno_id, topic_time_union.classe_id
        )
 SELECT sb.aluno_id,
    sb.classe_id,
    COALESCE(sum(sb.tempo_sessao_seg), 0::numeric) AS tempo_total_uso_seg,
    COALESCE(avg(sb.tempo_sessao_seg), 0::numeric) AS tempo_medio_sessao_seg,
    count(DISTINCT sb.sessao_id) AS numero_sessoes,
    COALESCE(count(DISTINCT sb.sessao_id)::numeric / NULLIF(count(DISTINCT sb.dia), 0)::numeric, 0::numeric) AS sessoes_por_dia,
    COALESCE(ttm.tempo_medio_topico_seg, 0::numeric) AS tempo_medio_topico_seg,
    COALESCE(count(DISTINCT sb.dia)::numeric / NULLIF(GREATEST(max(sb.dia) - min(sb.dia) + 1, 1), 0)::numeric * 100::numeric, 0::numeric) AS taxa_retorno_pct,
    COALESCE(( SELECT (count(*) - count(*) FILTER (WHERE ta.status::text = 'concluido'::text))::numeric / NULLIF(count(*), 0)::numeric * 100::numeric
           FROM topico_aluno ta
             JOIN topicos t_ab ON t_ab.id = ta.topico_id
          WHERE ta.aluno_id = sb.aluno_id AND t_ab.classe_id = sb.classe_id), 0::numeric) AS taxa_abandono_pct,
    COALESCE(( SELECT count(*) FILTER (WHERE ta.status::text = 'concluido'::text)::numeric / NULLIF(count(*), 0)::numeric * 100::numeric
           FROM topico_aluno ta
             JOIN topicos t_cc ON t_cc.id = ta.topico_id
          WHERE ta.aluno_id = sb.aluno_id AND t_cc.classe_id = sb.classe_id), 0::numeric) AS taxa_conclusao_topicos_pct,
    COALESCE(avg(sb.interacoes), 0::numeric) AS interacoes_por_sessao,
    COALESCE(avg(
        CASE
            WHEN sb.usou_chat THEN 1
            ELSE 0
        END) * 100::numeric, 0::numeric) AS taxa_uso_chat_pct,
    COALESCE(avg(td.tempo_conclusao_topico_seg), 0::numeric) AS tempo_medio_conclusao_topico_seg
   FROM session_base sb
     LEFT JOIN topic_events te ON te.aluno_id = sb.aluno_id AND te.classe_id = sb.classe_id
     LEFT JOIN topic_time_metrics ttm ON ttm.aluno_id = sb.aluno_id AND ttm.classe_id = sb.classe_id
     LEFT JOIN topic_durations td ON td.aluno_id = sb.aluno_id AND td.classe_id = sb.classe_id
  GROUP BY sb.aluno_id, sb.classe_id, te.topicos_iniciados, te.topicos_concluidos, ttm.tempo_medio_topico_seg;"""

VW_METRICAS_DISTRIBUICAO_TURMA_CLASSE = r""" WITH base AS (
         SELECT ca.classe_id,
            ca.aluno_id,
            COALESCE(ca."notaMedia", 0::numeric) AS nota_media,
            COALESCE(ca."porcentagemConcluida", 0::numeric) AS progresso_pct,
            COALESCE(eng.tempo_total_uso_seg, 0::numeric) AS tempo_uso_seg
           FROM classe_aluno ca
             LEFT JOIN vw_metricas_engajamento_aluno_classe eng ON eng.aluno_id = ca.aluno_id AND eng.classe_id = ca.classe_id
          WHERE ca.aluno_id IS NOT NULL
        ), faixas AS (
         SELECT base.classe_id,
            'nota_media'::text AS metrica,
                CASE
                    WHEN base.nota_media < 5::numeric THEN 'baixa'::text
                    WHEN base.nota_media < 7::numeric THEN 'media'::text
                    ELSE 'alta'::text
                END AS faixa
           FROM base
        UNION ALL
         SELECT base.classe_id,
            'tempo_uso'::text AS metrica,
                CASE
                    WHEN base.tempo_uso_seg < 1800::numeric THEN 'baixo'::text
                    WHEN base.tempo_uso_seg < 7200::numeric THEN 'medio'::text
                    ELSE 'alto'::text
                END AS faixa
           FROM base
        UNION ALL
         SELECT base.classe_id,
            'progresso'::text AS metrica,
                CASE
                    WHEN base.progresso_pct < 40::numeric THEN 'baixo'::text
                    WHEN base.progresso_pct < 80::numeric THEN 'medio'::text
                    ELSE 'alto'::text
                END AS faixa
           FROM base
        )
 SELECT classe_id,
    metrica,
    faixa,
    count(*) AS total_alunos,
    round(count(*)::numeric / NULLIF(sum(count(*)) OVER (PARTITION BY classe_id, metrica), 0::numeric) * 100::numeric, 2) AS percentual
   FROM faixas
  GROUP BY classe_id, metrica, faixa;"""

VW_METRICAS_TURMA_GERAL_CLASSE = r""" WITH base_alunos AS (
         SELECT DISTINCT ca.classe_id,
            ca.aluno_id
           FROM classe_aluno ca
          WHERE ca.aluno_id IS NOT NULL
        ), chat_after_error AS (
         SELECT e.classe_id,
            e.aluno_id,
            count(*) FILTER (WHERE e.event_group = 'chat'::text AND e.event_name = 'chat_message'::text) AS chat_messages_total,
            count(*) FILTER (WHERE e.event_group = 'chat'::text AND e.event_name = 'chat_message'::text AND COALESCE(e.trigger_context, 'unknown'::text) = 'after_error'::text) AS chat_messages_after_error
           FROM telemetria_eventos_app e
          GROUP BY e.classe_id, e.aluno_id
        )
 SELECT b.classe_id,
    count(DISTINCT b.aluno_id) AS total_alunos,
    COALESCE(avg(eng.tempo_total_uso_seg), 0::numeric) AS tempo_medio_uso_seg,
    COALESCE(avg(eng.numero_sessoes::numeric), 0::numeric) AS sessoes_medias_por_aluno,
    COALESCE(avg(eng.taxa_retorno_pct), 0::numeric) AS taxa_media_retorno_pct,
    COALESCE(avg(eng.taxa_abandono_pct), 0::numeric) AS taxa_media_abandono_pct,
    COALESCE(avg(eng.taxa_conclusao_topicos_pct), 0::numeric) AS taxa_media_conclusao_pct,
    COALESCE(avg(des.nota_media_desempenho), 0::numeric) AS media_nota_turma,
    COALESCE(avg(des.taxa_acertos_pct), 0::numeric) AS taxa_media_acertos_pct,
    COALESCE(avg(des.taxa_acertos_sem_erro_pct), 0::numeric) AS taxa_media_acertos_sem_erro_pct,
    COALESCE(avg(des.eficiencia_aprendizagem), 0::numeric) AS eficiencia_media_aprendizagem,
    COALESCE(avg(comp.media_tentativas_por_questao), 0::numeric) AS media_tentativas_por_questao,
    COALESCE(avg(
        CASE
            WHEN COALESCE(comp.revisitas_conteudo, 0::bigint) > 0 THEN 1
            ELSE 0
        END) * 100::numeric, 0::numeric) AS taxa_revisitas_pct,
    COALESCE(avg(
        CASE
            WHEN COALESCE(comp.interrupcoes_sessao, 0::bigint) > 0 THEN 1
            ELSE 0
        END) * 100::numeric, 0::numeric) AS taxa_interrupcoes_pct,
    COALESCE(avg(chat.frequencia_chat_por_sessao), 0::numeric) AS frequencia_chat_media_sessao,
    COALESCE(avg(eng.taxa_uso_chat_pct), 0::numeric) AS taxa_media_uso_chat_pct,
    COALESCE(avg(chat.tempo_chat_seg), 0::numeric) AS tempo_medio_chat_seg,
    COALESCE(sum(COALESCE(cae.chat_messages_after_error, 0::bigint)) / NULLIF(sum(COALESCE(cae.chat_messages_total, 0::bigint)), 0::numeric) * 100::numeric, 0::numeric) AS uso_chat_apos_erro_pct
   FROM base_alunos b
     LEFT JOIN vw_metricas_engajamento_aluno_classe eng ON eng.aluno_id = b.aluno_id AND eng.classe_id = b.classe_id
     LEFT JOIN vw_metricas_desempenho_aluno_classe des ON des.aluno_id = b.aluno_id AND des.classe_id = b.classe_id
     LEFT JOIN vw_metricas_comportamento_aluno_classe comp ON comp.aluno_id = b.aluno_id AND comp.classe_id = b.classe_id
     LEFT JOIN vw_metricas_chat_aluno_classe chat ON chat.aluno_id = b.aluno_id AND chat.classe_id = b.classe_id
     LEFT JOIN chat_after_error cae ON cae.aluno_id = b.aluno_id AND cae.classe_id = b.classe_id
  GROUP BY b.classe_id;"""

VW_METRICAS_TURMA_PERFIL_CLASSE = r""" WITH chat_after_error AS (
         SELECT e.classe_id,
            e.aluno_id,
            count(*) FILTER (WHERE e.event_group = 'chat'::text AND e.event_name = 'chat_message'::text) AS chat_messages_total,
            count(*) FILTER (WHERE e.event_group = 'chat'::text AND e.event_name = 'chat_message'::text AND COALESCE(e.trigger_context, 'unknown'::text) = 'after_error'::text) AS chat_messages_after_error
           FROM telemetria_eventos_app e
          GROUP BY e.classe_id, e.aluno_id
        )
 SELECT seg.classe_id,
    seg.segmento,
    seg.perfil_nome,
    count(DISTINCT seg.aluno_id) AS total_alunos_segmento,
    COALESCE(avg(eng.tempo_total_uso_seg), 0::numeric) AS tempo_medio_uso_seg,
    COALESCE(avg(eng.taxa_retorno_pct), 0::numeric) AS taxa_retorno_pct,
    COALESCE(avg(eng.taxa_abandono_pct), 0::numeric) AS taxa_abandono_pct,
    COALESCE(avg(eng.taxa_conclusao_topicos_pct), 0::numeric) AS taxa_conclusao_topicos_pct,
    COALESCE(avg(des.nota_media_desempenho), 0::numeric) AS media_nota,
    COALESCE(avg(des.taxa_acertos_pct), 0::numeric) AS taxa_acertos_pct,
    COALESCE(avg(des.taxa_acertos_sem_erro_pct), 0::numeric) AS taxa_acertos_sem_erro_pct,
    COALESCE(avg(des.eficiencia_aprendizagem), 0::numeric) AS eficiencia_aprendizagem,
    COALESCE(avg(comp.media_tentativas_por_questao), 0::numeric) AS media_tentativas_por_questao,
    COALESCE(avg(eng.taxa_uso_chat_pct), 0::numeric) AS taxa_uso_chat_pct,
    COALESCE(avg(chat.tempo_chat_seg), 0::numeric) AS tempo_chat_seg,
    COALESCE(sum(COALESCE(cae.chat_messages_after_error, 0::bigint)) / NULLIF(sum(COALESCE(cae.chat_messages_total, 0::bigint)), 0::numeric) * 100::numeric, 0::numeric) AS uso_chat_apos_erro_pct
   FROM vw_aluno_perfil_segmentos seg
     LEFT JOIN vw_metricas_engajamento_aluno_classe eng ON eng.aluno_id = seg.aluno_id AND eng.classe_id = seg.classe_id
     LEFT JOIN vw_metricas_desempenho_aluno_classe des ON des.aluno_id = seg.aluno_id AND des.classe_id = seg.classe_id
     LEFT JOIN vw_metricas_comportamento_aluno_classe comp ON comp.aluno_id = seg.aluno_id AND comp.classe_id = seg.classe_id
     LEFT JOIN vw_metricas_chat_aluno_classe chat ON chat.aluno_id = seg.aluno_id AND chat.classe_id = seg.classe_id
     LEFT JOIN chat_after_error cae ON cae.aluno_id = seg.aluno_id AND cae.classe_id = seg.classe_id
  GROUP BY seg.classe_id, seg.segmento, seg.perfil_nome;"""

# Em ordem de dependência.
VIEWS = (
    ("vw_aluno_perfil_segmentos", VW_ALUNO_PERFIL_SEGMENTOS),
    ("vw_metricas_sessoes_aluno_dia", VW_METRICAS_SESSOES_ALUNO_DIA),
    ("vw_metricas_chat_aluno_classe", VW_METRICAS_CHAT_ALUNO_CLASSE),
    ("vw_metricas_comportamento_aluno_classe", VW_METRICAS_COMPORTAMENTO_ALUNO_CLASSE),
    ("vw_metricas_desempenho_aluno_classe", VW_METRICAS_DESEMPENHO_ALUNO_CLASSE),
    ("vw_metricas_evolucao_desempenho_aluno_dia", VW_METRICAS_EVOLUCAO_DESEMPENHO_ALUNO_DIA),
    ("vw_metricas_engajamento_aluno_classe", VW_METRICAS_ENGAJAMENTO_ALUNO_CLASSE),
    ("vw_metricas_distribuicao_turma_classe", VW_METRICAS_DISTRIBUICAO_TURMA_CLASSE),
    ("vw_metricas_turma_geral_classe", VW_METRICAS_TURMA_GERAL_CLASSE),
    ("vw_metricas_turma_perfil_classe", VW_METRICAS_TURMA_PERFIL_CLASSE),
)


def _criar(nome: str, corpo: str) -> str:
    # O corpo termina com `;`; o CREATE recebe sem ele.
    return (
        f"CREATE OR REPLACE VIEW public.{nome} WITH (security_invoker = on) AS\n{corpo.rstrip().rstrip(';')};\n"
        f"REVOKE ALL ON public.{nome} FROM anon;\n"
        f"GRANT SELECT ON public.{nome} TO authenticated;\n"
    )


def upgrade() -> None:
    for nome, corpo in VIEWS:
        op.execute(_criar(nome, corpo))
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    # Ver o docstring: as dez existiam antes desta revisão.
    pass
