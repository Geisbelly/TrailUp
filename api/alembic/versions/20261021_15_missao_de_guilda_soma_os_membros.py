"""Fase 4 do plano: a missão de guilda passa a ser cumprida PELA guilda — soma do progresso dos membros

Fecha a fase 4 de `docs/superpowers/specs/2026-10-19-plano-do-que-falta-design.md`. Até aqui
o laço de missão de `trg_eventos_aluno_after_iud` (fase 5a, `20261021_04`) percorria `missoes`
aluno a aluno e **ignorava `escopo`**: uma missão `escopo = 'guilda'` se cumpria sozinho, e o
app a chamava "da guilda". Decisão de produto: **progresso da guilda = soma do progresso dos
membros**.

## O que muda

1. O laço individual passa a pular `escopo = 'guilda'` (`aluno` e `turma` seguem idênticos —
   o teste confere que o resto do corpo é o de `20261021_04`, byte a byte).
2. Um segundo laço, depois do individual e dentro do MESMO `BEGIN ... EXCEPTION`, acha as
   missões de guilda da turma em que o aluno do evento é membro ativo e chama
   `fn_missao_guilda_avaliar(missao, guilda)`.
3. `fn_missao_guilda_avaliar` soma a contribuição dos membros, grava o progresso (0–100) de
   cada membro ativo em `missao_aluno` com `guilda_id`, e, quando a soma atinge o alvo, conclui
   a missão para todos os membros ativos e paga cada um **uma vez**.
4. `fn_missoes_guarda` passa a recusar missão de guilda com métrica que não soma (22023).

## Só métrica que SOMA, e só dentro da janela

"Soma do progresso" só tem significado para contagem e tempo. `acertos_percentual` somado dá
180%; `dias_seguidos` somado não é sequência de ninguém; `atividade_especifica` não é número.
Ficam cinco, e todas contadas **dentro da janela da missão** — nunca desde sempre, senão a
guilda de veteranos nasceria cumprida:

| métrica | contribuição de cada membro | alvo |
|---|---|---|
| `eventos_totais` | eventos não creditados no período | `minimo` |
| `eventos_do_tipo` | idem, do tipo `evento` | `minimo` |
| `atividades_concluidas` | eventos `atividade_concluida` no período | `minimo` |
| `eventos_no_dia` | eventos do `dia` (fuso do critério), opcionalmente do tipo | `minimo` |
| `minutos_no_dia` | `aluno_atividade_diaria.tempo_uso_seg / 60` do `dia` | `minutos` |

As mesmas chaves de alvo do avaliador individual — o console já trava esse mapa em teste.

> **Diferença registrada:** na missão individual `atividades_concluidas` é de vida inteira; na
> de guilda é do período. É de propósito (ver acima) e está no rótulo do console.

`criado_em` de `eventos_aluno` é `timestamp without time zone` em UTC (CLAUDE.md), então a
comparação é `criado_em AT TIME ZONE 'UTC'` contra os `timestamptz` da janela e da filiação.

## Quem é membro: `guilda_membros` tem datas, e elas são usadas

`guilda_membros (joined_at, left_at)` já é um registro datado de filiação — não precisei de
tabela nova. O período de cada membro é **a interseção da janela da missão com a filiação
dele**. Daí:

- quem entra no fim do dia **não leva** o que os outros fizeram antes — o receio do spec
  ("entrar na guilda no fim do dia herda o progresso dos outros") — porque só conta o que ele
  fez depois de entrar, e o progresso de quem saiu fica só até a saída;
- **quem recebe** a conclusão é quem é membro ativo (`left_at IS NULL`) no momento em que a
  soma atinge o alvo. Quem saiu antes não recebe; quem entra depois da conclusão também não
  (a missão já está concluída para a guilda e não reavalia).

`guilda_congelar_composicao` (o congelamento do evento) **não** foi usado: ele fotografa uma
lista num instante, e a missão tem janela — a filiação datada responde a pergunta exata.

## Idempotência e pagamento único

- `pg_advisory_xact_lock` por `(missao, guilda)`: dois membros respondendo ao mesmo tempo não
  concluem duas vezes.
- Guilda que já concluiu volta cedo (há `missao_aluno` concluída com aquele `guilda_id`).
- A conclusão é `ON CONFLICT (aluno_id, missao_id) DO UPDATE ... WHERE status <> 'concluida'`,
  e o prêmio só sai quando essa linha de fato mudou (`ROW_COUNT`). O unique `missao_aluno_unica`
  é por aluno e missão, então o aluno que trocou de guilda depois de concluir não recebe de
  novo pela segunda.
- O prêmio é o mesmo da missão individual: um `eventos_aluno` com `tipo = recompensa_tipo`,
  `referencia = 'missao:<id>'`, valor vindo de `fn_pontos_do_evento`, sob o sinal
  `app.missao_premiando` — que é posto antes e devolvido a vazio depois de cada INSERT.

## Convenções

`SECURITY DEFINER`, `SET search_path = public, pg_temp`, `REVOKE ALL ... FROM PUBLIC, anon,
authenticated` nas duas funções novas: só o gatilho as chama. Nenhuma tabela nova, nenhuma
policy nova. A guarda segue sem DEFINER (ela roda como quem escreve), e por isso a lista de
métricas somáveis está escrita nela, não numa função auxiliar revogada.

Revision ID: 20261021_15
Revises: 20261021_14
Create Date: 2026-10-19
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261021_15"
down_revision = "20261021_14"
branch_labels = None
depends_on = None


METRICAS_SOMAVEIS = (
    "eventos_totais",
    "eventos_do_tipo",
    "atividades_concluidas",
    "eventos_no_dia",
    "minutos_no_dia",
)
_ARRAY_SOMAVEIS = "ARRAY[" + ", ".join(f"'{m}'::text" for m in METRICAS_SOMAVEIS) + "]"


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def gatilho_anterior() -> str:
    """O gatilho como a fase 5a o deixou — é o que está em produção (md5 conferido)."""
    return _modulo("20261021_04_missao_avaliada_no_gatilho.py").GATILHO


def guarda_anterior() -> str:
    """A guarda como a fase 6 (`20261021_07`) a deixou — é a que está em produção."""
    return _modulo("20261021_07_missao_diaria_texto_por_llm.py").GUARDA


def _trocar(texto: str, antes: str, depois: str) -> str:
    if texto.count(antes) != 1:
        raise RuntimeError(f"âncora ausente ou repetida: {antes[:60]!r}")
    return texto.replace(antes, depois)


_DECLARE_ANTES = "  v_premio          text;\n"
_DECLARE_DEPOIS = "  v_premio          text;\n  v_missao_guilda   record;\n"

_FILTRO_ANTES = "       WHERE m.ativa\n"
_FILTRO_DEPOIS = (
    "       WHERE m.ativa\n"
    "         -- Missao de guilda tem laco proprio, abaixo: e' a guilda que cumpre (20261021_15).\n"
    "         AND m.escopo <> 'guilda'\n"
)

_FIM_DO_LACO_ANTES = "    END LOOP;\n  EXCEPTION WHEN OTHERS THEN\n"
_FIM_DO_LACO_DEPOIS = """    END LOOP;

    -- MISSAO DE GUILDA (20261021_15): progresso = soma dos membros. Este aluno so' dispara a
    -- reavaliacao das guildas em que e' membro ATIVO; a soma em si olha a filiacao datada de
    -- todos. Mesmo bloco de EXCEPTION do laco individual: falha aqui nao desfaz o evento.
    FOR v_missao_guilda IN
      SELECT m.id AS missao_id, gm.guilda_id
        FROM public.guilda_membros gm
        JOIN public.guildas g ON g.id = gm.guilda_id AND g.ativa IS NOT FALSE
        JOIN public.missoes m ON m.classe_id = gm.classe_id
       WHERE gm.aluno_id = v_aluno_id
         AND gm.left_at IS NULL
         AND m.escopo = 'guilda'
         AND m.ativa
         AND m.aprovacao = ANY (ARRAY['nao_requer'::text, 'aprovada'::text])
         AND (m.janela_inicio IS NULL OR m.janela_inicio <= now())
         AND (m.janela_fim    IS NULL OR m.janela_fim    >= now())
    LOOP
      PERFORM public.fn_missao_guilda_avaliar(v_missao_guilda.missao_id, v_missao_guilda.guilda_id);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
"""


def gatilho() -> str:
    g = gatilho_anterior()
    g = _trocar(g, _DECLARE_ANTES, _DECLARE_DEPOIS)
    g = _trocar(g, _FILTRO_ANTES, _FILTRO_DEPOIS)
    g = _trocar(g, _FIM_DO_LACO_ANTES, _FIM_DO_LACO_DEPOIS)
    return g


_GUARDA_ANTES = "  -- Recompensa e chave de `eventos_pontuacao`, nao numero."
_GUARDA_DEPOIS = f"""  -- Missao de guilda soma o progresso dos membros (20261021_15). So' contagem e tempo somam:
  -- percentual somado passa de 100, sequencia somada nao e' de ninguem.
  IF NEW.escopo = 'guilda' AND v_metrica <> ALL ({_ARRAY_SOMAVEIS}) THEN
    RAISE EXCEPTION 'Missao de guilda soma o progresso dos membros; a metrica % nao soma.', v_metrica
      USING ERRCODE = '22023';
  END IF;

  -- Recompensa e chave de `eventos_pontuacao`, nao numero."""


def guarda() -> str:
    return _trocar(guarda_anterior(), _GUARDA_ANTES, _GUARDA_DEPOIS)


PROGRESSO = f"""
CREATE OR REPLACE FUNCTION public.fn_missao_guilda_progresso(p_missao bigint, p_guilda uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_m       record;
  v_metrica text;
  v_inicio  timestamptz;
  v_fim     timestamptz;
  v_dia     date;
  v_fuso    text;
  v_soma    numeric := 0;
BEGIN
  SELECT id, classe_id, criterio, janela_inicio, janela_fim, criado_em
    INTO v_m
    FROM public.missoes
   WHERE id = p_missao;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_metrica := v_m.criterio ->> 'metrica';
  IF v_metrica IS NULL OR v_metrica <> ALL ({_ARRAY_SOMAVEIS}) THEN
    RETURN 0;
  END IF;

  -- Periodo da missao. Sem inicio, vale desde a criacao: antes dela nao havia missao.
  v_inicio := COALESCE(v_m.janela_inicio, v_m.criado_em);
  v_fim    := COALESCE(v_m.janela_fim, 'infinity'::timestamptz);
  v_dia    := NULLIF(btrim(COALESCE(v_m.criterio ->> 'dia', '')), '')::date;
  v_fuso   := COALESCE(NULLIF(v_m.criterio ->> 'fuso', ''), 'America/Sao_Paulo');

  -- Cada membro contribui so' no intervalo em que foi membro E a missao estava aberta. Um
  -- aluno que saiu e voltou tem duas linhas, e os intervalos nao se sobrepoem.
  WITH periodo AS (
    SELECT gm.aluno_id,
           GREATEST(COALESCE(gm.joined_at, '-infinity'::timestamptz), v_inicio) AS ini,
           LEAST(COALESCE(gm.left_at, 'infinity'::timestamptz), v_fim)        AS fim
      FROM public.guilda_membros gm
     WHERE gm.guilda_id = p_guilda
       AND gm.classe_id = v_m.classe_id
       AND COALESCE(gm.joined_at, '-infinity'::timestamptz) < v_fim
       AND COALESCE(gm.left_at, 'infinity'::timestamptz) > v_inicio
  )
  SELECT COALESCE(sum(c.valor), 0) INTO v_soma
    FROM periodo p
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN v_metrica = 'minutos_no_dia' THEN (
          -- Granularidade de dia: conta o dia do membro se a filiacao tocou aquele dia.
          SELECT COALESCE(sum(d.tempo_uso_seg), 0) / 60.0
            FROM public.aluno_atividade_diaria d
           WHERE d.aluno_id = p.aluno_id
             AND d.dia = v_dia
             AND p.ini < ((v_dia + 1)::timestamp AT TIME ZONE v_fuso)
             AND p.fim >  (v_dia::timestamp       AT TIME ZONE v_fuso)
        )
        ELSE (
          SELECT count(*)::numeric
            FROM public.eventos_aluno e
           WHERE e.aluno_id = p.aluno_id
             AND NOT public.fn_evento_creditado(e.tipo)
             AND (e.criado_em AT TIME ZONE 'UTC') >= p.ini
             AND (e.criado_em AT TIME ZONE 'UTC') <  p.fim
             AND (
                   v_metrica = 'eventos_totais'
                   OR (v_metrica = 'atividades_concluidas' AND e.tipo = 'atividade_concluida')
                   OR (v_metrica = 'eventos_do_tipo' AND e.tipo = v_m.criterio ->> 'evento')
                   OR (v_metrica = 'eventos_no_dia'
                       AND (v_m.criterio ->> 'evento' IS NULL OR e.tipo = v_m.criterio ->> 'evento')
                       AND (e.criado_em AT TIME ZONE 'UTC' AT TIME ZONE v_fuso)::date = v_dia)
                 )
        )
      END AS valor
    ) c;

  RETURN v_soma;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_guilda_progresso(bigint, uuid) FROM PUBLIC, anon, authenticated;
"""


AVALIAR = """
CREATE OR REPLACE FUNCTION public.fn_missao_guilda_avaliar(p_missao bigint, p_guilda uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_m        record;
  v_membro   record;
  v_alvo     numeric;
  v_soma     numeric;
  v_pct      numeric;
  v_concluiu boolean;
  v_mudou    integer;
BEGIN
  SELECT id, classe_id, escopo, criterio, recompensa_tipo
    INTO v_m
    FROM public.missoes
   WHERE id = p_missao;
  IF NOT FOUND OR v_m.escopo <> 'guilda' OR p_guilda IS NULL THEN
    RETURN false;
  END IF;

  -- Dois membros pontuando ao mesmo tempo nao concluem duas vezes.
  PERFORM pg_advisory_xact_lock(hashtextextended('missao_guilda:' || p_missao::text || ':' || p_guilda::text, 0));

  -- Guilda que ja concluiu nao reavalia: e' o que torna a chamada idempotente.
  IF EXISTS (
    SELECT 1 FROM public.missao_aluno ma
     WHERE ma.missao_id = p_missao AND ma.guilda_id = p_guilda AND ma.status = 'concluida'
  ) THEN
    RETURN false;
  END IF;

  -- Mesmas chaves de alvo do avaliador individual.
  v_alvo := COALESCE(
    CASE WHEN v_m.criterio ->> 'metrica' = 'minutos_no_dia'
         THEN (v_m.criterio ->> 'minutos')::numeric
         ELSE (v_m.criterio ->> 'minimo')::numeric END,
    0);
  v_soma := public.fn_missao_guilda_progresso(p_missao, p_guilda);
  v_concluiu := v_soma >= v_alvo;
  v_pct := CASE WHEN v_alvo > 0 THEN LEAST(100, round(v_soma * 100 / v_alvo, 2)) ELSE 100 END;

  -- Quem recebe e' quem e' membro ATIVO agora. Quem saiu antes fica com a linha que tinha.
  FOR v_membro IN
    SELECT gm.aluno_id
      FROM public.guilda_membros gm
     WHERE gm.guilda_id = p_guilda
       AND gm.classe_id = v_m.classe_id
       AND gm.left_at IS NULL
  LOOP
    IF v_concluiu THEN
      INSERT INTO public.missao_aluno (aluno_id, missao_id, status, progresso, concluida_em, guilda_id)
      VALUES (v_membro.aluno_id, p_missao, 'concluida', 100, now(), p_guilda)
      ON CONFLICT (aluno_id, missao_id) DO UPDATE
        SET status = 'concluida', progresso = 100, concluida_em = now(),
            guilda_id = EXCLUDED.guilda_id, updated_at = now()
        WHERE public.missao_aluno.status <> 'concluida';
      GET DIAGNOSTICS v_mudou = ROW_COUNT;

      -- Paga uma vez so': so' quando a linha de fato virou concluida agora.
      IF v_mudou > 0 AND v_m.recompensa_tipo IS NOT NULL THEN
        PERFORM set_config('app.missao_premiando', 'on', true);
        INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)
        VALUES (v_membro.aluno_id, v_m.recompensa_tipo, 'missao:' || p_missao::text, 0, now());
        PERFORM set_config('app.missao_premiando', '', true);
      END IF;
    ELSE
      INSERT INTO public.missao_aluno (aluno_id, missao_id, status, progresso, concluida_em, guilda_id)
      VALUES (v_membro.aluno_id, p_missao,
              CASE WHEN v_soma > 0 THEN 'em_andamento' ELSE 'pendente' END,
              v_pct, NULL, p_guilda)
      ON CONFLICT (aluno_id, missao_id) DO UPDATE
        SET status = EXCLUDED.status, progresso = EXCLUDED.progresso,
            guilda_id = EXCLUDED.guilda_id, updated_at = now()
        WHERE public.missao_aluno.status <> 'concluida';
    END IF;
  END LOOP;

  RETURN v_concluiu;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.missao_premiando', '', true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_guilda_avaliar(bigint, uuid) FROM PUBLIC, anon, authenticated;
"""


def upgrade() -> None:
    op.execute(PROGRESSO)
    op.execute(AVALIAR)
    op.execute(guarda())
    op.execute(gatilho())
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    # O gatilho volta primeiro: o corpo desta fase chama as funcoes que saem depois.
    op.execute(gatilho_anterior())
    op.execute(guarda_anterior())
    op.execute("DROP FUNCTION IF EXISTS public.fn_missao_guilda_avaliar(bigint, uuid)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_missao_guilda_progresso(bigint, uuid)")
    op.execute("NOTIFY pgrst, 'reload schema'")
