"""Fase 3: o avaliador das métricas sai do gatilho de conquista e passa a ser compartilhado

Terceira fase de `docs/superpowers/specs/2026-10-19-eventos-missoes-ranks-modos-design.md`, e a
de maior risco: `trg_eventos_aluno_after_iud` é o gatilho que avalia conquista, paga prêmio e
tem guarda de recursão. Esta migration **não muda o comportamento dele** — move código.

## Por que DUAS funções, e não uma

O gatilho antigo calcula os agregados do aluno antes do laço, com este comentário:

    -- Agregados: uma vez por evento, nao uma vez por conquista.

Uma `fn_avaliar_metrica(p_aluno, p_criterio)` autossuficiente recalcularia os dez agregados
para **cada** conquista — 27 vezes por evento, hoje, em produção. Seria uma regressão de
desempenho que o autor original evitou de propósito. Então:

- `fn_agregados_do_aluno(p_aluno, p_classe_id) -> jsonb` — os dez agregados, uma vez;
- `fn_avaliar_metrica(p_aluno, p_agregados, p_criterio) -> boolean` — decide, barato.

`fn_avaliar_metrica` é `STABLE`, não `IMMUTABLE`: duas métricas (`atividades_rapidas` e
`atividade_especifica`) dependem de um parâmetro do critério e **precisam** consultar, então
não cabem num agregado fixo. As outras dez só leem o jsonb.

## Equivalência preservada ponto por ponto

O que parece detalhe e muda resultado:

- **Sentinela de `menor_tempo` é 999999.** Sem atividade concluída, `atividade_rapida` tem de
  falhar; com 0 ela passaria sempre.
- **`topicos_visitados` tem duas consultas**, não uma com filtro opcional: com turma, conta
  distintos **daquela** turma; sem turma, conta distintos de todas. E `topicos_da_classe` é 0
  quando não há turma — o que faz `visitados = 'todos'` falhar, porque o teste é
  `topicos_da_classe > 0 AND visitados >= topicos_da_classe`.
- **Todo limiar tem `COALESCE(..., 0)`.** Critério sem o parâmetro vira alvo zero e a conquista
  é atingida — é o comportamento atual, e mudá-lo aqui seria mudar o resultado. (É também o
  motivo de `criterio.ts` no console travar cada par métrica→chave: chave errada = alvo zero.)
- **`status` é comparado por `position('concl' in lower(status::text))`**, não por igualdade: o
  enum `status_atividade` tem `concluido` sem acento no í, e o `::text` antes do `lower` evita
  o `COALESCE(enum, '')` que o CLAUDE.md registra como estouro em tempo de execução.

## `atividade_especifica` deixa de ser exceção

A fase 2 aceitava essa métrica na validação de `missoes` mas **nada a avaliava**: era o buraco
registrado como "a fase 3 precisa implementá-la". Agora ela existe, e é a métrica de missão de
entrega: verdadeira quando `atividade_aluno` daquele aluno e daquela atividade está concluída.

Ela **não** entra em `fn_conquista_metrica_suportada`. Conquista não deveria depender de uma
atividade específica — o escopo dela é o aluno, não um item da trilha —, e deixar a função de
conquista sem essa métrica mantém o editor de conquista incapaz de oferecê-la.

## O que esta migration NÃO faz

Não liga missão no gatilho. `fn_avaliar_metrica` fica pronta e testada, mas quem percorre
`missoes` e escreve `missao_aluno` é a fase seguinte. Separar é de propósito: assim um problema
de equivalência aparece **antes** de haver escrita nova dependendo dela.

Revision ID: 20261021_03
Revises: 20261021_02
Create Date: 2026-10-19
"""

from alembic import op

revision = "20261021_03"
down_revision = "20261021_02"
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# Os dez agregados, calculados uma vez. Copiados do corpo do gatilho sem
# mudança de semântica.
# ---------------------------------------------------------------------------
AGREGADOS = r"""
CREATE OR REPLACE FUNCTION public.fn_agregados_do_aluno(p_aluno uuid, p_classe_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_eventos_totais     integer;
  v_dias_seguidos      integer;
  v_minutos_totais     numeric;
  v_topicos_visitados  integer;
  v_topicos_da_classe  integer;
  v_topicos_concluidos integer;
  v_melhor_acertos     numeric;
  v_melhor_trilha      numeric;
  v_menor_tempo        numeric;
  v_contagem_por_tipo  jsonb;
BEGIN
  SELECT count(*) INTO v_eventos_totais
    FROM public.eventos_aluno
   WHERE aluno_id = p_aluno AND NOT public.fn_evento_creditado(tipo);

  WITH dias AS (
    SELECT DISTINCT date(criado_em) AS d
      FROM public.eventos_aluno
     WHERE aluno_id = p_aluno AND NOT public.fn_evento_creditado(tipo)
  ), seq AS (
    SELECT d, d - (row_number() OVER (ORDER BY d))::int AS grp FROM dias
  ), cont AS (
    SELECT count(*) AS qtd FROM seq GROUP BY grp
  )
  SELECT COALESCE(max(qtd), 0) INTO v_dias_seguidos FROM cont;

  SELECT COALESCE((SELECT sum(tempo_gasto_min) FROM public.atividade_aluno WHERE aluno_id = p_aluno), 0)
       + COALESCE((SELECT sum(tempo_gasto_min) FROM public.conteudo_aluno  WHERE aluno_id = p_aluno), 0)
    INTO v_minutos_totais;

  SELECT COALESCE(max(acertos_percentual), 0) INTO v_melhor_acertos
    FROM public.atividade_aluno WHERE aluno_id = p_aluno;

  -- Sentinela alta: sem atividade concluida, nenhuma conquista de rapidez passa.
  SELECT COALESCE(min(tempo_gasto_min), 999999) INTO v_menor_tempo
    FROM public.atividade_aluno
   WHERE aluno_id = p_aluno
     AND tempo_gasto_min IS NOT NULL
     AND position('concl' in lower(coalesce(status::text, ''))) > 0;

  SELECT COALESCE(max(percentual_concluido), 0) INTO v_melhor_trilha
    FROM public.topico_aluno WHERE aluno_id = p_aluno;

  SELECT count(*) INTO v_topicos_concluidos
    FROM public.topico_aluno
   WHERE aluno_id = p_aluno
     AND position('concl' in lower(coalesce(status::text, ''))) > 0;

  SELECT COALESCE(jsonb_object_agg(tipo, n), '{}'::jsonb) INTO v_contagem_por_tipo
    FROM (SELECT tipo, count(*) AS n FROM public.eventos_aluno WHERE aluno_id = p_aluno GROUP BY tipo) s;

  -- Duas consultas, nao uma com filtro opcional: com turma conta distintos DAQUELA turma, e
  -- `topicos_da_classe` vira 0 sem turma -- o que faz `visitados = 'todos'` falhar de proposito.
  IF p_classe_id IS NOT NULL THEN
    SELECT count(*) INTO v_topicos_da_classe FROM public.topicos WHERE classe_id = p_classe_id;

    SELECT count(DISTINCT ta.topico_id) INTO v_topicos_visitados
      FROM public.topico_aluno ta
      JOIN public.topicos t ON t.id = ta.topico_id
     WHERE ta.aluno_id = p_aluno
       AND t.classe_id = p_classe_id
       AND ta.status::text <> 'não iniciado';
  ELSE
    v_topicos_da_classe := 0;
    SELECT count(DISTINCT topico_id) INTO v_topicos_visitados
      FROM public.topico_aluno
     WHERE aluno_id = p_aluno AND status::text <> 'não iniciado';
  END IF;

  RETURN jsonb_build_object(
    'eventos_totais',     v_eventos_totais,
    'dias_seguidos',      v_dias_seguidos,
    'minutos_totais',     v_minutos_totais,
    'topicos_visitados',  v_topicos_visitados,
    'topicos_da_classe',  v_topicos_da_classe,
    'topicos_concluidos', v_topicos_concluidos,
    'melhor_acertos',     v_melhor_acertos,
    'melhor_trilha',      v_melhor_trilha,
    'menor_tempo',        v_menor_tempo,
    'contagem_por_tipo',  v_contagem_por_tipo
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_agregados_do_aluno(uuid, bigint) FROM PUBLIC, anon, authenticated;
"""


# ---------------------------------------------------------------------------
# O decisor. Ramos copiados do gatilho, na mesma ordem, com os mesmos COALESCE.
# ---------------------------------------------------------------------------
AVALIADOR = r"""
CREATE OR REPLACE FUNCTION public.fn_avaliar_metrica(p_aluno uuid, p_agregados jsonb, p_criterio jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_metrica text := p_criterio ->> 'metrica';
  v_ok      boolean := false;
  v_ag      jsonb := COALESCE(p_agregados, '{}'::jsonb);
  v_contagem jsonb := COALESCE(v_ag -> 'contagem_por_tipo', '{}'::jsonb);
BEGIN
  IF v_metrica IS NULL THEN
    RETURN false;
  END IF;

  IF v_metrica = 'eventos_totais' THEN
    v_ok := COALESCE((v_ag ->> 'eventos_totais')::int, 0) >= COALESCE((p_criterio ->> 'minimo')::int, 0);

  ELSIF v_metrica = 'eventos_do_tipo' THEN
    v_ok := COALESCE((v_contagem ->> (p_criterio ->> 'evento'))::int, 0)
            >= COALESCE((p_criterio ->> 'minimo')::int, 0);

  ELSIF v_metrica = 'atividades_concluidas' THEN
    v_ok := COALESCE((v_contagem ->> 'atividade_concluida')::int, 0)
            >= COALESCE((p_criterio ->> 'minimo')::int, 0);

  ELSIF v_metrica = 'topicos_concluidos' THEN
    v_ok := COALESCE((v_ag ->> 'topicos_concluidos')::int, 0) >= COALESCE((p_criterio ->> 'minimo')::int, 0);

  ELSIF v_metrica = 'topicos_visitados' THEN
    IF p_criterio ->> 'visitados' = 'todos' THEN
      v_ok := COALESCE((v_ag ->> 'topicos_da_classe')::int, 0) > 0
              AND COALESCE((v_ag ->> 'topicos_visitados')::int, 0) >= COALESCE((v_ag ->> 'topicos_da_classe')::int, 0);
    ELSE
      v_ok := COALESCE((v_ag ->> 'topicos_visitados')::int, 0) >= COALESCE((p_criterio ->> 'visitados')::int, 0);
    END IF;

  ELSIF v_metrica = 'dias_seguidos' THEN
    v_ok := COALESCE((v_ag ->> 'dias_seguidos')::int, 0) >= COALESCE((p_criterio ->> 'dias_seguidos')::int, 0);

  ELSIF v_metrica = 'minutos_totais' THEN
    v_ok := COALESCE((v_ag ->> 'minutos_totais')::numeric, 0) >= COALESCE((p_criterio ->> 'minutos')::numeric, 0);

  ELSIF v_metrica = 'acertos_percentual' THEN
    v_ok := COALESCE((v_ag ->> 'melhor_acertos')::numeric, 0) >= COALESCE((p_criterio ->> 'percentual')::numeric, 0);

  ELSIF v_metrica = 'trilha_percentual' THEN
    v_ok := COALESCE((v_ag ->> 'melhor_trilha')::numeric, 0) >= COALESCE((p_criterio ->> 'percentual')::numeric, 0);

  ELSIF v_metrica = 'atividade_rapida' THEN
    -- Sentinela 999999 nos agregados: sem atividade concluida isto e' falso.
    v_ok := COALESCE((v_ag ->> 'menor_tempo')::numeric, 999999) <= COALESCE((p_criterio ->> 'max_tempo')::numeric, 0);

  ELSIF v_metrica = 'atividades_rapidas' THEN
    -- Depende de `max_tempo` do criterio, entao nao cabe num agregado fixo.
    SELECT count(*) >= COALESCE((p_criterio ->> 'minimo')::int, 0)
      INTO v_ok
      FROM public.atividade_aluno
     WHERE aluno_id = p_aluno
       AND tempo_gasto_min IS NOT NULL
       AND tempo_gasto_min <= COALESCE((p_criterio ->> 'max_tempo')::numeric, 0)
       AND position('concl' in lower(coalesce(status::text, ''))) > 0;

  ELSIF v_metrica = 'atividade_especifica' THEN
    -- Metrica da missao de entrega (fase 2). NAO entra em
    -- `fn_conquista_metrica_suportada`: o escopo de conquista e' o aluno, nao um item da trilha.
    SELECT count(*) > 0
      INTO v_ok
      FROM public.atividade_aluno aa
     WHERE aa.aluno_id = p_aluno
       AND aa.atividade_id = NULLIF(btrim(COALESCE(p_criterio ->> 'atividade_id', '')), '')::bigint
       AND position('concl' in lower(coalesce(aa.status::text, ''))) > 0;
  END IF;

  RETURN COALESCE(v_ok, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_avaliar_metrica(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
"""


# ---------------------------------------------------------------------------
# O gatilho, agora chamando as duas. O resto do corpo é o de `20261017_06`.
# ---------------------------------------------------------------------------
GATILHO = r"""
CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aluno_id        uuid;
  v_tipo            text;
  v_referencia      text;

  v_classe_id_old   bigint;
  v_classe_id_new   bigint;
  v_classe_id       bigint;

  v_conquista       record;
  v_conq_id         bigint;
  v_concluida_atual boolean;
  v_atingiu         boolean;
  v_premiar         boolean;

  -- Agregados: uma vez por evento, nao uma vez por conquista. E' por isso que o
  -- avaliador recebe `v_agregados` em vez de calcular por conta.
  v_agregados       jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_aluno_id := OLD.aluno_id;
    v_tipo := OLD.tipo;
    v_referencia := OLD.referencia;
  ELSE
    v_aluno_id := NEW.aluno_id;
    v_tipo := NEW.tipo;
    v_referencia := NEW.referencia;
  END IF;

  -- Guarda de recursao: o premio da conquista e' um evento. Sem ela, premiar
  -- reentraria neste gatilho e reavaliaria tudo de novo.
  IF public.fn_evento_creditado(v_tipo) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_classe_id_old := public.fn_eventos_aluno_resolve_classe_id(OLD.tipo, OLD.referencia);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_classe_id_new := public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia);
  END IF;

  v_classe_id := COALESCE(v_classe_id_new, v_classe_id_old);

  -- Ranking e' dirigido so' por view; este gatilho nao materializa posicao.
  IF TG_OP = 'DELETE' OR v_aluno_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  v_agregados := public.fn_agregados_do_aluno(v_aluno_id, v_classe_id);

  FOR v_conquista IN
    WITH representativos AS (
      SELECT rep.nome
        FROM (
          SELECT lower(p.nome) AS nome,
                 COALESCE(ap.afinidade, 0) AS af,
                 row_number() OVER (
                   ORDER BY COALESCE(ap.afinidade, 0) DESC, p.nome ASC
                 ) AS pos
            FROM public.aluno_perfil ap
            JOIN public.perfil p ON p.id = ap.perfil_id
           WHERE ap.aluno_id = v_aluno_id
        ) rep
       WHERE rep.af >= 20
          OR (rep.af > 0 AND rep.pos <= 2)
    )
    SELECT c.*
      FROM public.conquistas c
     WHERE (
             lower(COALESCE(c.escopo, 'comum')) <> 'perfil'
             OR lower(COALESCE(c.perfil_alvo, '')) IN (SELECT nome FROM representativos)
           )
       AND (
             -- FILTRO DE CLASSE (20260911_06)
             -- Os parenteses acima nao sao estilo: o predicado de perfil e uma
             -- DISJUNCAO, e `AND` liga mais forte que `OR`. Sem eles, conquista
             -- comum de outra turma passaria pelo primeiro ramo.
             c.classe_id IS NULL
             OR c.classe_id IN (
                  SELECT ca.classe_id
                    FROM public.classe_aluno ca
                   WHERE ca.aluno_id = v_aluno_id
                )
           )
       AND c.ativa IS NOT FALSE
  LOOP
    v_conq_id := NULL;
    v_concluida_atual := NULL;

    v_atingiu := public.fn_avaliar_metrica(v_aluno_id, v_agregados, v_conquista.criterio);

    IF v_atingiu THEN
      v_premiar := false;

      SELECT id, concluida INTO v_conq_id, v_concluida_atual
        FROM public.conquistas_aluno
       WHERE aluno_id = v_aluno_id AND conquista_id = v_conquista.id;

      IF v_conq_id IS NULL THEN
        INSERT INTO public.conquistas_aluno (
          aluno_id, conquista_id, data_conquista, progresso, concluida
        ) VALUES (v_aluno_id, v_conquista.id, now(), 100, TRUE)
        RETURNING id INTO v_conq_id;
        v_premiar := true;

      ELSIF COALESCE(v_concluida_atual, FALSE) = FALSE THEN
        UPDATE public.conquistas_aluno
           SET concluida = TRUE, progresso = 100, data_conquista = now()
         WHERE id = v_conq_id;
        v_premiar := true;
      END IF;

      -- Paga uma vez so: os dois ramos acima sao os unicos que viram TRUE.
      IF v_premiar THEN
        INSERT INTO public.notificacoes (aluno_id, titulo, corpo, tipo)
        VALUES (
          v_aluno_id,
          'Nova conquista desbloqueada!',
          'Parabens! Voce desbloqueou a conquista "' || v_conquista.nome || '".',
          'conquista'
        );

        IF COALESCE(v_conquista.pontos_recompensa, 0) > 0 THEN
          -- `classe:<id>` e' a forma que a view sabe resolver. Sem classe o
          -- premio fica registrado no razao, mas nao soma em rank nenhum --
          -- nao ha rank onde somar.
          INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)
          VALUES (
            v_aluno_id,
            'conquista_desbloqueada',
            CASE WHEN v_conquista.id IS NULL THEN NULL
                 ELSE 'conquista:' || v_conquista.id::text END,
            v_conquista.pontos_recompensa,
            now()
          );
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;
"""


SQL = AGREGADOS + AVALIADOR + GATILHO + "\nNOTIFY pgrst, 'reload schema';\n"


# ---------------------------------------------------------------------------
# Corpo anterior, para o downgrade. Copiado de
# 20261017_06_gatilho_conquistas_respeita_ativa.py (constante NOVA_FUNCAO), que e o que esta
# em producao antes desta revisao. O padrao da casa e guardar o corpo inteiro -- ver
# ANTERIOR_SQL em 20261017_07 -- em vez de mandar quem faz downgrade reaplicar outra
# revisao a mao.
# ---------------------------------------------------------------------------
GATILHO_ANTERIOR = r"""
CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aluno_id        uuid;
  v_tipo            text;
  v_referencia      text;

  v_classe_id_old   bigint;
  v_classe_id_new   bigint;
  v_classe_id       bigint;

  v_conquista       record;
  v_conq_id         bigint;
  v_concluida_atual boolean;
  v_atingiu         boolean;
  v_premiar         boolean;
  v_metrica         text;

  -- Agregados: uma vez por evento, nao uma vez por conquista.
  v_eventos_totais    integer;
  v_dias_seguidos     integer;
  v_minutos_totais    numeric;
  v_topicos_visitados integer;
  v_topicos_da_classe integer;
  v_topicos_concluidos integer;
  v_melhor_acertos    numeric;
  v_melhor_trilha     numeric;
  v_menor_tempo       numeric;
  v_contagem_por_tipo jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_aluno_id := OLD.aluno_id;
    v_tipo := OLD.tipo;
    v_referencia := OLD.referencia;
  ELSE
    v_aluno_id := NEW.aluno_id;
    v_tipo := NEW.tipo;
    v_referencia := NEW.referencia;
  END IF;

  -- Guarda de recursao: o premio da conquista e' um evento. Sem ela, premiar
  -- reentraria neste gatilho e reavaliaria tudo de novo.
  IF public.fn_evento_creditado(v_tipo) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_classe_id_old := public.fn_eventos_aluno_resolve_classe_id(OLD.tipo, OLD.referencia);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_classe_id_new := public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia);
  END IF;

  v_classe_id := COALESCE(v_classe_id_new, v_classe_id_old);

  -- Ranking e' dirigido so' por view; este gatilho nao materializa posicao.
  IF TG_OP = 'DELETE' OR v_aluno_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT count(*) INTO v_eventos_totais
    FROM public.eventos_aluno
   WHERE aluno_id = v_aluno_id AND NOT public.fn_evento_creditado(tipo);

  WITH dias AS (
    SELECT DISTINCT date(criado_em) AS d
      FROM public.eventos_aluno
     WHERE aluno_id = v_aluno_id AND NOT public.fn_evento_creditado(tipo)
  ), seq AS (
    SELECT d, d - (row_number() OVER (ORDER BY d))::int AS grp FROM dias
  ), cont AS (
    SELECT count(*) AS qtd FROM seq GROUP BY grp
  )
  SELECT COALESCE(max(qtd), 0) INTO v_dias_seguidos FROM cont;

  SELECT COALESCE((
           SELECT sum(tempo_gasto_min) FROM public.atividade_aluno
            WHERE aluno_id = v_aluno_id), 0)
       + COALESCE((
           SELECT sum(tempo_gasto_min) FROM public.conteudo_aluno
            WHERE aluno_id = v_aluno_id), 0)
    INTO v_minutos_totais;

  SELECT COALESCE(max(acertos_percentual), 0) INTO v_melhor_acertos
    FROM public.atividade_aluno WHERE aluno_id = v_aluno_id;

  -- Sentinela alta: sem atividade concluida, nenhuma conquista de rapidez passa.
  SELECT COALESCE(min(tempo_gasto_min), 999999) INTO v_menor_tempo
    FROM public.atividade_aluno
   WHERE aluno_id = v_aluno_id
     AND tempo_gasto_min IS NOT NULL
     AND position('concl' in lower(coalesce(status::text, ''))) > 0;

  SELECT COALESCE(max(percentual_concluido), 0) INTO v_melhor_trilha
    FROM public.topico_aluno WHERE aluno_id = v_aluno_id;

  SELECT count(*) INTO v_topicos_concluidos
    FROM public.topico_aluno
   WHERE aluno_id = v_aluno_id
     AND position('concl' in lower(coalesce(status::text, ''))) > 0;

  SELECT COALESCE(jsonb_object_agg(tipo, n), '{}'::jsonb) INTO v_contagem_por_tipo
    FROM (
      SELECT tipo, count(*) AS n FROM public.eventos_aluno
       WHERE aluno_id = v_aluno_id GROUP BY tipo
    ) s;

  IF v_classe_id IS NOT NULL THEN
    SELECT count(*) INTO v_topicos_da_classe
      FROM public.topicos WHERE classe_id = v_classe_id;

    SELECT count(DISTINCT ta.topico_id) INTO v_topicos_visitados
      FROM public.topico_aluno ta
      JOIN public.topicos t ON t.id = ta.topico_id
     WHERE ta.aluno_id = v_aluno_id
       AND t.classe_id = v_classe_id
       AND ta.status::text <> 'não iniciado';
  ELSE
    v_topicos_da_classe := 0;
    SELECT count(DISTINCT topico_id) INTO v_topicos_visitados
      FROM public.topico_aluno
     WHERE aluno_id = v_aluno_id AND status::text <> 'não iniciado';
  END IF;

  FOR v_conquista IN
    WITH representativos AS (
      SELECT rep.nome
        FROM (
          SELECT lower(p.nome) AS nome,
                 COALESCE(ap.afinidade, 0) AS af,
                 row_number() OVER (
                   ORDER BY COALESCE(ap.afinidade, 0) DESC, p.nome ASC
                 ) AS pos
            FROM public.aluno_perfil ap
            JOIN public.perfil p ON p.id = ap.perfil_id
           WHERE ap.aluno_id = v_aluno_id
        ) rep
       WHERE rep.af >= 20
          OR (rep.af > 0 AND rep.pos <= 2)
    )
    SELECT c.*
      FROM public.conquistas c
     WHERE (
             lower(COALESCE(c.escopo, 'comum')) <> 'perfil'
             OR lower(COALESCE(c.perfil_alvo, '')) IN (SELECT nome FROM representativos)
           )
       AND (
             -- FILTRO DE CLASSE (20260911_06)
             -- Os parenteses acima nao sao estilo: o predicado de perfil e uma
             -- DISJUNCAO, e `AND` liga mais forte que `OR`. Sem eles, conquista
             -- comum de outra turma passaria pelo primeiro ramo.
             c.classe_id IS NULL
             OR c.classe_id IN (
                  SELECT ca.classe_id
                    FROM public.classe_aluno ca
                   WHERE ca.aluno_id = v_aluno_id
                )
           )
       AND c.ativa IS NOT FALSE
  LOOP
    v_atingiu := false;
    v_conq_id := NULL;
    v_concluida_atual := NULL;
    v_metrica := v_conquista.criterio->>'metrica';

    IF v_metrica = 'eventos_totais' THEN
      v_atingiu := v_eventos_totais >= COALESCE((v_conquista.criterio->>'minimo')::int, 0);
    ELSIF v_metrica = 'eventos_do_tipo' THEN
      v_atingiu := COALESCE((v_contagem_por_tipo->>(v_conquista.criterio->>'evento'))::int, 0) >= COALESCE((v_conquista.criterio->>'minimo')::int, 0);
    ELSIF v_metrica = 'atividades_concluidas' THEN
      v_atingiu := COALESCE((v_contagem_por_tipo->>'atividade_concluida')::int, 0) >= COALESCE((v_conquista.criterio->>'minimo')::int, 0);
    ELSIF v_metrica = 'topicos_concluidos' THEN
      v_atingiu := v_topicos_concluidos >= COALESCE((v_conquista.criterio->>'minimo')::int, 0);
    ELSIF v_metrica = 'topicos_visitados' THEN
      IF v_conquista.criterio->>'visitados' = 'todos' THEN
        v_atingiu := v_topicos_da_classe > 0 AND v_topicos_visitados >= v_topicos_da_classe;
      ELSE
        v_atingiu := v_topicos_visitados >= COALESCE((v_conquista.criterio->>'visitados')::int, 0);
      END IF;
    ELSIF v_metrica = 'dias_seguidos' THEN
      v_atingiu := v_dias_seguidos >= COALESCE((v_conquista.criterio->>'dias_seguidos')::int, 0);
    ELSIF v_metrica = 'minutos_totais' THEN
      v_atingiu := v_minutos_totais >= COALESCE((v_conquista.criterio->>'minutos')::numeric, 0);
    ELSIF v_metrica = 'acertos_percentual' THEN
      v_atingiu := v_melhor_acertos >= COALESCE((v_conquista.criterio->>'percentual')::numeric, 0);
    ELSIF v_metrica = 'trilha_percentual' THEN
      v_atingiu := v_melhor_trilha >= COALESCE((v_conquista.criterio->>'percentual')::numeric, 0);
    ELSIF v_metrica = 'atividade_rapida' THEN
      v_atingiu := v_menor_tempo <= COALESCE((v_conquista.criterio->>'max_tempo')::numeric, 0);
    ELSIF v_metrica = 'atividades_rapidas' THEN
      SELECT count(*) >= COALESCE((v_conquista.criterio->>'minimo')::int, 0)
        INTO v_atingiu
        FROM public.atividade_aluno
       WHERE aluno_id = v_aluno_id
         AND tempo_gasto_min IS NOT NULL
         AND tempo_gasto_min <= COALESCE((v_conquista.criterio->>'max_tempo')::numeric, 0)
         AND position('concl' in lower(coalesce(status::text, ''))) > 0;
    END IF;

    IF v_atingiu THEN
      v_premiar := false;

      SELECT id, concluida INTO v_conq_id, v_concluida_atual
        FROM public.conquistas_aluno
       WHERE aluno_id = v_aluno_id AND conquista_id = v_conquista.id;

      IF v_conq_id IS NULL THEN
        INSERT INTO public.conquistas_aluno (
          aluno_id, conquista_id, data_conquista, progresso, concluida
        ) VALUES (v_aluno_id, v_conquista.id, now(), 100, TRUE)
        RETURNING id INTO v_conq_id;
        v_premiar := true;

      ELSIF COALESCE(v_concluida_atual, FALSE) = FALSE THEN
        UPDATE public.conquistas_aluno
           SET concluida = TRUE, progresso = 100, data_conquista = now()
         WHERE id = v_conq_id;
        v_premiar := true;
      END IF;

      -- Paga uma vez so: os dois ramos acima sao os unicos que viram TRUE.
      IF v_premiar THEN
        INSERT INTO public.notificacoes (aluno_id, titulo, corpo, tipo)
        VALUES (
          v_aluno_id,
          'Nova conquista desbloqueada!',
          'Parabens! Voce desbloqueou a conquista "' || v_conquista.nome || '".',
          'conquista'
        );

        IF COALESCE(v_conquista.pontos_recompensa, 0) > 0 THEN
          -- `classe:<id>` e' a forma que a view sabe resolver. Sem classe o
          -- premio fica registrado no razao, mas nao soma em rank nenhum --
          -- nao ha rank onde somar.
          INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)
          VALUES (
            v_aluno_id,
            'conquista_desbloqueada',
            CASE WHEN v_conquista.id IS NULL THEN NULL
                 ELSE 'conquista:' || v_conquista.id::text END,
            v_conquista.pontos_recompensa,
            now()
          );
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(GATILHO_ANTERIOR)
    op.execute("DROP FUNCTION IF EXISTS public.fn_avaliar_metrica(uuid, jsonb, jsonb)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_agregados_do_aluno(uuid, bigint)")
    op.execute("NOTIFY pgrst, 'reload schema'")
