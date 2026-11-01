"""Tempo de uso sem fan-out, tempo ativo de uma fonte só e dia no fuso de Brasília (F5, Task 2)

Faz a I16 passar: o tempo de uso da view de engajamento passa a ser igual à soma das sessões.

## O que estava errado (medido em produção em 31/10, só leitura)

- **Fan-out.** `vw_metricas_engajamento_aluno_classe` fazia `LEFT JOIN topic_durations`, uma linha por
  abertura de tópico, **antes** de `sum(sb.tempo_sessao_seg)`. Cada sessão era somada uma vez por
  abertura. A I16 acusava 3 de 3 pares aluno × turma, com o tempo de uso valendo **6, 81 e 10 vezes** a
  soma das sessões. Pelo mesmo motivo, `interacoes_por_sessao` e `taxa_uso_chat_pct` eram médias
  ponderadas pelo número de aberturas.
- **Fuso.** `vw_metricas_sessoes_aluno_dia` cortava o dia com `date(s.started_at)`, em UTC: estudo das
  21h à meia-noite de Brasília caía no dia seguinte.
- **Duas fontes de tempo ativo.** Quando a sessão não tinha linha em
  `telemetria_time_metric_entries`, o tempo ativo vinha de `telemetria_lotes`. D-1 e a F4a
  (`20261030_01`) fixaram uma fonte só: `active_sec` do escopo `topic`.
- **Zero no lugar de "sem dado".** Médias e tempos terminavam em `COALESCE(..., 0)`.
- **Tempo de conclusão de tópico ~1 s.** Toda abertura sem conclusão entrava como 0 na média.

## O que muda

- **`vw_metricas_sessoes_aluno_dia`:**
  - `dia` é a data de Brasília;
  - `tempo_ativo_seg` e `tempo_ocioso_seg` vêm só do escopo `topic`, e ficam `NULL` quando a sessão
    não tem linha de tempo;
  - `tempo_sessao_seg` (o app aberto, "presença") não muda, porque é o denominador da I16.
- **`vw_metricas_engajamento_aluno_classe`:**
  - cada fonte é agregada por `(aluno, turma)` **antes** do join;
  - `tempo_medio_conclusao_topico_seg` só conta aberturas com conclusão;
  - `tempo_medio_topico_seg` vem só do escopo `topic`;
  - médias e taxas sem observação ficam `NULL`;
  - entra `tempo_ativo_seg`, no fim da lista.

As colunas e os tipos de hoje continuam no mesmo lugar: `CREATE OR REPLACE` mantém as views
dependentes (`turma_geral`, `turma_perfil`, `distribuicao_turma`) de pé. `taxa_retorno_pct` e
`taxa_abandono_pct` continuam com a definição antiga, sem o zero falso: elas saem na Task 3.

## Downgrade

Volta ao corpo de produção da `20261031_03`, com fan-out e tudo, porque é o estado anterior.

Revision ID: 20261031_04
Revises: 20261031_03
Create Date: 2026-10-31
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261031_04"
down_revision = "20261031_03"
branch_labels = None
depends_on = None


SESSOES = r"""
CREATE OR REPLACE VIEW public.vw_metricas_sessoes_aluno_dia WITH (security_invoker = on) AS
WITH session_lotes AS (
  SELECT s.id AS sessao_id,
         s.aluno_id,
         s.classe_id,
         (s.started_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
         COALESCE(EXTRACT(epoch FROM COALESCE(s.ended_at, max(l.captured_at), s.started_at) - s.started_at), 0::numeric)
           AS tempo_sessao_raw_seg,
         COALESCE(sum(l.screen_dwell_sec), 0::numeric) AS tempo_dwell_lotes_seg
    FROM public.telemetria_sessoes s
    LEFT JOIN public.telemetria_lotes l ON l.sessao_id = s.id
   GROUP BY s.id, s.aluno_id, s.classe_id, s.started_at, s.ended_at
), session_time_entries AS (
  -- Uma fonte de tempo ativo (D-1): o escopo `topic`. Somar os quatro escopos contaria o mesmo
  -- intervalo até quatro vezes (o aninhamento é inclusivo).
  SELECT e.sessao_id,
         sum(e.active_sec) AS tempo_ativo_seg,
         sum(e.idle_sec) AS tempo_ocioso_seg,
         sum(e.dwell_sec) AS tempo_dwell_seg
    FROM public.telemetria_time_metric_entries e
   WHERE e.scope = 'topic'
   GROUP BY e.sessao_id
), session_events AS (
  SELECT e.sessao_id,
         count(*) FILTER (WHERE e.event_group = 'interaction') AS interacoes,
         count(*) FILTER (WHERE e.event_group = 'chat' AND e.event_name = 'chat_message') AS mensagens_chat,
         count(*) FILTER (WHERE e.event_group = 'chat' AND e.event_name = 'chat_open') AS aberturas_chat,
         bool_or(e.event_group = 'chat') AS usou_chat
    FROM public.telemetria_eventos_app e
   GROUP BY e.sessao_id
)
SELECT sl.dia,
       sl.aluno_id,
       sl.classe_id,
       sl.sessao_id,
       COALESCE(NULLIF(sl.tempo_sessao_raw_seg, 0::numeric), NULLIF(ste.tempo_dwell_seg, 0::numeric),
                sl.tempo_dwell_lotes_seg, 0::numeric) AS tempo_sessao_seg,
       ste.tempo_ativo_seg::numeric AS tempo_ativo_seg,
       ste.tempo_ocioso_seg::numeric AS tempo_ocioso_seg,
       COALESCE(se.interacoes, 0::bigint) AS interacoes,
       COALESCE(se.mensagens_chat, 0::bigint) AS mensagens_chat,
       COALESCE(se.aberturas_chat, 0::bigint) AS aberturas_chat,
       COALESCE(se.usou_chat, false) AS usou_chat
  FROM session_lotes sl
  LEFT JOIN session_time_entries ste ON ste.sessao_id = sl.sessao_id
  LEFT JOIN session_events se ON se.sessao_id = sl.sessao_id;
"""

ENGAJAMENTO = r"""
CREATE OR REPLACE VIEW public.vw_metricas_engajamento_aluno_classe WITH (security_invoker = on) AS
WITH sessoes AS (
  -- Uma linha por (aluno, turma) ANTES de qualquer join: é o que acaba com o fan-out (I16).
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
  -- Só abertura que terminou em conclusão: abertura sem conclusão não é "0 s para concluir".
  SELECT o.aluno_id, o.classe_id,
         avg(EXTRACT(epoch FROM c.occurred_at - o.occurred_at)) AS tempo_medio_conclusao_topico_seg
    FROM topic_opens o
    JOIN topic_completes c
      ON c.aluno_id = o.aluno_id AND c.classe_id = o.classe_id AND c.sessao_id = o.sessao_id
     AND c.topico_id = o.topico_id AND c.rn = o.rn
   GROUP BY o.aluno_id, o.classe_id
), tempo_por_topico AS (
  SELECT x.aluno_id, x.classe_id, avg(x.tempo_ativo_seg) AS tempo_medio_topico_seg
    FROM (
      SELECT e.aluno_id, e.classe_id, e.topico_id, sum(e.active_sec) AS tempo_ativo_seg
        FROM public.telemetria_time_metric_entries e
       WHERE e.scope = 'topic' AND e.topico_id IS NOT NULL
       GROUP BY e.aluno_id, e.classe_id, e.topico_id
    ) x
   GROUP BY x.aluno_id, x.classe_id
), progresso AS (
  SELECT ta.aluno_id, t.classe_id,
         count(*) AS topicos_com_linha,
         count(*) FILTER (WHERE ta.status::text = 'concluido') AS topicos_concluidos
    FROM public.topico_aluno ta
    JOIN public.topicos t ON t.id = ta.topico_id
   GROUP BY ta.aluno_id, t.classe_id
)
SELECT s.aluno_id,
       s.classe_id,
       s.tempo_total_uso_seg::numeric AS tempo_total_uso_seg,
       s.tempo_medio_sessao_seg::numeric AS tempo_medio_sessao_seg,
       s.numero_sessoes::bigint AS numero_sessoes,
       (s.numero_sessoes::numeric / NULLIF(s.dias_com_sessao, 0)::numeric)::numeric AS sessoes_por_dia,
       tp.tempo_medio_topico_seg::numeric AS tempo_medio_topico_seg,
       -- Definição antiga, sem o zero falso; sai na Task 3 (retorno semanal).
       (s.dias_com_sessao::numeric / GREATEST(s.ultimo_dia - s.primeiro_dia + 1, 1)::numeric * 100::numeric)::numeric
         AS taxa_retorno_pct,
       -- Definição antiga, sem o zero falso; sai na Task 3 (inatividade, estagnação e evasão).
       ((p.topicos_com_linha - p.topicos_concluidos)::numeric / NULLIF(p.topicos_com_linha, 0)::numeric * 100::numeric)::numeric
         AS taxa_abandono_pct,
       (p.topicos_concluidos::numeric / NULLIF(p.topicos_com_linha, 0)::numeric * 100::numeric)::numeric
         AS taxa_conclusao_topicos_pct,
       s.interacoes_por_sessao::numeric AS interacoes_por_sessao,
       s.taxa_uso_chat_pct::numeric AS taxa_uso_chat_pct,
       c.tempo_medio_conclusao_topico_seg::numeric AS tempo_medio_conclusao_topico_seg,
       s.tempo_ativo_seg::numeric AS tempo_ativo_seg
  FROM sessoes s
  LEFT JOIN conclusoes c ON c.aluno_id = s.aluno_id AND c.classe_id = s.classe_id
  LEFT JOIN tempo_por_topico tp ON tp.aluno_id = s.aluno_id AND tp.classe_id = s.classe_id
  LEFT JOIN progresso p ON p.aluno_id = s.aluno_id AND p.classe_id = s.classe_id;
"""

GRANTS = """
REVOKE ALL ON public.vw_metricas_sessoes_aluno_dia FROM anon;
GRANT SELECT ON public.vw_metricas_sessoes_aluno_dia TO authenticated;
REVOKE ALL ON public.vw_metricas_engajamento_aluno_classe FROM anon;
GRANT SELECT ON public.vw_metricas_engajamento_aluno_classe TO authenticated;
"""


def _anterior():
    """O corpo de produção, da `20261031_03`: é o estado ao qual o downgrade volta."""
    caminho = Path(__file__).with_name("20261031_03_views_de_metricas_no_alembic.py")
    spec = importlib.util.spec_from_file_location("views_de_metricas_20261031_03", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def upgrade() -> None:
    op.execute(SESSOES)
    op.execute(ENGAJAMENTO)
    op.execute(GRANTS)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    anterior = _anterior()
    # A coluna `tempo_ativo_seg` não existia: CREATE OR REPLACE não remove coluna, então derruba e
    # recria a família, na ordem da `20261031_03`.
    op.execute(
        "DROP VIEW IF EXISTS public.vw_metricas_turma_perfil_classe, public.vw_metricas_turma_geral_classe, "
        "public.vw_metricas_distribuicao_turma_classe, public.vw_metricas_engajamento_aluno_classe"
    )
    for nome, corpo in anterior.VIEWS:
        if nome in (
            "vw_metricas_sessoes_aluno_dia",
            "vw_metricas_engajamento_aluno_classe",
            "vw_metricas_distribuicao_turma_classe",
            "vw_metricas_turma_geral_classe",
            "vw_metricas_turma_perfil_classe",
        ):
            op.execute(anterior._criar(nome, corpo))
    op.execute("NOTIFY pgrst, 'reload schema'")
