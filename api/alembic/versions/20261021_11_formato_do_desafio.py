"""Fase 10: o eixo de composição passa a existir — solo, dupla, guilda e turma de verdade

Décima fase de `docs/superpowers/specs/2026-10-19-eventos-missoes-ranks-modos-design.md`.
Encadeia depois da fase 9 (`20261021_10`), que mexe no mesmo `guilda_desafio_criar`.

`formato` é o eixo de COMPOSIÇÃO (quem joga). A fase 1 abriu o CHECK para os quatro valores e
o spec listou `turma` como a lacuna de "solo / dupla / guilda". Até aqui, nada mudou de fato:
`guilda_desafio_criar` grava `formato = 'guilda'` **fixo**, e `arena_desafio_criar` — a única
RPC que recebe `p_formato` — recusa `'turma'` e não é chamada por cliente nenhum.

> Para ser preciso sobre o estado anterior: **não havia seletor de formato no cliente**.
> `FORMATOS` existe em `mobile/src/utils/eixosDoDesafio.ts` e nunca foi renderizado, então
> ninguém escolhia "Solo" e recebia guilda. Era eixo não entregue, não bug silencioso.

## `guilda_id` tem de ser NULL fora do formato guilda

`guilda_desafios_guilda_do_formato` é `(formato = 'guilda') = (guilda_id IS NOT NULL)`. Como
a RPC é chamada de dentro do chat da guilda, o reflexo é gravar `guilda_id = p_guilda_id`
sempre — e isso viola o CHECK para solo, dupla e turma.

Então o desafio não-guilda nasce **sem** `guilda_id`, e a guilda continua sendo só o lugar de
onde ele foi anunciado (a mensagem do chat usa `p_guilda_id` à parte). Isso é coerente com o
que a fase 1 registrou: `turma` com `guilda_id` nulo é "exatamente o certo para um desafio da
turma inteira".

## Cooperativo passa a ser "não há equipe 2", e não "é guilda sem rival"

`fn_desafio_encerrar` decidia `v_cooperativo := (formato = 'guilda' AND guilda_rival_id IS
NULL)`. Com solo/dupla/turma existindo, os três cairiam no ramo competitivo, onde
`v_jog2 = 0` dá `sem_adversario` — **ninguém venceria nunca**, e o aluno sozinho receberia só
`desafio_participou`.

O predicado novo é direto: **cooperativo é não existir participante na equipe 2.** Ele
preserva todos os casos de hoje, um por um:

| caso | equipe 2? | antes | agora |
| --- | --- | --- | --- |
| guilda sem rival | não | cooperativo | cooperativo |
| guilda com rival | sim (membros da rival) | competitivo | competitivo |
| solo/dupla da arena (`arena_desafio_criar`) | sim (adversários) | competitivo | competitivo |
| solo/dupla/turma deste commit | não | — | cooperativo |

Note que `guilda_rival_id IS NULL` **não** era um teste confiável de "sem adversário": o duelo
solo da arena tem equipe 2 e rival nulo. O predicado antigo só funcionava porque o formato
estava preso a `guilda`.

## O `modo` que a RPC aceitava e a tabela recusava

Medido: `guilda_desafios_modo_check` permite `todos | velocidade | precisao`, e a RPC da
fase 7 valida contra `todos | velocidade | precisao | duelo | duplo`. Pedir `duelo` passava a
validação e estourava `23514` no INSERT, longe da causa. A lista da RPC passa a ser a da
tabela — os dois valores legados não eram alcançáveis pelo seletor (que só oferece três), então
nada que funcionava deixa de funcionar: um 23514 vira `guilda_desafio_invalido`.

## Dupla pede aliado, e o aliado entra aceito

Sem aliado, `dupla` seria indistinguível de `solo` — então ela **exige** `p_aliado`, e recusa
alto (`guilda_desafio_aliado_obrigatorio`) em vez de criar algo errado em silêncio. O aliado é
validado como colega de turma, e não pode ser quem criou.

Ele entra como `'aceito'`, não `'convidado'`, porque **não existe fluxo de aceite no caminho
vivo**: `arena_convite_responder` existe e nenhum cliente a chama. Com `'convidado'`, o
fechamento automático da fase 8 — que conta só participante `aceito` — fecharia a dupla
assim que o criador respondesse tudo, deixando o parceiro de fora do próprio desafio. O
formato `guilda` já matricula todo mundo como aceito; isto é a mesma regra.

Revision ID: 20261021_11
Revises: 20261021_10
Create Date: 2026-10-19
"""

from alembic import op

revision = "20261021_11"
down_revision = "20261021_10"
branch_labels = None
depends_on = None


# --------------------------------------------------------------------------------------
# O fechamento: cooperativo é não ter equipe 2.
# --------------------------------------------------------------------------------------
COOPERATIVO_NOVO = """  -- Cooperativo e NAO EXISTIR equipe 2. `formato = 'guilda' AND rival IS NULL` nao servia:
  -- o duelo solo da arena tem equipe 2 e rival nulo, e solo/dupla/turma desta fase nao tem
  -- equipe nenhuma do outro lado -- cairiam em `sem_adversario` e nunca venceriam.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.desafio_participantes dp
     WHERE dp.desafio_id = p_desafio_id AND dp.equipe = 2
  ) INTO v_cooperativo;"""

COOPERATIVO_ANTIGO = """  v_cooperativo := (v_d.formato = 'guilda' AND v_d.guilda_rival_id IS NULL);"""


def _encerrar(cooperativo: str) -> str:
    """`fn_desafio_encerrar` como a fase 8 a deixa, trocando só o teste de cooperativo.

    O corpo é recortado do arquivo da fase 8 em vez de copiado: cópia seria uma segunda fonte
    da verdade que envelhece em silêncio, e o downgrade restauraria algo que já não é a fase 8.
    """
    from pathlib import Path

    fase8 = Path(__file__).with_name("20261021_09_o_desafio_fecha_e_paga.py")
    texto = fase8.read_text(encoding="utf-8")
    marca = 'ENCERRAR_MIOLO = """\n'
    inicio = texto.index(marca) + len(marca)
    fim = texto.index('\n"""', inicio)
    sql = texto[inicio:fim]

    if "CREATE OR REPLACE FUNCTION public.fn_desafio_encerrar(p_desafio_id uuid)" not in sql:
        raise RuntimeError("o bloco ENCERRAR_MIOLO da fase 8 mudou de forma; revise a fase 10")
    antigo = "  v_cooperativo := (v_d.formato = 'guilda' AND v_d.guilda_rival_id IS NULL);"
    if antigo not in sql:
        raise RuntimeError("o teste de cooperativo da fase 8 mudou; revise a fase 10")

    return sql.replace(antigo, cooperativo, 1)


# --------------------------------------------------------------------------------------
# A criação: `formato` decide quem joga.
# --------------------------------------------------------------------------------------
FORMATOS = ("guilda", "dupla", "solo", "turma")
MODOS = ("todos", "velocidade", "precisao")


def _criar(com_formato: bool) -> str:
    assinatura = (
        """  p_guilda_id uuid,
  p_modo text DEFAULT 'todos',
  p_quantidade integer DEFAULT 3,
  p_dificuldade text DEFAULT 'normal',
  p_consequencia text DEFAULT 'ranqueada',
  p_formato text DEFAULT 'guilda',
  p_aliado uuid DEFAULT NULL"""
        if com_formato
        else """  p_guilda_id uuid,
  p_modo text DEFAULT 'todos',
  p_quantidade integer DEFAULT 3,
  p_dificuldade text DEFAULT 'normal',
  p_consequencia text DEFAULT 'ranqueada'"""
    )

    lista_modos = ", ".join(f"'{m}'" for m in MODOS)
    if com_formato:
        validacao = f"""  IF v_modo NOT IN ({lista_modos}) THEN
    -- A lista e a da TABELA (`guilda_desafios_modo_check`). A da fase 7 incluia `duelo` e
    -- `duplo`, que a tabela recusa: pedi-los passava a validacao e estourava 23514 no INSERT.
    RAISE EXCEPTION 'guilda_desafio_invalido';
  END IF;
  IF v_formato NOT IN ({", ".join(f"'{f}'" for f in FORMATOS)}) THEN
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
  END IF;"""
        participantes = """  -- Quem joga, por formato. Todos na EQUIPE 1 e `aceito`: nao existe fluxo de aceite no
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
  GET DIAGNOSTICS v_jogadores = ROW_COUNT;"""
        insert_desafio = """  INSERT INTO public.guilda_desafios (
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
  ) RETURNING id INTO v_id;"""
        declara = """  v_formato text := lower(btrim(COALESCE(p_formato, 'guilda')));"""
        retorno = """    'formato', v_formato,"""
    else:
        validacao = """  IF v_modo NOT IN ('todos', 'velocidade', 'precisao', 'duelo', 'duplo') THEN
    RAISE EXCEPTION 'guilda_desafio_invalido';
  END IF;"""
        participantes = """  INSERT INTO public.desafio_participantes
         (desafio_id, aluno_id, equipe, estado, respondido_em)
  SELECT v_id, m.aluno_id, 1, 'aceito', now()
    FROM public.guilda_membros m
   WHERE m.guilda_id = p_guilda_id
     AND m.left_at IS NULL
     AND m.aluno_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_jogadores = ROW_COUNT;"""
        insert_desafio = """  INSERT INTO public.guilda_desafios (
    guilda_id, classe_id, criado_por, formato, modo, titulo, configuracao,
    dificuldade, consequencia
  ) VALUES (
    p_guilda_id, v_g.classe_id, auth.uid(), 'guilda', v_modo, 'Desafio da guilda',
    jsonb_build_object('quantidade', array_length(v_qids, 1)),
    v_dif, v_cons
  ) RETURNING id INTO v_id;"""
        declara = ""
        retorno = ""

    selecao = """  IF v_dif = 'dificil' THEN
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
  END IF;"""

    antiga = (
        "DROP FUNCTION IF EXISTS public.guilda_desafio_criar(uuid, text, integer, text, text, text, uuid);"
        if not com_formato
        else "DROP FUNCTION IF EXISTS public.guilda_desafio_criar(uuid, text, integer, text, text);"
    )
    nova_assinatura = (
        "public.guilda_desafio_criar(uuid, text, integer, text, text, text, uuid)"
        if com_formato
        else "public.guilda_desafio_criar(uuid, text, integer, text, text)"
    )

    return f"""
-- A lista de parametros muda, entao a versao anterior sai: `CREATE OR REPLACE` nao troca
-- assinatura.
{antiga}

CREATE OR REPLACE FUNCTION public.guilda_desafio_criar(
{assinatura}
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
{declara}
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

{validacao}
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

{insert_desafio}

  FOREACH v_q IN ARRAY v_qids LOOP
    v_i := v_i + 1;
    INSERT INTO public.guilda_desafio_questoes (desafio_id, questao_id, ordem)
    VALUES (v_id, v_q, v_i);
  END LOOP;

{participantes}

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
{retorno}
    'quantidade', array_length(v_qids, 1),
    'dificuldade', v_dif,
    'consequencia', v_cons,
    'jogadores', v_jogadores,
    'params', v_params
  );
END
$function$;

REVOKE ALL ON FUNCTION {nova_assinatura} FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION {nova_assinatura} TO authenticated;
"""


RELOAD = "\nNOTIFY pgrst, 'reload schema';\n"


def upgrade() -> None:
    op.execute(_encerrar(COOPERATIVO_NOVO))
    op.execute(_criar(com_formato=True))
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(_criar(com_formato=False))
    op.execute(_encerrar(COOPERATIVO_ANTIGO))
    op.execute(RELOAD)
