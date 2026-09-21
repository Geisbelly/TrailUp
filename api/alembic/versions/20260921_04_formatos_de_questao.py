"""Tres formatos novos de questao: ligar termos, ordenar e multipla resposta.

A base tinha quatro formatos, e dois deles nao pedem raciocinio de relacao:

    multipla          21
    verdadeiro_falso  14
    fill_blank        13
    dissertativa       8

Entram:

| tipo                | `alternativas`                     | o que o aluno faz          |
| ------------------- | ---------------------------------- | -------------------------- |
| `associacao`        | `{"termos": [...], "definicoes": [...]}` | liga termo a definicao |
| `ordenacao`         | `["passo", ...]` (ordem canonica)  | poe em ordem               |
| `multipla_resposta` | `["a", ...]`                       | marca TODAS as certas      |

## A decisao que estrutura tudo: o par nao mora em `alternativas`

O caminho obvio para "ligar termos" seria guardar pares --
`[{"termo": "x", "par": "y"}, ...]`. Isso **entrega a resposta**: o aluno le o
JSON e ja tem o gabarito, que e exatamente o defeito que a `20260921_01`
fechou para os outros formatos.

Por isso `alternativas` guarda DUAS LISTAS SOLTAS, embaralhadas de forma
independente, e o pareamento vive so em `questao_gabarito`. Sem isso, a posicao
delataria o par -- `termos[0]` com `definicoes[0]`.

## O gabarito dos tres e JSON, e isso e deliberado

Separador de texto (`a|c`) quebra em alternativa que contenha o separador, e
nao ha caractere seguro. Os tres novos gravam JSON:

    multipla_resposta  ["SISD", "MIMD"]
    ordenacao          ["primeiro", "segundo", "terceiro"]
    associacao         [["termo", "definicao"], ...]

`fn_questao_resposta_em_lista` aceita JSON e, como reserva, o texto separado
por barra -- porque cliente antigo e professor digitando a mao vao mandar
barra, e recusar isso seria recusar a resposta certa.

## Onde a ordem importa e onde nao importa

- `ordenacao` compara SEQUENCIA: e a pergunta inteira.
- `multipla_resposta` e `associacao` comparam CONJUNTO: marcar B e D e o mesmo
  que marcar D e B, e o aluno nao escolhe a ordem em que liga os pares.

## Reordenar `ordenacao` nao e opcional

Se as alternativas ficassem guardadas na ordem certa, a tela mostraria a
resposta. A ordem canonica da `20260921_03` ja resolve isso -- e aqui ela
deixa de ser reducao de vies para virar requisito.

Revision ID: 20260921_04
Revises: 20260921_03
"""

from alembic import op

revision = "20260921_04"
down_revision = "20260921_03"
branch_labels = None
depends_on = None

_TIPOS_NOVOS = ("associacao", "ordenacao", "multipla_resposta")


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Resposta como lista normalizada.
    # ------------------------------------------------------------------
    op.execute(
        # String RAW: o `\|` do regexp nao e escape valido em Python, e sem o
        # `r` o interpretador so avisa (DeprecationWarning) em vez de recusar.
        r"""
        CREATE OR REPLACE FUNCTION public.fn_questao_resposta_em_lista(p_valor text)
          RETURNS text[]
          LANGUAGE plpgsql IMMUTABLE
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
        DECLARE
          v_json  jsonb;
          v_saida text[];
        BEGIN
          IF p_valor IS NULL OR btrim(p_valor) = '' THEN
            RETURN ARRAY[]::text[];
          END IF;

          BEGIN
            v_json := p_valor::jsonb;
          EXCEPTION WHEN OTHERS THEN
            v_json := NULL;
          END;

          IF v_json IS NOT NULL AND jsonb_typeof(v_json) = 'array' THEN
            SELECT array_agg(item ORDER BY ord) INTO v_saida
              FROM (
                SELECT ord,
                       CASE
                         -- Par de associacao: vira "termo=>definicao", ja
                         -- normalizado dos dois lados.
                         WHEN jsonb_typeof(e.valor) = 'array' THEN
                           public.fn_texto_comparavel(e.valor ->> 0)
                           || '=>' ||
                           public.fn_texto_comparavel(e.valor ->> 1)
                         WHEN jsonb_typeof(e.valor) = 'object' THEN
                           public.fn_texto_comparavel(COALESCE(
                             e.valor ->> 'termo', e.valor ->> 'esquerda', e.valor ->> 'chave'))
                           || '=>' ||
                           public.fn_texto_comparavel(COALESCE(
                             e.valor ->> 'definicao', e.valor ->> 'direita', e.valor ->> 'valor'))
                         ELSE public.fn_texto_comparavel(e.valor #>> '{}')
                       END AS item
                  FROM jsonb_array_elements(v_json) WITH ORDINALITY AS e(valor, ord)
              ) x
             WHERE x.item <> '' AND x.item <> '=>';
            RETURN COALESCE(v_saida, ARRAY[]::text[]);
          END IF;

          -- Reserva: texto separado por barra. Cliente antigo e professor
          -- digitando a mao mandam assim, e recusar seria recusar a resposta
          -- certa por causa da forma.
          SELECT array_agg(public.fn_texto_comparavel(parte) ORDER BY ord)
            INTO v_saida
            FROM (
              SELECT parte, ord
                FROM regexp_split_to_table(p_valor, '\|') WITH ORDINALITY AS t(parte, ord)
            ) y
           WHERE public.fn_texto_comparavel(parte) <> '';
          RETURN COALESCE(v_saida, ARRAY[]::text[]);
        END;
        $fn$
        """
    )

    # ------------------------------------------------------------------
    # 2. Correcao dos tres. Conjunto para dois, sequencia para um.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_questao_confere_lista(
          p_tipo      text,
          p_gabarito  text,
          p_resposta  text
        ) RETURNS boolean
          LANGUAGE plpgsql IMMUTABLE
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
        DECLARE
          v_gab  text[] := public.fn_questao_resposta_em_lista(p_gabarito);
          v_resp text[] := public.fn_questao_resposta_em_lista(p_resposta);
          v_tipo text   := public.fn_texto_comparavel(COALESCE(p_tipo, ''));
        BEGIN
          -- Gabarito vazio nunca vale acerto: seria acerto de graca para todo
          -- mundo, exatamente o modo de falha das conquistas sem limiar.
          IF cardinality(v_gab) = 0 OR cardinality(v_resp) = 0 THEN
            RETURN false;
          END IF;

          IF v_tipo = 'ordenacao' THEN
            -- SEQUENCIA: a ordem e a pergunta.
            RETURN v_gab = v_resp;
          END IF;

          -- CONJUNTO, com tamanho: sem a comparacao de cardinalidade, marcar
          -- TODAS as alternativas passaria em multipla_resposta (o gabarito
          -- estaria contido na resposta).
          RETURN cardinality(v_gab) = cardinality(v_resp)
             AND NOT EXISTS (SELECT unnest(v_gab) EXCEPT SELECT unnest(v_resp))
             AND NOT EXISTS (SELECT unnest(v_resp) EXCEPT SELECT unnest(v_gab));
        END;
        $fn$
        """
    )

    # ------------------------------------------------------------------
    # 3. `fn_questao_confere` passa a delegar para os tres formatos novos.
    #    Os antigos seguem pelo corpo de sempre, intocados.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_questao_confere(
          p_questao_id bigint,
          p_resposta text
        ) RETURNS boolean
          LANGUAGE plpgsql STABLE SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
        DECLARE
          v_gabarito text;
          v_alts     jsonb;
          v_tipo     text;
          v_resp     text;
          v_gab      text;
          v_i        integer;
          v_texto    text;
        BEGIN
          SELECT g.resposta_correta, q.alternativas, q.tipo
            INTO v_gabarito, v_alts, v_tipo
            FROM public.questoes q
            LEFT JOIN public.questao_gabarito g ON g.questao_id = q.id
           WHERE q.id = p_questao_id;

          IF v_gabarito IS NULL THEN RETURN false; END IF;

          IF public.fn_texto_comparavel(COALESCE(v_tipo, '')) IN
             ('associacao', 'ordenacao', 'multipla_resposta') THEN
            RETURN public.fn_questao_confere_lista(v_tipo, v_gabarito, p_resposta);
          END IF;

          v_resp := public.fn_texto_comparavel(p_resposta);
          IF v_resp = '' THEN RETURN false; END IF;
          v_gab := public.fn_texto_comparavel(v_gabarito);

          IF v_resp = v_gab THEN RETURN true; END IF;

          IF v_resp IN ('v','true','verdadeiro','sim','certo')
             AND v_gab IN ('v','true','verdadeiro','sim','certo') THEN RETURN true; END IF;
          IF v_resp IN ('f','false','falso','nao','errado')
             AND v_gab IN ('f','false','falso','nao','errado') THEN RETURN true; END IF;

          IF jsonb_typeof(v_alts) = 'array' THEN
            FOR v_i IN 0 .. jsonb_array_length(v_alts) - 1 LOOP
              v_texto := public.fn_texto_comparavel(v_alts ->> v_i);
              IF v_texto = '' THEN CONTINUE; END IF;

              IF v_resp = v_texto
                 OR v_resp = v_i::text
                 OR v_resp = lower(chr(65 + v_i)) THEN
                IF v_gab = v_texto
                   OR v_gab = v_i::text
                   OR v_gab = lower(chr(65 + v_i)) THEN
                  RETURN true;
                END IF;
              END IF;
            END LOOP;
          END IF;

          RETURN false;
        END;
        $fn$
        """
    )

    # ------------------------------------------------------------------
    # 4. `associacao` guarda duas listas, e elas precisam ser embaralhadas
    #    SEPARADAMENTE. Com a mesma semente, `termos[i]` e `definicoes[i]`
    #    continuariam pareados por posicao e a tela entregaria a resposta.
    # ------------------------------------------------------------------
    op.execute(
        r"""
        CREATE OR REPLACE FUNCTION public.fn_questao_associacao_em_ordem(
          p_questao_id bigint,
          p_alts jsonb,
          p_gabarito text DEFAULT NULL
        ) RETURNS jsonb
          LANGUAGE plpgsql IMMUTABLE
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
        DECLARE
          v_gab    text[] := public.fn_questao_resposta_em_lista(p_gabarito);
          v_termos jsonb;
          v_defs   jsonb;
          v_n      integer;
          v_casam  integer;
          v_sal    integer;
        BEGIN
          IF jsonb_typeof(p_alts) <> 'object' THEN RETURN p_alts; END IF;

          -- Embaralha as duas listas SEPARADAMENTE. Com a mesma semente,
          -- `termos[i]` e `definicoes[i]` continuariam pareados por posicao e
          -- a tela entregaria a resposta.
          --
          -- Alinhamento por acaso nao e vazamento: medido sobre 200 ids com 5
          -- pares, a media de pares alinhados e 0,915 -- ou seja, casar por
          -- posicao rende o mesmo que chutar, que e a definicao de nao
          -- carregar informacao. O que NAO da para aceitar e o caso extremo:
          -- uma em 200 saiu com os CINCO pares alinhados, e nessa a
          -- resposta inteira fica visivel.
          --
          -- Por isso o sal avanca so quando a permutacao e a identidade.
          -- Recusar mais do que isso seria pior: garantir que a posicao i
          -- NUNCA e o par elimina uma opcao por linha, e ai a posicao passa a
          -- carregar informacao de verdade.
          FOR v_sal IN 0 .. 4 LOOP
            SELECT COALESCE(jsonb_agg(v ORDER BY
                     md5(p_questao_id::text || '|t' || v_sal::text || '|' || v)
                   ), '[]'::jsonb)
              INTO v_termos
              FROM jsonb_array_elements_text(
                     COALESCE(p_alts -> 'termos', '[]'::jsonb)) AS a(v);

            SELECT COALESCE(jsonb_agg(v ORDER BY
                     md5(p_questao_id::text || '|d' || v_sal::text || '|' || v)
                   ), '[]'::jsonb)
              INTO v_defs
              FROM jsonb_array_elements_text(
                     COALESCE(p_alts -> 'definicoes', '[]'::jsonb)) AS a(v);

            v_n := jsonb_array_length(v_termos);

            -- Sem gabarito nao da para medir alinhamento; sem pelo menos dois
            -- itens nao ha permutacao a evitar.
            EXIT WHEN cardinality(v_gab) = 0
                   OR v_n < 2
                   OR v_n <> jsonb_array_length(v_defs);

            SELECT count(*) INTO v_casam
              FROM generate_series(0, v_n - 1) AS k
             WHERE (public.fn_texto_comparavel(v_termos ->> k)
                    || '=>' ||
                    public.fn_texto_comparavel(v_defs ->> k)) = ANY (v_gab);

            EXIT WHEN v_casam < v_n;
          END LOOP;

          RETURN jsonb_build_object('termos', v_termos, 'definicoes', v_defs);
        END;
        $fn$
        """
    )

    # ------------------------------------------------------------------
    # 5. O gatilho canonico aprende os tres.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_questoes_alternativas_canonicas()
          RETURNS trigger
          LANGUAGE plpgsql
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
        DECLARE
          v_alts jsonb;
          v_tipo text := public.fn_texto_comparavel(COALESCE(NEW.tipo, ''));
        BEGIN
          -- Associacao nao tem lista de opcoes: tem duas listas, e o
          -- pareamento e' o gabarito. Nada a normalizar nem a resolver.
          IF v_tipo = 'associacao' THEN
            NEW.alternativas := public.fn_questao_associacao_em_ordem(
              NEW.id, NEW.alternativas, NEW.resposta_correta);
            RETURN NEW;
          END IF;

          v_alts := public.fn_questao_alternativas_normalizadas(NEW.alternativas);
          NEW.alternativas := v_alts;

          IF v_tipo IN ('verdadeiro_falso', 'true_false', 'vf') THEN
            RETURN NEW;
          END IF;

          -- Nos formatos de LISTA o gabarito e' um conjunto/sequencia, nao uma
          -- opcao: resolve-lo como texto de alternativa o destruiria. E a
          -- reordenacao continua valendo -- em `ordenacao` ela e' o que impede
          -- a tela de mostrar a resposta.
          IF v_tipo NOT IN ('ordenacao', 'multipla_resposta') THEN
            NEW.resposta_correta :=
              public.fn_questao_gabarito_em_texto(v_alts, NEW.resposta_correta);
          END IF;

          NEW.alternativas :=
            public.fn_questao_alternativas_em_ordem(NEW.id, v_alts);

          RETURN NEW;
        END;
        $fn$
        """
    )

    # ------------------------------------------------------------------
    # 6. As funcoes novas nascem executaveis por `anon` (default do Supabase).
    # ------------------------------------------------------------------
    for assinatura in (
        "fn_questao_resposta_em_lista(text)",
        "fn_questao_confere_lista(text, text, text)",
        "fn_questao_associacao_em_ordem(bigint, jsonb, text)",
    ):
        op.execute(f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon")
        op.execute(f"GRANT EXECUTE ON FUNCTION public.{assinatura} TO authenticated")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.fn_questao_associacao_em_ordem(bigint, jsonb, text)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_questao_confere_lista(text, text, text)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_questao_resposta_em_lista(text)")
