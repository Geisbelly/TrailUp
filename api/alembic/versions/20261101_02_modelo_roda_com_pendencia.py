"""O modelo de evasão também roda em semana sem evento, enquanto o aluno tiver o que fazer (F5)

## Por quê

A `20261101_01` limitou o modelo do core às semanas com pelo menos 1 evento: o painel de
validação do OULAD não tem semana com 0 cliques, e semana sem evento ficou com a regra de
inatividade. Decisão de 01/11 (Geisbelly): **com pendência, semana parada é justamente o sinal de
abandono**, e o modelo deve rodar. Sem nada pendente, a regra de inatividade continua.

Pendência, por matrícula:

- **conteúdo:** algum tópico da turma sem `topico_aluno` concluído;
- **missão:** ativa, aprovada (ou sem aprovação), na janela, para o perfil do aluno e não concluída.
  É a mesma elegibilidade do gatilho que avalia missões (`20261021_04`), copiada e não
  extraída, como ele mesmo pede;
- **evento:** evento da turma `aberto` agora.

Ressalva registrada: com 0 eventos na semana o modelo trabalha fora do trecho medido no OULAD (lá o
mínimo é 1 clique). A faixa nesse caso deve ser conferida no piloto. `risco_abandono_origem`
continua dizendo quem decidiu: `modelo` ou `inatividade`.

## Como

`CREATE OR REPLACE` só da `vw_metricas_engajamento_aluno_classe`: entra o CTE `pendencias` e a
condição do desvio para a inatividade. As colunas não mudam (nem nome, nem ordem, nem tipo), então as
views de turma e os GRANTs ficam como estão.

## Downgrade

Volta ao texto da `20261101_01`.

Revision ID: 20261101_02
Revises: 20261101_01
Create Date: 2026-11-01
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261101_02"
down_revision = "20261101_01"
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
), pendencias AS (
  -- Ainda há o que fazer na turma (decisão de 01/11). Com pendência, semana sem evento é o próprio
  -- sinal de abandono e o modelo roda; sem nada pendente, a faixa vem da inatividade.
  SELECT m.aluno_id, m.classe_id,
         (
           -- conteúdo: tópico da turma que o aluno ainda não concluiu
           EXISTS (
             SELECT 1 FROM public.topicos t
              WHERE t.classe_id = m.classe_id
                AND NOT EXISTS (
                      SELECT 1 FROM public.topico_aluno ta
                       WHERE ta.topico_id = t.id AND ta.aluno_id = m.aluno_id AND ta.status::text = 'concluido'))
           -- missão: elegível, na janela e não concluída (a mesma regra do gatilho, 20261021_04)
           OR EXISTS (
             SELECT 1 FROM public.missoes mi
              WHERE mi.classe_id = m.classe_id
                AND mi.ativa
                AND mi.aprovacao = ANY (ARRAY['nao_requer'::text, 'aprovada'::text])
                AND (mi.janela_inicio IS NULL OR mi.janela_inicio <= now())
                AND (mi.janela_fim IS NULL OR mi.janela_fim >= now())
                AND (mi.perfil_alvo IS NULL OR lower(mi.perfil_alvo) IN (
                      SELECT rep.nome
                        FROM (SELECT lower(p.nome) AS nome,
                                     COALESCE(ap.afinidade, 0) AS af,
                                     row_number() OVER (ORDER BY COALESCE(ap.afinidade, 0) DESC, p.nome ASC) AS pos
                                FROM public.aluno_perfil ap
                                JOIN public.perfil p ON p.id = ap.perfil_id
                               WHERE ap.aluno_id = m.aluno_id) rep
                       WHERE rep.af >= 20 OR (rep.af > 0 AND rep.pos <= 2)))
                AND NOT EXISTS (
                      SELECT 1 FROM public.missao_aluno ma
                       WHERE ma.aluno_id = m.aluno_id AND ma.missao_id = mi.id AND ma.status = 'concluida'))
           -- evento da turma aberto agora
           OR EXISTS (
             SELECT 1 FROM public.eventos_classe ev
              WHERE ev.classe_id = m.classe_id AND ev.status = 'aberto' AND ev.inicio <= now() AND ev.fim > now())
         ) AS tem_pendencia
    FROM matriculas m
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
         -- Semana sem evento E sem nada pendente: a faixa vem da inatividade (30 dias = alto, 7 = atenção).
         -- Com pendência (conteúdo, missão ou evento), o modelo roda mesmo com 0 eventos (decisão de 01/11).
         WHEN COALESCE(cl.semana, 0) = 0 AND NOT COALESCE(pe.tem_pendencia, false) THEN
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
            WHEN COALESCE(cl.semana, 0) = 0 AND NOT COALESCE(pe.tem_pendencia, false) THEN 'inatividade'
            ELSE 'modelo' END AS risco_abandono_origem
  FROM matriculas m
  LEFT JOIN sessoes s ON s.aluno_id = m.aluno_id AND s.classe_id = m.classe_id
  LEFT JOIN conclusoes c ON c.aluno_id = m.aluno_id AND c.classe_id = m.classe_id
  LEFT JOIN tempo_medio_topico tmt ON tmt.aluno_id = m.aluno_id AND tmt.classe_id = m.classe_id
  LEFT JOIN atividade a ON a.aluno_id = m.aluno_id AND a.classe_id = m.classe_id
  LEFT JOIN progresso p ON p.aluno_id = m.aluno_id AND p.classe_id = m.classe_id
  LEFT JOIN estagnacao est ON est.aluno_id = m.aluno_id AND est.classe_id = m.classe_id
  LEFT JOIN cliques cl ON cl.aluno_id = m.aluno_id AND cl.classe_id = m.classe_id
  LEFT JOIN entregas en ON en.aluno_id = m.aluno_id AND en.classe_id = m.classe_id
  LEFT JOIN pendencias pe ON pe.aluno_id = m.aluno_id AND pe.classe_id = m.classe_id;
"""


def _anterior():
    caminho = Path(__file__).with_name("20261101_01_colunas_antigas_e_modelo_so_com_evento.py")
    spec = importlib.util.spec_from_file_location("colunas_antigas_20261101_01", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def upgrade() -> None:
    op.execute(ENGAJAMENTO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(_anterior().ENGAJAMENTO)
    op.execute("NOTIFY pgrst, 'reload schema'")
