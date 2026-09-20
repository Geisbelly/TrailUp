"""arena: guilda contra guilda, e o cooperativo deixa de ser deduzido do placar

Revision ID: 20260920_06
Revises: 20260920_05
Create Date: 2026-09-20

A `20260920_05` deixou o formato `guilda` cooperativo -- a guilda joga contra a
regua do `modo` -- e decidiu isso por uma DEDUCAO: `arena_encerrar` olhava
`integrantes da equipe 2 = 0` e concluia "entao e cooperativo".

Isso estava errado por dois motivos ao mesmo tempo, e o segundo e um furo.

**1. Guilda contra guilda e indizivel por deducao.** Uma partida PvP em que o
outro lado ainda nao aceitou tem equipe 2 vazia e fica IDENTICA a um treino
cooperativo. Nao da para separar as duas lendo o placar; tem de estar na
identidade do desafio. Entra `guilda_rival_id`: preenchida, e disputa; nula no
formato `guilda`, e treino.

**2. Dava para farmar vitoria sozinho.** Medido nesta base, em transacao
revertida, antes desta migracao:

    A cria solo contra B  ->  B fica `convidado` e nunca aceita
    A responde as 3 questoes certas
    A chama `arena_encerrar` na mao  ->  status encerrado, vencedor_equipe = 1
    eventos: desafio_participou=3 | desafio_vencido=12

`arena_responder` so fecha sozinho quando nao sobra `convidado`, entao o
desafio ficava aberto -- mas `arena_encerrar` aceita qualquer participante, e
com a equipe 2 vazia o ramo cooperativo dava a vitoria. Repetivel contra
qualquer colega da turma, sem a participacao dele.

A correcao e uma so para os dois: **cooperativo passa a ser
`formato = 'guilda' AND guilda_rival_id IS NULL`, nunca o placar.** E toda
disputa (solo, dupla, guilda com rival) exige que os DOIS lados tenham pelo
menos um jogador que respondeu. Quando nao tem, o resultado e `sem_adversario`:
sem vencedor, sem empate, so `desafio_participou` para quem jogou -- que e o
mesmo que a pessoa levaria jogando qualquer rodada. O farm deixa de pagar.

**E o placar de guilda contra guilda compara APROVEITAMENTO, nao acerto bruto.**
Pontuacao de equipe e soma, entao uma guilda de 5 bateria uma de 2 so por ser
maior. Aproveitamento e `acertos / (questoes * integrantes)`, comparado por
multiplicacao cruzada (`p1 * n2 > p2 * n1`) para nao sair do inteiro. Nao e
regra nova: e exatamente a regua de 50% que o cooperativo ja usava. Em solo e
dupla os times tem o mesmo tamanho por construcao, entao a ordem nao muda --
so guilda contra guilda de tamanhos diferentes sente.

Quem aceita pela guilda rival: **cada membro por si**. Nao ha papel de lider no
dominio (`criado_por` e quem criou, nao quem manda), e inventar um governo de
guilda aqui seria decidir por eles. Cada membro ativo da rival nasce
`convidado` e responde por si; quem nao aceitar simplesmente nao joga, e o
aproveitamento normaliza o tamanho de quem apareceu.
"""

from alembic import op

revision = "20260920_06"
down_revision = "20260920_05"
branch_labels = None
depends_on = None


_RESULTADOS = ("vitoria", "empate", "sem_adversario")


def _lista(valores) -> str:
    return ", ".join(f"'{v}'" for v in valores)


_FUNCOES = (
    "arena_desafio_criar(bigint, text, text, integer, uuid, uuid, uuid[], uuid)",
    "arena_encerrar(uuid)",
    "arena_listar(bigint)",
)


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE public.guilda_desafios
          ADD COLUMN IF NOT EXISTS guilda_rival_id uuid
            REFERENCES public.guildas(id) ON DELETE CASCADE,
          ADD COLUMN IF NOT EXISTS resultado text
        """
    )
    # Rival so existe no formato guilda, e nunca e a propria guilda. Sem a
    # segunda metade, um desafio da guilda contra ela mesma teria os mesmos
    # alunos nas duas equipes.
    op.execute(
        """
        ALTER TABLE public.guilda_desafios
          DROP CONSTRAINT IF EXISTS guilda_desafios_rival_check
        """
    )
    op.execute(
        """
        ALTER TABLE public.guilda_desafios
          ADD CONSTRAINT guilda_desafios_rival_check
          CHECK (guilda_rival_id IS NULL
                 OR (formato = 'guilda' AND guilda_rival_id <> guilda_id))
        """
    )
    op.execute(
        """
        ALTER TABLE public.guilda_desafios
          DROP CONSTRAINT IF EXISTS guilda_desafios_resultado_check
        """
    )
    op.execute(
        f"""
        ALTER TABLE public.guilda_desafios
          ADD CONSTRAINT guilda_desafios_resultado_check
          CHECK (resultado IS NULL OR resultado IN ({_lista(_RESULTADOS)}))
        """
    )

    # A assinatura ganha um parametro, entao a antiga de 7 argumentos some --
    # senao o PostgREST fica com duas candidatas e escolhe por numero de
    # parametros nomeados, que e' exatamente o tipo de ambiguidade que aparece
    # so em producao.
    op.execute(
        "DROP FUNCTION IF EXISTS public.arena_desafio_criar"
        "(bigint, text, text, integer, uuid, uuid, uuid[])"
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.arena_desafio_criar(
          p_classe_id    bigint,
          p_formato      text    DEFAULT 'solo',
          p_modo         text    DEFAULT 'precisao',
          p_quantidade   integer DEFAULT 5,
          p_guilda_id    uuid    DEFAULT NULL,
          p_aliado       uuid    DEFAULT NULL,
          p_adversarios  uuid[]  DEFAULT NULL,
          p_guilda_rival uuid    DEFAULT NULL
        ) RETURNS jsonb
          LANGUAGE plpgsql SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
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
              -- A rival tem de ser da MESMA turma e estar ativa: guilda de
              -- outra classe traria aluno que nao ve as questoes desta.
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
          -- `COALESCE(..., 0)` nao e zelo: `array_length` de array VAZIO devolve
          -- NULL, nao zero, e o formato guilda convoca ninguem. Sem isto a
          -- comparacao dava `NULL IS DISTINCT FROM 0` -- verdadeiro -- e o
          -- formato guilda morria com `arena_participante_repetido`.
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

          -- Composicao CONGELADA na abertura, dos DOIS lados. Quem sair da
          -- guilda amanha continua no placar deste desafio, e quem entrar
          -- depois fica de fora -- senao `guilda_listar` mudaria o placar de
          -- uma rodada ja respondida toda vez que alguem entrasse ou saisse.
          IF v_formato = 'guilda' THEN
            INSERT INTO public.desafio_participantes
                   (desafio_id, aluno_id, equipe, estado, respondido_em)
            SELECT v_id, m.aluno_id, 1, 'aceito', now()
              FROM public.guilda_membros m
             WHERE m.guilda_id = p_guilda_id AND m.left_at IS NULL
               AND m.aluno_id IS NOT NULL
            ON CONFLICT DO NOTHING;

            IF p_guilda_rival IS NOT NULL THEN
              -- Cada membro da rival responde POR SI. Nao ha papel de lider no
              -- dominio (`criado_por` e quem criou, nao quem manda), e deixar
              -- uma pessoa comprometer a guilda inteira num desafio que paga
              -- ponto seria inventar um governo que nao existe.
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

          -- O pool tem de estar liberado para TODOS. Sortear pelo que o criador
          -- ja abriu daria ao adversario questao que a trilha dele nao liberou.
          --
          -- E o `ORDER BY random()` vem ANTES do LIMIT. A RPC antiga sorteava
          -- depois de cortar em 30, ou seja, embaralhava sempre as mesmas 30.
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
              -- A rival tambem e avisada no chat DELA: sem isto o unico sinal
              -- seria o convite individual, e guilda parada nunca saberia que
              -- foi desafiada.
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
        $fn$
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.arena_encerrar(p_desafio_id uuid)
          RETURNS jsonb
          LANGUAGE plpgsql SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
        DECLARE
          v_d        public.guilda_desafios%ROWTYPE;
          v_p1 integer; v_p2 integer;
          v_t1 bigint;  v_t2 bigint;
          v_n1 integer; v_n2 integer;
          v_jog1 integer; v_jog2 integer;
          v_total    integer;
          v_cooperativo boolean;
          v_vencedor smallint;
          v_resultado text;
          v_ref      text;
          v_pagos    integer;
        BEGIN
          -- `FOR UPDATE` e a trava: dois encerramentos concorrentes serializam
          -- aqui, e o segundo ve `encerrado` e sai sem pagar.
          SELECT * INTO v_d FROM public.guilda_desafios
           WHERE id = p_desafio_id FOR UPDATE;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'arena_desafio_inexistente';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM public.desafio_participantes
             WHERE desafio_id = p_desafio_id AND aluno_id = auth.uid()
          ) THEN
            RAISE EXCEPTION 'arena_sem_permissao';
          END IF;
          IF v_d.status = 'encerrado' THEN
            RETURN jsonb_build_object('status', 'encerrado', 'novo', false,
                                      'resultado', v_d.resultado,
                                      'vencedor_equipe', v_d.vencedor_equipe);
          END IF;

          SELECT COALESCE(sum(pontos)      FILTER (WHERE equipe = 1), 0),
                 COALESCE(sum(tempo_ms)    FILTER (WHERE equipe = 1), 0),
                 COALESCE(sum(integrantes) FILTER (WHERE equipe = 1), 0),
                 COALESCE(sum(pontos)      FILTER (WHERE equipe = 2), 0),
                 COALESCE(sum(tempo_ms)    FILTER (WHERE equipe = 2), 0),
                 COALESCE(sum(integrantes) FILTER (WHERE equipe = 2), 0)
            INTO v_p1, v_t1, v_n1, v_p2, v_t2, v_n2
            FROM public.fn_arena_equipes(p_desafio_id);

          -- Quem de fato JOGOU, por lado. Sai do placar cru e NAO do filtro de
          -- modo: em `todos`, quem respondeu parcial nao pontua, mas apareceu
          -- -- e "apareceu" e o que decide se houve adversario.
          SELECT count(*) FILTER (WHERE equipe = 1 AND estado = 'aceito' AND respondidas > 0),
                 count(*) FILTER (WHERE equipe = 2 AND estado = 'aceito' AND respondidas > 0)
            INTO v_jog1, v_jog2
            FROM public.fn_arena_placar(p_desafio_id);

          SELECT count(*) INTO v_total
            FROM public.guilda_desafio_questoes WHERE desafio_id = p_desafio_id;

          -- COOPERATIVO E' DECIDIDO PELA IDENTIDADE DO DESAFIO, nunca pelo
          -- placar. Deduzir de "equipe 2 vazia" dava a vitoria a quem
          -- desafiasse alguem que nunca aceitou -- medido: 12 pontos por
          -- rodada, contra qualquer colega, sem a participacao dele.
          v_cooperativo := (v_d.formato = 'guilda' AND v_d.guilda_rival_id IS NULL);

          IF v_cooperativo THEN
            -- A guilda joga contra a regua: ou bate a maioria das questoes
            -- disponiveis, ou empata. Ninguem PERDE um desafio cooperativo.
            IF v_p1 * 2 >= v_total * GREATEST(v_n1, 1) THEN
              v_vencedor := 1; v_resultado := 'vitoria';
            ELSE
              v_vencedor := NULL; v_resultado := 'empate';
            END IF;
          ELSIF v_jog1 = 0 OR v_jog2 = 0 THEN
            -- Disputa sem os dois lados nao e vitoria nem empate: e' uma
            -- rodada que nao aconteceu. Quem jogou leva so a participacao --
            -- o mesmo que levaria em qualquer outra rodada.
            v_vencedor := NULL; v_resultado := 'sem_adversario';
          ELSE
            -- APROVEITAMENTO, nao acerto bruto: pontuacao de equipe e soma,
            -- entao uma guilda de 5 bateria uma de 2 so por ser maior.
            -- `acertos / (questoes * integrantes)` comparado por multiplicacao
            -- cruzada -- as questoes sao as mesmas dos dois lados e cancelam,
            -- e assim a conta nao sai do inteiro. E a mesma regua de 50% que o
            -- ramo cooperativo usa. Em solo e dupla os times tem o mesmo
            -- tamanho por construcao, entao a ordem nao muda.
            IF v_n1 = 0 OR v_n2 = 0 THEN
              -- So acontece no modo `todos`: um lado apareceu mas ninguem dele
              -- fechou a rodada. Quem fechou, vence.
              v_vencedor := CASE WHEN v_n1 > 0 THEN 1::smallint
                                 WHEN v_n2 > 0 THEN 2::smallint
                                 ELSE NULL END;
            ELSIF v_p1 * v_n2 > v_p2 * v_n1 THEN
              v_vencedor := 1;
            ELSIF v_p2 * v_n1 > v_p1 * v_n2 THEN
              v_vencedor := 2;
            ELSIF v_d.modo = 'velocidade' AND v_p1 > 0 AND v_t1 * v_n2 <> v_t2 * v_n1 THEN
              -- Desempate por tempo MEDIO, pela mesma razao do aproveitamento.
              -- So quando houve acerto: premiar o mais rapido num placar de
              -- zero a zero e premiar quem chutou mais depressa.
              v_vencedor := CASE WHEN v_t1 * v_n2 < v_t2 * v_n1
                                 THEN 1::smallint ELSE 2::smallint END;
            ELSE
              v_vencedor := NULL;
            END IF;
            v_resultado := CASE WHEN v_vencedor IS NULL THEN 'empate' ELSE 'vitoria' END;
          END IF;

          UPDATE public.guilda_desafios
             SET status = 'encerrado', encerrado_em = now(),
                 vencedor_equipe = v_vencedor, resultado = v_resultado
           WHERE id = p_desafio_id;

          -- A referencia comeca pela CLASSE porque e dai que
          -- `fn_eventos_aluno_resolve_classe_id` tira o id (segundo segmento).
          -- Uma referencia que comecasse pelo desafio resolveria classe nula, e
          -- classe nula tira o evento do rank inteiro.
          v_ref := 'classe' || ':' || v_d.classe_id::text
                 || ':' || 'desafio' || ':' || p_desafio_id::text;

          -- `valor` vai zero de proposito: o gatilho descarta o que o chamador
          -- manda e le `fn_pontos_do_evento`. E a `idempotencia_key` e DERIVADA
          -- de (desafio, aluno, tipo), nao gerada na hora -- gerar na hora e o
          -- que duplica ponto no reenvio.
          --
          -- `sem_adversario` nao entra no CASE: rodada que nao aconteceu paga
          -- so a participacao.
          INSERT INTO public.eventos_aluno
                 (aluno_id, tipo, referencia, valor, criado_em, idempotencia_key)
          SELECT pl.aluno_id, t.tipo, v_ref, 0, now(),
                 md5(p_desafio_id::text || t.tipo || pl.aluno_id::text)::uuid
            FROM public.fn_arena_placar(p_desafio_id) pl
            CROSS JOIN LATERAL (
              SELECT unnest(
                ARRAY['desafio_participou']
                || CASE
                     WHEN v_resultado = 'empate' THEN ARRAY['desafio_empate']
                     WHEN v_resultado = 'vitoria' AND pl.equipe = v_vencedor
                       THEN ARRAY['desafio_vencido']
                     ELSE ARRAY[]::text[]
                   END
              ) AS tipo
            ) t
           WHERE pl.estado = 'aceito' AND pl.respondidas > 0
          ON CONFLICT DO NOTHING;
          GET DIAGNOSTICS v_pagos = ROW_COUNT;

          RETURN jsonb_build_object(
            'status', 'encerrado', 'novo', true,
            'resultado', v_resultado,
            'vencedor_equipe', v_vencedor,
            'cooperativo', v_cooperativo,
            'eventos', v_pagos,
            'equipe_1', jsonb_build_object('pontos', v_p1, 'tempo_ms', v_t1,
                                           'integrantes', v_n1, 'jogaram', v_jog1),
            'equipe_2', jsonb_build_object('pontos', v_p2, 'tempo_ms', v_t2,
                                           'integrantes', v_n2, 'jogaram', v_jog2)
          );
        END
        $fn$
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.arena_listar(p_classe_id bigint)
          RETURNS jsonb
          LANGUAGE sql STABLE SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
          SELECT COALESCE(jsonb_agg(s.item ORDER BY s.created_at DESC), '[]'::jsonb)
          FROM (
            SELECT d.created_at,
                   jsonb_build_object(
                     'id', d.id,
                     'classe_id', d.classe_id,
                     'formato', d.formato,
                     'modo', d.modo,
                     'status', d.status,
                     'resultado', d.resultado,
                     'titulo', d.titulo,
                     'guilda_id', d.guilda_id,
                     'guilda_nome', g.nome,
                     'guilda_rival_id', d.guilda_rival_id,
                     'guilda_rival_nome', gr.nome,
                     'criado_por', d.criado_por,
                     'sou_criador', d.criado_por = auth.uid(),
                     'created_at', d.created_at,
                     'encerrado_em', d.encerrado_em,
                     'vencedor_equipe', d.vencedor_equipe,
                     'questoes', (SELECT count(*) FROM public.guilda_desafio_questoes q
                                   WHERE q.desafio_id = d.id),
                     'meu_estado', me.estado,
                     'minha_equipe', me.equipe,
                     'minhas_respostas', (SELECT count(*)
                                            FROM public.guilda_desafio_respostas r
                                           WHERE r.desafio_id = d.id
                                             AND r.aluno_id = auth.uid()),
                     'participantes', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                                'aluno_id', pl.aluno_id, 'nome', a.nome,
                                'apelido', a.apelido, 'foto_url', a.foto_url,
                                'perfil_ativo', a.perfil_ativo,
                                'equipe', pl.equipe, 'estado', pl.estado,
                                'acertos', pl.acertos,
                                'respondidas', pl.respondidas,
                                'tempo_ms', pl.tempo_total_ms
                              ) ORDER BY pl.equipe, a.nome)
                         FROM public.fn_arena_placar(d.id) pl
                         JOIN public.alunos a ON a.id = pl.aluno_id
                     ), '[]'::jsonb),
                     'equipes', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                                'equipe', e.equipe, 'pontos', e.pontos,
                                'tempo_ms', e.tempo_ms, 'integrantes', e.integrantes
                              ) ORDER BY e.equipe)
                         FROM public.fn_arena_equipes(d.id) e
                     ), '[]'::jsonb)
                   ) AS item
              FROM public.guilda_desafios d
              JOIN public.desafio_participantes me
                ON me.desafio_id = d.id AND me.aluno_id = auth.uid()
              LEFT JOIN public.guildas g  ON g.id  = d.guilda_id
              LEFT JOIN public.guildas gr ON gr.id = d.guilda_rival_id
             WHERE d.classe_id = p_classe_id
               AND public.guilda_e_colega(auth.uid(), p_classe_id)
             ORDER BY d.created_at DESC
             LIMIT 40
          ) s;
        $fn$
        """
    )

    for assinatura in _FUNCOES:
        op.execute(f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon")
        op.execute(f"GRANT EXECUTE ON FUNCTION public.{assinatura} TO authenticated")

    op.execute(
        """
        DO $confere$
        DECLARE v_sobra text;
        BEGIN
          SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_sobra
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('arena_desafio_criar', 'arena_encerrar', 'arena_listar')
             AND (has_function_privilege('anon', p.oid, 'execute')
                  OR p.proconfig IS NULL);
          IF v_sobra IS NOT NULL THEN
            RAISE EXCEPTION USING MESSAGE =
              'funcao da arena alcancavel por anon ou sem search_path: ' || v_sobra;
          END IF;
        END
        $confere$;
        """
    )


def downgrade() -> None:
    # Desafio de guilda contra guilda nao cabe no esquema anterior: a equipe 2
    # dele viraria um time sem dono. Some junto com a coluna; os eventos ja
    # pagos FICAM, como na `20260920_05`.
    op.execute("DELETE FROM public.guilda_desafios WHERE guilda_rival_id IS NOT NULL")
    op.execute(
        """
        ALTER TABLE public.guilda_desafios
          DROP CONSTRAINT IF EXISTS guilda_desafios_rival_check,
          DROP CONSTRAINT IF EXISTS guilda_desafios_resultado_check
        """
    )
    op.execute(
        """
        ALTER TABLE public.guilda_desafios
          DROP COLUMN IF EXISTS guilda_rival_id,
          DROP COLUMN IF EXISTS resultado
        """
    )
    op.execute(
        "DROP FUNCTION IF EXISTS public.arena_desafio_criar"
        "(bigint, text, text, integer, uuid, uuid, uuid[], uuid)"
    )
