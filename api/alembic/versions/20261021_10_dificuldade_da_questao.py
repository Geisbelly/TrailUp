"""Fase 9: `questoes.dificuldade` — "questão mais difícil" era a única parte do difícil sem nada atrás

Nona fase de `docs/superpowers/specs/2026-10-19-eventos-missoes-ranks-modos-design.md`.
Encadeia depois da fase 8 (`20261021_09`), que mexe no mesmo `guilda_desafio_criar`.

O pedido do planejamento definiu difícil como quatro coisas: **questões difíceis**, menos
tempo, menos tentativas e aposta maior. As três últimas estão entregues (preset da fase 1,
cobrança da fase 8, fator da fase 4). A primeira não tinha nada atrás: a seleção de questões
do desafio é `ORDER BY random()`, e `questoes` não tem como dizer que uma questão é difícil
(colunas: id, atividade_id, enunciado, tipo, alternativas, resposta_correta, midia_url,
created_at, nota_estabelecida).

## Coluna explícita, e a medição é que decidiu

O spec deixou a decisão aberta entre acrescentar a coluna ou usar um **proxy** (a questão que
a turma mais errou, por `questao_aluno`). Medido na produção: a base tem **1 questão e 2
respostas em `questao_aluno`**. O proxy não tem em que se apoiar.

E o problema do proxy não é só a base estar vazia hoje: ele **nunca** classifica questão nova,
porque questão recém-criada não tem resposta nenhuma — e é exatamente aí que o professor quer
marcar "esta é difícil". O proxy serve para *refinar* uma marcação existente, não para
substituí-la.

`NULL` é "não marcada", e é o default de propósito: um default `'media'` afirmaria uma
dificuldade que ninguém informou, e as 1 questão existente (e toda questão gerada por IA
antes de a IA aprender o campo) passaria a mentir que foi avaliada.

## Preferência, não filtro — e isto é a decisão que mais importa aqui

O nome `desafio_dificuldade_min` sugere filtro. **Filtro não serve:** com a base de hoje
(nenhuma questão marcada), todo desafio difícil levantaria `guilda_sem_questoes_liberadas` e
o modo difícil ficaria inutilizável até alguém anotar o banco inteiro. Pior: ficaria
inutilizável em silêncio, porque o erro fala de "questões liberadas", não de dificuldade.

Então a dificuldade entra como **ordem de preferência**: no difícil, as questões no nível
pedido (ou acima) vêm primeiro, embaralhadas entre si; o resto entra se faltar. Modo difícil
com banco não anotado se comporta exatamente como hoje, e vai melhorando conforme o professor
marca.

## O `LIMIT` tinha de sair do caminho, e só no difícil

A seleção da fase 7/8 é `SELECT ... WHERE liberada LIMIT 30` e **depois** `ORDER BY random()`.
Com o `LIMIT` antes da ordenação, a preferência olharia 30 questões **arbitrárias** — as
difíceis podem não estar entre elas. Para preferir, é preciso ver o banco da turma inteiro.

Isso tem custo: sem `LIMIT`, `fn_questao_liberada` é avaliada para toda questão da turma em
vez de parar nas primeiras 30. Por isso o ramo novo vale **só para `dificil`**; `normal`
continua com o caminho de hoje, parando em 30. Modo normal não muda em nada — nem em
comportamento, nem em custo.

Revision ID: 20261021_10
Revises: 20261021_09
Create Date: 2026-10-19
"""

from alembic import op

revision = "20261021_10"
down_revision = "20261021_09"
branch_labels = None
depends_on = None


NIVEIS = ("facil", "media", "dificil")


COLUNA = f"""
ALTER TABLE public.questoes
  ADD COLUMN IF NOT EXISTS dificuldade text;

COMMENT ON COLUMN public.questoes.dificuldade IS
  'facil | media | dificil, ou NULL para "nao marcada". NULL e o default de proposito: '
  '''media'' como default afirmaria uma dificuldade que ninguem informou. Usada como '
  'PREFERENCIA na selecao do desafio dificil, nunca como filtro -- ver 20261021_10.';

ALTER TABLE public.questoes DROP CONSTRAINT IF EXISTS questoes_dificuldade_check;
ALTER TABLE public.questoes ADD CONSTRAINT questoes_dificuldade_check
  CHECK (dificuldade IS NULL OR dificuldade = ANY (ARRAY[{", ".join(f"'{n}'::text" for n in NIVEIS)}]));

INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('desafio_dificuldade_min', 'dificil',
   'Nivel que o desafio dificil PREFERE. Questao nesse nivel ou acima vem primeiro; o resto '
   'entra se faltar. Preferencia e nao filtro: filtro deixaria o modo dificil inutilizavel '
   'enquanto o banco nao estiver anotado. ''media'' alarga o grupo preferido.', false)
ON CONFLICT (chave) DO NOTHING;

-- Peso para ordenar. NAO marcada vale o MEIO, nao zero: dificuldade desconhecida nao e o
-- mesmo que facil, e mandar o nao-marcado para o fim da fila faria o desafio dificil de um
-- banco sem anotacao preferir justamente as faceis marcadas.
CREATE OR REPLACE FUNCTION public.fn_questao_peso_dificuldade(p_nivel text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $function$
  SELECT CASE lower(COALESCE(NULLIF(btrim(COALESCE(p_nivel, '')), ''), 'media'))
           WHEN 'facil'   THEN 1
           WHEN 'media'   THEN 2
           WHEN 'dificil' THEN 3
           -- Nivel desconhecido (coluna aberta por migracao futura) cai no meio pelo mesmo
           -- motivo do NULL: nao inventa ordem para o que nao sabe.
           ELSE 2
         END;
$function$;
"""

COLUNA_FORA = """
DROP FUNCTION IF EXISTS public.fn_questao_peso_dificuldade(text);
DELETE FROM public.app_config WHERE chave = 'desafio_dificuldade_min';
ALTER TABLE public.questoes DROP CONSTRAINT IF EXISTS questoes_dificuldade_check;
ALTER TABLE public.questoes DROP COLUMN IF EXISTS dificuldade;
"""


def _criar(com_preferencia: bool) -> str:
    """`guilda_desafio_criar` como a fase 8 a deixa, trocando só a escolha de questões."""
    if com_preferencia:
        selecao = """
    IF v_dif = 'dificil' THEN
      -- Precisa ver o banco da turma INTEIRO: com o LIMIT antes da ordenacao, a preferencia
      -- olharia 30 questoes arbitrarias e as dificeis poderiam nao estar entre elas.
      --
      -- O grupo preferido e um BOOLEANO (nivel pedido ou acima), nao o ranking completo:
      -- dentro do grupo o sorteio continua, senao o mesmo desafio sairia toda vez.
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
      -- Caminho de hoje, intocado: para nas primeiras 30 e sorteia. Modo normal nao paga o
      -- custo de avaliar `fn_questao_liberada` para a turma inteira.
      SELECT array_agg(id ORDER BY random()) INTO v_qids FROM (
        SELECT q.id FROM public.questoes q
          JOIN public.atividades a ON a.id = q.atividade_id
          JOIN public.topicos t ON t.id = a.topico_id
         WHERE t.classe_id = v_g.classe_id AND public.fn_questao_liberada(q.id) LIMIT 30) s;
    END IF;"""
    else:
        selecao = """
    SELECT array_agg(id ORDER BY random()) INTO v_qids FROM (
      SELECT q.id FROM public.questoes q
        JOIN public.atividades a ON a.id = q.atividade_id
        JOIN public.topicos t ON t.id = a.topico_id
       WHERE t.classe_id = v_g.classe_id AND public.fn_questao_liberada(q.id) LIMIT 30) s;"""

    return f"""
CREATE OR REPLACE FUNCTION public.guilda_desafio_criar(
  p_guilda_id uuid,
  p_modo text DEFAULT 'todos',
  p_quantidade integer DEFAULT 3,
  p_dificuldade text DEFAULT 'normal',
  p_consequencia text DEFAULT 'ranqueada'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  IF v_modo NOT IN ('todos', 'velocidade', 'precisao', 'duelo', 'duplo') THEN
    RAISE EXCEPTION 'guilda_desafio_invalido';
  END IF;
  IF v_dif NOT IN ('normal', 'dificil') THEN
    RAISE EXCEPTION 'guilda_desafio_dificuldade_invalida';
  END IF;
  IF v_cons NOT IN ('treino', 'ranqueada', 'evento') THEN
    RAISE EXCEPTION 'guilda_desafio_consequencia_invalida';
  END IF;
{selecao}
  IF COALESCE(array_length(v_qids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'guilda_sem_questoes_liberadas';
  END IF;
  v_qids := v_qids[1:GREATEST(1, LEAST(p_quantidade, 10))];

  INSERT INTO public.guilda_desafios (
    guilda_id, classe_id, criado_por, formato, modo, titulo, configuracao,
    dificuldade, consequencia
  ) VALUES (
    p_guilda_id, v_g.classe_id, auth.uid(), 'guilda', v_modo, 'Desafio da guilda',
    jsonb_build_object('quantidade', array_length(v_qids, 1)),
    v_dif, v_cons
  ) RETURNING id INTO v_id;

  FOREACH v_q IN ARRAY v_qids LOOP
    v_i := v_i + 1;
    INSERT INTO public.guilda_desafio_questoes (desafio_id, questao_id, ordem)
    VALUES (v_id, v_q, v_i);
  END LOOP;

  -- Fase 8: sem isto `desafio_participantes` fica vazio e o desafio nao paga ninguem.
  INSERT INTO public.desafio_participantes
         (desafio_id, aluno_id, equipe, estado, respondido_em)
  SELECT v_id, m.aluno_id, 1, 'aceito', now()
    FROM public.guilda_membros m
   WHERE m.guilda_id = p_guilda_id
     AND m.left_at IS NULL
     AND m.aluno_id IS NOT NULL
  ON CONFLICT DO NOTHING;
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
    'quantidade', array_length(v_qids, 1),
    'dificuldade', v_dif,
    'consequencia', v_cons,
    'jogadores', v_jogadores,
    'params', v_params
  );
END
$function$;
"""


RELOAD = "\nNOTIFY pgrst, 'reload schema';\n"


def upgrade() -> None:
    op.execute(COLUNA)
    op.execute(_criar(com_preferencia=True))
    op.execute(RELOAD)


def downgrade() -> None:
    # A criação volta a não citar `dificuldade` ANTES de a coluna sair, senão a função fica um
    # instante consultando coluna que já não existe.
    op.execute(_criar(com_preferencia=False))
    op.execute(COLUNA_FORA)
    op.execute(RELOAD)
