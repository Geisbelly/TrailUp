"""Missão de turma e de aluno conta da criação, não desde sempre

Decisão de produto registrada na #857. As seis métricas que o professor e a IA usam em missão
(`minutos_totais`, `dias_seguidos`, `topicos_concluidos`, `atividades_concluidas`,
`acertos_percentual`, `trilha_percentual`) eram avaliadas sobre o acumulado da vida inteira do aluno.
Quem já tinha estudado cumpria "Estude 120 minutos" ou "Tire 80% numa atividade" no evento seguinte,
sem fazer nada novo. A guilda já contava só dentro da janela (`20261021_15`); agora a individual e a
de turma também.

## Como

O laço individual de `trg_eventos_aluno_after_iud` passa a mandar ao avaliador o critério com uma
chave a mais, `desde` = `COALESCE(janela_inicio, criado_em)` da missão. Quando `fn_avaliar_metrica`
vê `desde` numa dessas seis métricas, troca os agregados de vida inteira pelos de
`fn_agregados_desde(aluno, desde)`. Os ramos de decisão não mudam: só os números que eles leem.

**Conquista não muda.** Ela nunca manda `desde` (o critério dela vem de `conquistas`, e esta chave
não está lá), então os agregados dela continuam os de sempre.

## O que cada métrica conta a partir de `desde`

| métrica | conta |
|---|---|
| `minutos_totais` | `active_sec` de `telemetria_time_metric_entries` com `captured_at >= desde`, escopos `content` e `activity`. É a mesma fonte e os mesmos escopos de `tempo_gasto_min` (`20261030_01`), só que recortados no tempo |
| `atividades_concluidas` | eventos `atividade_concluida` desde então |
| `dias_seguidos` | maior sequência de dias com evento desde então |
| `acertos_percentual` | melhor `acertos_percentual` de atividade com `atividade_concluida` desde então (`referencia = 'atividade:<id>'`) |
| `topicos_concluidos` | `topico_aluno` concluído com `updated_at >= desde` |
| `trilha_percentual` | maior `percentual_concluido` de `topico_aluno` com `updated_at >= desde` |

As duas últimas usam `updated_at` porque `topico_aluno` não guarda quando concluiu. Um tópico
concluído antes e recalculado depois (o professor acrescentou material) volta a contar. É o lado
generoso do erro; o outro lado seria não contar um tópico concluído de fato.

`eventos_aluno.criado_em` é `timestamp` sem fuso, em UTC (CLAUDE.md): a comparação é contra
`desde AT TIME ZONE 'UTC'`.

## Missão sugerida pela IA

O início é `criado_em`, o momento da proposta, não o da aprovação: `missoes` não guarda quando foi
aprovada. O que o aluno fez entre a proposta e o aceite conta. Para a missão começar num instante
exato, `janela_inicio` continua valendo e vence `criado_em`.

Revision ID: 20261103_07
Revises: 20261103_06
Create Date: 2026-11-03
"""

from __future__ import annotations

from alembic import op

revision = "20261103_07"
down_revision = "20261103_06"
branch_labels = None
depends_on = None

METRICAS = (
    "minutos_totais",
    "dias_seguidos",
    "topicos_concluidos",
    "atividades_concluidas",
    "acertos_percentual",
    "trilha_percentual",
)
_LISTA = ", ".join(f"'{m}'" for m in METRICAS)


AGREGADOS_DESDE = r"""
CREATE OR REPLACE FUNCTION public.fn_agregados_desde(p_aluno uuid, p_desde timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  -- `eventos_aluno.criado_em` e' timestamp sem fuso, em UTC.
  v_desde_utc          timestamp := p_desde AT TIME ZONE 'UTC';
  v_dias_seguidos      integer;
  v_minutos_totais     numeric;
  v_topicos_concluidos integer;
  v_melhor_acertos     numeric;
  v_melhor_trilha      numeric;
  v_contagem_por_tipo  jsonb;
BEGIN
  WITH dias AS (
    SELECT DISTINCT date(criado_em) AS d
      FROM public.eventos_aluno
     WHERE aluno_id = p_aluno AND criado_em >= v_desde_utc AND NOT public.fn_evento_creditado(tipo)
  ), seq AS (
    SELECT d, d - (row_number() OVER (ORDER BY d))::int AS grp FROM dias
  ), cont AS (
    SELECT count(*) AS qtd FROM seq GROUP BY grp
  )
  SELECT COALESCE(max(qtd), 0) INTO v_dias_seguidos FROM cont;

  -- Mesma fonte e mesmos escopos de `tempo_gasto_min` (20261030_01), recortados no tempo.
  SELECT COALESCE(sum(e.active_sec)::numeric / 60.0, 0) INTO v_minutos_totais
    FROM public.telemetria_time_metric_entries e
   WHERE e.aluno_id = p_aluno
     AND e.scope IN ('content', 'activity')
     AND e.captured_at >= p_desde;

  SELECT COALESCE(max(aa.acertos_percentual), 0) INTO v_melhor_acertos
    FROM public.atividade_aluno aa
   WHERE aa.aluno_id = p_aluno
     AND EXISTS (SELECT 1 FROM public.eventos_aluno e
                  WHERE e.aluno_id = p_aluno AND e.tipo = 'atividade_concluida'
                    AND e.referencia = 'atividade:' || aa.atividade_id::text
                    AND e.criado_em >= v_desde_utc);

  -- `topico_aluno` nao guarda quando concluiu: `updated_at` e' o mais perto disso.
  SELECT COALESCE(max(percentual_concluido), 0) INTO v_melhor_trilha
    FROM public.topico_aluno
   WHERE aluno_id = p_aluno AND updated_at >= p_desde;

  SELECT count(*) INTO v_topicos_concluidos
    FROM public.topico_aluno
   WHERE aluno_id = p_aluno
     AND updated_at >= p_desde
     AND position('concl' in lower(coalesce(status::text, ''))) > 0;

  SELECT COALESCE(jsonb_object_agg(tipo, n), '{}'::jsonb) INTO v_contagem_por_tipo
    FROM (SELECT tipo, count(*) AS n FROM public.eventos_aluno
           WHERE aluno_id = p_aluno AND criado_em >= v_desde_utc GROUP BY tipo) s;

  RETURN jsonb_build_object(
    'dias_seguidos', v_dias_seguidos,
    'minutos_totais', v_minutos_totais,
    'topicos_concluidos', v_topicos_concluidos,
    'melhor_acertos', v_melhor_acertos,
    'melhor_trilha', v_melhor_trilha,
    'contagem_por_tipo', v_contagem_por_tipo
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_agregados_desde(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
"""


_ANCORA_AVALIADOR = """  IF v_metrica IS NULL THEN
    RETURN false;
  END IF;
"""
RAMO_DESDE = f"""
  -- Missao conta da criacao (20261103_07): o laco de missao manda `desde`; conquista nunca manda.
  IF p_criterio ? 'desde' AND v_metrica IN ({_LISTA}) THEN
    v_ag := public.fn_agregados_desde(p_aluno, (p_criterio ->> 'desde')::timestamptz);
    v_contagem := COALESCE(v_ag -> 'contagem_por_tipo', '{{}}'::jsonb);
  END IF;
"""

_ANCORA_LACO = """    FOR v_missao IN
      SELECT m.id, m.criterio, m.recompensa_tipo
"""
_LACO_DESDE = """    FOR v_missao IN
      -- `desde`: a missao conta da criacao (ou de `janela_inicio`), nao desde sempre (20261103_07).
      SELECT m.id,
             m.criterio || jsonb_build_object('desde', COALESCE(m.janela_inicio, m.criado_em)) AS criterio,
             m.recompensa_tipo
"""


def _trocar_no_banco(funcao: str, assinatura: str, antes: str, depois: str, marca: str, aplicar: bool) -> str:
    """Troca `antes` por `depois` no corpo vivo da função (o padrão de `20261103_05`): a função já
    passou por várias migrations, e reescrevê-la inteira apagaria o que elas acrescentaram.
    Idempotente pela `marca`; recusa se a âncora sumir ou se repetir."""
    origem, destino = (antes, depois) if aplicar else (depois, antes)
    ja_feito = "> 0" if aplicar else "= 0"
    return f"""
DO $migracao$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.{funcao}({assinatura})'::regprocedure) INTO v_def;
  IF position($m${marca}$m$ IN v_def) {ja_feito} THEN
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, $a${origem}$a$, ''))) / length($a${origem}$a$) <> 1 THEN
    RAISE EXCEPTION 'ancora ausente ou repetida em {funcao}';
  END IF;
  EXECUTE replace(v_def, $a${origem}$a$, $r${destino}$r$);
END;
$migracao$;
"""


def avaliador(aplicar: bool = True) -> str:
    return _trocar_no_banco(
        "fn_avaliar_metrica", "uuid, jsonb, jsonb",
        _ANCORA_AVALIADOR, _ANCORA_AVALIADOR + RAMO_DESDE, "fn_agregados_desde", aplicar,
    )


def gatilho(aplicar: bool = True) -> str:
    return _trocar_no_banco(
        "trg_eventos_aluno_after_iud", "",
        _ANCORA_LACO, _LACO_DESDE, "20261103_07", aplicar,
    )


def upgrade() -> None:
    op.execute(AGREGADOS_DESDE)
    op.execute(avaliador())
    op.execute(gatilho())
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(gatilho(aplicar=False))
    op.execute(avaliador(aplicar=False))
    op.execute("DROP FUNCTION IF EXISTS public.fn_agregados_desde(uuid, timestamptz)")
    op.execute("NOTIFY pgrst, 'reload schema'")
