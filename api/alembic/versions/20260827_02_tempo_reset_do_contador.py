"""tempo derivado: separa reset do contador de leitura repetida

Corrige um defeito de `20260826_19` (issue #42), pego pelo E2E.

Aquela migracao trata `dwell_sec` como o contador cumulativo que ele e, e soma
os incrementos entre leituras. Mas ela colapsava DOIS casos diferentes no mesmo
`ELSE 0`:

    leitura repetida   180 -> 180   duplicata: nao houve tempo novo    -> 0
    contador reiniciado 180 ->  60   novo trecho de 60s                 -> 60

O comentario de la dizia "o ELSE 0 cobre reset do contador sem inventar tempo".
Cobria pela metade: nao inventava, mas descartava o trecho inteiro depois de
cada reinicio. E o mesmo defeito que eu havia rejeitado na regra do maximo, so
que na outra ponta da serie.

Sequencia do E2E que expoe: leituras 120, 180, 180 (duplicata), 60.

    esperado   2min + 1min + 0 + 1min = 4,00 min
    obtido                                3,00 min

A regra completa de um contador cumulativo com reset:

    sem leitura anterior  -> vale por inteiro     (comeco da serie)
    subiu                 -> vale o incremento
    caiu                  -> vale por inteiro     (a serie recomecou)
    igual                 -> vale zero            (mesma leitura reenviada)

A imunidade a lote duplicado continua vindo de graca do ramo `igual`.

Revision ID: 20260827_02
Revises: 20260827_01
Create Date: 2026-08-27
"""

from alembic import op

revision = "20260827_02"
down_revision = "20260827_01"
branch_labels = None
depends_on = None


CORPO_NOVO = """
  SELECT COALESCE(round(sum(
           CASE WHEN d.anterior IS NULL       THEN d.dwell_sec
                WHEN d.dwell_sec > d.anterior THEN d.dwell_sec - d.anterior
                -- Contador reiniciado: a serie recomecou, e a leitura inteira e
                -- tempo novo. Descartar aqui era o bug.
                WHEN d.dwell_sec < d.anterior THEN d.dwell_sec
                -- Leitura identica: lote duplicado reenviando o mesmo
                -- acumulado. Nao houve tempo novo.
                ELSE 0
           END
         )::numeric / 60.0, 2), 0)
    FROM (
      SELECT e.dwell_sec,
             lag(e.dwell_sec) OVER (
               PARTITION BY e.sessao_id, e.item_key
               ORDER BY e.captured_at, e.id
             ) AS anterior
        FROM telemetria_time_metric_entries e
       WHERE e.aluno_id = p_aluno
         AND e.scope = p_scope
         AND (p_topico    IS NULL OR e.topico_id    = p_topico)
         AND (p_conteudo  IS NULL OR e.conteudo_id  = p_conteudo)
         AND (p_atividade IS NULL OR e.atividade_id = p_atividade)
    ) d
"""

CORPO_ANTIGO = """
  SELECT COALESCE(round(sum(
           CASE WHEN d.anterior IS NULL        THEN d.dwell_sec
                WHEN d.dwell_sec > d.anterior  THEN d.dwell_sec - d.anterior
                ELSE 0
           END
         )::numeric / 60.0, 2), 0)
    FROM (
      SELECT e.dwell_sec,
             lag(e.dwell_sec) OVER (
               PARTITION BY e.sessao_id, e.item_key
               ORDER BY e.captured_at, e.id
             ) AS anterior
        FROM telemetria_time_metric_entries e
       WHERE e.aluno_id = p_aluno
         AND e.scope = p_scope
         AND (p_topico    IS NULL OR e.topico_id    = p_topico)
         AND (p_conteudo  IS NULL OR e.conteudo_id  = p_conteudo)
         AND (p_atividade IS NULL OR e.atividade_id = p_atividade)
    ) d
"""

ASSINATURA = """
CREATE OR REPLACE FUNCTION public.trailup_tempo_telemetria_min(
  p_aluno uuid, p_scope text,
  p_topico bigint, p_conteudo bigint, p_atividade bigint
)
RETURNS numeric LANGUAGE sql STABLE
SET search_path = public, pg_temp AS $fn$
%s
$fn$
"""

# Recalcula o que ja esta gravado. Sem isto o valor antigo, com o trecho
# pos-reset faltando, fica no banco ate o aluno voltar ao item.
REBACKFILL = (
    """
    UPDATE topico_aluno ta
       SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
             ta.aluno_id, 'topic', ta.topico_id, NULL, NULL)
     WHERE EXISTS (
       SELECT 1 FROM telemetria_time_metric_entries e
        WHERE e.aluno_id = ta.aluno_id AND e.topico_id = ta.topico_id
          AND e.scope = 'topic')
    """,
    """
    UPDATE conteudo_aluno ca
       SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
             ca.aluno_id, 'content', NULL, ca.conteudo_id, NULL)
     WHERE EXISTS (
       SELECT 1 FROM telemetria_time_metric_entries e
        WHERE e.aluno_id = ca.aluno_id AND e.conteudo_id = ca.conteudo_id
          AND e.scope = 'content')
    """,
    """
    UPDATE atividade_aluno aa
       SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
             aa.aluno_id, 'activity', NULL, NULL, aa.atividade_id)
     WHERE EXISTS (
       SELECT 1 FROM telemetria_time_metric_entries e
        WHERE e.aluno_id = aa.aluno_id AND e.atividade_id = aa.atividade_id
          AND e.scope = 'activity')
    """,
)


def upgrade() -> None:
    op.execute(ASSINATURA % CORPO_NOVO)
    for sql in REBACKFILL:
        op.execute(sql)


def downgrade() -> None:
    op.execute(ASSINATURA % CORPO_ANTIGO)
    for sql in REBACKFILL:
        op.execute(sql)
