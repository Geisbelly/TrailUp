"""tempo_gasto_min derivado da telemetria, lendo dwell_sec como o contador que ele e

Fecha a issue #42.

O contador do app divergia da telemetria em ate 29x, mas o numero sozinho nao
decidia nada — duas fontes podem medir coisas diferentes e as duas estarem
certas. O que decidiu foi a inconsistencia INTERNA:

    topico 125            tempo_gasto_min = 0,84 min
      └ conteudo 174      tempo_gasto_min = 6,39 min

Um topico nao pode ter menos tempo que um conteudo dentro dele. E o conteudo 177
marcava zero com 6,52 min medidos. O contador nao fecha consigo mesmo, entao nao
serve como fonte. Ele era acumulado por leitura-soma-escrita no cliente: a base
podia estar velha, a escrita que falhava so virava `console.warn` e aquele
intervalo se perdia, e o do topico so era incrementado nos caminhos que chamavam
`registrarTempoTopico` — dai ficar 29x fora enquanto o do conteudo ficava 3,7x.

## O achado que muda a conta

`dwell_sec` **nao e o tempo daquele lote. E um contador cumulativo** por
(sessao, item), reenviado a cada lote. A serie de uma sessao real:

    dwell = 0, 1, 2, 2, 2, 2, 2, 2 ...   enquanto o relogio da sessao ia 0..7

Somar as linhas multiplica o tempo pelo numero de lotes. E nao e teoria: em
**15 das 34 sessoes** com telemetria de topico, a soma das linhas dava MAIS que
o relogio da propria sessao (`study_elapsed_sec`) — fisicamente impossivel.

Isto tambem explica o mistério da issue #43, onde `topic`, `content` e
`material` apareciam com o mesmo valor dentro de um lote: nao eram tres escopos
contando o mesmo tempo, era cada um reportando o proprio acumulado.

A leitura correta de um contador cumulativo e a **soma dos incrementos
positivos**, com a primeira leitura valendo por inteiro:

    passo = CASE WHEN nao ha anterior THEN dwell
                 WHEN dwell > anterior THEN dwell - anterior
                 ELSE 0 END

O `ELSE 0` cobre reset do contador sem inventar tempo, e faz a regra ser imune a
lote duplicado de graca: duas leituras do mesmo acumulado dao incremento zero.
Nao ha, portanto, deduplicacao nenhuma aqui — a forma da conta ja resolve.

Conferido contra o relogio da sessao, que e independente desta tabela:

    | regra                     | sessoes impossiveis | contencao topico>conteudo |
    | soma das linhas (ingenua) | 15 de 34            | invertida                 |
    | maximo por sessao         | 0 de 34             | invertida                 |
    | soma dos incrementos      | 1 de 34             | correta                   |

O maximo zera as impossiveis mas perde o tempo anterior a cada reset, e por isso
deixa o conteudo maior que o topico que o contem. A soma dos incrementos e a
unica que fecha nas duas pontas.

## Duas escolhas menores

**`dwell_sec`, nao `active_sec`.** `IDLE_THRESHOLD_MS` no mobile e 15s: quem le
um texto longo sem tocar a tela vira ocioso, e `active_sec` subestimaria leitura
justo num app de estudo. O repo ja decidiu no mesmo sentido uma vez
(`test_tempo_min_usa_dwell_nao_active`). `active_sec` continua disponivel para
quem quiser engajamento.

**So UPDATE, nunca INSERT.** Criar a linha de `conteudo_aluno` aqui inventaria
um item "iniciado" que ninguem iniciou; a linha ja existe assim que o aluno
interage.

Revision ID: 20260826_19
Revises: 20260826_18
Create Date: 2026-08-27
"""

from alembic import op

revision = "20260826_19"
down_revision = "20260826_18"
branch_labels = None
depends_on = None

ESCOPOS = (
    ("topic", "topico_id"),
    ("content", "conteudo_id"),
    ("activity", "atividade_id"),
)


def upgrade() -> None:
    # A derivacao filtra por (aluno, escopo, entidade) a cada recalculo. Sem
    # indice isso vira varredura da tabela que mais cresce no sistema.
    for _, coluna in ESCOPOS:
        op.execute(
            f"""
            CREATE INDEX IF NOT EXISTS telemetria_tme_{coluna}_tempo_idx
              ON telemetria_time_metric_entries (aluno_id, scope, {coluna})
             WHERE {coluna} IS NOT NULL
            """
        )

    op.execute(
        "DROP FUNCTION IF EXISTS "
        "public.trailup_tempo_telemetria_min(uuid, text, bigint, bigint, bigint)"
    )
    op.execute(
        """
        CREATE FUNCTION public.trailup_tempo_telemetria_min(
          p_aluno uuid, p_scope text,
          p_topico bigint, p_conteudo bigint, p_atividade bigint
        )
        RETURNS numeric LANGUAGE sql STABLE
        SET search_path = public, pg_temp AS $fn$
          -- `dwell_sec` e um contador CUMULATIVO por (sessao, item), reenviado
          -- a cada lote. Somar as linhas multiplicaria o tempo pelo numero de
          -- lotes; o que vale e o incremento entre leituras consecutivas.
          SELECT COALESCE(round(sum(
                   CASE WHEN d.anterior IS NULL        THEN d.dwell_sec
                        WHEN d.dwell_sec > d.anterior  THEN d.dwell_sec - d.anterior
                        -- Contador reiniciado, ou lote duplicado reenviando a
                        -- mesma leitura: nos dois casos nao houve tempo novo.
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
        $fn$
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.trailup_tempo_after_telemetria()
        RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = public, pg_temp AS $fn$
        BEGIN
          UPDATE topico_aluno ta
             SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
                   ta.aluno_id, 'topic', ta.topico_id, NULL, NULL),
                 updated_at = now()
           WHERE EXISTS (
             SELECT 1 FROM novas n
              WHERE n.aluno_id = ta.aluno_id AND n.topico_id = ta.topico_id
                AND n.scope = 'topic'
           );

          UPDATE conteudo_aluno ca
             SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
                   ca.aluno_id, 'content', NULL, ca.conteudo_id, NULL),
                 updated_at = now()
           WHERE EXISTS (
             SELECT 1 FROM novas n
              WHERE n.aluno_id = ca.aluno_id AND n.conteudo_id = ca.conteudo_id
                AND n.scope = 'content'
           );

          UPDATE atividade_aluno aa
             SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
                   aa.aluno_id, 'activity', NULL, NULL, aa.atividade_id),
                 updated_at = now()
           WHERE EXISTS (
             SELECT 1 FROM novas n
              WHERE n.aluno_id = aa.aluno_id AND n.atividade_id = aa.atividade_id
                AND n.scope = 'activity'
           );

          RETURN NULL;
        END;
        $fn$
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_telemetria_tempo_gasto
          ON telemetria_time_metric_entries
        """
    )
    # Por STATEMENT, nao por linha: um lote insere dezenas de linhas de uma vez,
    # e recalcular a cada uma refaria a mesma soma dezenas de vezes.
    op.execute(
        """
        CREATE TRIGGER trg_telemetria_tempo_gasto
          AFTER INSERT ON telemetria_time_metric_entries
          REFERENCING NEW TABLE AS novas
          FOR EACH STATEMENT EXECUTE FUNCTION public.trailup_tempo_after_telemetria()
        """
    )

    # ------------------------------------------------------------------
    # Backfill: sem isto o contador quebrado fica na tela ate o aluno voltar
    # ao item.
    # ------------------------------------------------------------------
    op.execute(
        """
        UPDATE topico_aluno ta
           SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
                 ta.aluno_id, 'topic', ta.topico_id, NULL, NULL)
         WHERE EXISTS (
           SELECT 1 FROM telemetria_time_metric_entries e
            WHERE e.aluno_id = ta.aluno_id AND e.topico_id = ta.topico_id
              AND e.scope = 'topic'
         )
        """
    )
    op.execute(
        """
        UPDATE conteudo_aluno ca
           SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
                 ca.aluno_id, 'content', NULL, ca.conteudo_id, NULL)
         WHERE EXISTS (
           SELECT 1 FROM telemetria_time_metric_entries e
            WHERE e.aluno_id = ca.aluno_id AND e.conteudo_id = ca.conteudo_id
              AND e.scope = 'content'
         )
        """
    )
    op.execute(
        """
        UPDATE atividade_aluno aa
           SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
                 aa.aluno_id, 'activity', NULL, NULL, aa.atividade_id)
         WHERE EXISTS (
           SELECT 1 FROM telemetria_time_metric_entries e
            WHERE e.aluno_id = aa.aluno_id AND e.atividade_id = aa.atividade_id
              AND e.scope = 'activity'
         )
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS trg_telemetria_tempo_gasto "
        "ON telemetria_time_metric_entries"
    )
    op.execute("DROP FUNCTION IF EXISTS public.trailup_tempo_after_telemetria()")
    op.execute(
        "DROP FUNCTION IF EXISTS "
        "public.trailup_tempo_telemetria_min(uuid, text, bigint, bigint, bigint)"
    )
    for _, coluna in ESCOPOS:
        op.execute(f"DROP INDEX IF EXISTS telemetria_tme_{coluna}_tempo_idx")
    # Os valores derivados NAO sao revertidos: o contador antigo nao existe mais
    # em lugar nenhum para ser restaurado, e ele era o dado errado.
