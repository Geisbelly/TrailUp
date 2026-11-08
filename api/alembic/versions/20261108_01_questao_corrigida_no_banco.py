"""Questão corrigida no banco, sem o app precisar do gabarito (fase 1)

Plano em `docs/analises/2026-11-08-gabarito-fora-do-app-do-aluno.md`. Esta é a fase 1, **só
aditiva**: nada que o app instalado (1.0.x) usa muda. O app continua lendo o gabarito e gravando a
resposta direto até a fase 2 (build novo) e o corte da fase 3 (versão mínima + fechar a coluna).

## O que entra

- **`fn_questao_confere` v2.** Só existia em produção, fora do Alembic. Dissertativa e lacuna
  passam a aceitar o que o app aceita (`QuestionActivity.isTextAnswerEquivalent`): várias
  respostas separadas por `|`, `;` ou linha, "contém" com 4 ou mais caracteres e Levenshtein
  ≥ 0,82, sem acento nem pontuação. Antes o banco só aceitava igual: o app dava "15 min" como
  certo para "15 minutos" e o banco não. O resto do corpo (alternativa por texto, índice ou letra,
  V/F, listas) é o de produção.
- **Sem EXECUTE de `fn_questao_confere` para o cliente.** Medido em 07/11: com ela, o aluno
  testava A, B, C e D e achava a certa sem gravar nada. Nenhum cliente a chama.
- **`questao_responder` v2** (mesma assinatura; a de produção não era chamada por ninguém). Corrige,
  pontua e grava. Só devolve o gabarito quando o app o mostraria (acertou, ou modo imediato), e ao
  devolvê-lo depois de um erro **grava a revelação** em `questao_gabarito_revelado`, que até aqui
  tinha 0 linhas.
- **`questao_revelar_gabarito`**: o "ver gabarito" do modo pensante e da revisão. Exige resposta
  anterior e grava a revelação.
- **`questao_correcao_ia_contexto` e `questao_registrar_correcao_ia`**, só `service_role`: a edge
  function da dissertativa lê a resposta esperada no servidor e grava a nota da IA, em vez de
  receber a resposta esperada do app e deixar o app gravar o resultado.

## A pontuação é a do app, decidida pelo banco

`fn_questao_registrar_resposta` repete o multiplicador de `QuestionActivity` (o percentual da
questão e o `multiplicador` dos pontos), na mesma ordem:

1. viu o gabarito nesta tentativa da atividade → 20%;
2. já respondeu esta questão nesta tentativa → 50%;
3. respondeu antes desta tentativa (é a nova tentativa, que só reabre as erradas) →
   `1 − penalty_retry_pct/100` de `atividades.metadata.grading_rules` (50% por padrão);
4. senão, 100%.

O app sabe disso por estado de tela; o banco, pela `atividade_tentativas` aberta: a janela é
`iniciada_em` dela. Sem tentativa aberta, a janela é todo o histórico. Por isso a revelação é
gravada com `revelado_em = now()` a cada vez: com a data da primeira, ver de novo na tentativa 2
não contaria.

A trava de prazo de `fn_questao_aluno_recusa` é repetida em `fn_questao_acesso`, porque lá ela lê
`auth.uid()`, e a edge function grava pela chave de serviço. O INSERT em `questao_aluno` sai como
dono da função, então a guarda `trg_questao_aluno_a_guarda_cliente` não roda: a checagem tem de
vir antes.

## Duas decisões assumidas (ver o documento)

- `mostrar_gabarito_ao_errar` não existe no banco: vale o padrão do app, que é mostrar.
- Levenshtein em plpgsql, sem instalar `fuzzystrmatch`. A conta só roda quando os tamanhos já
  permitem passar de 0,82, então não chega a comparar textos de tamanhos muito diferentes.

## Downgrade

Volta `fn_questao_confere` e `questao_responder` ao corpo de produção de 07/11 (com o EXECUTE de
`fn_questao_confere` para `authenticated`) e apaga as funções novas. As revelações gravadas ficam.

Revision ID: 20261108_01
Revises: 20261107_01
Create Date: 2026-11-08
"""

from __future__ import annotations

from alembic import op

revision = "20261108_01"
down_revision = "20261107_01"
branch_labels = None
depends_on = None


# Os mesmos nomes de tipo que `QuestionActivity` reconhece (isDissertativaType / isFillBlankType).
TIPOS_DISSERTATIVA = (
    "'dissertativa', 'aberta', 'texto_livre', 'ensaio', 'essay', 'questao_aberta', 'questao aberta', "
    "'open', 'open_ended', 'open-ended', 'open_text', 'open text'"
)
TIPOS_LACUNA = (
    "'fill_blank', 'fili_blank', 'fill in the blank', 'fill-in-the-blank', 'fillblank', "
    "'completar_lacuna', 'completar lacuna', 'lacuna'"
)

TEXTO = r"""
-- Normalização da comparação de texto do app (normalizeStrictAnswerValue): sem acento, minúsculas,
-- só letras, dígitos e espaço simples.
CREATE OR REPLACE FUNCTION public.fn_texto_estrito(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT btrim(regexp_replace(regexp_replace(
    translate(lower(COALESCE(p_texto, '')),
              'áàâãäåéèêëíìîïóòôõöúùûüçñý', 'aaaaaaeeeeiiiiooooouuuucny'),
    '[^a-z0-9[:space:]]', ' ', 'g'), '[[:space:]]+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.fn_levenshtein(p_a text, p_b text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE STRICT
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a text[] := regexp_split_to_array(p_a, '');
  v_b text[] := regexp_split_to_array(p_b, '');
  v_la integer := COALESCE(array_length(v_a, 1), 0);
  v_lb integer := COALESCE(array_length(v_b, 1), 0);
  v_ant integer[];
  v_atual integer[];
  i integer;
  j integer;
BEGIN
  IF p_a = p_b THEN RETURN 0; END IF;
  IF v_la = 0 THEN RETURN v_lb; END IF;
  IF v_lb = 0 THEN RETURN v_la; END IF;
  v_ant := ARRAY(SELECT generate_series(0, v_lb));
  FOR i IN 1 .. v_la LOOP
    v_atual := array_fill(0, ARRAY[v_lb + 1]);
    v_atual[1] := i;
    FOR j IN 1 .. v_lb LOOP
      v_atual[j + 1] := least(v_ant[j + 1] + 1, v_atual[j] + 1,
                              v_ant[j] + CASE WHEN v_a[i] = v_b[j] THEN 0 ELSE 1 END);
    END LOOP;
    v_ant := v_atual;
  END LOOP;
  RETURN v_ant[v_lb + 1];
END;
$$;

-- isTextAnswerEquivalent do app: igual, "contém" com 4 ou mais caracteres, ou parecido (≥ 0,82).
CREATE OR REPLACE FUNCTION public.fn_texto_parecido(p_entrada text, p_esperado text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_e text := public.fn_texto_estrito(p_entrada);
  v_g text := public.fn_texto_estrito(p_esperado);
  v_le integer := char_length(v_e);
  v_lg integer := char_length(v_g);
  v_max integer := greatest(v_le, v_lg);
BEGIN
  IF v_e = '' OR v_g = '' THEN RETURN false; END IF;
  IF v_e = v_g THEN RETURN true; END IF;
  IF (strpos(v_e, v_g) > 0 OR strpos(v_g, v_e) > 0) AND least(v_le, v_lg) >= 4 THEN
    RETURN true;
  END IF;
  -- A distância é pelo menos a diferença de tamanho: se ela já passa do limite, nem calcula.
  IF 1 - abs(v_le - v_lg)::numeric / v_max < 0.82 THEN RETURN false; END IF;
  RETURN 1 - public.fn_levenshtein(v_e, v_g)::numeric / v_max >= 0.82;
END;
$$;

-- getAcceptedAnswers do app: JSON (lista, ou objeto com acceptedAnswers/answers/respostas/
-- alternativas/value) ou texto separado por |, ; ou quebra de linha.
CREATE OR REPLACE FUNCTION public.fn_questao_respostas_aceitas_json(p_valor jsonb)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_saida text[] := ARRAY[]::text[];
  v_item jsonb;
BEGIN
  IF p_valor IS NULL THEN RETURN v_saida; END IF;
  CASE jsonb_typeof(p_valor)
    WHEN 'array' THEN
      FOR v_item IN SELECT e FROM jsonb_array_elements(p_valor) AS e LOOP
        v_saida := v_saida || public.fn_questao_respostas_aceitas_json(v_item);
      END LOOP;
      RETURN v_saida;
    WHEN 'object' THEN
      RETURN public.fn_questao_respostas_aceitas_json(COALESCE(
        p_valor -> 'acceptedAnswers', p_valor -> 'answers', p_valor -> 'respostas',
        p_valor -> 'alternativas', p_valor -> 'value'));
    WHEN 'null' THEN
      RETURN v_saida;
    ELSE
      RETURN public.fn_questao_respostas_aceitas(p_valor #>> '{}');
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_questao_respostas_aceitas(p_gabarito text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_json jsonb;
  v_saida text[];
BEGIN
  IF p_gabarito IS NULL OR btrim(p_gabarito) = '' THEN RETURN ARRAY[]::text[]; END IF;
  BEGIN
    v_json := p_gabarito::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_json := NULL;
  END;
  IF v_json IS NOT NULL AND jsonb_typeof(v_json) IN ('array', 'object') THEN
    RETURN public.fn_questao_respostas_aceitas_json(v_json);
  END IF;
  SELECT COALESCE(array_agg(btrim(t.parte) ORDER BY t.ordem), ARRAY[]::text[])
    INTO v_saida
    FROM regexp_split_to_table(p_gabarito, '[|;\n]') WITH ORDINALITY AS t(parte, ordem)
   WHERE btrim(t.parte) <> '';
  RETURN v_saida;
END;
$$;
"""

CONFERE = f"""
CREATE OR REPLACE FUNCTION public.fn_questao_confere(p_questao_id bigint, p_resposta text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_gabarito text; v_alts jsonb; v_tipo text; v_tipo_atividade text; v_resp text; v_gab text;
  v_i integer; v_texto text; v_aceitas text[]; v_dissertativa boolean;
BEGIN
  SELECT g.resposta_correta, q.alternativas, q.tipo, lower(btrim(COALESCE(a.tipo::text, '')))
    INTO v_gabarito, v_alts, v_tipo, v_tipo_atividade
    FROM public.questoes q
    LEFT JOIN public.questao_gabarito g ON g.questao_id = q.id
    LEFT JOIN public.atividades a ON a.id = q.atividade_id
   WHERE q.id = p_questao_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Dissertativa e lacuna: a tolerância do app (`20261108_01`). O tipo vale da questão ou da
  -- atividade, como em QuestionActivity.
  v_dissertativa := lower(btrim(COALESCE(v_tipo, ''))) IN ({TIPOS_DISSERTATIVA})
                    OR v_tipo_atividade IN ({TIPOS_DISSERTATIVA});
  IF v_dissertativa
     OR lower(btrim(COALESCE(v_tipo, ''))) IN ({TIPOS_LACUNA})
     OR v_tipo_atividade IN ({TIPOS_LACUNA}) THEN
    IF public.fn_texto_estrito(p_resposta) = '' THEN RETURN false; END IF;
    v_aceitas := ARRAY(SELECT x FROM unnest(public.fn_questao_respostas_aceitas(v_gabarito)) AS x
                        WHERE public.fn_texto_estrito(x) <> '');
    -- Sem resposta esperada, o app aceita a dissertativa e recusa a lacuna.
    IF cardinality(v_aceitas) = 0 THEN RETURN v_dissertativa; END IF;
    RETURN EXISTS (SELECT 1 FROM unnest(v_aceitas) AS x WHERE public.fn_texto_parecido(p_resposta, x));
  END IF;

  -- Daqui para baixo, o corpo de produção de 07/11, com 'yes'/'no' a mais no V/F (como o app).
  IF v_gabarito IS NULL THEN RETURN false; END IF;
  IF public.fn_texto_comparavel(COALESCE(v_tipo,'')) IN ('associacao','ordenacao','multipla_resposta') THEN
    RETURN public.fn_questao_confere_lista(v_tipo, v_gabarito, p_resposta);
  END IF;
  v_resp := public.fn_texto_comparavel(p_resposta);
  IF v_resp = '' THEN RETURN false; END IF;
  v_gab := public.fn_texto_comparavel(v_gabarito);
  IF v_resp = v_gab THEN RETURN true; END IF;
  IF v_resp IN ('v','true','verdadeiro','sim','certo','yes') AND v_gab IN ('v','true','verdadeiro','sim','certo','yes') THEN RETURN true; END IF;
  IF v_resp IN ('f','false','falso','nao','errado','no') AND v_gab IN ('f','false','falso','nao','errado','no') THEN RETURN true; END IF;
  IF jsonb_typeof(v_alts) = 'array' THEN
    FOR v_i IN 0 .. jsonb_array_length(v_alts) - 1 LOOP
      v_texto := public.fn_texto_comparavel(v_alts ->> v_i);
      IF v_texto = '' THEN CONTINUE; END IF;
      IF v_resp = v_texto OR v_resp = v_i::text OR v_resp = lower(chr(65 + v_i)) THEN
        IF v_gab = v_texto OR v_gab = v_i::text OR v_gab = lower(chr(65 + v_i)) THEN RETURN true; END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$function$;

-- Oráculo: com EXECUTE, o aluno testava cada alternativa sem gravar nada (medido em 07/11).
REVOKE ALL ON FUNCTION public.fn_questao_confere(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_questao_confere(bigint, text) TO service_role;
"""

REGISTRAR = f"""
-- Quem pode responder esta questão agora: matriculado e dentro do prazo. A regra do prazo é a de
-- fn_questao_aluno_recusa, repetida aqui porque lá ela lê auth.uid() e a edge function grava
-- pela chave de serviço. Mudou lá, mude aqui.
CREATE OR REPLACE FUNCTION public.fn_questao_acesso(p_aluno uuid, p_questao_id bigint)
RETURNS public.questoes
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_q public.questoes%ROWTYPE;
  v_prazo timestamptz;
BEGIN
  IF p_aluno IS NULL THEN
    RAISE EXCEPTION 'questao_sem_sessao' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_q FROM public.questoes WHERE id = p_questao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'questao_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.atividades a
      JOIN public.topicos t ON t.id = a.topico_id
      JOIN public.classe_aluno ca ON ca.classe_id = t.classe_id
     WHERE a.id = v_q.atividade_id AND ca.aluno_id = p_aluno
  ) THEN
    RAISE EXCEPTION 'questao_sem_permissao' USING ERRCODE = '42501';
  END IF;
  v_prazo := public.fn_prazo_efetivo(p_aluno, v_q.atividade_id);
  IF v_prazo IS NOT NULL AND v_prazo < now() AND NOT EXISTS (
       SELECT 1 FROM public.alteracao_aluno r
        WHERE r.aluno_id = p_aluno
          AND r.atividade_id = v_q.atividade_id
          AND r.decisao_efetiva = 'revisar'
          AND r.revisar_desde IS NOT NULL
          AND r.revisada_em IS NULL) THEN
    RAISE EXCEPTION 'prazo_expirado' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_q;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_questao_e_dissertativa(p_questao_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(bool_or(lower(btrim(COALESCE(q.tipo::text, ''))) IN ({TIPOS_DISSERTATIVA})
                          OR lower(btrim(COALESCE(a.tipo::text, ''))) IN ({TIPOS_DISSERTATIVA})), false)
    FROM public.questoes q
    LEFT JOIN public.atividades a ON a.id = q.atividade_id
   WHERE q.id = p_questao_id;
$$;

-- Grava a resposta já corrigida e devolve o que o app mostra. Interna: só as RPCs abaixo chamam.
-- p_percentual é a nota-base (100/0 na objetiva, o percentual da IA na dissertativa); o
-- multiplicador é o de QuestionActivity (ver a docstring da 20261108_01).
CREATE OR REPLACE FUNCTION public.fn_questao_registrar_resposta(
  p_aluno uuid, p_questao_id bigint, p_resposta text, p_correta boolean,
  p_percentual numeric, p_tempo_gasto_seg integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_q public.questoes%ROWTYPE;
  v_desde timestamptz;
  v_fator numeric := 1;
  v_regra text := 'primeira';
  v_penalidade numeric;
  v_bruto text;
  v_percentual numeric;
  v_tentativa integer;
  v_erros integer;
  v_tempo integer;
  v_modo text;
  v_dissertativa boolean;
  v_liberado boolean;
  v_gabarito text;
BEGIN
  v_q := public.fn_questao_acesso(p_aluno, p_questao_id);

  -- Duas respostas ao mesmo tempo pegariam a mesma `tentativa` (índice único).
  PERFORM pg_advisory_xact_lock(hashtextextended('questao_aluno|' || p_aluno::text || '|' || p_questao_id::text, 0));

  SELECT t.iniciada_em INTO v_desde
    FROM public.atividade_tentativas t
   WHERE t.aluno_id = p_aluno AND t.atividade_id = v_q.atividade_id AND t.respondida_em IS NULL
   ORDER BY t.numero DESC
   LIMIT 1;

  IF EXISTS (SELECT 1 FROM public.questao_gabarito_revelado r
              WHERE r.aluno_id = p_aluno AND r.questao_id = p_questao_id
                AND (v_desde IS NULL OR r.revelado_em >= v_desde)) THEN
    v_fator := 0.2; v_regra := 'viu_gabarito';
  ELSIF EXISTS (SELECT 1 FROM public.questao_aluno qa
                 WHERE qa.aluno_id = p_aluno AND qa.questao_id = p_questao_id
                   AND (v_desde IS NULL OR qa.criado_em >= v_desde)) THEN
    v_fator := 0.5; v_regra := 'resposta_repetida';
  ELSIF v_desde IS NOT NULL AND EXISTS (SELECT 1 FROM public.questao_aluno qa
                                         WHERE qa.aluno_id = p_aluno AND qa.questao_id = p_questao_id
                                           AND qa.criado_em < v_desde) THEN
    SELECT COALESCE(a.metadata -> 'grading_rules', a.metadata -> 'gradingRules') ->> 'penalty_retry_pct'
      INTO v_bruto
      FROM public.atividades a WHERE a.id = v_q.atividade_id;
    v_penalidade := CASE WHEN btrim(COALESCE(v_bruto, '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                         THEN greatest(0, least(100, btrim(v_bruto)::numeric)) ELSE 50 END;
    v_fator := 1 - v_penalidade / 100; v_regra := 'nova_tentativa';
  END IF;

  v_percentual := round(greatest(0, least(100, COALESCE(p_percentual, 0))) * v_fator);
  v_tempo := NULLIF(LEAST(GREATEST(COALESCE(p_tempo_gasto_seg, 0), 0), 3600), 0);

  SELECT COALESCE(max(tentativa), 0) + 1 INTO v_tentativa
    FROM public.questao_aluno
   WHERE aluno_id = p_aluno AND questao_id = p_questao_id;

  INSERT INTO public.questao_aluno
         (aluno_id, questao_id, atividade_id, tentativa, resposta, correta, acertos_percentual, tempo_gasto_seg)
  VALUES (p_aluno, p_questao_id, v_q.atividade_id, v_tentativa, COALESCE(p_resposta, ''),
          COALESCE(p_correta, false), v_percentual, v_tempo);

  SELECT count(*) INTO v_erros
    FROM public.questao_aluno
   WHERE aluno_id = p_aluno AND questao_id = p_questao_id AND correta IS FALSE;

  -- O que o app mostraria (canShowQuestionAnswer): acertou, ou modo imediato. A dissertativa
  -- nunca mostra a resposta esperada ("Avaliação manual").
  SELECT lower(btrim(COALESCE(al.modo_resposta::text, ''))) INTO v_modo
    FROM public.alunos al WHERE al.id = p_aluno;
  v_dissertativa := public.fn_questao_e_dissertativa(p_questao_id);
  v_liberado := NOT v_dissertativa AND (COALESCE(p_correta, false) OR COALESCE(v_modo, '') <> 'pensante');

  IF v_liberado THEN
    SELECT g.resposta_correta INTO v_gabarito FROM public.questao_gabarito g WHERE g.questao_id = p_questao_id;
    IF NOT COALESCE(p_correta, false) THEN
      INSERT INTO public.questao_gabarito_revelado (aluno_id, questao_id, revelado_em)
      VALUES (p_aluno, p_questao_id, now())
      ON CONFLICT (aluno_id, questao_id) DO UPDATE SET revelado_em = EXCLUDED.revelado_em;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'correta', COALESCE(p_correta, false),
    'acertos_percentual', v_percentual,
    'regra', v_regra,
    'tentativa', v_tentativa,
    'erros', v_erros,
    'gabarito_liberado', v_liberado,
    'resposta_correta', CASE WHEN v_liberado THEN v_gabarito END
  );
END;
$$;

-- Porta do app para a objetiva (e para a dissertativa, quando a IA está fora do ar).
CREATE OR REPLACE FUNCTION public.questao_responder(
  p_questao_id bigint, p_resposta text, p_tempo_gasto_seg integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_correta boolean;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'questao_sem_sessao' USING ERRCODE = '42501';
  END IF;
  -- A conferência roda antes da checagem de acesso, mas o resultado só sai depois dela:
  -- fn_questao_registrar_resposta levanta para quem não é da turma ou está fora do prazo.
  v_correta := public.fn_questao_confere(p_questao_id, p_resposta);
  RETURN public.fn_questao_registrar_resposta(
    v_me, p_questao_id, p_resposta, v_correta, CASE WHEN v_correta THEN 100 ELSE 0 END, p_tempo_gasto_seg);
END
$function$;

-- "Ver gabarito" (modo pensante, revisão): só depois de responder, e fica gravado.
CREATE OR REPLACE FUNCTION public.questao_revelar_gabarito(p_questao_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_q public.questoes%ROWTYPE;
  v_acertou boolean;
  v_erros integer;
  v_gabarito text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'questao_sem_sessao' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_q FROM public.questoes WHERE id = p_questao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'questao_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.atividades a
      JOIN public.topicos t ON t.id = a.topico_id
      JOIN public.classe_aluno ca ON ca.classe_id = t.classe_id
     WHERE a.id = v_q.atividade_id AND ca.aluno_id = v_me
  ) THEN
    RAISE EXCEPTION 'questao_sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.questao_aluno qa WHERE qa.aluno_id = v_me AND qa.questao_id = p_questao_id) THEN
    RAISE EXCEPTION 'questao_nao_respondida' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(bool_or(qa.correta), false), count(*) FILTER (WHERE qa.correta IS FALSE)
    INTO v_acertou, v_erros
    FROM public.questao_aluno qa
   WHERE qa.aluno_id = v_me AND qa.questao_id = p_questao_id;

  IF public.fn_questao_e_dissertativa(p_questao_id) THEN
    RETURN jsonb_build_object('correta', v_acertou, 'erros', v_erros,
                              'gabarito_liberado', false, 'resposta_correta', NULL);
  END IF;

  INSERT INTO public.questao_gabarito_revelado (aluno_id, questao_id, revelado_em)
  VALUES (v_me, p_questao_id, now())
  ON CONFLICT (aluno_id, questao_id) DO UPDATE SET revelado_em = EXCLUDED.revelado_em;

  SELECT g.resposta_correta INTO v_gabarito FROM public.questao_gabarito g WHERE g.questao_id = p_questao_id;
  RETURN jsonb_build_object('correta', v_acertou, 'erros', v_erros,
                            'gabarito_liberado', true, 'resposta_correta', v_gabarito);
END;
$$;

-- Edge function da dissertativa, pela chave de serviço: o que ela precisa para corrigir. A
-- checagem de acesso vem antes, para não gastar cota com quem não pode responder.
CREATE OR REPLACE FUNCTION public.questao_correcao_ia_contexto(p_aluno uuid, p_questao_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_q public.questoes%ROWTYPE;
  v_gabarito text;
BEGIN
  v_q := public.fn_questao_acesso(p_aluno, p_questao_id);
  IF NOT public.fn_questao_e_dissertativa(p_questao_id) THEN
    RAISE EXCEPTION 'questao_nao_dissertativa' USING ERRCODE = '22023';
  END IF;
  SELECT g.resposta_correta INTO v_gabarito FROM public.questao_gabarito g WHERE g.questao_id = p_questao_id;
  RETURN jsonb_build_object(
    'enunciado', v_q.enunciado,
    'nota_estabelecida', v_q.nota_estabelecida,
    'resposta_esperada', v_gabarito);
END;
$$;

CREATE OR REPLACE FUNCTION public.questao_registrar_correcao_ia(
  p_aluno uuid, p_questao_id bigint, p_resposta text, p_correta boolean,
  p_percentual numeric, p_tempo_gasto_seg integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.fn_questao_e_dissertativa(p_questao_id) THEN
    RAISE EXCEPTION 'questao_nao_dissertativa' USING ERRCODE = '22023';
  END IF;
  RETURN public.fn_questao_registrar_resposta(
    p_aluno, p_questao_id, p_resposta, COALESCE(p_correta, false), p_percentual, p_tempo_gasto_seg);
END;
$$;

-- Internas: sem EXECUTE para cliente nenhum.
REVOKE ALL ON FUNCTION public.fn_questao_acesso(uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_questao_e_dissertativa(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_questao_registrar_resposta(uuid, bigint, text, boolean, numeric, integer)
  FROM PUBLIC, anon, authenticated;

-- Do aluno: conferem a sessão (auth.uid()).
REVOKE ALL ON FUNCTION public.questao_responder(bigint, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.questao_responder(bigint, text, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.questao_revelar_gabarito(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.questao_revelar_gabarito(bigint) TO authenticated, service_role;

-- Da edge function: recebem o aluno no parâmetro, então só a chave de serviço chama.
REVOKE ALL ON FUNCTION public.questao_correcao_ia_contexto(uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.questao_correcao_ia_contexto(uuid, bigint) TO service_role;
REVOKE ALL ON FUNCTION public.questao_registrar_correcao_ia(uuid, bigint, text, boolean, numeric, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.questao_registrar_correcao_ia(uuid, bigint, text, boolean, numeric, integer)
  TO service_role;
"""

def upgrade() -> None:
    op.execute(TEXTO)
    op.execute(CONFERE)
    op.execute(REGISTRAR)


def downgrade() -> None:
    op.execute(CONFERE_PRODUCAO)
    op.execute(RESPONDER_PRODUCAO)
    op.execute(APAGAR_NOVAS)


# Só do downgrade, e depois dele de propósito: os portões de DEFINER e de RPC leem o arquivo até
# `def downgrade`, e o GRANT de volta para `authenticated` não é o estado que a migration deixa.
# Corpos de produção de 07/11 (lidos com pg_get_functiondef), para o downgrade.
CONFERE_PRODUCAO = """
CREATE OR REPLACE FUNCTION public.fn_questao_confere(p_questao_id bigint, p_resposta text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_gabarito text; v_alts jsonb; v_tipo text; v_resp text; v_gab text; v_i integer; v_texto text;
BEGIN
  SELECT g.resposta_correta, q.alternativas, q.tipo INTO v_gabarito, v_alts, v_tipo
    FROM public.questoes q LEFT JOIN public.questao_gabarito g ON g.questao_id = q.id WHERE q.id = p_questao_id;
  IF v_gabarito IS NULL THEN RETURN false; END IF;
  IF public.fn_texto_comparavel(COALESCE(v_tipo,'')) IN ('associacao','ordenacao','multipla_resposta') THEN
    RETURN public.fn_questao_confere_lista(v_tipo, v_gabarito, p_resposta);
  END IF;
  v_resp := public.fn_texto_comparavel(p_resposta);
  IF v_resp = '' THEN RETURN false; END IF;
  v_gab := public.fn_texto_comparavel(v_gabarito);
  IF v_resp = v_gab THEN RETURN true; END IF;
  IF v_resp IN ('v','true','verdadeiro','sim','certo') AND v_gab IN ('v','true','verdadeiro','sim','certo') THEN RETURN true; END IF;
  IF v_resp IN ('f','false','falso','nao','errado') AND v_gab IN ('f','false','falso','nao','errado') THEN RETURN true; END IF;
  IF jsonb_typeof(v_alts) = 'array' THEN
    FOR v_i IN 0 .. jsonb_array_length(v_alts) - 1 LOOP
      v_texto := public.fn_texto_comparavel(v_alts ->> v_i);
      IF v_texto = '' THEN CONTINUE; END IF;
      IF v_resp = v_texto OR v_resp = v_i::text OR v_resp = lower(chr(65 + v_i)) THEN
        IF v_gab = v_texto OR v_gab = v_i::text OR v_gab = lower(chr(65 + v_i)) THEN RETURN true; END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END; $function$;

GRANT EXECUTE ON FUNCTION public.fn_questao_confere(bigint, text) TO authenticated, service_role;
"""

RESPONDER_PRODUCAO = """
CREATE OR REPLACE FUNCTION public.questao_responder(p_questao_id bigint, p_resposta text, p_tempo_gasto_seg integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me        uuid := auth.uid();
  v_q         public.questoes%ROWTYPE;
  v_gabarito  text;
  v_correta   boolean;
  v_tentativa integer;
  v_tempo     integer;
  v_erros     integer;
  v_liberado  boolean;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'questao_sem_sessao';
  END IF;

  SELECT * INTO v_q FROM public.questoes WHERE id = p_questao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'questao_inexistente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.atividades a
      JOIN public.topicos t ON t.id = a.topico_id
      JOIN public.classe_aluno ca ON ca.classe_id = t.classe_id
     WHERE a.id = v_q.atividade_id AND ca.aluno_id = v_me
  ) THEN
    RAISE EXCEPTION 'questao_sem_permissao';
  END IF;

  v_correta := public.fn_questao_confere(p_questao_id, p_resposta);

  SELECT g.resposta_correta INTO v_gabarito
    FROM public.questao_gabarito g WHERE g.questao_id = p_questao_id;

  v_tempo := NULLIF(LEAST(GREATEST(COALESCE(p_tempo_gasto_seg, 0), 0), 3600), 0);

  SELECT COALESCE(max(tentativa), 0) + 1 INTO v_tentativa
    FROM public.questao_aluno
   WHERE aluno_id = v_me AND questao_id = p_questao_id;

  INSERT INTO public.questao_aluno
         (aluno_id, questao_id, atividade_id, tentativa, resposta,
          correta, acertos_percentual, tempo_gasto_seg)
  VALUES (v_me, p_questao_id, v_q.atividade_id, v_tentativa,
          COALESCE(p_resposta, ''), v_correta,
          CASE WHEN v_correta THEN 100 ELSE 0 END, v_tempo);

  SELECT count(*) INTO v_erros
    FROM public.questao_aluno
   WHERE aluno_id = v_me AND questao_id = p_questao_id
     AND correta IS FALSE;

  v_liberado := v_correta OR v_erros >= 2;

  RETURN jsonb_build_object(
    'correta', v_correta,
    'tentativa', v_tentativa,
    'erros', v_erros,
    'gabarito_liberado', v_liberado,
    'resposta_correta', CASE WHEN v_liberado THEN v_gabarito END
  );
END
$function$;
"""

APAGAR_NOVAS = """
DROP FUNCTION IF EXISTS public.questao_registrar_correcao_ia(uuid, bigint, text, boolean, numeric, integer);
DROP FUNCTION IF EXISTS public.questao_correcao_ia_contexto(uuid, bigint);
DROP FUNCTION IF EXISTS public.questao_revelar_gabarito(bigint);
DROP FUNCTION IF EXISTS public.fn_questao_registrar_resposta(uuid, bigint, text, boolean, numeric, integer);
DROP FUNCTION IF EXISTS public.fn_questao_e_dissertativa(bigint);
DROP FUNCTION IF EXISTS public.fn_questao_acesso(uuid, bigint);
DROP FUNCTION IF EXISTS public.fn_questao_respostas_aceitas(text);
DROP FUNCTION IF EXISTS public.fn_questao_respostas_aceitas_json(jsonb);
DROP FUNCTION IF EXISTS public.fn_texto_parecido(text, text);
DROP FUNCTION IF EXISTS public.fn_levenshtein(text, text);
DROP FUNCTION IF EXISTS public.fn_texto_estrito(text);
"""
