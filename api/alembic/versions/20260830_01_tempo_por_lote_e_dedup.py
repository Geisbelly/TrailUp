"""tempo derivado le dwell_sec como valor POR LOTE, e a dedup vira constraint

Corrige A1 e A5 da revisao de telemetria de ponta a ponta. As duas juntas, de
proposito -- a razao esta em "Por que a dedup vem junto", abaixo.

## O que estava errado

`20260826_19` e `20260827_02` leem `dwell_sec` como contador cumulativo por
(sessao, item) e somam os incrementos. Essa e a leitura certa de um contador
cumulativo, e ela estava certa para o dado que existia quando foi escrita.

So que o coletor nao produz mais um contador cumulativo. `runStudyBatchFlush`
troca o acumulador por `buildEmptyBatch(nowMs)` a cada flush, e `timeMetrics`
nasce vazio: cada lote carrega o tempo DAQUELE lote.

A premissa venceu por 3h47min:

    27 ago 14:41  6c1482e  o batch passa a ser zerado tambem quando o envio falha
    27 ago 18:28  8e8af81  20260826_19 assume dwell_sec cumulativo

Antes de `6c1482e` o acumulador so era zerado quando o envio dava CERTO. Cada
falha o deixava crescer, e os lotes seguintes reenviavam o total -- que e
exatamente a serie `0, 1, 2, 2, 2, 2` citada em `20260826_19`. A correcao matou
a fonte da cumulatividade; a analise das 34 sessoes foi feita sobre o dado
produzido antes dela.

## O tamanho do estrago

A regra de incremento aplicada a valores por lote:

    serie de dwell_sec                real   calculado   retido
    60,120,180,240,300 (a premissa)   300s        300s     100 por cento
    60,60,60,60,60     (hoje)         300s         60s      20 por cento
    60,59,61,60,58     (com jitter)   298s        239s      80 por cento
    60,60,25,60,60     (saiu/voltou)  265s        120s      45 por cento

Nao e so baixo: e instavel. O flush tem intervalo fixo de 60s, entao lotes de
valor repetido sao o caso COMUM -- e o ramo `ELSE 0`, mantido de proposito em
`20260827_02` como imunidade a lote duplicado, e justamente o que mais perde.
Duas sessoes iguais podem registrar 20 e 80 por cento conforme o arredondamento.

## Por que a dedup vem junto

`20260826_19` dizia: "nao ha deduplicacao nenhuma aqui -- a forma da conta ja
resolve". E resolvia: o `ELSE 0` engolia a duplicata por acidente. Trocar para
`sum()` sem antes deduplicar de verdade converteria a duplicata latente do
fallback (`telemetriaApi.ts` insere sem `ON CONFLICT`) em tempo inflado --
trocaria um erro para baixo por um para cima.

Por isso a chave unica entra ANTES de a funcao mudar, na mesma migracao.

## A chave

O coletor ja chaveia cada entrada por `key` (`topic:12`, `content:87`, o
proprio `materialKey`): e o campo que identifica a entrada dentro do lote, e
era descartado na gravacao. Ele passa a ser gravado em `entry_key`, e
`(lote_id, scope, entry_key)` e a identidade.

`item_key` NAO serve como chave. Entradas de escopo `topic` nascem com ele nulo
(`accumulateContextTime` passa so `{key, topicoId}`), e no Postgres NULL nao
colide com NULL: um unique sobre ele nao deduplicaria nada justamente no escopo
que alimenta o percentual do topico.

Quem preenche `entry_key` e o BANCO, estendendo o trigger que ja normaliza a
linha (`telemetria_resolver_entidade`, `20260826_17`). Nao e economia de
codigo: e o unico jeito de a dedup valer para os apps JA PUBLICADOS, que usam
o fallback direto ao Supabase e nunca vao mandar a coluna nova. Preencher no
cliente deixaria de fora exatamente o caminho que gera a duplicata.

O preenchimento vai no fim da funcao existente, e nao num segundo trigger,
porque ele depende de `topico_id`/`conteudo_id`/`atividade_id` ja resolvidos --
dois triggers BEFORE dariam ordem alfabetica como garantia, que nao e garantia
nenhuma.

Revision ID: 20260830_01
Revises: 20260829_03
Create Date: 2026-08-30
"""

from alembic import op

revision = "20260830_01"
down_revision = "20260829_03"
branch_labels = None
depends_on = None


# A mesma formula que o coletor usa para chavear o dicionario do lote
# (`accumulateContextTime`/`markContextVisit`). O ELSE final nunca funde duas
# linhas: sem como identificar a entrada, preservar e mais seguro que deduplicar
# no escuro.
EXPRESSAO_ENTRY_KEY = """
  CASE
    WHEN {alvo}.scope = 'topic'    AND {alvo}.topico_id    IS NOT NULL
      THEN 'topic:'    || {alvo}.topico_id::text
    WHEN {alvo}.scope = 'content'  AND {alvo}.conteudo_id  IS NOT NULL
      THEN 'content:'  || {alvo}.conteudo_id::text
    WHEN {alvo}.scope = 'activity' AND {alvo}.atividade_id IS NOT NULL
      THEN 'activity:' || {alvo}.atividade_id::text
    WHEN {alvo}.material_key IS NOT NULL THEN {alvo}.material_key
    WHEN {alvo}.item_key     IS NOT NULL THEN {alvo}.item_key
    ELSE 'row:' || {alvo}.id::text
  END
"""


FUNCAO_POR_LOTE = """
  -- `dwell_sec` e o tempo DAQUELE lote: o acumulador do app e substituido por
  -- um vazio a cada flush (`buildEmptyBatch`). A soma direta e a conta certa.
  --
  -- A imunidade a lote duplicado, que a regra de incremento dava de graca no
  -- ramo `ELSE 0`, agora vem da chave unica (lote_id, scope, entry_key):
  -- dedup de verdade, no ponto onde a duplicata entra, em vez de efeito
  -- colateral da forma da conta.
  SELECT COALESCE(round(sum(e.dwell_sec)::numeric / 60.0, 2), 0)
    FROM telemetria_time_metric_entries e
   WHERE e.aluno_id = p_aluno
     AND e.scope = p_scope
     AND (p_topico    IS NULL OR e.topico_id    = p_topico)
     AND (p_conteudo  IS NULL OR e.conteudo_id  = p_conteudo)
     AND (p_atividade IS NULL OR e.atividade_id = p_atividade)
"""


# Corpo de `20260827_02`, para o downgrade.
FUNCAO_CUMULATIVA = """
  SELECT COALESCE(round(sum(
           CASE WHEN d.anterior IS NULL       THEN d.dwell_sec
                WHEN d.dwell_sec > d.anterior THEN d.dwell_sec - d.anterior
                WHEN d.dwell_sec < d.anterior THEN d.dwell_sec
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
{corpo}
$fn$
"""


# `telemetria_resolver_entidade` de `20260826_17`, com o preenchimento de
# `entry_key` acrescentado no fim -- depois de os ids terem sido resolvidos.
TRIGGER_RESOLVER = """
CREATE OR REPLACE FUNCTION public.telemetria_resolver_entidade()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  v_id bigint;
BEGIN
  -- Preenche SO o que esta nulo: o que o cliente mandou tem precedencia,
  -- porque ele sabe do contexto que a chave nao carrega.
  IF NEW.conteudo_id IS NULL THEN
    v_id := public.telemetria_id_do_item_key(NEW.item_key, 'content');
    -- Confere existencia antes de atribuir: chave de material antigo pode
    -- apontar para conteudo ja removido, e gravar isso criaria referencia
    -- quebrada que so apareceria num JOIN silencioso.
    IF v_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM conteudos c WHERE c.id = v_id) THEN
      NEW.conteudo_id := v_id;
    END IF;
  END IF;

  IF NEW.atividade_id IS NULL THEN
    v_id := public.telemetria_id_do_item_key(NEW.item_key, 'activity');
    IF v_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM atividades a WHERE a.id = v_id) THEN
      NEW.atividade_id := v_id;
    END IF;
  END IF;

  IF NEW.topico_id IS NULL THEN
    v_id := public.telemetria_id_do_item_key(NEW.item_key, 'topic');
    IF v_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM topicos t WHERE t.id = v_id) THEN
      NEW.topico_id := v_id;
    END IF;
  END IF;

  -- Identidade da entrada dentro do lote. Derivada aqui, e nao no cliente,
  -- para valer tambem para os apps ja publicados, que escrevem direto no
  -- Supabase pelo fallback e nunca vao mandar esta coluna. `id` ainda nao
  -- existe num BEFORE INSERT, entao o ELSE final usa a propria chave do
  -- cliente; se nem ela houver, um valor unico por linha, que preserva em vez
  -- de fundir.
  IF NEW.entry_key IS NULL THEN
    NEW.entry_key := CASE
      WHEN NEW.scope = 'topic'    AND NEW.topico_id    IS NOT NULL
        THEN 'topic:'    || NEW.topico_id::text
      WHEN NEW.scope = 'content'  AND NEW.conteudo_id  IS NOT NULL
        THEN 'content:'  || NEW.conteudo_id::text
      WHEN NEW.scope = 'activity' AND NEW.atividade_id IS NOT NULL
        THEN 'activity:' || NEW.atividade_id::text
      WHEN NEW.material_key IS NOT NULL THEN NEW.material_key
      WHEN NEW.item_key     IS NOT NULL THEN NEW.item_key
      ELSE 'row:' || gen_random_uuid()::text
    END;
  END IF;

  RETURN NEW;
END;
$fn$
"""


TRIGGER_RESOLVER_ANTIGO = """
CREATE OR REPLACE FUNCTION public.telemetria_resolver_entidade()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  v_id bigint;
BEGIN
  IF NEW.conteudo_id IS NULL THEN
    v_id := public.telemetria_id_do_item_key(NEW.item_key, 'content');
    IF v_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM conteudos c WHERE c.id = v_id) THEN
      NEW.conteudo_id := v_id;
    END IF;
  END IF;

  IF NEW.atividade_id IS NULL THEN
    v_id := public.telemetria_id_do_item_key(NEW.item_key, 'activity');
    IF v_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM atividades a WHERE a.id = v_id) THEN
      NEW.atividade_id := v_id;
    END IF;
  END IF;

  IF NEW.topico_id IS NULL THEN
    v_id := public.telemetria_id_do_item_key(NEW.item_key, 'topic');
    IF v_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM topicos t WHERE t.id = v_id) THEN
      NEW.topico_id := v_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$
"""


INDICE = "uq_telemetria_time_metric_entries_lote_entrada"


# Recalcula o que ja esta gravado. Sem isto o valor errado -- a maior parte do
# tempo do aluno faltando -- fica no banco ate ele voltar ao item.
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
    # ------------------------------------------------------------------
    # 1. A chave: coluna, historico, e o trigger que passa a preenche-la
    # ------------------------------------------------------------------
    op.execute(
        "ALTER TABLE telemetria_time_metric_entries "
        "ADD COLUMN IF NOT EXISTS entry_key TEXT"
    )
    op.execute(
        f"""
        UPDATE telemetria_time_metric_entries e
           SET entry_key = {EXPRESSAO_ENTRY_KEY.format(alvo="e")}
         WHERE e.entry_key IS NULL
        """
    )
    op.execute(TRIGGER_RESOLVER)

    # ------------------------------------------------------------------
    # 2. Remove as duplicatas ja gravadas, antes de a chave existir
    # ------------------------------------------------------------------
    # Mantem a de menor `id` -- a primeira que chegou. As duplicatas vieram de
    # reenvio do mesmo lote, entao as linhas sao iguais e a escolha nao muda o
    # valor; fixar um criterio so torna a migracao reproduzivel.
    op.execute(
        """
        DELETE FROM telemetria_time_metric_entries e
         USING telemetria_time_metric_entries primeira
         WHERE e.lote_id   = primeira.lote_id
           AND e.scope     = primeira.scope
           AND e.entry_key = primeira.entry_key
           AND e.id        > primeira.id
        """
    )
    op.execute(
        f"""
        CREATE UNIQUE INDEX IF NOT EXISTS {INDICE}
          ON telemetria_time_metric_entries (lote_id, scope, entry_key)
        """
    )

    # ------------------------------------------------------------------
    # 3. So agora a conta muda, com a duplicata ja impossivel
    # ------------------------------------------------------------------
    op.execute(ASSINATURA.format(corpo=FUNCAO_POR_LOTE))
    for sql in REBACKFILL:
        op.execute(sql)


def downgrade() -> None:
    op.execute(ASSINATURA.format(corpo=FUNCAO_CUMULATIVA))
    op.execute(f"DROP INDEX IF EXISTS {INDICE}")
    op.execute(TRIGGER_RESOLVER_ANTIGO)
    # `entry_key` fica. Dropar a coluna descartaria a chave de linhas que o
    # upgrade seguinte teria de reconstruir, e uma coluna a mais nao atrapalha
    # a regra antiga, que nao a le.
    for sql in REBACKFILL:
        op.execute(sql)
