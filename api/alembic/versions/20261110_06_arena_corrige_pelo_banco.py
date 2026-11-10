"""A arena corrige pelo banco, e só sorteia o que o banco corrige na hora

## O que foi medido (10/11)

Não há desafio nenhum em produção, então a medida é o duelo inteiro num Postgres local com as **50
funções de produção** (`tests/fixtures/arena_prod_20261110.sql`, lidas do catálogo em `BEGIN READ
ONLY`). Solo, A contra B, as quatro formas de questão que a produção tem (múltipla, V/F, lacuna,
dissertativa): criar, aceitar, responder pelo `desafio_responder` (a porta do app), fechar sozinho na
última resposta, pagar e mover o Elo. O fluxo anda. A correção não:

- **Lacuna** sem acento ("fotossintese" contra "fotossíntese") contava como **erro**. A arena
  comparava `lower(btrim(resposta)) = lower(btrim(questoes.resposta_correta))`; a atividade aceita a
  mesma resposta (`fn_questao_confere`, `20261108_01`).
- **Dissertativa** era sorteada e corrigida pela mesma igualdade: na prática, sempre errada, num
  duelo que vale Elo e ponto.
- Múltipla e V/F só davam certo por coincidência: hoje o gabarito está gravado como o texto da
  alternativa e como "verdadeiro"/"falso", que é o que a tela da arena manda. Gabarito por posição,
  por letra, "V", "true" ou texto rico (`20261108_03`) dava errado.
- `arena_responder` devolvia se o **chute novo** estaria certo mesmo quando a resposta já estava
  gravada (`ON CONFLICT DO NOTHING`): responder de novo a mesma questão era um oráculo do gabarito.

## O que muda

- `arena_responder` e `guilda_desafio_responder` corrigem por `fn_questao_confere`, a mesma função da
  atividade, que lê `questao_gabarito`. Uma regra de correção, não três.
- `arena_responder`, quando a resposta já existia, devolve o `correta` **gravado**.
- `fn_questao_cabe_no_desafio` (nova, só `service_role`): fica de fora do sorteio o que o banco não
  corrige sozinho na hora — dissertativa e código (a IA, `fn_questao_corrigida_por_ia`), numérica e
  expressão (a edge `questao-conferir-resposta`) e as respostas em lista (associação, ordenação,
  múltipla resposta), que a tela do desafio não tem como responder. `arena_desafio_criar` e
  `guilda_desafio_criar` filtram por ela.

Os quatro corpos de antes são os de produção de 10/11, copiados do retrato; o depois é o antes com
trocas conferidas (`_trocar` falha se o trecho não aparece o número exato de vezes).

Revision ID: 20261110_06
Revises: 20261110_05
Create Date: 2026-11-10
"""

from __future__ import annotations

from alembic import op

revision = "20261110_06"
down_revision = "20261110_05"
branch_labels = None
depends_on = None


def _trocar(sql: str, trocas: list[tuple[str, str, int]]) -> str:
    for velho, novo, vezes in trocas:
        achou = sql.count(velho)
        if achou != vezes:
            raise RuntimeError(f"esperava {vezes} ocorrência(s), achei {achou}: {velho[:80]!r}")
        sql = sql.replace(velho, novo)
    return sql


CABE_NO_DESAFIO = """
CREATE OR REPLACE FUNCTION public.fn_questao_cabe_no_desafio(p_questao_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- O que o banco corrige sozinho, na hora da resposta, com a tela do desafio (alternativas,
  -- Verdadeiro/Falso ou uma caixa de texto). O resto tem outro corretor ou outra tela.
  SELECT EXISTS (
    SELECT 1
      FROM public.questoes q
      LEFT JOIN public.atividades a ON a.id = q.atividade_id
     WHERE q.id = p_questao_id
       AND NOT public.fn_questao_corrigida_por_ia(q.id)
       AND lower(btrim(COALESCE(q.tipo::text, ''))) NOT IN
           ('codigo', 'numerica', 'expressao', 'associacao', 'ordenacao', 'multipla_resposta')
       AND lower(btrim(COALESCE(a.tipo::text, ''))) NOT IN ('code', 'numeric', 'expression')
  );
$function$;
REVOKE ALL ON FUNCTION public.fn_questao_cabe_no_desafio(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_questao_cabe_no_desafio(bigint) TO service_role;
"""

CORRIGE = "COALESCE(public.fn_questao_confere(p_questao_id, p_resposta), false)"

ARENA_CRIAR_ANTES = r"""
CREATE OR REPLACE FUNCTION public.arena_desafio_criar(p_classe_id bigint, p_formato text DEFAULT 'solo'::text, p_modo text DEFAULT 'precisao'::text, p_quantidade integer DEFAULT 5, p_guilda_id uuid DEFAULT NULL::uuid, p_aliado uuid DEFAULT NULL::uuid, p_adversarios uuid[] DEFAULT NULL::uuid[], p_guilda_rival uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me      uuid := auth.uid();
  v_formato text := lower(btrim(COALESCE(p_formato, '')));
  v_modo    text := lower(btrim(COALESCE(p_modo, '')));
  v_adv     uuid[] := COALESCE(p_adversarios, ARRAY[]::uuid[]);
  v_n_adv   integer;
  v_qtd     integer := GREATEST(1, LEAST(COALESCE(p_quantidade, 5), 10));
  v_convocados uuid[];
  v_alvo    uuid;
  v_id      uuid;
  v_q       record;
  v_i       integer := 0;
  v_rivais  integer := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'arena_sem_sessao';
  END IF;
  IF NOT public.guilda_e_colega(v_me, p_classe_id) THEN
    RAISE EXCEPTION 'arena_sem_permissao';
  END IF;
  IF v_formato NOT IN ('guilda', 'dupla', 'solo') THEN
    RAISE EXCEPTION 'arena_formato_invalido';
  END IF;
  IF v_modo NOT IN ('todos', 'velocidade', 'precisao') THEN
    RAISE EXCEPTION 'arena_modo_invalido';
  END IF;

  v_n_adv := COALESCE(array_length(v_adv, 1), 0);

  IF v_formato = 'guilda' THEN
    IF p_guilda_id IS NULL OR p_aliado IS NOT NULL OR v_n_adv > 0 THEN
      RAISE EXCEPTION 'arena_formato_invalido';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.guilda_membros m
       WHERE m.guilda_id = p_guilda_id AND m.aluno_id = v_me
         AND m.left_at IS NULL
    ) THEN
      RAISE EXCEPTION 'arena_sem_permissao';
    END IF;
    IF p_guilda_rival IS NOT NULL THEN
      IF p_guilda_rival = p_guilda_id THEN
        RAISE EXCEPTION 'arena_rival_invalida';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.guildas g
         WHERE g.id = p_guilda_rival AND g.ativa
           AND g.classe_id = p_classe_id
      ) THEN
        RAISE EXCEPTION 'arena_rival_invalida';
      END IF;
      SELECT count(*) INTO v_rivais
        FROM public.guilda_membros m
       WHERE m.guilda_id = p_guilda_rival AND m.left_at IS NULL
         AND m.aluno_id IS NOT NULL;
      IF v_rivais = 0 THEN
        RAISE EXCEPTION 'arena_rival_sem_membros';
      END IF;
    END IF;
    v_convocados := ARRAY[]::uuid[];
  ELSIF v_formato = 'dupla' THEN
    IF p_guilda_id IS NOT NULL OR p_guilda_rival IS NOT NULL
       OR p_aliado IS NULL OR v_n_adv <> 2 THEN
      RAISE EXCEPTION 'arena_formato_invalido';
    END IF;
    v_convocados := ARRAY[p_aliado] || v_adv;
  ELSE
    IF p_guilda_id IS NOT NULL OR p_guilda_rival IS NOT NULL
       OR p_aliado IS NOT NULL OR v_n_adv <> 1 THEN
      RAISE EXCEPTION 'arena_formato_invalido';
    END IF;
    v_convocados := v_adv;
  END IF;

  IF v_me = ANY(v_convocados) THEN
    RAISE EXCEPTION 'arena_participante_invalido';
  END IF;
  IF COALESCE(array_length(v_convocados, 1), 0)
     IS DISTINCT FROM (SELECT count(DISTINCT x)::integer FROM unnest(v_convocados) x) THEN
    RAISE EXCEPTION 'arena_participante_repetido';
  END IF;
  FOREACH v_alvo IN ARRAY v_convocados LOOP
    IF NOT public.guilda_e_colega(v_alvo, p_classe_id) THEN
      RAISE EXCEPTION 'arena_participante_fora_da_turma';
    END IF;
    IF public.guilda_bloqueio_ativo(v_me, v_alvo) THEN
      RAISE EXCEPTION 'arena_participante_bloqueado';
    END IF;
  END LOOP;

  INSERT INTO public.guilda_desafios
         (guilda_id, guilda_rival_id, classe_id, criado_por,
          modo, formato, titulo, configuracao)
  VALUES (CASE WHEN v_formato = 'guilda' THEN p_guilda_id ELSE NULL END,
          CASE WHEN v_formato = 'guilda' THEN p_guilda_rival ELSE NULL END,
          p_classe_id, v_me, v_modo, v_formato,
          'Desafio em ' || v_formato,
          jsonb_build_object('quantidade', v_qtd))
  RETURNING id INTO v_id;

  IF v_formato = 'guilda' THEN
    INSERT INTO public.desafio_participantes
           (desafio_id, aluno_id, equipe, estado, respondido_em)
    SELECT v_id, m.aluno_id, 1, 'aceito', now()
      FROM public.guilda_membros m
     WHERE m.guilda_id = p_guilda_id AND m.left_at IS NULL
       AND m.aluno_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    IF p_guilda_rival IS NOT NULL THEN
      INSERT INTO public.desafio_participantes
             (desafio_id, aluno_id, equipe, estado)
      SELECT v_id, m.aluno_id, 2, 'convidado'
        FROM public.guilda_membros m
       WHERE m.guilda_id = p_guilda_rival AND m.left_at IS NULL
         AND m.aluno_id IS NOT NULL
      ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    INSERT INTO public.desafio_participantes
           (desafio_id, aluno_id, equipe, estado, respondido_em)
    VALUES (v_id, v_me, 1, 'aceito', now());
    IF v_formato = 'dupla' THEN
      INSERT INTO public.desafio_participantes
             (desafio_id, aluno_id, equipe, estado)
      VALUES (v_id, p_aliado, 1, 'convidado');
    END IF;
    FOREACH v_alvo IN ARRAY v_adv LOOP
      INSERT INTO public.desafio_participantes
             (desafio_id, aluno_id, equipe, estado)
      VALUES (v_id, v_alvo, 2, 'convidado');
    END LOOP;
  END IF;

  -- 20261021_19 (decisão 5): limite diário contra o mesmo adversário. A exceção desfaz o
  -- desafio inteiro.
  PERFORM public.fn_arena_cobrar_limite_diario(v_id);

  FOR v_q IN
    SELECT q.id
      FROM public.questoes q
      JOIN public.atividades a ON a.id = q.atividade_id
      JOIN public.topicos t ON t.id = a.topico_id
     WHERE t.classe_id = p_classe_id
       AND NOT EXISTS (
         SELECT 1 FROM public.desafio_participantes dp
          WHERE dp.desafio_id = v_id
            AND NOT public.fn_questao_liberada_para(dp.aluno_id, q.id)
       )
     ORDER BY random()
     LIMIT v_qtd
  LOOP
    v_i := v_i + 1;
    INSERT INTO public.guilda_desafio_questoes (desafio_id, questao_id, ordem)
    VALUES (v_id, v_q.id, v_i);
  END LOOP;

  IF v_i = 0 THEN
    RAISE EXCEPTION 'arena_sem_questoes_liberadas';
  END IF;

  UPDATE public.guilda_desafios
     SET configuracao = jsonb_build_object('quantidade', v_i)
   WHERE id = v_id;

  IF v_formato = 'guilda' THEN
    INSERT INTO public.guilda_mensagens
           (guilda_id, classe_id, autor_id, tipo, texto, conteudo)
    VALUES (p_guilda_id, p_classe_id, v_me, 'desafio',
            'Um novo desafio foi lancado!',
            jsonb_build_object('id', v_id, 'modo', v_modo,
                               'formato', v_formato, 'quantidade', v_i));
    IF p_guilda_rival IS NOT NULL THEN
      INSERT INTO public.guilda_mensagens
             (guilda_id, classe_id, autor_id, tipo, texto, conteudo)
      VALUES (p_guilda_rival, p_classe_id, v_me, 'desafio',
              'Sua guilda foi desafiada!',
              jsonb_build_object('id', v_id, 'modo', v_modo,
                                 'formato', v_formato, 'quantidade', v_i));
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'formato', v_formato,
                            'modo', v_modo, 'quantidade', v_i,
                            'rivais_convidados', v_rivais);
END
$function$;
"""

GUILDA_CRIAR_ANTES = r"""
CREATE OR REPLACE FUNCTION public.guilda_desafio_criar(p_guilda_id uuid, p_modo text DEFAULT 'todos'::text, p_quantidade integer DEFAULT 3, p_dificuldade text DEFAULT 'normal'::text, p_consequencia text DEFAULT 'ranqueada'::text, p_formato text DEFAULT 'guilda'::text, p_aliado uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_g public.guildas%ROWTYPE;
  v_id uuid;
  v_qids bigint[];
  v_q bigint;
  v_i integer := 0;
  v_modo text := lower(btrim(COALESCE(p_modo, 'todos')));
  v_dif text := lower(btrim(COALESCE(p_dificuldade, 'normal')));
  v_cons text := lower(btrim(COALESCE(p_consequencia, 'ranqueada')));
  v_formato text := lower(btrim(COALESCE(p_formato, 'guilda')));
  v_params jsonb;
  v_jogadores integer;
BEGIN
  SELECT * INTO v_g
    FROM public.guildas
   WHERE id = p_guilda_id
     AND ativa
     AND EXISTS (
       SELECT 1 FROM public.guilda_membros
        WHERE guilda_id = p_guilda_id AND aluno_id = auth.uid() AND left_at IS NULL
     );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guilda_desafio_invalido';
  END IF;

  IF v_modo NOT IN ('todos', 'velocidade', 'precisao') THEN
    -- A lista e a da TABELA (`guilda_desafios_modo_check`). A da fase 7 incluia `duelo` e
    -- `duplo`, que a tabela recusa: pedi-los passava a validacao e estourava 23514 no INSERT.
    RAISE EXCEPTION 'guilda_desafio_invalido';
  END IF;
  IF v_formato NOT IN ('guilda', 'dupla', 'solo', 'turma') THEN
    RAISE EXCEPTION 'guilda_desafio_formato_invalido';
  END IF;
  IF v_formato = 'dupla' THEN
    -- Sem aliado, `dupla` seria `solo` com outro nome. Recusa alto em vez de criar errado.
    IF p_aliado IS NULL THEN
      RAISE EXCEPTION 'guilda_desafio_aliado_obrigatorio';
    END IF;
    IF p_aliado = auth.uid() THEN
      RAISE EXCEPTION 'guilda_desafio_aliado_invalido';
    END IF;
    IF NOT public.guilda_e_colega(p_aliado, v_g.classe_id) THEN
      RAISE EXCEPTION 'guilda_desafio_aliado_fora_da_turma';
    END IF;
  ELSIF p_aliado IS NOT NULL THEN
    -- Aliado em formato que nao o usa: recusa, para nao ser ignorado em silencio.
    RAISE EXCEPTION 'guilda_desafio_aliado_invalido';
  END IF;
  IF v_dif NOT IN ('normal', 'dificil') THEN
    RAISE EXCEPTION 'guilda_desafio_dificuldade_invalida';
  END IF;
  IF v_cons NOT IN ('treino', 'ranqueada', 'evento') THEN
    RAISE EXCEPTION 'guilda_desafio_consequencia_invalida';
  END IF;

  IF v_dif = 'dificil' THEN
    SELECT array_agg(s.id ORDER BY s.preferida DESC, random()) INTO v_qids
      FROM (
        SELECT q.id,
               public.fn_questao_peso_dificuldade(q.dificuldade)
                 >= public.fn_questao_peso_dificuldade(
                      (SELECT valor FROM public.app_config WHERE chave = 'desafio_dificuldade_min')
                    ) AS preferida
          FROM public.questoes q
          JOIN public.atividades a ON a.id = q.atividade_id
          JOIN public.topicos t ON t.id = a.topico_id
         WHERE t.classe_id = v_g.classe_id AND public.fn_questao_liberada(q.id)
      ) s;
  ELSE
    SELECT array_agg(id ORDER BY random()) INTO v_qids FROM (
      SELECT q.id FROM public.questoes q
        JOIN public.atividades a ON a.id = q.atividade_id
        JOIN public.topicos t ON t.id = a.topico_id
       WHERE t.classe_id = v_g.classe_id AND public.fn_questao_liberada(q.id) LIMIT 30) s;
  END IF;
  IF COALESCE(array_length(v_qids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'guilda_sem_questoes_liberadas';
  END IF;
  v_qids := v_qids[1:GREATEST(1, LEAST(p_quantidade, 10))];

  INSERT INTO public.guilda_desafios (
    guilda_id, classe_id, criado_por, formato, modo, titulo, configuracao,
    dificuldade, consequencia
  ) VALUES (
    -- `guilda_desafios_guilda_do_formato` exige `(formato = 'guilda') = (guilda_id IS NOT
    -- NULL)`: fora do formato guilda o desafio nasce SEM guilda, e ela fica sendo apenas o
    -- lugar de onde ele foi anunciado.
    CASE WHEN v_formato = 'guilda' THEN p_guilda_id ELSE NULL END,
    v_g.classe_id, auth.uid(), v_formato, v_modo,
    CASE v_formato WHEN 'guilda' THEN 'Desafio da guilda'
                   WHEN 'turma'  THEN 'Desafio da turma'
                   WHEN 'dupla'  THEN 'Desafio em dupla'
                   ELSE 'Desafio solo' END,
    jsonb_build_object('quantidade', array_length(v_qids, 1)),
    v_dif, v_cons
  ) RETURNING id INTO v_id;

  FOREACH v_q IN ARRAY v_qids LOOP
    v_i := v_i + 1;
    INSERT INTO public.guilda_desafio_questoes (desafio_id, questao_id, ordem)
    VALUES (v_id, v_q, v_i);
  END LOOP;

  -- Quem joga, por formato. Todos na EQUIPE 1 e `aceito`: nao existe fluxo de aceite no
  -- caminho vivo (`arena_convite_responder` nao e chamada por cliente nenhum), e com
  -- `convidado` o fechamento automatico da fase 8 -- que conta so `aceito` -- fecharia o
  -- desafio sem o parceiro.
  IF v_formato = 'guilda' THEN
    INSERT INTO public.desafio_participantes (desafio_id, aluno_id, equipe, estado, respondido_em)
    SELECT v_id, m.aluno_id, 1, 'aceito', now()
      FROM public.guilda_membros m
     WHERE m.guilda_id = p_guilda_id AND m.left_at IS NULL AND m.aluno_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  ELSIF v_formato = 'turma' THEN
    INSERT INTO public.desafio_participantes (desafio_id, aluno_id, equipe, estado, respondido_em)
    SELECT v_id, ca.aluno_id, 1, 'aceito', now()
      FROM public.classe_aluno ca
     WHERE ca.classe_id = v_g.classe_id AND ca.aluno_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  ELSIF v_formato = 'dupla' THEN
    INSERT INTO public.desafio_participantes (desafio_id, aluno_id, equipe, estado, respondido_em)
    VALUES (v_id, auth.uid(), 1, 'aceito', now()), (v_id, p_aliado, 1, 'aceito', now())
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.desafio_participantes (desafio_id, aluno_id, equipe, estado, respondido_em)
    VALUES (v_id, auth.uid(), 1, 'aceito', now())
    ON CONFLICT DO NOTHING;
  END IF;
  GET DIAGNOSTICS v_jogadores = ROW_COUNT;

  v_params := public.fn_desafio_params_efetivos(v_dif);

  INSERT INTO public.guilda_mensagens (guilda_id, classe_id, autor_id, tipo, texto, conteudo)
  VALUES (
    p_guilda_id, v_g.classe_id, auth.uid(), 'desafio', 'Um novo desafio foi lançado!',
    jsonb_build_object(
      'id', v_id, 'modo', v_modo, 'quantidade', array_length(v_qids, 1),
      'dificuldade', v_dif, 'consequencia', v_cons, 'params', v_params
    )
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'modo', v_modo,
    'formato', v_formato,
    'quantidade', array_length(v_qids, 1),
    'dificuldade', v_dif,
    'consequencia', v_cons,
    'jogadores', v_jogadores,
    'params', v_params
  );
END
$function$;
"""

ARENA_RESPONDER_ANTES = r"""
CREATE OR REPLACE FUNCTION public.arena_responder(p_desafio_id uuid, p_questao_id bigint, p_resposta text, p_tempo_ms integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me      uuid := auth.uid();
  v_q       public.questoes%ROWTYPE;
  v_correta boolean;
  v_tempo   integer;
  v_gravou  boolean := false;
  v_faltam  integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.desafio_participantes p
      JOIN public.guilda_desafios d ON d.id = p.desafio_id
     WHERE p.desafio_id = p_desafio_id AND p.aluno_id = v_me
       AND p.estado = 'aceito' AND d.status = 'aberto'
  ) THEN
    RAISE EXCEPTION 'arena_sem_permissao';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.guilda_desafio_questoes
     WHERE desafio_id = p_desafio_id AND questao_id = p_questao_id
  ) THEN
    RAISE EXCEPTION 'arena_questao_fora_do_desafio';
  END IF;
  -- 20261021_19: desafio sem equipe 2 e cooperativo, e cooperativo se responde por
  -- `guilda_desafio_responder` (tentativas do preset, fecha sem esperar convidado).
  IF NOT EXISTS (
    SELECT 1 FROM public.desafio_participantes p
     WHERE p.desafio_id = p_desafio_id AND p.equipe = 2
  ) THEN
    RAISE EXCEPTION 'arena_desafio_cooperativo' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_q FROM public.questoes WHERE id = p_questao_id;
  v_correta := lower(btrim(COALESCE(p_resposta, '')))
             = lower(btrim(COALESCE(v_q.resposta_correta, '')));

  v_tempo := LEAST(GREATEST(COALESCE(p_tempo_ms, 0), 0), 600000);

  INSERT INTO public.guilda_desafio_respostas
         (desafio_id, questao_id, aluno_id, resposta, correta, tempo_ms)
  VALUES (p_desafio_id, p_questao_id, v_me,
          COALESCE(p_resposta, ''), v_correta, v_tempo)
  ON CONFLICT (desafio_id, questao_id, aluno_id) DO NOTHING;
  GET DIAGNOSTICS v_faltam = ROW_COUNT;
  v_gravou := v_faltam > 0;

  SELECT count(*) INTO v_faltam
    FROM public.desafio_participantes p
    CROSS JOIN LATERAL (
      SELECT count(*) AS n FROM public.guilda_desafio_respostas r
       WHERE r.desafio_id = p.desafio_id AND r.aluno_id = p.aluno_id
    ) resp
   WHERE p.desafio_id = p_desafio_id
     AND p.estado = 'aceito'
     AND resp.n < (SELECT count(*) FROM public.guilda_desafio_questoes q
                    WHERE q.desafio_id = p_desafio_id);

  IF v_faltam = 0 AND NOT EXISTS (
    SELECT 1 FROM public.desafio_participantes p
     WHERE p.desafio_id = p_desafio_id AND p.estado = 'convidado'
  ) THEN
    PERFORM public.arena_encerrar(p_desafio_id);
  END IF;

  RETURN jsonb_build_object('correta', v_correta, 'registrada', v_gravou);
END
$function$;
"""

GUILDA_RESPONDER_ANTES = r"""
CREATE OR REPLACE FUNCTION public.guilda_desafio_responder(p_desafio_id uuid, p_questao_id bigint, p_resposta text, p_tempo_ms integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_q           public.questoes%ROWTYPE;
  v_d           public.guilda_desafios%ROWTYPE;
  v_tipo        text;
  v_correta     boolean;
  v_limite      integer;
  v_feitas      integer;
  v_tentativas  integer;
  v_total       integer;
  v_faltam      integer;
  v_fechou      jsonb := NULL;
BEGIN
  SELECT d.* INTO v_d
    FROM public.guilda_desafios d
    JOIN public.guilda_desafio_questoes dq ON dq.desafio_id = d.id
   WHERE d.id = p_desafio_id
     AND dq.questao_id = p_questao_id
     -- Participacao, nao pertencimento a guilda: `guilda_id` e NULL em solo, dupla e turma
     -- (`guilda_desafios_guilda_do_formato` obriga), e a guarda por guilda recusava os tres.
     -- Esta pergunta e a mesma que `fn_arena_placar` faz para contar e `fn_desafio_encerrar`
     -- para pagar, entao permissao e placar passam a coincidir.
     AND EXISTS (
       SELECT 1 FROM public.desafio_participantes dp
        WHERE dp.desafio_id = d.id
          AND dp.aluno_id = auth.uid()
          AND dp.estado = 'aceito'
     );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guilda_desafio_sem_permissao';
  END IF;

  -- 20261021_19: desafio com equipe 2 e da arena, e se responde por `arena_responder` (uma
  -- tentativa, espera o convidado). Respondido aqui, fecharia antes de o adversario aceitar.
  IF EXISTS (
    SELECT 1 FROM public.desafio_participantes dp
     WHERE dp.desafio_id = p_desafio_id AND dp.equipe = 2
  ) THEN
    RAISE EXCEPTION 'guilda_desafio_e_da_arena' USING ERRCODE = '22023';
  END IF;

  -- Desafio encerrado nao aceita resposta. Sem isto, responder depois do fechamento
  -- mudaria o placar de um desafio JA PAGO -- e `ON CONFLICT DO NOTHING` no pagamento
  -- impede o acerto de virar premio, entao o aluno perderia o que ganhou sem explicacao.
  IF v_d.status = 'encerrado' THEN
    RAISE EXCEPTION 'guilda_desafio_encerrado' USING ERRCODE = '22023';
  END IF;

  -- LIMITE DE TENTATIVA -- e aqui que `desafio_tentativas_dificil` deixa de ser enfeite do
  -- preset. Conta as tentativas JA feitas nesta questao antes de gravar a nova.
  v_limite := public.fn_app_config_int(
    CASE WHEN lower(COALESCE(v_d.dificuldade, 'normal')) = 'dificil'
         THEN 'desafio_tentativas_dificil' ELSE 'desafio_tentativas_normal' END,
    2);
  SELECT COALESCE(r.tentativas, 0) INTO v_feitas
    FROM public.guilda_desafio_respostas r
   WHERE r.desafio_id = p_desafio_id AND r.questao_id = p_questao_id
     AND r.aluno_id = auth.uid();
  IF COALESCE(v_feitas, 0) >= GREATEST(v_limite, 1) THEN
    RAISE EXCEPTION 'guilda_desafio_sem_tentativas' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_q FROM public.questoes WHERE id = p_questao_id;
  v_tipo := lower(btrim(COALESCE(v_q.tipo::text, '')));
  -- Os dois lados do CASE original eram identicos; a comparacao e a mesma para todo tipo.
  v_correta := lower(btrim(COALESCE(p_resposta, '')))
             = lower(btrim(COALESCE(v_q.resposta_correta::text, '')));

  INSERT INTO public.guilda_desafio_respostas
         (desafio_id, questao_id, aluno_id, resposta, correta, tempo_ms, tentativas)
  VALUES (p_desafio_id, p_questao_id, auth.uid(), p_resposta, v_correta,
          GREATEST(COALESCE(p_tempo_ms, 0), 0), 1)
  ON CONFLICT (desafio_id, questao_id, aluno_id) DO UPDATE
     SET resposta = EXCLUDED.resposta,
         correta = EXCLUDED.correta,
         -- O tempo ACUMULA entre tentativas: quem erra e tenta de novo gastou os dois.
         -- Substituir premiaria a ultima tentativa, que e sempre a mais rapida.
         tempo_ms = COALESCE(public.guilda_desafio_respostas.tempo_ms, 0)
                  + GREATEST(COALESCE(EXCLUDED.tempo_ms, 0), 0),
         tentativas = public.guilda_desafio_respostas.tentativas + 1,
         respondida_em = now()
  RETURNING tentativas INTO v_tentativas;

  -- FECHAMENTO AUTOMATICO: a ultima resposta fecha. Quem conta e o par
  -- (participante aceito x questao do desafio) -- participante que nao respondeu tudo
  -- mantem o desafio aberto, e e para isso que existe a varredura.
  SELECT count(*) INTO v_total
    FROM public.guilda_desafio_questoes WHERE desafio_id = p_desafio_id;

  -- Quem ainda PODE responder, nao quem ainda nao respondeu: a versao anterior fechava o
  -- desafio na primeira resposta de cada um, mesmo errada e com tentativa sobrando, e a
  -- tentativa seguinte batia em `guilda_desafio_encerrado`. Acerto fecha o par na hora.
  SELECT count(*) INTO v_faltam
    FROM public.desafio_participantes dp
    CROSS JOIN public.guilda_desafio_questoes dq
    LEFT JOIN public.guilda_desafio_respostas r
           ON r.desafio_id = p_desafio_id
          AND r.questao_id = dq.questao_id
          AND r.aluno_id = dp.aluno_id
   WHERE dp.desafio_id = p_desafio_id
     AND dq.desafio_id = p_desafio_id
     AND dp.estado = 'aceito'
     AND (
       r.questao_id IS NULL
       -- `v_limite` e o mesmo numero que recusa a tentativa a mais, 20 linhas acima.
       OR (NOT r.correta AND COALESCE(r.tentativas, 0) < GREATEST(v_limite, 1))
     );

  IF v_total > 0 AND v_faltam = 0 THEN
    v_fechou := public.fn_desafio_encerrar(p_desafio_id);
  END IF;

  RETURN jsonb_build_object(
    'correta', v_correta,
    'tentativas', v_tentativas,
    'tentativas_restantes', GREATEST(GREATEST(v_limite, 1) - COALESCE(v_tentativas, 1), 0),
    'faltam', v_faltam,
    'encerrou', v_fechou
  );
END
$function$;
"""

ARENA_CRIAR = _trocar(ARENA_CRIAR_ANTES, [
    (
        "     WHERE t.classe_id = p_classe_id\n       AND NOT EXISTS (",
        "     WHERE t.classe_id = p_classe_id\n"
        "       -- 20261110_06: só o que o banco corrige na hora.\n"
        "       AND public.fn_questao_cabe_no_desafio(q.id)\n"
        "       AND NOT EXISTS (",
        1,
    ),
])

GUILDA_CRIAR = _trocar(GUILDA_CRIAR_ANTES, [
    (
        "public.fn_questao_liberada(q.id)",
        "public.fn_questao_liberada(q.id)\n"
        "           AND public.fn_questao_cabe_no_desafio(q.id)",
        2,
    ),
])

ARENA_RESPONDER = _trocar(ARENA_RESPONDER_ANTES, [
    (
        "  v_correta := lower(btrim(COALESCE(p_resposta, '')))\n"
        "             = lower(btrim(COALESCE(v_q.resposta_correta, '')));",
        "  -- 20261110_06: a mesma correção da atividade, pelo gabarito de `questao_gabarito`.\n"
        f"  v_correta := {CORRIGE};",
        1,
    ),
    (
        "  GET DIAGNOSTICS v_faltam = ROW_COUNT;\n  v_gravou := v_faltam > 0;\n",
        "  GET DIAGNOSTICS v_faltam = ROW_COUNT;\n  v_gravou := v_faltam > 0;\n"
        "  -- 20261110_06: resposta repetida devolve o que ficou gravado, não a correção do chute\n"
        "  -- novo. Sem isto, responder de novo era um oráculo do gabarito.\n"
        "  IF NOT v_gravou THEN\n"
        "    SELECT r.correta INTO v_correta\n"
        "      FROM public.guilda_desafio_respostas r\n"
        "     WHERE r.desafio_id = p_desafio_id AND r.questao_id = p_questao_id\n"
        "       AND r.aluno_id = v_me;\n"
        "  END IF;\n",
        1,
    ),
])

GUILDA_RESPONDER = _trocar(GUILDA_RESPONDER_ANTES, [
    (
        "  -- Os dois lados do CASE original eram identicos; a comparacao e a mesma para todo tipo.\n"
        "  v_correta := lower(btrim(COALESCE(p_resposta, '')))\n"
        "             = lower(btrim(COALESCE(v_q.resposta_correta::text, '')));",
        "  -- 20261110_06: a mesma correção da atividade, pelo gabarito de `questao_gabarito`.\n"
        f"  v_correta := {CORRIGE};",
        1,
    ),
])


def upgrade() -> None:
    op.execute(CABE_NO_DESAFIO)
    for sql in (ARENA_CRIAR, GUILDA_CRIAR, ARENA_RESPONDER, GUILDA_RESPONDER):
        op.execute(sql)


def downgrade() -> None:
    for sql in (ARENA_CRIAR_ANTES, GUILDA_CRIAR_ANTES, ARENA_RESPONDER_ANTES, GUILDA_RESPONDER_ANTES):
        op.execute(sql)
    op.execute("DROP FUNCTION IF EXISTS public.fn_questao_cabe_no_desafio(bigint);")
