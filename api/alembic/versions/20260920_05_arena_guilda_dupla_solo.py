"""arena: formato (guilda/dupla/solo), participantes congelados e pontuacao no rank

Revision ID: 20260920_05
Revises: 20260920_04
Create Date: 2026-09-20

O substrato do desafio de guilda ja estava inteiro no banco e **sem um chamador
sequer** no monorepo (conferido em `mobile/src`, `frontend/src`, `api/app`):
3 linhas em `guilda_desafios`, 9 em `guilda_desafio_questoes`, **0** em
`guilda_desafio_respostas`. E o `CHECK` de `modo` ja aceitava `duelo` e `duplo`.

Tres coisas impediam que isso virasse produto, e esta migracao trata as tres.

1. **`modo` misturava duas perguntas.** `todos`/`velocidade`/`precisao` dizem
   COMO se ganha; `duelo`/`duplo` dizem QUEM joga. Com as cinco na mesma coluna
   "um duelo decidido por velocidade" e indizivel. Entra `formato`, e `modo`
   encolhe para as tres que sempre foram dele. Nenhuma das 3 linhas usa `duelo`
   ou `duplo` (sao `velocidade`, `velocidade`, `todos`), entao estreitar o CHECK
   nao recusa linha nenhuma -- e a migracao confere isso antes de trocar.

2. **`guilda_id` era NOT NULL.** Duelo entre alunos de guildas diferentes, ou
   sem guilda, nao cabia na tabela. Passa a aceitar NULL e vira ROTULO: quem
   joga sai de `desafio_participantes`, e so de la.

3. **Nada pontuava.** `guilda_desafio_responder` grava so em
   `guilda_desafio_respostas`; `questao_aluno`, onde
   `guilda_chat_questao_responder` grava, **nao tem gatilho nenhum**. O desafio
   valia zero ponto. Agora o encerramento paga em `eventos_aluno`, que e a
   coluna que o rank soma.

Quatro decisoes que nao sao acidentais:

- **O tipo do evento comeca com `desafio_`, nunca com `participacao_`.**
  `fn_evento_creditado` casa por PREFIXO e devolve o valor que o CHAMADOR
  mandou para `presenca*`, `participacao*` e `conquista*`. Um tipo
  `participacao_desafio` deixaria o aluno escolher quanto vale a propria
  vitoria. Com `desafio_*` o gatilho descarta o que veio e le
  `fn_pontos_do_evento`.

- **A referencia e `classe` / id / desafio / uuid, nessa ordem.**
  `fn_eventos_aluno_resolve_classe_id` so conhece os prefixos topico, conteudo,
  atividade, classe e conquista; uma referencia que comecasse pelo desafio
  resolveria classe NULL, e classe nula tira o evento do rank inteiro. O id da
  turma fica no SEGUNDO segmento, como `registrar_credito_da_turma` ja faz.

- **Pagar duas vezes e impossivel em dois niveis.** O encerramento vira
  aberto -> encerrado com `FOR UPDATE` na linha, e cada evento nasce com
  `idempotencia_key` DERIVADA de (desafio, aluno, tipo) por md5. `desafio_*`
  nao esta em `fn_evento_de_conclusao`, entao nao herda a dedup por referencia
  -- e a chave derivada que protege.

- **Resposta e `DO NOTHING`, nao `DO UPDATE`.** A RPC antiga fazia UPDATE, o
  que em desafio valendo ponto e tentar ate acertar. A primeira resposta vale.

`fn_questao_liberada` ganha a variante `_para(aluno, questao)` com o corpo de
verdade, e a antiga passa a delegar. Nao e zelo: o pool tem de estar liberado
para TODOS os participantes, senao o adversario recebe questao que a trilha
dele ainda nao abriu. Duas copias do corpo divergiriam.

E toda funcao criada aqui sai com `search_path` fixo e sem `anon`: funcao nova
NASCE executavel por PUBLIC no Supabase, que e a divida que chegou a 74 em
`20260920_04`.
"""

from alembic import op

revision = "20260920_05"
down_revision = "20260920_04"
branch_labels = None
depends_on = None


# As RPCs de usuario desta migracao. Sao estas que saem do alcance do `anon` e
# que o downgrade devolve.
_FUNCOES = (
    "fn_questao_liberada(bigint)",
    "fn_questao_liberada_para(uuid, bigint)",
    "fn_arena_placar(uuid)",
    "fn_arena_equipes(uuid)",
    "arena_desafio_criar(bigint, text, text, integer, uuid, uuid, uuid[])",
    "arena_convite_responder(uuid, boolean)",
    "arena_responder(uuid, bigint, text, integer)",
    "arena_encerrar(uuid)",
    "arena_listar(bigint)",
    "arena_desafio(uuid)",
)

_FORMATOS = ("guilda", "dupla", "solo")
_MODOS = ("todos", "velocidade", "precisao")

# Pontos e moedas dos tres tipos novos, na mesma escala de `eventos_pontuacao`
# (atividade_concluida vale 15, conteudo_concluido 10, atividade_acertada 5).
_PONTUACAO = (
    ("desafio_vencido", 12, 3, "Venceu um desafio da arena"),
    ("desafio_empate", 6, 1, "Empatou um desafio da arena"),
    ("desafio_participou", 3, 0, "Jogou um desafio da arena"),
)


def _lista(valores) -> str:
    return ", ".join(f"'{v}'" for v in valores)


def _sem_anon() -> None:
    for assinatura in _FUNCOES:
        op.execute(
            f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon"
        )
        op.execute(
            f"GRANT EXECUTE ON FUNCTION public.{assinatura} TO authenticated"
        )


def upgrade() -> None:
    # ---------------------------------------------------------------- schema

    # Antes de estreitar o CHECK, prove que nao ha linha a recusar. Um CHECK que
    # nao valida no ADD derruba a migracao no meio; um que valida mas apaga
    # semantica e pior.
    op.execute(
        f"""
        DO $confere$
        DECLARE v_n integer;
        BEGIN
          SELECT count(*) INTO v_n
            FROM public.guilda_desafios
           WHERE modo NOT IN ({_lista(_MODOS)});
          IF v_n > 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'ha ' || v_n::text || ' desafio(s) em modo que sai do CHECK; '
              || 'migre-os para formato antes de estreitar';
          END IF;
        END
        $confere$;
        """
    )

    op.execute(
        """
        ALTER TABLE public.guilda_desafios
          ADD COLUMN IF NOT EXISTS formato text NOT NULL DEFAULT 'guilda',
          ADD COLUMN IF NOT EXISTS encerrado_em timestamptz,
          ADD COLUMN IF NOT EXISTS vencedor_equipe smallint
        """
    )
    op.execute(
        "ALTER TABLE public.guilda_desafios ALTER COLUMN guilda_id DROP NOT NULL"
    )
    op.execute(
        "ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_modo_check"
    )
    op.execute(
        f"""
        ALTER TABLE public.guilda_desafios
          ADD CONSTRAINT guilda_desafios_modo_check
          CHECK (modo IN ({_lista(_MODOS)}))
        """
    )
    op.execute(
        "ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_formato_check"
    )
    op.execute(
        f"""
        ALTER TABLE public.guilda_desafios
          ADD CONSTRAINT guilda_desafios_formato_check
          CHECK (formato IN ({_lista(_FORMATOS)}))
        """
    )
    # Formato de guilda exige guilda; os outros dois nao a tem. Sem isto,
    # `guilda_id` nullable vira "as vezes preenchido", que e o estado em que o
    # rotulo deixa de dizer alguma coisa.
    op.execute(
        "ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_guilda_do_formato"
    )
    op.execute(
        """
        ALTER TABLE public.guilda_desafios
          ADD CONSTRAINT guilda_desafios_guilda_do_formato
          CHECK ((formato = 'guilda') = (guilda_id IS NOT NULL))
        """
    )
    op.execute(
        """
        ALTER TABLE public.guilda_desafios
          DROP CONSTRAINT IF EXISTS guilda_desafios_vencedor_check
        """
    )
    op.execute(
        """
        ALTER TABLE public.guilda_desafios
          ADD CONSTRAINT guilda_desafios_vencedor_check
          CHECK (vencedor_equipe IS NULL OR vencedor_equipe IN (1, 2))
        """
    )

    # A latencia da tentativa. `respondida_em` diz QUANDO a resposta chegou, nao
    # quanto a pessoa levou -- sem esta coluna o modo `velocidade` nao e apenas
    # nao implementado, e inavaliavel.
    op.execute(
        """
        ALTER TABLE public.guilda_desafio_respostas
          ADD COLUMN IF NOT EXISTS tempo_ms integer
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.desafio_participantes (
          desafio_id    uuid     NOT NULL REFERENCES public.guilda_desafios(id) ON DELETE CASCADE,
          aluno_id      uuid     NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
          equipe        smallint NOT NULL,
          estado        text     NOT NULL DEFAULT 'convidado',
          convidado_em  timestamptz NOT NULL DEFAULT now(),
          respondido_em timestamptz,
          PRIMARY KEY (desafio_id, aluno_id),
          CONSTRAINT desafio_participantes_equipe_check CHECK (equipe IN (1, 2)),
          CONSTRAINT desafio_participantes_estado_check
            CHECK (estado IN ('convidado', 'aceito', 'recusado'))
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS desafio_participantes_aluno_idx
          ON public.desafio_participantes (aluno_id, estado)
        """
    )
    # Mesmo padrao das outras 9 tabelas de guilda: RLS ligada e ZERO policy, o
    # acesso passa inteiro pelas SECURITY DEFINER. `rls_auto_enable` ja liga no
    # CREATE TABLE -- a linha abaixo e para a tabela que ja existir.
    op.execute("ALTER TABLE public.desafio_participantes ENABLE ROW LEVEL SECURITY")

    for tipo, pontos, moedas, descricao in _PONTUACAO:
        op.execute(
            f"""
            INSERT INTO public.eventos_pontuacao (tipo, pontos, moedas, descricao)
            VALUES ('{tipo}', {pontos}, {moedas}, '{descricao}')
            ON CONFLICT (tipo) DO NOTHING
            """
        )

    # ------------------------------------------------------------- funcoes

    # O corpo de verdade passa a receber o aluno. A antiga delega -- duas copias
    # do mesmo predicado divergiriam, e ele decide o que o aluno pode ver.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_questao_liberada_para(
          p_aluno uuid, p_questao_id bigint
        ) RETURNS boolean
          LANGUAGE sql STABLE SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
          SELECT EXISTS (
            SELECT 1
              FROM public.questoes q
              JOIN public.atividades a ON a.id = q.atividade_id
              JOIN public.topicos t ON t.id = a.topico_id
             WHERE q.id = p_questao_id
               AND EXISTS (
                 SELECT 1 FROM public.classe_aluno ca
                  WHERE ca.aluno_id = p_aluno AND ca.classe_id = t.classe_id
               )
               AND (
                 EXISTS (
                   SELECT 1 FROM public.questao_aluno qa
                    WHERE qa.aluno_id = p_aluno AND qa.questao_id = q.id
                 )
                 OR EXISTS (
                   SELECT 1 FROM public.atividade_aluno aa
                    WHERE aa.aluno_id = p_aluno AND aa.atividade_id = a.id
                      AND (COALESCE(aa.percentual_concluido, 0) > 0
                           OR lower(COALESCE(aa.status::text, ''))
                              IN ('em andamento', 'concluido', 'concluida'))
                 )
                 OR EXISTS (
                   SELECT 1 FROM public.topico_aluno ta
                    WHERE ta.aluno_id = p_aluno AND ta.topico_id = t.id
                      AND (COALESCE(ta.percentual_concluido, 0) > 0
                           OR lower(COALESCE(ta.status::text, ''))
                              IN ('em andamento', 'concluido', 'concluida'))
                 )
               )
          );
        $fn$
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_questao_liberada(p_questao_id bigint)
          RETURNS boolean
          LANGUAGE sql STABLE SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
          SELECT public.fn_questao_liberada_para(auth.uid(), p_questao_id);
        $fn$
        """
    )

    # Placar por PESSOA. O LEFT JOIN mantem quem nao respondeu nada: o
    # `count(*) FILTER` sobre a coluna nula devolve 0, e quem foi convidado e
    # nao jogou precisa aparecer no placar com zero, nao sumir dele.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_arena_placar(p_desafio_id uuid)
          RETURNS TABLE(
            aluno_id uuid, equipe smallint, estado text,
            acertos integer, respondidas integer, tempo_total_ms bigint
          )
          LANGUAGE sql STABLE SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
          SELECT p.aluno_id, p.equipe, p.estado,
                 COALESCE(count(*) FILTER (WHERE r.correta), 0)::integer,
                 COALESCE(count(r.questao_id), 0)::integer,
                 COALESCE(sum(COALESCE(r.tempo_ms, 0)), 0)::bigint
            FROM public.desafio_participantes p
            LEFT JOIN public.guilda_desafio_respostas r
                   ON r.desafio_id = p.desafio_id AND r.aluno_id = p.aluno_id
           WHERE p.desafio_id = p_desafio_id
           GROUP BY p.aluno_id, p.equipe, p.estado;
        $fn$
        """
    )

    # Placar por EQUIPE, ja com a regra do `modo` aplicada. Uma autoridade so:
    # o encerramento decide o vencedor a partir daqui, e a listagem mostra o
    # mesmo numero. Duas contas divergiriam, e o aluno veria um placar que nao
    # explica quem ganhou.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_arena_equipes(p_desafio_id uuid)
          RETURNS TABLE(
            equipe smallint, pontos integer, tempo_ms bigint, integrantes integer
          )
          LANGUAGE sql STABLE SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
          WITH d AS (
            SELECT g.id, g.modo,
                   (SELECT count(*) FROM public.guilda_desafio_questoes q
                     WHERE q.desafio_id = g.id) AS total
              FROM public.guilda_desafios g
             WHERE g.id = p_desafio_id
          ), valido AS (
            -- `todos` so conta quem fechou a rodada inteira: e esse o sentido
            -- do modo. Nos outros dois, responder parcial conta o que foi
            -- respondido.
            SELECT pl.*
              FROM public.fn_arena_placar(p_desafio_id) pl
              CROSS JOIN d
             WHERE pl.estado = 'aceito'
               AND (d.modo <> 'todos' OR pl.respondidas >= d.total)
          )
          SELECT valido.equipe,
                 COALESCE(sum(valido.acertos), 0)::integer,
                 COALESCE(sum(valido.tempo_total_ms), 0)::bigint,
                 count(*)::integer
            FROM valido
           GROUP BY valido.equipe;
        $fn$
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.arena_desafio_criar(
          p_classe_id   bigint,
          p_formato     text    DEFAULT 'solo',
          p_modo        text    DEFAULT 'precisao',
          p_quantidade  integer DEFAULT 5,
          p_guilda_id   uuid    DEFAULT NULL,
          p_aliado      uuid    DEFAULT NULL,
          p_adversarios uuid[]  DEFAULT NULL
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
            v_convocados := ARRAY[]::uuid[];
          ELSIF v_formato = 'dupla' THEN
            IF p_guilda_id IS NOT NULL OR p_aliado IS NULL OR v_n_adv <> 2 THEN
              RAISE EXCEPTION 'arena_formato_invalido';
            END IF;
            v_convocados := ARRAY[p_aliado] || v_adv;
          ELSE
            IF p_guilda_id IS NOT NULL OR p_aliado IS NOT NULL OR v_n_adv <> 1 THEN
              RAISE EXCEPTION 'arena_formato_invalido';
            END IF;
            v_convocados := v_adv;
          END IF;

          -- Todo convocado tem de ser colega desta turma, nao pode ser eu, nao
          -- pode repetir e nao pode estar em bloqueio comigo. Bloqueio social
          -- ja impede convite de guilda; um desafio que o contornasse seria a
          -- mesma porta por outro nome.
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
                 (guilda_id, classe_id, criado_por, modo, formato, titulo, configuracao)
          VALUES (CASE WHEN v_formato = 'guilda' THEN p_guilda_id ELSE NULL END,
                  p_classe_id, v_me, v_modo, v_formato,
                  'Desafio em ' || v_formato,
                  jsonb_build_object('quantidade', v_qtd))
          RETURNING id INTO v_id;

          -- Composicao CONGELADA na abertura. Quem sair da guilda amanha
          -- continua no placar deste desafio, e quem entrar depois fica de
          -- fora -- senao `guilda_listar` mudaria o placar de uma rodada ja
          -- respondida toda vez que alguem entrasse ou saisse.
          IF v_formato = 'guilda' THEN
            INSERT INTO public.desafio_participantes
                   (desafio_id, aluno_id, equipe, estado, respondido_em)
            SELECT v_id, m.aluno_id, 1, 'aceito', now()
              FROM public.guilda_membros m
             WHERE m.guilda_id = p_guilda_id AND m.left_at IS NULL
               AND m.aluno_id IS NOT NULL
            ON CONFLICT DO NOTHING;
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
          END IF;

          RETURN jsonb_build_object('id', v_id, 'formato', v_formato,
                                    'modo', v_modo, 'quantidade', v_i);
        END
        $fn$
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.arena_convite_responder(
          p_desafio_id uuid, p_aceitar boolean
        ) RETURNS jsonb
          LANGUAGE plpgsql SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
        DECLARE v_estado text := CASE WHEN p_aceitar THEN 'aceito' ELSE 'recusado' END;
        BEGIN
          UPDATE public.desafio_participantes p
             SET estado = v_estado, respondido_em = now()
            FROM public.guilda_desafios d
           WHERE d.id = p.desafio_id
             AND p.desafio_id = p_desafio_id
             AND p.aluno_id = auth.uid()
             AND p.estado = 'convidado'
             AND d.status = 'aberto';
          IF NOT FOUND THEN
            RAISE EXCEPTION 'arena_convite_indisponivel';
          END IF;
          RETURN jsonb_build_object('estado', v_estado);
        END
        $fn$
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.arena_responder(
          p_desafio_id uuid, p_questao_id bigint, p_resposta text,
          p_tempo_ms integer DEFAULT NULL
        ) RETURNS jsonb
          LANGUAGE plpgsql SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
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

          SELECT * INTO v_q FROM public.questoes WHERE id = p_questao_id;
          v_correta := lower(btrim(COALESCE(p_resposta, '')))
                     = lower(btrim(COALESCE(v_q.resposta_correta, '')));

          -- Teto de 10 min por questao: o numero vem do relogio do aparelho e
          -- decide o desempate do modo velocidade.
          v_tempo := LEAST(GREATEST(COALESCE(p_tempo_ms, 0), 0), 600000);

          -- DO NOTHING, e nao DO UPDATE. A RPC antiga sobrescrevia a resposta,
          -- o que num desafio que paga ponto e tentar ate acertar. A primeira
          -- vale.
          INSERT INTO public.guilda_desafio_respostas
                 (desafio_id, questao_id, aluno_id, resposta, correta, tempo_ms)
          VALUES (p_desafio_id, p_questao_id, v_me,
                  COALESCE(p_resposta, ''), v_correta, v_tempo)
          ON CONFLICT (desafio_id, questao_id, aluno_id) DO NOTHING;
          GET DIAGNOSTICS v_faltam = ROW_COUNT;
          v_gravou := v_faltam > 0;

          -- Acabou para todo mundo que aceitou? Entao fecha sozinho. Sem isto o
          -- desafio fica aberto ate alguem lembrar de fechar, e ninguem recebe.
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
          v_total    integer;
          v_vencedor smallint;
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

          SELECT count(*) INTO v_total
            FROM public.guilda_desafio_questoes WHERE desafio_id = p_desafio_id;

          IF v_n2 = 0 THEN
            -- Cooperativo (formato guilda): a equipe joga contra a regua, nao
            -- contra alguem. Ninguem PERDE um desafio cooperativo -- ou bate a
            -- maioria das questoes disponiveis, ou fica em empate.
            v_vencedor := CASE
              WHEN v_p1 * 2 >= v_total * GREATEST(v_n1, 1) THEN 1::smallint
              ELSE NULL END;
          ELSIF v_p1 > v_p2 THEN
            v_vencedor := 1;
          ELSIF v_p2 > v_p1 THEN
            v_vencedor := 2;
          ELSIF v_d.modo = 'velocidade' AND v_p1 > 0 AND v_t1 <> v_t2 THEN
            -- Desempate por tempo so quando houve acerto. Premiar o mais rapido
            -- num placar de zero a zero e premiar quem chutou mais depressa.
            v_vencedor := CASE WHEN v_t1 < v_t2 THEN 1::smallint ELSE 2::smallint END;
          ELSE
            v_vencedor := NULL;
          END IF;

          UPDATE public.guilda_desafios
             SET status = 'encerrado', encerrado_em = now(),
                 vencedor_equipe = v_vencedor
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
          INSERT INTO public.eventos_aluno
                 (aluno_id, tipo, referencia, valor, criado_em, idempotencia_key)
          SELECT pl.aluno_id, t.tipo, v_ref, 0, now(),
                 md5(p_desafio_id::text || t.tipo || pl.aluno_id::text)::uuid
            FROM public.fn_arena_placar(p_desafio_id) pl
            CROSS JOIN LATERAL (
              SELECT unnest(
                ARRAY['desafio_participou']
                || CASE
                     WHEN v_vencedor IS NULL THEN ARRAY['desafio_empate']
                     WHEN pl.equipe = v_vencedor THEN ARRAY['desafio_vencido']
                     ELSE ARRAY[]::text[]
                   END
              ) AS tipo
            ) t
           WHERE pl.estado = 'aceito' AND pl.respondidas > 0
          ON CONFLICT DO NOTHING;
          GET DIAGNOSTICS v_pagos = ROW_COUNT;

          RETURN jsonb_build_object(
            'status', 'encerrado', 'novo', true,
            'vencedor_equipe', v_vencedor,
            'eventos', v_pagos,
            'equipe_1', jsonb_build_object('pontos', v_p1, 'tempo_ms', v_t1),
            'equipe_2', jsonb_build_object('pontos', v_p2, 'tempo_ms', v_t2)
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
                     'titulo', d.titulo,
                     'guilda_id', d.guilda_id,
                     'guilda_nome', g.nome,
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
              LEFT JOIN public.guildas g ON g.id = d.guilda_id
             WHERE d.classe_id = p_classe_id
               AND public.guilda_e_colega(auth.uid(), p_classe_id)
             ORDER BY d.created_at DESC
             LIMIT 40
          ) s;
        $fn$
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.arena_desafio(p_desafio_id uuid)
          RETURNS jsonb
          LANGUAGE sql STABLE SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
          SELECT jsonb_build_object(
            'id', d.id,
            'formato', d.formato,
            'modo', d.modo,
            'status', d.status,
            'meu_estado', me.estado,
            'minha_equipe', me.equipe,
            'questoes', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                       'ordem', dq.ordem,
                       'questao_id', dq.questao_id,
                       'enunciado', q.enunciado,
                       'tipo', q.tipo,
                       'alternativas', q.alternativas,
                       'midia_url', q.midia_url,
                       'minha_resposta', r.resposta,
                       'correta', r.correta,
                       'tempo_ms', r.tempo_ms,
                       -- A resposta certa so sai DEPOIS de responder. Mandar
                       -- junto com o enunciado entrega o gabarito a quem ler o
                       -- payload -- e num desafio que paga ponto isso e o
                       -- proprio ponto.
                       'resposta_correta',
                         CASE WHEN r.questao_id IS NULL THEN NULL
                              ELSE q.resposta_correta END
                     ) ORDER BY dq.ordem)
                FROM public.guilda_desafio_questoes dq
                JOIN public.questoes q ON q.id = dq.questao_id
                LEFT JOIN public.guilda_desafio_respostas r
                       ON r.desafio_id = dq.desafio_id
                      AND r.questao_id = dq.questao_id
                      AND r.aluno_id = auth.uid()
               WHERE dq.desafio_id = d.id
            ), '[]'::jsonb)
          )
          FROM public.guilda_desafios d
          JOIN public.desafio_participantes me
            ON me.desafio_id = d.id AND me.aluno_id = auth.uid()
         WHERE d.id = p_desafio_id AND me.estado = 'aceito';
        $fn$
        """
    )

    _sem_anon()

    # Funcao nova nasce executavel por PUBLIC no Supabase. Esta guarda recusa a
    # migracao se alguma das minhas tiver sobrado alcancavel -- e a mesma que a
    # `20260920_04` termina exigindo, por propriedade e nao por lista.
    op.execute(
        f"""
        DO $confere$
        DECLARE v_sobra text;
        BEGIN
          SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_sobra
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ({_lista(nome.split('(')[0] for nome in _FUNCOES)})
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
    for assinatura in reversed(_FUNCOES):
        if assinatura.startswith("fn_questao_liberada"):
            # `fn_questao_liberada` e anterior a esta migracao e tem chamador
            # vivo (`guilda_chat_questao_responder`). Derrubar as duas aqui
            # quebraria o chat de guilda; a volta restaura o corpo original
            # abaixo.
            continue
        op.execute(f"DROP FUNCTION IF EXISTS public.{assinatura}")

    op.execute("DROP FUNCTION IF EXISTS public.fn_questao_liberada(bigint)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_questao_liberada_para(uuid, bigint)")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_questao_liberada(p_questao_id bigint)
          RETURNS boolean
          LANGUAGE sql STABLE SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
          SELECT EXISTS (
            SELECT 1
              FROM public.questoes q
              JOIN public.atividades a ON a.id = q.atividade_id
              JOIN public.topicos t ON t.id = a.topico_id
             WHERE q.id = p_questao_id
               AND EXISTS (SELECT 1 FROM public.classe_aluno ca
                            WHERE ca.aluno_id = auth.uid() AND ca.classe_id = t.classe_id)
               AND (
                 EXISTS (SELECT 1 FROM public.questao_aluno qa
                          WHERE qa.aluno_id = auth.uid() AND qa.questao_id = q.id)
                 OR EXISTS (SELECT 1 FROM public.atividade_aluno aa
                             WHERE aa.aluno_id = auth.uid() AND aa.atividade_id = a.id
                               AND (COALESCE(aa.percentual_concluido, 0) > 0
                                    OR lower(COALESCE(aa.status::text, ''))
                                       IN ('em andamento', 'concluido', 'concluida')))
                 OR EXISTS (SELECT 1 FROM public.topico_aluno ta
                             WHERE ta.aluno_id = auth.uid() AND ta.topico_id = t.id
                               AND (COALESCE(ta.percentual_concluido, 0) > 0
                                    OR lower(COALESCE(ta.status::text, ''))
                                       IN ('em andamento', 'concluido', 'concluida')))
               )
          );
        $fn$
        """
    )
    op.execute(
        "REVOKE ALL ON FUNCTION public.fn_questao_liberada(bigint) FROM PUBLIC, anon"
    )
    op.execute(
        "GRANT EXECUTE ON FUNCTION public.fn_questao_liberada(bigint) TO authenticated"
    )

    op.execute("DROP TABLE IF EXISTS public.desafio_participantes")

    # Os eventos ja pagos FICAM. Apagar linha de `eventos_aluno` num downgrade
    # tiraria ponto de aluno que jogou -- o mesmo dano que a classe deduzida na
    # leitura causava (`20260910_06`). So a tabela de precos volta atras, e so
    # se ninguem tiver pontuado por ela.
    for tipo, _pontos, _moedas, _descricao in _PONTUACAO:
        op.execute(
            f"""
            DELETE FROM public.eventos_pontuacao
             WHERE tipo = '{tipo}'
               AND NOT EXISTS (SELECT 1 FROM public.eventos_aluno e
                                WHERE e.tipo = '{tipo}')
            """
        )

    op.execute(
        "ALTER TABLE public.guilda_desafio_respostas DROP COLUMN IF EXISTS tempo_ms"
    )
    op.execute(
        """
        ALTER TABLE public.guilda_desafios
          DROP CONSTRAINT IF EXISTS guilda_desafios_guilda_do_formato
        """
    )
    op.execute(
        """
        ALTER TABLE public.guilda_desafios
          DROP CONSTRAINT IF EXISTS guilda_desafios_vencedor_check
        """
    )
    op.execute(
        """
        ALTER TABLE public.guilda_desafios
          DROP CONSTRAINT IF EXISTS guilda_desafios_formato_check
        """
    )
    # Volta com `guilda_id` obrigatoria: quem nao tem guilda sai junto com o
    # formato que o permitia.
    op.execute(
        "DELETE FROM public.guilda_desafios WHERE guilda_id IS NULL"
    )
    op.execute(
        "ALTER TABLE public.guilda_desafios ALTER COLUMN guilda_id SET NOT NULL"
    )
    op.execute(
        """
        ALTER TABLE public.guilda_desafios
          DROP COLUMN IF EXISTS formato,
          DROP COLUMN IF EXISTS encerrado_em,
          DROP COLUMN IF EXISTS vencedor_equipe
        """
    )
    op.execute(
        "ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_modo_check"
    )
    op.execute(
        """
        ALTER TABLE public.guilda_desafios
          ADD CONSTRAINT guilda_desafios_modo_check
          CHECK (modo IN ('todos', 'velocidade', 'precisao', 'duelo', 'duplo'))
        """
    )
