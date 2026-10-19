"""Gatilho de conquistas passa a respeitar `conquistas.ativa`

Conferido no banco real (2026-10-16, somente leitura): `trg_eventos_aluno_after_iud()` já filtra a
conquista por turma (`classe_id IS NULL OR classe_id IN (turmas do aluno)`), mas **não olha `ativa`**.
Resultado: o professor "desativa" uma conquista na tela Conquistas (migration 20261016_01/02 criam a
coluna) e o aluno continua a ganhá-la. Esta migration acrescenta `AND c.ativa IS NOT FALSE` ao
`SELECT` do laço, e só isso.

A função é reescrita por inteiro porque o Postgres não tem "editar um trecho": o texto abaixo é a
definição **de produção** (`pg_get_functiondef`, snapshot de 2026-10-16) com uma linha a mais. O
`upgrade` falha de propósito se o banco já tiver outra versão do trecho — ver a guarda. O
`downgrade` restaura o snapshot original.

Conquista já desbloqueada não é desfeita ao desativar (`conquistas_aluno` não é tocada).
Depois de aplicar, virar `GATILHO_RESPEITA_ATIVA` para `true` em
`frontend/src/components/console/conquistas/textos.ts`.

Revision ID: 20261017_06
Revises: 20261017_05
Create Date: 2026-10-17
"""

from alembic import op

revision = "20261017_06"
down_revision = "20261017_05"
branch_labels = None
depends_on = None

NOVA_FUNCAO = r"""CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud()
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

FUNCAO_ORIGINAL = r"""CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud()
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
    # Guarda: só reescreve se a função em produção ainda tem o filtro de classe esperado.
    op.execute(
        """
        DO $guarda$
        BEGIN
          IF position('c.classe_id IS NULL' in pg_get_functiondef('public.trg_eventos_aluno_after_iud()'::regprocedure)) = 0 THEN
            RAISE EXCEPTION 'trg_eventos_aluno_after_iud mudou: revise esta migration antes de aplicar.';
          END IF;
        END
        $guarda$;
        """
    )
    op.execute(NOVA_FUNCAO)


def downgrade() -> None:
    op.execute(FUNCAO_ORIGINAL)
