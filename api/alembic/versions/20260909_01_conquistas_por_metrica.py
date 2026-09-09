"""conquistas passam a ser avaliadas pela metrica declarada, e pagam os pontos

Dois defeitos, uma raiz.

**21 das 27 conquistas nunca destravavam.** `trg_eventos_aluno_after_iud`
decidia por uma cadeia `IF/ELSIF` fechada em seis valores de `conquistas.tipo`
(`simples`, `tempo`, `acertos`, `dias`, `tempo_total`, `exploracao`), sem `ELSE`.
A `20260826_12` inseriu 21 linhas com `tipo` novo (`brainhex_*`) e nao acrescentou
ramo nenhum: todas caiam fora da cadeia com `v_atingiu = false`, para sempre, sem
erro. Medido em producao: 6 concessoes no total, uma de cada tipo avaliado, zero
de conquista de perfil.

**E as 6 que destravavam nao pagavam.** Ao destravar, o gatilho escrevia em
`conquistas_aluno` e em `notificacoes` — nunca em `eventos_aluno`. Como o rank
soma `eventos_aluno.valor`, `pontos_recompensa` era numero decorativo.

O que muda:

1. O criterio passa a declarar a **metrica** (`criterio->>'metrica'`), e o
   despacho e por ela. `tipo` deixa de ser codigo disfarcado de dado — era a
   mesma armadilha de `rank_tipo.criterio`.

2. `METRICAS` abaixo e a **unica** fonte: dela saem tanto a lista aceita por
   `fn_conquista_metrica_suportada` quanto os ramos do gatilho. Declarar uma
   metrica sem avaliar deixa de ser possivel por construcao, que e exatamente o
   defeito que aconteceu.

3. Um CHECK em `conquistas` recusa criterio sem metrica suportada. E mais forte
   que um teste que percorre as linhas: a linha morta nao chega a existir.

4. Destravar emite `conquista_desbloqueada` em `eventos_aluno`, com guarda de
   recursao — sem ela, premiar reentraria no gatilho.

5. `vw_rank_posicoes_por_classe_todas` passa a resolver a classe desse evento.
   Sem isso o premio seria inserido e **descartado em silencio** pelo
   `WHERE ... IS NOT NULL` da view, que so conhecia os prefixos `topico`,
   `conteudo` e `atividade`.

Os agregados sairam de dentro do laco: antes cada conquista rodava a propria
agregacao, 27 vezes por evento inserido. Agora sao calculados uma vez e o laco
so compara.

Nota sobre `topico_concluido`: duas conquistas do Conqueror pediam contagem do
evento `topico_concluido`, que **nenhum cliente emite** (os 12 tipos observados
nao o incluem). Elas passam a ler `topico_aluno.status`, que o trigger de
progresso ja mantem — assim funcionam sem depender de mudanca no app.

Revision ID: 20260909_01
Revises: 20260831_02
Create Date: 2026-09-09
"""

from alembic import op

revision = "20260909_01"
down_revision = "20260831_02"
branch_labels = None
depends_on = None


# Fonte unica: nome da metrica -> corpo PL/pgSQL que resolve `v_atingiu`.
# A lista aceita pelo banco e os ramos do gatilho sao gerados daqui, entao nao
# ha como declarar uma metrica que ninguem avalia.
METRICAS: dict[str, str] = {
    # Qualquer evento do aluno. Exclui o proprio premio, que nao e esforco.
    "eventos_totais": (
        "v_atingiu := v_eventos_totais >= "
        "COALESCE((v_conquista.criterio->>'minimo')::int, 0);"
    ),
    # Contagem de um tipo de evento nomeado em `criterio->>'evento'`.
    "eventos_do_tipo": (
        "v_atingiu := COALESCE("
        "(v_contagem_por_tipo->>(v_conquista.criterio->>'evento'))::int, 0) >= "
        "COALESCE((v_conquista.criterio->>'minimo')::int, 0);"
    ),
    "atividades_concluidas": (
        "v_atingiu := COALESCE((v_contagem_por_tipo->>'atividade_concluida')::int, 0) >= "
        "COALESCE((v_conquista.criterio->>'minimo')::int, 0);"
    ),
    # Le `topico_aluno`, nao evento: `topico_concluido` nao e emitido por ninguem.
    "topicos_concluidos": (
        "v_atingiu := v_topicos_concluidos >= "
        "COALESCE((v_conquista.criterio->>'minimo')::int, 0);"
    ),
    # `visitados` aceita um numero ou a palavra "todos" (que exige uma classe).
    "topicos_visitados": (
        "IF v_conquista.criterio->>'visitados' = 'todos' THEN\n"
        "        v_atingiu := v_topicos_da_classe > 0 "
        "AND v_topicos_visitados >= v_topicos_da_classe;\n"
        "      ELSE\n"
        "        v_atingiu := v_topicos_visitados >= "
        "COALESCE((v_conquista.criterio->>'visitados')::int, 0);\n"
        "      END IF;"
    ),
    "dias_seguidos": (
        "v_atingiu := v_dias_seguidos >= "
        "COALESCE((v_conquista.criterio->>'dias_seguidos')::int, 0);"
    ),
    "minutos_totais": (
        "v_atingiu := v_minutos_totais >= "
        "COALESCE((v_conquista.criterio->>'minutos')::numeric, 0);"
    ),
    # Melhor acerto em UMA atividade, nao media.
    "acertos_percentual": (
        "v_atingiu := v_melhor_acertos >= "
        "COALESCE((v_conquista.criterio->>'percentual')::numeric, 0);"
    ),
    "trilha_percentual": (
        "v_atingiu := v_melhor_trilha >= "
        "COALESCE((v_conquista.criterio->>'percentual')::numeric, 0);"
    ),
    "atividade_rapida": (
        "v_atingiu := v_menor_tempo <= "
        "COALESCE((v_conquista.criterio->>'max_tempo')::numeric, 0);"
    ),
    # Depende do limiar da propria conquista, entao nao da para pre-calcular.
    "atividades_rapidas": (
        "SELECT count(*) >= COALESCE((v_conquista.criterio->>'minimo')::int, 0)\n"
        "        INTO v_atingiu\n"
        "        FROM public.atividade_aluno\n"
        "       WHERE aluno_id = v_aluno_id\n"
        "         AND tempo_gasto_min IS NOT NULL\n"
        "         AND tempo_gasto_min <= "
        "COALESCE((v_conquista.criterio->>'max_tempo')::numeric, 0)\n"
        "         AND position('concl' in lower(coalesce(status::text, ''))) > 0;"
    ),
}

EVENTO_PREMIO = "conquista_desbloqueada"


def _lista_sql() -> str:
    return ", ".join(f"'{nome}'" for nome in METRICAS)


def _ramos_sql() -> str:
    partes = []
    for indice, (nome, corpo) in enumerate(METRICAS.items()):
        palavra = "IF" if indice == 0 else "ELSIF"
        partes.append(f"    {palavra} v_metrica = '{nome}' THEN\n      {corpo}")
    # Sem ELSE: metrica desconhecida nao destrava. O CHECK impede que exista.
    partes.append("    END IF;")
    return "\n".join(partes)


FUNCAO_METRICA_SUPORTADA = f"""
CREATE OR REPLACE FUNCTION public.fn_conquista_metrica_suportada(p_metrica text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT p_metrica IN ({_lista_sql()});
$fn$;
"""

# Deriva a metrica do formato que o criterio ja tem. As chaves nunca foram o
# problema — o `tipo` e que nao casava com ramo nenhum.
BACKFILL = """
UPDATE public.conquistas c
   SET criterio = c.criterio || jsonb_build_object('metrica', v.metrica)
  FROM (
    SELECT id,
           CASE
             WHEN criterio ? 'evento' AND criterio->>'evento' = 'topico_concluido'
               THEN 'topicos_concluidos'
             WHEN criterio ? 'evento' THEN 'eventos_do_tipo'
             WHEN criterio ? 'visitados' THEN 'topicos_visitados'
             WHEN criterio ? 'dias_seguidos' THEN 'dias_seguidos'
             WHEN criterio ? 'minutos' THEN 'minutos_totais'
             WHEN criterio ? 'minimo' AND criterio ? 'max_tempo' THEN 'atividades_rapidas'
             WHEN criterio ? 'max_tempo' THEN 'atividade_rapida'
             -- `percentual` significava duas coisas, separadas so pelo resumo:
             -- acerto numa atividade e conclusao da trilha.
             WHEN criterio ? 'percentual'
                  AND position('trilha' in lower(coalesce(criterio->>'resumo', ''))) > 0
               THEN 'trilha_percentual'
             WHEN criterio ? 'percentual' THEN 'acertos_percentual'
             WHEN tipo = 'simples' THEN 'eventos_totais'
             WHEN criterio ? 'minimo' THEN 'atividades_concluidas'
             ELSE NULL
           END AS metrica
      FROM public.conquistas
     WHERE criterio IS NOT NULL AND NOT (criterio ? 'metrica')
  ) v
 WHERE c.id = v.id AND v.metrica IS NOT NULL;
"""

# Falha com mensagem legivel em vez de estouro de constraint.
CONFERE_ANTES_DO_CHECK = """
DO $$
DECLARE
  v_orfas text;
BEGIN
  SELECT string_agg(id::text || ' (' || nome || ')', ', ')
    INTO v_orfas
    FROM public.conquistas
   WHERE criterio IS NULL
      OR NOT public.fn_conquista_metrica_suportada(criterio->>'metrica');

  IF v_orfas IS NOT NULL THEN
    RAISE EXCEPTION 'conquistas sem metrica suportada: ' || v_orfas;
  END IF;
END $$;
"""

CHECK_METRICA = """
ALTER TABLE public.conquistas DROP CONSTRAINT IF EXISTS conquistas_metrica_suportada;
ALTER TABLE public.conquistas
  ADD CONSTRAINT conquistas_metrica_suportada
  CHECK (criterio IS NOT NULL
         AND public.fn_conquista_metrica_suportada(criterio->>'metrica'));
"""

GATILHO = f"""
CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
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
  IF v_tipo = '{EVENTO_PREMIO}' THEN
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
   WHERE aluno_id = v_aluno_id AND tipo <> '{EVENTO_PREMIO}';

  WITH dias AS (
    SELECT DISTINCT date(criado_em) AS d
      FROM public.eventos_aluno
     WHERE aluno_id = v_aluno_id AND tipo <> '{EVENTO_PREMIO}'
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

  SELECT COALESCE(jsonb_object_agg(tipo, n), '{{}}'::jsonb) INTO v_contagem_por_tipo
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

  FOR v_conquista IN SELECT * FROM public.conquistas LOOP
    v_atingiu := false;
    v_conq_id := NULL;
    v_concluida_atual := NULL;
    v_metrica := v_conquista.criterio->>'metrica';

{_ramos_sql()}

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
            '{EVENTO_PREMIO}',
            CASE WHEN v_classe_id IS NULL THEN NULL
                 ELSE 'classe:' || v_classe_id::text END,
            v_conquista.pontos_recompensa,
            now()
          );
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$fn$;
"""

# Acrescenta so o ramo de conquista; o resto e' o que ja estava no banco.
VIEW_RANK = """
CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas AS
 WITH referencias_normalizadas AS (
         SELECT e.aluno_id,
            e.tipo,
            COALESCE(e.valor, 0::numeric) AS valor,
                CASE
                    WHEN NULLIF(TRIM(BOTH FROM e.referencia), ''::text) IS NULL THEN NULL::bigint
                    WHEN TRIM(BOTH FROM e.referencia) ~ '^\\d+$'::text
                      THEN TRIM(BOTH FROM e.referencia)::bigint
                    WHEN split_part(TRIM(BOTH FROM e.referencia), ':'::text, 2) ~ '^\\d+$'::text
                      THEN split_part(TRIM(BOTH FROM e.referencia), ':'::text, 2)::bigint
                    ELSE NULL::bigint
                END AS referencia_id
           FROM eventos_aluno e
        ), eventos_por_classe AS (
         SELECT e.aluno_id,
            COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, cl.id) AS classe_id,
            sum(e.valor) AS pontuacao
           FROM referencias_normalizadas e
             LEFT JOIN topicos t
               ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'topico') AND t.id = e.referencia_id
             LEFT JOIN conteudos c
               ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'conteudo') AND c.id = e.referencia_id
             LEFT JOIN topicos t_c ON t_c.id = c.topico_id
             LEFT JOIN atividades atv
               ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'atividade') AND atv.id = e.referencia_id
             LEFT JOIN topicos t_a ON t_a.id = atv.topico_id
             LEFT JOIN classe cl
               ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'conquista') AND cl.id = e.referencia_id
          WHERE COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, cl.id) IS NOT NULL
          GROUP BY e.aluno_id, (COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, cl.id))
        ), base AS (
         SELECT r.id AS rank_id,
            r.classe_id,
            ca.aluno_id,
            rt.criterio,
                CASE rt.criterio
                    WHEN 'percentual'::text THEN COALESCE(ca."porcentagemConcluida", 0::numeric)
                    WHEN 'pontuacao'::text THEN COALESCE(epc.pontuacao, 0::numeric)
                    WHEN 'tempo'::text THEN COALESCE(ca."tempoGastoMin", 0::numeric)
                    ELSE 0::numeric
                END AS pontuacao
           FROM ranks r
             JOIN rank_tipo rt ON rt.id = r.tipo_id
             JOIN classe_aluno ca ON ca.classe_id = r.classe_id
             LEFT JOIN eventos_por_classe epc
               ON epc.classe_id = r.classe_id AND epc.aluno_id = ca.aluno_id
        ), ordenado AS (
         SELECT b.rank_id,
            b.classe_id,
            b.aluno_id,
            b.pontuacao,
            dense_rank() OVER (PARTITION BY b.rank_id ORDER BY b.pontuacao DESC, b.aluno_id) AS posicao
           FROM base b
        )
 SELECT o.rank_id,
    o.classe_id,
    o.posicao,
    a.id AS id_aluno,
    a.nome AS nome_aluno,
    o.pontuacao,
    round(o.pontuacao / NULLIF(max(o.pontuacao) OVER (PARTITION BY o.rank_id), 0::numeric)
          * 100::numeric, 2) AS progresso,
        CASE
            WHEN o.posicao = 1 THEN 'ouro'::text
            WHEN o.posicao = 2 THEN 'prata'::text
            WHEN o.posicao = 3 THEN 'bronze'::text
            ELSE NULL::text
        END AS medalha
   FROM ordenado o
     JOIN alunos a ON a.id = o.aluno_id;
"""


def upgrade() -> None:
    op.execute(FUNCAO_METRICA_SUPORTADA)
    op.execute(BACKFILL)
    op.execute(CONFERE_ANTES_DO_CHECK)
    op.execute(CHECK_METRICA)
    op.execute(GATILHO)
    op.execute(VIEW_RANK)


def downgrade() -> None:
    # A view volta ao formato sem o ramo de conquista; o gatilho antigo nao e'
    # restaurado de proposito -- voltar a ele reintroduziria as 21 mortas.
    op.execute(
        "ALTER TABLE public.conquistas "
        "DROP CONSTRAINT IF EXISTS conquistas_metrica_suportada"
    )
    op.execute("DROP FUNCTION IF EXISTS public.fn_conquista_metrica_suportada(text)")
