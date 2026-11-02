"""KPIs operacionais agregados da fila de personalização: latência, falha, reprocessamento (#14)

## Por quê

A observabilidade por job já existe (`GET /personalizar/jobs`), mas para saber se a fila está piorando
alguém precisa olhar job por job. O cap. 10 do TCC (§5, §7, §11) pede o agregado: distribuição de
status por formato, tempo de geração por formato, taxa de reprocessamento, latência de job
(`finished_at - created_at`) e os gatilhos de revisão ("aumento persistente de pending/failed",
"regressão de latência acima de SLO").

Agregar não tem modelo de linguagem no meio, então é banco (regra de fronteira do CLAUDE.md), e o
console lê direto do Supabase.

## O que existia em produção (medido em 02/11, só leitura)

- `personalizacao_jobs` tem `created_at`, `started_at` e `finished_at` em todo job terminado: a latência
  de job e a espera na fila dão para calcular desde sempre.
- `personalizacao_job_targets` (onde está o formato, `media_kind`) **não tem início nem fim**: só
  `created_at` e `updated_at`, e `updated_at` é tocado pelo upsert depois do target concluído. O tempo de
  geração por formato não dava para calcular.
- `attempts` é zerado quando o professor pede para retomar (`reabrir_job_para_retomada`), então o
  reprocessamento manual sumia do dado.

## O que muda

**1. Relógio por target, pelo banco.** Três colunas novas em `personalizacao_job_targets`:

- `processing_started_at`: quando o target entrou em `processing` pela última vez;
- `processing_finished_at`: quando saiu de `processing` para `completed`, `failed` ou `skipped`;
- `processing_runs`: quantas vezes entrou em `processing`. Nunca volta a zero (a retomada manual zera
  `attempts`, não isto).

Quem preenche é o gatilho `trg_job_target_relogio` (BEFORE INSERT OR UPDATE), com `clock_timestamp()`
e não `now()`: o worker pode marcar início e fim dentro da mesma transação, e `now()` daria duração
zero. Quem escreve não escolhe o relógio: o gatilho recompõe as três colunas a partir de `OLD` em todo
UPDATE. Um target que vai para estado final sem ter passado por `processing` fica sem duração (NULL), e
não com zero.

Os targets anteriores a esta migration ficam com as colunas nulas e `processing_runs = 0`: não há como
reconstruir o relógio deles, e a RPC usa `GREATEST(attempts, processing_runs)` para não perder o
reprocessamento que `attempts` já registrava.

**2. SLO escrito.** `app_config.personalizacao_kpi_slo` (JSON), público porque é parâmetro de leitura
do console e não teto anti-abuso. Os números são o ponto de partida, para calibrar:

- latência de job (p95): 30 min para qualquer tipo. Os jobs de geração que terminaram em produção
  levaram de 19 a 21 min (`media_generation`), e os sem geração pesada, segundos;
- tempo de geração por formato (p95): enriquecimento e capítulo 5 min, áudio e apresentação 10 min,
  perfil inteiro (target legado, sem `media_kind`) 30 min. **Hipótese**: até esta migration não havia
  nenhuma duração por target medida;
- falha persistente: mais de 20 % dos jobs com problema em cada um dos 3 últimos dias que tiveram job.

**3. A RPC `personalizacao_kpis_operacionais(classe_id, inicio, fim, granularidade)`.** `SECURITY
INVOKER`: as policies de leitura do professor nas duas tabelas da fila
(`personalizacao_jobs_professor_sel`, `personalizacao_job_targets_professor_sel`) continuam valendo, e a
posse é conferida antes com `app_classes_do_professor()` (fora dela, 42501 em vez de um painel zerado).
Só agrega: nenhum `aluno_id`, nenhuma mensagem de erro sai daqui. Devolve:

- `jobs`: total, distribuição de status, latência média/p95, espera na fila, pedidos de reprocessamento;
- `por_tipo`: o mesmo por `kind`, com o SLO e `slo_violado`;
- `por_formato`: distribuição de status dos targets, tempo de geração médio/p95 e taxa de
  reprocessamento, com os cinco formatos sempre presentes (formato sem job volta com zeros e médias
  nulas);
- `serie`: um balde por hora, dia ou semana (fuso de Brasília), com zeros onde não houve job, para
  localizar quando um aumento de `failed` começou;
- `gatilhos`: os do §11, já decididos (`ativo`), sem conta manual.

## Definições

- **Latência de job** = `finished_at - created_at`, só de job em estado final (`completed`, `partial`,
  `failed`) com `finished_at`. Job em andamento não entra na média como se tivesse terminado em zero.
  Job retomado pelo professor volta a `pending` com `finished_at = NULL` e mantém o `created_at`, então
  a latência dele inclui o tempo até a retomada.
- **Status na série** é o status de hoje dos jobs criados naquele balde, não o status que tinham na época.
- **Tempo de geração por formato** = `processing_finished_at - processing_started_at` da última execução
  dos targets `completed`.
- **Taxa de reprocessamento** = targets `completed` ou `failed` que precisaram de mais de uma execução,
  sobre todos os `completed` ou `failed`.

Revision ID: 20261102_12
Revises: 20261102_11
Create Date: 2026-11-02
"""

from alembic import op

revision = "20261102_12"
down_revision = "20261102_11"
branch_labels = None
depends_on = None

FORMATOS = ("enriquecimento", "capitulo", "audio", "apresentacao", "perfil_inteiro")
GRANULARIDADES = ("hora", "dia", "semana")

SLO = (
    '{"latencia_job_p95_seg":{"padrao":1800},'
    '"geracao_p95_seg":{"enriquecimento":300,"capitulo":300,"audio":600,"apresentacao":600,"perfil_inteiro":1800},'
    '"falha_pct_max":20,"dias_persistencia":3}'
)

RELOGIO = """
ALTER TABLE public.personalizacao_job_targets
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_runs integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.fn_job_target_relogio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.processing_runs := CASE WHEN NEW.status = 'processing' THEN 1 ELSE 0 END;
    NEW.processing_started_at := CASE WHEN NEW.status = 'processing' THEN clock_timestamp() END;
    NEW.processing_finished_at := NULL;
    RETURN NEW;
  END IF;

  -- Quem escreve não escolhe o relógio: as três colunas só mudam por aqui.
  NEW.processing_runs := OLD.processing_runs;
  NEW.processing_started_at := OLD.processing_started_at;
  NEW.processing_finished_at := OLD.processing_finished_at;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'processing' THEN
    NEW.processing_runs := OLD.processing_runs + 1;
    NEW.processing_started_at := clock_timestamp();
    NEW.processing_finished_at := NULL;
  ELSIF NEW.status IN ('completed', 'failed', 'skipped') THEN
    -- Sem passar por processing não houve execução medida: fica NULL, nunca zero.
    IF OLD.status = 'processing' THEN
      NEW.processing_finished_at := clock_timestamp();
    END IF;
  ELSE
    NEW.processing_started_at := NULL;
    NEW.processing_finished_at := NULL;
  END IF;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_job_target_relogio() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_job_target_relogio ON public.personalizacao_job_targets;
CREATE TRIGGER trg_job_target_relogio
  BEFORE INSERT OR UPDATE ON public.personalizacao_job_targets
  FOR EACH ROW EXECUTE FUNCTION public.fn_job_target_relogio();
"""

CONFIG = f"""
INSERT INTO public.app_config (chave, valor, descricao, publico)
VALUES ('personalizacao_kpi_slo', '{SLO}',
        'SLO da fila de personalização (#14): p95 de latência de job e de geração por formato, em segundos, '
        'e o limiar da falha persistente. Lido pela RPC personalizacao_kpis_operacionais.', true)
ON CONFLICT (chave) DO NOTHING;
"""

_FORMATOS_VALUES = ", ".join(f"('{f}', {i})" for i, f in enumerate(FORMATOS, start=1))
_FORMATOS_IN = ", ".join(f"'{f}'" for f in FORMATOS)

FUNCAO = f"""
CREATE OR REPLACE FUNCTION public.personalizacao_kpis_operacionais(
  p_classe_id bigint,
  p_inicio timestamptz DEFAULT NULL,
  p_fim timestamptz DEFAULT NULL,
  p_granularidade text DEFAULT 'dia'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_fuso constant text := 'America/Sao_Paulo';
  v_fim timestamptz := COALESCE(p_fim, now());
  v_inicio timestamptz := COALESCE(p_inicio, COALESCE(p_fim, now()) - interval '30 days');
  v_unidade text;
  v_passo interval;
  v_slo jsonb;
  v_slo_padrao numeric;
  v_falha_max numeric;
  v_dias integer;
  v_jobs jsonb;
  v_por_tipo jsonb;
  v_por_formato jsonb;
  v_serie jsonb;
  v_persistencia jsonb;
  v_persistente boolean;
  v_envelhecidos integer;
BEGIN
  IF auth.uid() IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.app_classes_do_professor() AS minha(id)
     WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'turma_nao_encontrada_ou_sem_permissao'
      USING ERRCODE = '42501';
  END IF;

  IF v_fim <= v_inicio THEN
    RAISE EXCEPTION 'periodo_invalido' USING ERRCODE = '22023';
  END IF;

  v_unidade := CASE p_granularidade WHEN 'hora' THEN 'hour' WHEN 'dia' THEN 'day' WHEN 'semana' THEN 'week' END;
  IF v_unidade IS NULL THEN
    RAISE EXCEPTION 'granularidade_invalida' USING ERRCODE = '22023';
  END IF;
  v_passo := ('1 ' || v_unidade)::interval;
  IF extract(epoch FROM v_fim - v_inicio) / extract(epoch FROM v_passo) > 1000 THEN
    RAISE EXCEPTION 'periodo_longo_demais_para_a_granularidade' USING ERRCODE = '22023';
  END IF;

  -- Sem a chave (ou com JSON inválido), não há SLO: slo_violado volta NULL, nunca false.
  BEGIN
    SELECT c.valor::jsonb INTO v_slo FROM public.app_config c WHERE c.chave = 'personalizacao_kpi_slo';
  EXCEPTION WHEN invalid_text_representation THEN
    v_slo := NULL;
  END;
  v_slo := COALESCE(v_slo, '{{}}'::jsonb);
  v_slo_padrao := (v_slo -> 'latencia_job_p95_seg' ->> 'padrao')::numeric;
  v_falha_max := (v_slo ->> 'falha_pct_max')::numeric;
  v_dias := GREATEST(COALESCE((v_slo ->> 'dias_persistencia')::integer, 3), 1);

  -- Uma consulta só: STABLE roda em transação somente leitura pelo PostgREST, então nada de tabela
  -- temporária.
  WITH jobs AS (
    SELECT j.id, j.kind, j.status, j.created_at,
           j.status IN ('pending', 'processing') AS em_aberto,
           -- Só job em estado final: em andamento não entra na média como se tivesse terminado em zero.
           CASE WHEN j.status NOT IN ('pending', 'processing') AND j.finished_at >= j.created_at
                THEN extract(epoch FROM j.finished_at - j.created_at) END AS latencia,
           CASE WHEN j.started_at >= j.created_at
                THEN extract(epoch FROM j.started_at - j.created_at) END AS espera,
           COALESCE((v_slo -> 'latencia_job_p95_seg' ->> j.kind)::numeric, v_slo_padrao) AS slo
      FROM public.personalizacao_jobs j
     WHERE j.classe_id = p_classe_id
       AND j.created_at >= v_inicio
       AND j.created_at < v_fim
  ),
  tipos AS (
    SELECT k.*,
           CASE WHEN k.slo_latencia_p95_seg IS NULL OR k.latencia_p95_seg IS NULL THEN NULL
                ELSE k.latencia_p95_seg > k.slo_latencia_p95_seg END AS slo_violado
      FROM (
        SELECT kind,
               count(*) AS total,
               jsonb_build_object(
                 'pending', count(*) FILTER (WHERE status = 'pending'),
                 'processing', count(*) FILTER (WHERE status = 'processing'),
                 'completed', count(*) FILTER (WHERE status = 'completed'),
                 'partial', count(*) FILTER (WHERE status = 'partial'),
                 'failed', count(*) FILTER (WHERE status = 'failed')) AS por_status,
               count(*) FILTER (WHERE em_aberto) AS em_aberto,
               count(latencia) AS terminados,
               round(avg(latencia)) AS latencia_media_seg,
               round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latencia)::numeric) AS latencia_p95_seg,
               round(avg(espera)) AS espera_media_seg,
               max(slo) AS slo_latencia_p95_seg
          FROM jobs
         GROUP BY kind
      ) k
  ),
  alvos AS (
    SELECT COALESCE(t.media_kind, 'perfil_inteiro') AS formato,
           t.status,
           GREATEST(t.attempts, t.processing_runs) AS execucoes,
           CASE WHEN t.status = 'completed' AND t.processing_finished_at >= t.processing_started_at
                THEN extract(epoch FROM t.processing_finished_at - t.processing_started_at) END AS duracao
      FROM public.personalizacao_job_targets t
      JOIN jobs j ON j.id = t.job_id
  ),
  formatos AS (
    SELECT f.formato, f.ordem FROM (VALUES {_FORMATOS_VALUES}) AS f(formato, ordem)
    UNION
    SELECT DISTINCT a.formato, 99 FROM alvos a
     WHERE a.formato NOT IN ({_FORMATOS_IN})
  ),
  por_formato AS (
    SELECT g.*,
           CASE WHEN g.base_reprocessamento > 0
                THEN round(100.0 * g.reprocessados / g.base_reprocessamento, 1) END AS taxa_reprocessamento_pct,
           CASE WHEN g.slo_geracao_p95_seg IS NULL OR g.tempo_geracao_p95_seg IS NULL THEN NULL
                ELSE g.tempo_geracao_p95_seg > g.slo_geracao_p95_seg END AS slo_violado
      FROM (
        SELECT f.formato, f.ordem,
               count(a.formato) AS total,
               jsonb_build_object(
                 'pending', count(*) FILTER (WHERE a.status = 'pending'),
                 'processing', count(*) FILTER (WHERE a.status = 'processing'),
                 'completed', count(*) FILTER (WHERE a.status = 'completed'),
                 'failed', count(*) FILTER (WHERE a.status = 'failed'),
                 'skipped', count(*) FILTER (WHERE a.status = 'skipped')) AS por_status,
               count(a.duracao) AS geracoes_medidas,
               round(avg(a.duracao)) AS tempo_geracao_medio_seg,
               round(percentile_cont(0.95) WITHIN GROUP (ORDER BY a.duracao)::numeric) AS tempo_geracao_p95_seg,
               count(*) FILTER (WHERE a.status IN ('completed', 'failed')) AS base_reprocessamento,
               count(*) FILTER (WHERE a.status IN ('completed', 'failed') AND a.execucoes > 1) AS reprocessados,
               (v_slo -> 'geracao_p95_seg' ->> f.formato)::numeric AS slo_geracao_p95_seg
          FROM formatos f
          LEFT JOIN alvos a ON a.formato = f.formato
         GROUP BY f.formato, f.ordem
      ) g
  ),
  -- Série com zeros onde não houve job: o começo de um aumento de failed fica visível.
  serie AS (
    SELECT b.balde,
           count(j.id) AS total,
           count(*) FILTER (WHERE j.status = 'pending') AS pending,
           count(*) FILTER (WHERE j.status = 'processing') AS processing,
           count(*) FILTER (WHERE j.status = 'completed') AS completed,
           count(*) FILTER (WHERE j.status = 'partial') AS partial,
           count(*) FILTER (WHERE j.status = 'failed') AS failed,
           round(avg(j.latencia)) AS latencia_media_seg
      FROM generate_series(
             date_trunc(v_unidade, v_inicio AT TIME ZONE v_fuso),
             date_trunc(v_unidade, (v_fim - interval '1 microsecond') AT TIME ZONE v_fuso),
             v_passo
           ) AS b(balde)
      LEFT JOIN jobs j
        ON date_trunc(v_unidade, j.created_at AT TIME ZONE v_fuso) = b.balde
     GROUP BY b.balde
  ),
  -- §11, "aumento persistente de pending/failed": nos últimos v_dias dias que tiveram job, todos
  -- acima do limiar. Problema = failed, partial ou em aberto há mais que o SLO do tipo. Dia sem job
  -- não conta nem a favor nem contra.
  dias AS (
    SELECT (j.created_at AT TIME ZONE v_fuso)::date AS dia,
           count(*) AS total,
           round(100.0 * count(*) FILTER (
             WHERE j.status IN ('failed', 'partial')
                OR (j.em_aberto AND j.slo IS NOT NULL AND extract(epoch FROM now() - j.created_at) > j.slo)
           ) / count(*), 1) AS problema_pct
      FROM jobs j
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT v_dias
  )
  SELECT
    (SELECT jsonb_build_object(
              'total', count(*),
              'por_status', jsonb_build_object(
                'pending', count(*) FILTER (WHERE status = 'pending'),
                'processing', count(*) FILTER (WHERE status = 'processing'),
                'completed', count(*) FILTER (WHERE status = 'completed'),
                'partial', count(*) FILTER (WHERE status = 'partial'),
                'failed', count(*) FILTER (WHERE status = 'failed')),
              'em_aberto', count(*) FILTER (WHERE em_aberto),
              'terminados', count(latencia),
              'latencia_media_seg', round(avg(latencia)),
              'latencia_p95_seg', round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latencia)::numeric),
              'espera_media_seg', round(avg(espera)),
              'pedidos_de_reprocessamento', count(*) FILTER (WHERE kind = 'manual_retry'))
       FROM jobs),
    (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.total DESC, t.kind), '[]'::jsonb) FROM tipos t),
    (SELECT COALESCE(jsonb_agg(to_jsonb(p) - 'ordem' ORDER BY p.ordem, p.formato), '[]'::jsonb) FROM por_formato p),
    (SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'inicio', to_char(s.balde, 'YYYY-MM-DD"T"HH24":"MI'),
                'total', s.total, 'pending', s.pending, 'processing', s.processing,
                'completed', s.completed, 'partial', s.partial, 'failed', s.failed,
                'latencia_media_seg', s.latencia_media_seg)
              ORDER BY s.balde), '[]'::jsonb)
       FROM serie s),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('dia', d.dia, 'total', d.total, 'problema_pct', d.problema_pct)
                               ORDER BY d.dia), '[]'::jsonb)
       FROM dias d),
    (SELECT count(*) = v_dias AND v_falha_max IS NOT NULL AND COALESCE(bool_and(d.problema_pct > v_falha_max), false)
       FROM dias d),
    (SELECT count(*) FROM jobs j
      WHERE j.em_aberto AND j.slo IS NOT NULL AND extract(epoch FROM now() - j.created_at) > j.slo)
  INTO v_jobs, v_por_tipo, v_por_formato, v_serie, v_persistencia, v_persistente, v_envelhecidos;

  RETURN jsonb_build_object(
    'classe_id', p_classe_id,
    'inicio', v_inicio,
    'fim', v_fim,
    'granularidade', p_granularidade,
    'fuso', v_fuso,
    'gerado_em', now(),
    'slo', v_slo,
    'jobs', v_jobs,
    'por_tipo', v_por_tipo,
    'por_formato', v_por_formato,
    'serie', v_serie,
    'gatilhos', jsonb_build_array(
      jsonb_build_object(
        'chave', 'falha_persistente',
        'ativo', COALESCE(v_persistente, false),
        'limiar_pct', v_falha_max,
        'dias', v_dias,
        'ultimos_dias_com_job', v_persistencia),
      jsonb_build_object(
        'chave', 'latencia_acima_slo',
        'ativo', EXISTS (SELECT 1 FROM jsonb_array_elements(v_por_tipo) e WHERE (e ->> 'slo_violado')::boolean),
        'tipos', (SELECT COALESCE(jsonb_agg(e -> 'kind'), '[]'::jsonb)
                    FROM jsonb_array_elements(v_por_tipo) e WHERE (e ->> 'slo_violado')::boolean)),
      jsonb_build_object(
        'chave', 'geracao_acima_slo',
        'ativo', EXISTS (SELECT 1 FROM jsonb_array_elements(v_por_formato) e WHERE (e ->> 'slo_violado')::boolean),
        'formatos', (SELECT COALESCE(jsonb_agg(e -> 'formato'), '[]'::jsonb)
                       FROM jsonb_array_elements(v_por_formato) e WHERE (e ->> 'slo_violado')::boolean)),
      jsonb_build_object(
        'chave', 'fila_parada',
        'ativo', v_envelhecidos > 0,
        'jobs_em_aberto_acima_do_slo', v_envelhecidos)
    )
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.personalizacao_kpis_operacionais(bigint, timestamptz, timestamptz, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personalizacao_kpis_operacionais(bigint, timestamptz, timestamptz, text)
  TO authenticated;
"""

DOWNGRADE = """
DROP FUNCTION IF EXISTS public.personalizacao_kpis_operacionais(bigint, timestamptz, timestamptz, text);
DELETE FROM public.app_config WHERE chave = 'personalizacao_kpi_slo';
DROP TRIGGER IF EXISTS trg_job_target_relogio ON public.personalizacao_job_targets;
DROP FUNCTION IF EXISTS public.fn_job_target_relogio();
ALTER TABLE public.personalizacao_job_targets
  DROP COLUMN IF EXISTS processing_runs,
  DROP COLUMN IF EXISTS processing_finished_at,
  DROP COLUMN IF EXISTS processing_started_at;
"""


def upgrade() -> None:
    op.execute(RELOGIO)
    op.execute(CONFIG)
    op.execute(FUNCAO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(DOWNGRADE)
    op.execute("NOTIFY pgrst, 'reload schema'")
