"""Fase 5a: a missão passa a ser avaliada, pelo mesmo avaliador da conquista

Quinta fase de `docs/superpowers/specs/2026-10-19-eventos-missoes-ranks-modos-design.md`,
primeira metade.

## Por que esta migration existe fora do plano original

O spec tem sete fases e **nenhuma delas liga missão ao avaliador**. A fase 3 deixou
`fn_avaliar_metrica` pronta e registrou que "quem percorre `missoes` e escreve `missao_aluno`
é a fase seguinte"; no spec a fase seguinte é pontuação. A peça ficou sem dono — e sem ela a
missão que a fase 2 deixou o professor criar **nunca completa**, e a missão diária da fase 5b
seria decoração.

Então a fase 5 virou duas: esta liga a missão, a próxima gera a diária.

## O laço de missão reusa os MESMOS agregados

Nenhum segundo cálculo: `v_agregados` já existe no gatilho desde a fase 3, e o laço de missão
o recebe igual ao de conquista. É o motivo de a fase 3 ter separado `fn_agregados_do_aluno` de
`fn_avaliar_metrica` em vez de fazer uma função autossuficiente.

## Duas guardas de recursão, e por que a segunda é diferente

A conquista já estava protegida: ela premia inserindo `conquista_desbloqueada`, que casa o
prefixo de `fn_evento_creditado`, e o gatilho volta cedo para eventos creditados.

O prêmio de missão **não** pode casar esse prefixo, de propósito: "creditado" faz
`trg_eventos_aluno_valor_do_banco` tratar o valor como vindo de quem concedeu e congelá-lo,
e o valor da missão tem de vir de `fn_pontos_do_evento` (chave em `eventos_pontuacao`, com
override por turma). Então a guarda da missão é um **sinal de sessão**,
`app.missao_premiando`, no padrão de `app.evento_transicao` que `eventos_classe` usa.

O sinal é posto imediatamente antes do INSERT do prêmio e **devolvido a vazio depois**:
`set_config(..., true)` vale pela transação inteira, então deixá-lo ligado faria o resto da
transação parar de avaliar qualquer coisa. O `EXCEPTION` também o limpa.

> Mesmo sem o sinal a recursão terminaria, porque o `NOT EXISTS` exclui missão já concluída e
> a segunda passada não premiaria nada. Mas ela recalcularia os agregados e reavaliaria as 27
> conquistas a cada missão concluída — e é isso que o sinal evita.

## Falha de missão não desfaz evento nem conquista

O laço todo está num `BEGIN ... EXCEPTION WHEN OTHERS` que avisa e segue. É o padrão de
`fn_enqueue_student_enrollment_job` ("falha ao enfileirar nao desfaz a matricula"). A fase 3
mediu a equivalência do caminho de conquista; este laço é acréscimo e não deve poder quebrá-lo.

## O CTE de perfil é repetido, não extraído

O `representativos` aparece duas vezes agora. Extraí-lo exigiria mexer na consulta de
conquista, o que invalidaria a equivalência medida na fase 3 — por um ganho de estilo. A
duplicação é a escolha conservadora, e está anotada no corpo.

## Janela

Missão fora da janela (`janela_inicio`/`janela_fim`) não é avaliada. Missão `pendente` de
aprovação também não — o filtro é o mesmo da policy que o aluno vê.

Revision ID: 20261021_04
Revises: 20261021_03
Create Date: 2026-10-19
"""

from alembic import op

revision = "20261021_04"
down_revision = "20261021_03"
branch_labels = None
depends_on = None


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

  v_missao          record;
  v_premio          text;

  -- Agregados: uma vez por evento, nao uma vez por conquista. E' por isso que o
  -- avaliador recebe `v_agregados` em vez de calcular por conta. O laco de missao
  -- reusa os MESMOS agregados -- nao ha segundo calculo.
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

  -- Segunda guarda de recursao, para MISSAO. A da conquista funciona porque
  -- `conquista_desbloqueada` casa o prefixo de `fn_evento_creditado`. O premio de missao
  -- NAO casa, de proposito: creditado faz `trg_eventos_aluno_valor_do_banco` tratar o valor
  -- como vindo de quem concedeu, e o da missao tem de vir de `fn_pontos_do_evento`. Entao a
  -- guarda e um sinal de sessao, no padrao de `app.evento_transicao` de `eventos_classe`.
  IF COALESCE(current_setting('app.missao_premiando', true), '') = 'on' THEN
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

  -- ---------------------------------------------------------------------------
  -- MISSAO: mesmo avaliador, MESMOS agregados.
  --
  -- Em bloco proprio com EXCEPTION: falha aqui nao pode desfazer o evento nem a conquista.
  -- E' o padrao de `fn_enqueue_student_enrollment_job`, onde "falha ao enfileirar nao desfaz
  -- a matricula". A fase 3 provou a equivalencia do caminho de conquista; este laco e
  -- acrescimo, e nao deve poder quebra-lo.
  --
  -- O CTE de perfil representativo e' repetido em vez de extraido: mexer na consulta de
  -- conquista invalidaria a equivalencia medida na fase 3 por um ganho de estilo.
  -- ---------------------------------------------------------------------------
  BEGIN
    FOR v_missao IN
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
      SELECT m.id, m.criterio, m.recompensa_tipo
        FROM public.missoes m
       WHERE m.ativa
         AND m.aprovacao = ANY (ARRAY['nao_requer'::text, 'aprovada'::text])
         AND (m.janela_inicio IS NULL OR m.janela_inicio <= now())
         AND (m.janela_fim    IS NULL OR m.janela_fim    >= now())
         AND m.classe_id IN (
               SELECT ca.classe_id FROM public.classe_aluno ca WHERE ca.aluno_id = v_aluno_id
             )
         AND (m.perfil_alvo IS NULL
              OR lower(m.perfil_alvo) IN (SELECT nome FROM representativos))
         -- Ja concluida nao reavalia: e' o que impede o premio de sair duas vezes e o que
         -- faz a recursao, se houvesse, terminar.
         AND NOT EXISTS (
               SELECT 1 FROM public.missao_aluno ma
                WHERE ma.aluno_id = v_aluno_id AND ma.missao_id = m.id AND ma.status = 'concluida'
             )
    LOOP
      IF public.fn_avaliar_metrica(v_aluno_id, v_agregados, v_missao.criterio) THEN
        INSERT INTO public.missao_aluno (aluno_id, missao_id, status, progresso, concluida_em)
        VALUES (v_aluno_id, v_missao.id, 'concluida', 100, now())
        ON CONFLICT (aluno_id, missao_id) DO UPDATE
          SET status = 'concluida', progresso = 100, concluida_em = now(), updated_at = now();

        v_premio := v_missao.recompensa_tipo;
        IF v_premio IS NOT NULL THEN
          -- O sinal impede a reentrada. `set_config(..., true)` e' local a transacao, entao
          -- precisa voltar a vazio depois -- senao o resto da transacao pararia de avaliar.
          PERFORM set_config('app.missao_premiando', 'on', true);
          INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)
          VALUES (v_aluno_id, v_premio, 'missao:' || v_missao.id::text, 0, now());
          PERFORM set_config('app.missao_premiando', '', true);
        END IF;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.missao_premiando', '', true);
    RAISE WARNING 'avaliacao de missao do aluno % falhou: %', v_aluno_id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
"""


# Corpo da fase 3 (so conquista), para o downgrade.
GATILHO_SEM_MISSAO = r"""
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


def upgrade() -> None:
    op.execute(GATILHO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(GATILHO_SEM_MISSAO)
    op.execute("NOTIFY pgrst, 'reload schema'")
