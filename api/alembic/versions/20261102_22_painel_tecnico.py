"""Painel técnico: fila de jobs, erro e latência por formato, e os gatilhos do §11 (#21)

## O pedido

A #21 pede a superfície onde o que a #14 mediu (`personalizacao_kpis_operacionais`) é **observado
continuamente**, e onde os quatro gatilhos de revisão arquitetural do §11 do TCC viram indicador em vez
de descoberta tardia. A RPC da #14 é por turma e só o professor dono lê; o painel é do sistema inteiro e
só o dono do projeto lê.

## O que muda

`public.painel_tecnico(p_horas integer DEFAULT 168)`, uma RPC só de leitura, `SECURITY DEFINER`, que
confere `app_e_dono()` **antes** de qualquer leitura (fora disso, 42501 em vez de um painel vazio). Só
agrega: nenhum `aluno_id`, nenhum texto de erro de job sai daqui. Devolve:

- `fila`: jobs e alvos em aberto agora, o pedido mais antigo esperando e os travados (`processing` há
  mais de 1 h, que o worker deveria ter fechado);
- `jobs`: distribuição de status e, por tipo, latência p95 contra o SLO;
- `formatos`: por formato, status dos alvos, taxa de erro, p95 de geração contra o SLO e quantas
  execuções cada alvo consumiu, comparado com a janela anterior de mesmo tamanho;
- `gatilhos`: os quatro do §11, cada um `ok`, `alerta` ou `sem_dado`, com o motivo em português;
- `invariantes`: o último resultado de cada invariante do auditor de métricas;
- `atividade`: quando cada worker mexeu pela última vez (a disponibilidade que o banco enxerga).

O SLO é o mesmo da #14 (`app_config.personalizacao_kpi_slo`): um número só, não dois.

## Os quatro gatilhos, e o que cada um mede de verdade

| Gatilho (§11) | Regra | Quando é `sem_dado` |
|---|---|---|
| Aumento persistente de `pending`/`failed` | mais de `falha_pct_max` % dos jobs com problema (`failed` ou `partial`) em **cada** um dos últimos `dias_persistencia` dias, ou pedido `pending` esperando há mais de 6 h | nenhum job nesses dias e nada esperando |
| Divergência entre progresso agregado e eventos | alguma invariante do auditor falhou na rodada mais recente (`metricas_invariante_resultado`) | o auditor não rodou nas últimas 48 h |
| Custo por artefato sem ganho equivalente | média de execuções por alvo **sobe mais de 30 %** sobre a janela anterior sem a taxa de conclusão subir | menos de 5 alvos em alguma das janelas |
| Regressão de latência acima do SLO | p95 de algum tipo de job acima do SLO | sem SLO escrito ou sem job terminado |

**O de custo é um proxy, e o painel diz isso.** O banco não grava tokens nem custo em dinheiro por
artefato (`ia_decision_logs` guarda o texto da decisão, não o uso). O que existe é quantas vezes cada
alvo entrou em `processing` (`processing_runs`) e quantas tentativas teve (`attempts`): reprocessar é
pagar de novo. Medir custo de verdade exige gravar o uso do modelo, e isso é outra mudança.

## Alerta

Só visual, nesta versão (a #21 aceita "e-mail, log ou apenas visual"): o dono vê o painel quando abre.
Avisar sem ele abrir exigiria uma varredura agendada gravando em `professor_notificacoes`, que já
existe, e fica como o passo seguinte.
"""

from __future__ import annotations

from alembic import op

revision = "20261102_22"
down_revision = "20261102_21"
branch_labels = None
depends_on = None

# Quando o pedido esperando passa a ser anormal, e quando um `processing` passa a estar travado.
PENDING_ANTIGO_MIN = 360
TRAVADO_MIN = 60
# Custo: quanto a média de execuções por alvo precisa subir sobre a janela anterior, e o mínimo de alvos
# em cada janela para a comparação valer.
CRESCIMENTO_CUSTO = "1.3"
MINIMO_DE_ALVOS = 5
IDADE_MAXIMA_DO_AUDITOR_H = 48

FUNCAO = f"""
CREATE OR REPLACE FUNCTION public.painel_tecnico(p_horas integer DEFAULT 168)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_fuso constant text := 'America/Sao_Paulo';
  v_fim timestamptz := now();
  v_inicio timestamptz;
  v_anterior timestamptz;
  v_slo jsonb;
  v_slo_padrao numeric;
  v_falha_max numeric;
  v_dias integer;

  v_fila jsonb;
  v_jobs jsonb;
  v_formatos jsonb;
  v_invariantes jsonb;
  v_atividade jsonb;

  v_mais_antigo_min numeric;
  v_dias_com_job integer;
  v_dias_acima integer;
  v_jobs_recentes integer;
  v_kinds_violados text;
  v_tem_slo boolean;
  v_terminados integer;
  v_inv_rodou timestamptz;
  v_inv_ruins text;
  v_custo_agora numeric;
  v_custo_antes numeric;
  v_alvos_agora integer;
  v_alvos_antes integer;
  v_concl_agora numeric;
  v_concl_antes numeric;

  v_g_fila jsonb;
  v_g_lat jsonb;
  v_g_div jsonb;
  v_g_custo jsonb;
BEGIN
  -- A posse vem antes de qualquer leitura: quem não é o dono nem descobre que a função existe.
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto acessa o painel técnico.' USING ERRCODE = '42501';
  END IF;
  IF p_horas IS NULL OR p_horas < 1 OR p_horas > 720 THEN
    RAISE EXCEPTION 'A janela vai de 1 a 720 horas.' USING ERRCODE = '22023';
  END IF;

  v_inicio := v_fim - make_interval(hours => p_horas);
  v_anterior := v_inicio - make_interval(hours => p_horas);

  -- O mesmo SLO da #14. Sem a chave (ou com JSON inválido) não há SLO: `slo_violado` volta NULL, nunca false.
  BEGIN
    SELECT c.valor::jsonb INTO v_slo FROM public.app_config c WHERE c.chave = 'personalizacao_kpi_slo';
  EXCEPTION WHEN invalid_text_representation THEN
    v_slo := NULL;
  END;
  v_tem_slo := v_slo IS NOT NULL;
  v_slo := COALESCE(v_slo, '{{}}'::jsonb);
  v_slo_padrao := (v_slo -> 'latencia_job_p95_seg' ->> 'padrao')::numeric;
  v_falha_max := COALESCE((v_slo ->> 'falha_pct_max')::numeric, 20);
  v_dias := GREATEST(COALESCE((v_slo ->> 'dias_persistencia')::integer, 3), 1);

  -- ---------------------------------------------------------------- fila agora (não depende da janela)
  SELECT round(extract(epoch FROM v_fim - min(j.created_at)) / 60)
    INTO v_mais_antigo_min
    FROM public.personalizacao_jobs j WHERE j.status = 'pending';

  SELECT jsonb_build_object(
           'jobs_pending', count(*) FILTER (WHERE j.status = 'pending'),
           'jobs_processing', count(*) FILTER (WHERE j.status = 'processing'),
           'pending_mais_antigo_min', v_mais_antigo_min,
           'processing_travados', count(*) FILTER (
             WHERE j.status = 'processing'
               AND COALESCE(j.started_at, j.created_at) < v_fim - make_interval(mins => {TRAVADO_MIN})),
           'alvos_pending', (SELECT count(*) FROM public.personalizacao_job_targets t WHERE t.status = 'pending'),
           'alvos_processing', (SELECT count(*) FROM public.personalizacao_job_targets t WHERE t.status = 'processing'))
    INTO v_fila
    FROM public.personalizacao_jobs j
   WHERE j.status IN ('pending', 'processing');

  -- ---------------------------------------------------------------- jobs na janela, por tipo
  WITH jobs AS (
    SELECT j.kind, j.status,
           CASE WHEN j.status NOT IN ('pending', 'processing') AND j.finished_at >= j.created_at
                THEN extract(epoch FROM j.finished_at - j.created_at) END AS latencia,
           COALESCE((v_slo -> 'latencia_job_p95_seg' ->> j.kind)::numeric, v_slo_padrao) AS slo
      FROM public.personalizacao_jobs j
     WHERE j.created_at >= v_inicio AND j.created_at < v_fim
  ),
  tipos AS (
    SELECT k.*,
           CASE WHEN k.slo_p95_seg IS NULL OR k.latencia_p95_seg IS NULL THEN NULL
                ELSE k.latencia_p95_seg > k.slo_p95_seg END AS slo_violado
      FROM (
        SELECT kind,
               count(*) AS total,
               count(*) FILTER (WHERE status = 'pending') AS pending,
               count(*) FILTER (WHERE status = 'processing') AS processing,
               count(*) FILTER (WHERE status = 'completed') AS completed,
               count(*) FILTER (WHERE status = 'partial') AS partial,
               count(*) FILTER (WHERE status = 'failed') AS failed,
               count(latencia) AS terminados,
               round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latencia)::numeric) AS latencia_p95_seg,
               max(slo) AS slo_p95_seg
          FROM jobs GROUP BY kind
      ) k
  )
  SELECT jsonb_build_object(
           'total', (SELECT count(*) FROM jobs),
           'por_status', jsonb_build_object(
             'pending', (SELECT count(*) FROM jobs WHERE status = 'pending'),
             'processing', (SELECT count(*) FROM jobs WHERE status = 'processing'),
             'completed', (SELECT count(*) FROM jobs WHERE status = 'completed'),
             'partial', (SELECT count(*) FROM jobs WHERE status = 'partial'),
             'failed', (SELECT count(*) FROM jobs WHERE status = 'failed')),
           'por_tipo', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.total DESC, t.kind) FROM tipos t), '[]'::jsonb)),
         (SELECT string_agg(t.kind, ', ' ORDER BY t.kind) FROM tipos t WHERE t.slo_violado),
         (SELECT COALESCE(sum(t.terminados), 0)::integer FROM tipos t)
    INTO v_jobs, v_kinds_violados, v_terminados;

  -- ---------------------------------------------------------------- formatos (alvos), com a janela anterior
  WITH alvos AS (
    SELECT COALESCE(t.media_kind, 'perfil_inteiro') AS formato, t.status,
           GREATEST(t.attempts, t.processing_runs) AS execucoes,
           (t.created_at >= v_inicio) AS agora,
           CASE WHEN t.status = 'completed' AND t.processing_finished_at >= t.processing_started_at
                THEN extract(epoch FROM t.processing_finished_at - t.processing_started_at) END AS duracao
      FROM public.personalizacao_job_targets t
     WHERE t.created_at >= v_anterior AND t.created_at < v_fim
  ),
  por_formato AS (
    SELECT g.*,
           CASE WHEN g.base > 0 THEN round(100.0 * g.failed / g.base, 1) END AS falha_pct,
           CASE WHEN g.slo_p95_seg IS NULL OR g.tempo_p95_seg IS NULL THEN NULL
                ELSE g.tempo_p95_seg > g.slo_p95_seg END AS slo_violado
      FROM (
        SELECT a.formato,
               count(*) FILTER (WHERE a.agora) AS total,
               count(*) FILTER (WHERE a.agora AND a.status = 'pending') AS pending,
               count(*) FILTER (WHERE a.agora AND a.status = 'processing') AS processing,
               count(*) FILTER (WHERE a.agora AND a.status = 'completed') AS completed,
               count(*) FILTER (WHERE a.agora AND a.status = 'failed') AS failed,
               count(*) FILTER (WHERE a.agora AND a.status = 'skipped') AS skipped,
               count(*) FILTER (WHERE a.agora AND a.status IN ('completed', 'failed')) AS base,
               round(percentile_cont(0.95) WITHIN GROUP (ORDER BY a.duracao) FILTER (WHERE a.agora)::numeric) AS tempo_p95_seg,
               round(avg(a.execucoes) FILTER (WHERE a.agora AND a.status IN ('completed', 'failed')), 2) AS execucoes_medias,
               round(avg(a.execucoes) FILTER (WHERE NOT a.agora AND a.status IN ('completed', 'failed')), 2) AS execucoes_medias_anterior,
               (v_slo -> 'geracao_p95_seg' ->> a.formato)::numeric AS slo_p95_seg
          FROM alvos a GROUP BY a.formato
      ) g
     WHERE g.total > 0
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.total DESC, f.formato), '[]'::jsonb)
    INTO v_formatos
    FROM por_formato f;

  -- custo (proxy): execuções por alvo finalizado, agora × janela anterior, e a taxa de conclusão de cada uma
  SELECT round(avg(GREATEST(t.attempts, t.processing_runs)) FILTER (WHERE t.created_at >= v_inicio), 2),
         round(avg(GREATEST(t.attempts, t.processing_runs)) FILTER (WHERE t.created_at < v_inicio), 2),
         count(*) FILTER (WHERE t.created_at >= v_inicio)::integer,
         count(*) FILTER (WHERE t.created_at < v_inicio)::integer,
         round(100.0 * count(*) FILTER (WHERE t.created_at >= v_inicio AND t.status = 'completed')
               / NULLIF(count(*) FILTER (WHERE t.created_at >= v_inicio), 0), 1),
         round(100.0 * count(*) FILTER (WHERE t.created_at < v_inicio AND t.status = 'completed')
               / NULLIF(count(*) FILTER (WHERE t.created_at < v_inicio), 0), 1)
    INTO v_custo_agora, v_custo_antes, v_alvos_agora, v_alvos_antes, v_concl_agora, v_concl_antes
    FROM public.personalizacao_job_targets t
   WHERE t.created_at >= v_anterior AND t.created_at < v_fim AND t.status IN ('completed', 'failed');

  -- ---------------------------------------------------------------- invariantes: o último resultado de cada uma
  WITH ultimas AS (
    SELECT DISTINCT ON (r.invariante) r.invariante, r.ok, r.linhas, r.rodado_em,
           left(r.erro, 160) AS erro
      FROM public.metricas_invariante_resultado r
     ORDER BY r.invariante, r.rodado_em DESC, r.id DESC
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(u) ORDER BY u.invariante), '[]'::jsonb),
         max(u.rodado_em),
         string_agg(u.invariante, ', ' ORDER BY u.invariante) FILTER (WHERE NOT u.ok OR u.erro IS NOT NULL)
    INTO v_invariantes, v_inv_rodou, v_inv_ruins
    FROM ultimas u;

  -- ---------------------------------------------------------------- o que cada worker fez por último
  SELECT jsonb_build_object(
           'ultimo_job_iniciado_em', (SELECT max(j.started_at) FROM public.personalizacao_jobs j),
           'ultimo_lote_em', (SELECT max(l.created_at) FROM public.telemetria_lotes l),
           'ultima_analise_em', (SELECT max(l.created_at) FROM public.telemetria_lotes l WHERE l.analysis_ciclo_id IS NOT NULL),
           'analise_na_fila', (SELECT count(*) FROM public.telemetria_analise_fila),
           'analise_com_erro', (SELECT count(*) FROM public.telemetria_analise_fila q WHERE q.ultimo_erro IS NOT NULL))
    INTO v_atividade;

  -- ---------------------------------------------------------------- gatilho 1: pending/failed persistente
  SELECT count(*)::integer, count(*) FILTER (WHERE d.pct > v_falha_max)::integer
    INTO v_dias_com_job, v_dias_acima
    FROM (
      SELECT date_trunc('day', j.created_at AT TIME ZONE v_fuso) AS dia,
             100.0 * count(*) FILTER (WHERE j.status IN ('failed', 'partial')) / count(*) AS pct
        FROM public.personalizacao_jobs j
       WHERE j.created_at >= v_fim - make_interval(days => v_dias)
       GROUP BY 1
    ) d;
  SELECT count(*)::integer INTO v_jobs_recentes
    FROM public.personalizacao_jobs j WHERE j.created_at >= v_fim - make_interval(days => v_dias);

  v_g_fila := CASE
    WHEN v_dias_com_job >= v_dias AND v_dias_acima >= v_dias THEN jsonb_build_object(
      'estado', 'alerta',
      'detalhe', format('Mais de %s%% dos jobs com problema em cada um dos últimos %s dias.', v_falha_max, v_dias))
    WHEN COALESCE(v_mais_antigo_min, 0) > {PENDING_ANTIGO_MIN} THEN jsonb_build_object(
      'estado', 'alerta',
      'detalhe', format('Há um pedido esperando na fila há %s min.', v_mais_antigo_min::integer))
    WHEN v_jobs_recentes = 0 AND v_mais_antigo_min IS NULL THEN jsonb_build_object(
      'estado', 'sem_dado', 'detalhe', format('Nenhum job nos últimos %s dias.', v_dias))
    ELSE jsonb_build_object('estado', 'ok', 'detalhe', 'Sem aumento persistente de pending ou failed.')
  END;

  -- ---------------------------------------------------------------- gatilho 2: latência acima do SLO
  v_g_lat := CASE
    WHEN NOT v_tem_slo THEN jsonb_build_object('estado', 'sem_dado', 'detalhe', 'Não há SLO escrito (app_config.personalizacao_kpi_slo).')
    WHEN v_terminados = 0 THEN jsonb_build_object('estado', 'sem_dado', 'detalhe', 'Nenhum job terminou na janela.')
    WHEN v_kinds_violados IS NOT NULL THEN jsonb_build_object(
      'estado', 'alerta', 'detalhe', format('p95 acima do SLO em: %s.', v_kinds_violados))
    ELSE jsonb_build_object('estado', 'ok', 'detalhe', 'p95 de todos os tipos dentro do SLO.')
  END;

  -- ---------------------------------------------------------------- gatilho 3: divergência (invariantes)
  v_g_div := CASE
    WHEN v_inv_rodou IS NULL OR v_inv_rodou < v_fim - make_interval(hours => {IDADE_MAXIMA_DO_AUDITOR_H}) THEN jsonb_build_object(
      'estado', 'sem_dado', 'detalhe', 'O auditor de métricas não rodou nas últimas {IDADE_MAXIMA_DO_AUDITOR_H} h.')
    WHEN v_inv_ruins IS NOT NULL THEN jsonb_build_object(
      'estado', 'alerta', 'detalhe', format('Invariante(s) que falharam na última rodada: %s.', v_inv_ruins))
    ELSE jsonb_build_object('estado', 'ok', 'detalhe', 'Todas as invariantes passaram na última rodada.')
  END;

  -- ---------------------------------------------------------------- gatilho 4: custo por artefato (proxy)
  v_g_custo := CASE
    WHEN COALESCE(v_alvos_agora, 0) < {MINIMO_DE_ALVOS} OR COALESCE(v_alvos_antes, 0) < {MINIMO_DE_ALVOS}
      OR v_custo_antes IS NULL OR v_custo_agora IS NULL THEN jsonb_build_object(
      'estado', 'sem_dado',
      'detalhe', 'Poucos alvos finalizados para comparar com a janela anterior (proxy: execuções por alvo; o custo em tokens não é gravado).')
    WHEN v_custo_agora > v_custo_antes * {CRESCIMENTO_CUSTO}
      AND COALESCE(v_concl_agora, 0) <= COALESCE(v_concl_antes, 0) THEN jsonb_build_object(
      'estado', 'alerta',
      'detalhe', format('Execuções por alvo subiram de %s para %s sem a taxa de conclusão subir (proxy do custo).', v_custo_antes, v_custo_agora))
    ELSE jsonb_build_object(
      'estado', 'ok',
      'detalhe', format('Execuções por alvo: %s (janela anterior: %s). Proxy do custo; tokens não são gravados.', v_custo_agora, v_custo_antes))
  END;

  RETURN jsonb_build_object(
    'gerado_em', v_fim,
    'janela_horas', p_horas,
    'fila', v_fila,
    'jobs', v_jobs,
    'formatos', v_formatos,
    'gatilhos', jsonb_build_array(
      v_g_fila || jsonb_build_object('id', 'fila_persistente', 'titulo', 'Aumento persistente de pending/failed'),
      v_g_div || jsonb_build_object('id', 'divergencia_progresso', 'titulo', 'Divergência entre progresso agregado e eventos'),
      v_g_custo || jsonb_build_object('id', 'custo_por_artefato', 'titulo', 'Custo por artefato sem ganho equivalente'),
      v_g_lat || jsonb_build_object('id', 'latencia_slo', 'titulo', 'Latência acima do SLO')),
    'invariantes', v_invariantes,
    'atividade', v_atividade);
END;
$fn$;

REVOKE ALL ON FUNCTION public.painel_tecnico(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_tecnico(integer) TO authenticated;
"""


def upgrade() -> None:
    op.execute(FUNCAO)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.painel_tecnico(integer)")
