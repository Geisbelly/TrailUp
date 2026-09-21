"""A alternativa correta deixa de morar na primeira posicao.

Medido nesta base, nas 21 questoes de multipla escolha:

    posicao da correta | questoes
    1a                 | 14
    2a                 |  7
    3a                 |  0
    4a                 |  0

Nenhuma questao tem a resposta na terceira ou na quarta posicao. Dava para
gabaritar a trilha inteira sem ler um enunciado -- e nenhuma tela conseguiria
corrigir isso, porque o vies esta no DADO.

## Por que no banco, e nao no gerador

Quem escreve `questoes` sao TRES caminhos: o console do professor, a API
(pipeline de personalizacao) e o microservice. Corrigir no gerador deixaria os
outros dois produzindo o mesmo vies -- e foi assim que o console e a API
divergiram no FORMATO das alternativas, o que esta migracao tambem fecha.

Ordenar nao tem modelo de linguagem no meio: pela regra de fronteira do repo,
e do Postgres.

## O segundo defeito, latente: duas formas de `alternativas`

- API/pipeline gravam `["texto", ...]` e o gabarito como o TEXTO da opcao;
- o console grava `[{id, texto, correta}, ...]` e o gabarito como a LETRA
  (`correct.id`, em `QuestionsManager.tsx`).

Medido: as 35 linhas com alternativas estao na forma de STRING, ou seja, a
forma do console **nunca foi exercitada**. Ela nao esta quebrada por sorte:
`fn_questao_confere` le `v_alts ->> v_i`, que sobre um objeto devolve o JSON
inteiro, e o mobile renderizaria `[object Object]`. Normalizar na entrada
resolve os dois de uma vez, e sem pedir mudanca simultanea nos tres clientes.

## Idempotencia nao e detalhe -- e o que torna o gatilho possivel

Uma PERMUTACAO aplicada de novo sobre a propria saida embaralha outra vez: o
console le a ordem gravada, edita um texto, grava de volta, e a ordem mudaria a
cada save. Por isso a ordem canonica e uma ORDENACAO por chave derivada do
conteudo (`md5(id || '|' || texto)`), nao um embaralhamento: aplicar duas vezes
da o mesmo resultado, e editar uma opcao move so aquela.

## O que NAO e reordenado

- `verdadeiro_falso`: o par tem ordem semantica;
- menos de 3 alternativas: nao ha o que distribuir;
- ancoras ("todas as anteriores", "nenhuma das alternativas", "n.d.a"): ficam
  no fim, onde a pergunta precisa que estejam. Embaralhar isso quebraria a
  questao, nao o vies.

Revision ID: 20260921_03
Revises: 20260921_02
"""

from alembic import op

revision = "20260921_03"
down_revision = "20260921_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Uma forma so de alternativa: array de strings.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_questao_alternativas_normalizadas(
          p_alts jsonb
        ) RETURNS jsonb
          LANGUAGE sql IMMUTABLE
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
          SELECT CASE
            WHEN p_alts IS NULL THEN NULL
            WHEN jsonb_typeof(p_alts) <> 'array' THEN p_alts
            ELSE COALESCE((
              SELECT jsonb_agg(x.texto ORDER BY x.ord)
                FROM (
                  SELECT t.ord,
                         btrim(CASE jsonb_typeof(t.item)
                           WHEN 'string' THEN t.item #>> '{}'
                           WHEN 'object' THEN COALESCE(
                             t.item ->> 'texto', t.item ->> 'text',
                             t.item ->> 'label', t.item ->> 'titulo',
                             t.item ->> 'descricao', t.item ->> 'id'
                           )
                           ELSE t.item #>> '{}'
                         END) AS texto
                    FROM jsonb_array_elements(p_alts)
                         WITH ORDINALITY AS t(item, ord)
                ) x
               WHERE COALESCE(x.texto, '') <> ''
            ), '[]'::jsonb)
          END;
        $fn$
        """
    )

    # ------------------------------------------------------------------
    # 2. O gabarito vira sempre o TEXTO da opcao.
    #
    # O console grava a letra. Enquanto o gabarito for posicional, reordenar
    # as alternativas o invalida -- entao materializa-lo como texto e
    # PRE-REQUISITO da reordenacao, nao melhoria a parte.
    #
    # A tolerancia e exatamente a de `fn_questao_confere` (texto, letra,
    # indice base zero). Aceitar tambem indice base um criaria ambiguidade:
    # num quarteto, "1" seria a primeira ou a segunda opcao, e a escolha
    # errada trocaria o gabarito em silencio.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_questao_gabarito_em_texto(
          p_alts jsonb,
          p_resposta text
        ) RETURNS text
          LANGUAGE plpgsql IMMUTABLE
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
        DECLARE
          v_resp text := btrim(COALESCE(p_resposta, ''));
          v_norm text;
          v_i    integer;
        BEGIN
          IF v_resp = '' OR jsonb_typeof(p_alts) <> 'array' THEN
            RETURN p_resposta;
          END IF;

          v_norm := public.fn_texto_comparavel(v_resp);

          -- Texto de uma opcao ganha de letra e de indice: uma opcao cujo
          -- proprio texto seja "A" ou "1" nao pode ser lida como posicao.
          FOR v_i IN 0 .. jsonb_array_length(p_alts) - 1 LOOP
            IF public.fn_texto_comparavel(p_alts ->> v_i) = v_norm THEN
              RETURN p_alts ->> v_i;
            END IF;
          END LOOP;

          FOR v_i IN 0 .. jsonb_array_length(p_alts) - 1 LOOP
            IF v_norm = lower(chr(65 + v_i)) OR v_norm = v_i::text THEN
              RETURN p_alts ->> v_i;
            END IF;
          END LOOP;

          -- Nao resolveu: devolve intacto. Dissertativa e fill_blank caem
          -- aqui, e e o certo -- o gabarito delas nao e uma opcao.
          RETURN p_resposta;
        END;
        $fn$
        """
    )

    # ------------------------------------------------------------------
    # 3. A ordem canonica.
    # ------------------------------------------------------------------
    op.execute(
        r"""
        CREATE OR REPLACE FUNCTION public.fn_questao_alternativas_em_ordem(
          p_questao_id bigint,
          p_alts jsonb
        ) RETURNS jsonb
          LANGUAGE sql IMMUTABLE
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
          SELECT CASE
            WHEN jsonb_typeof(p_alts) <> 'array' THEN p_alts
            WHEN jsonb_array_length(p_alts) < 3 THEN p_alts
            ELSE (
              SELECT jsonb_agg(x.texto ORDER BY x.ancora, x.chave, x.texto)
                FROM (
                  SELECT t.item #>> '{}' AS texto,
                         CASE WHEN public.fn_texto_comparavel(t.item #>> '{}')
                                   ~ '^(todas|nenhuma|n\.?d\.?a)\y'
                              THEN 1 ELSE 0 END AS ancora,
                         md5(p_questao_id::text || '|' || (t.item #>> '{}')) AS chave
                    FROM jsonb_array_elements(p_alts) AS t(item)
                ) x
            )
          END;
        $fn$
        """
    )

    # ------------------------------------------------------------------
    # 4. O gatilho, onde os tres escritores passam.
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
        BEGIN
          v_alts := public.fn_questao_alternativas_normalizadas(NEW.alternativas);
          NEW.alternativas := v_alts;

          -- Verdadeiro/Falso tem ordem semantica: reordenar troca o par de
          -- lugar sem ganho nenhum, e o aluno le "Falso" onde esperava "V".
          IF public.fn_texto_comparavel(COALESCE(NEW.tipo, '')) IN
             ('verdadeiro_falso', 'true_false', 'vf') THEN
            RETURN NEW;
          END IF;

          -- Resolver ANTES de reordenar: a letra que o autor escolheu se
          -- refere a ordem que ELE viu.
          NEW.resposta_correta :=
            public.fn_questao_gabarito_em_texto(v_alts, NEW.resposta_correta);
          NEW.alternativas :=
            public.fn_questao_alternativas_em_ordem(NEW.id, v_alts);

          RETURN NEW;
        END;
        $fn$
        """
    )

    op.execute("DROP TRIGGER IF EXISTS trg_questoes_alternativas_canonicas ON public.questoes")
    op.execute(
        """
        CREATE TRIGGER trg_questoes_alternativas_canonicas
          BEFORE INSERT OR UPDATE ON public.questoes
          FOR EACH ROW
          EXECUTE FUNCTION public.fn_questoes_alternativas_canonicas()
        """
    )

    # ------------------------------------------------------------------
    # 5. O espelho do gabarito precisa ouvir TODO update.
    #
    # `UPDATE OF resposta_correta` dispara pelas colunas que a INSTRUCAO
    # lista, nao pelo que um BEFORE trigger alterou. Como o gatilho acima
    # reescreve `resposta_correta` num UPDATE que mexeu so em
    # `alternativas`, o espelho nao dispararia e `questao_gabarito` ficaria
    # com a letra velha -- apontando para a posicao antiga. O upsert e
    # idempotente, entao ouvir tudo custa uma escrita e evita divergencia.
    # ------------------------------------------------------------------
    op.execute("DROP TRIGGER IF EXISTS trg_questoes_espelha_gabarito ON public.questoes")
    op.execute(
        """
        CREATE TRIGGER trg_questoes_espelha_gabarito
          AFTER INSERT OR UPDATE ON public.questoes
          FOR EACH ROW
          EXECUTE FUNCTION public.fn_questoes_espelha_gabarito()
        """
    )

    # ------------------------------------------------------------------
    # 6. Backfill, com recusa explicita.
    #
    # Uma linha cujo gabarito nao resolva para nenhuma opcao NAO pode ser
    # reordenada: perder-se-ia a unica ligacao entre resposta e posicao.
    # O UPDATE abaixo so toca as que resolvem, e o bloco seguinte recusa a
    # migracao se sobrar multipla escolha sem gabarito casavel.
    # ------------------------------------------------------------------
    op.execute(
        """
        UPDATE public.questoes q
           SET alternativas = q.alternativas
         WHERE jsonb_typeof(q.alternativas) = 'array'
           AND jsonb_array_length(q.alternativas) >= 3
        """
    )

    op.execute(
        """
        DO $guard$
        DECLARE
          v_sem_casar integer;
          v_primeira  integer;
          v_total     integer;
        BEGIN
          SELECT count(*) INTO v_sem_casar
            FROM public.questoes q
           WHERE jsonb_typeof(q.alternativas) = 'array'
             AND jsonb_array_length(q.alternativas) >= 3
             AND NOT EXISTS (
               SELECT 1
                 FROM jsonb_array_elements_text(q.alternativas) AS a(v)
                WHERE public.fn_texto_comparavel(a.v)
                    = public.fn_texto_comparavel(q.resposta_correta)
             );

          IF v_sem_casar > 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'backfill deixou ' || v_sem_casar ||
              ' questao(oes) cujo gabarito nao casa com nenhuma alternativa';
          END IF;

          SELECT count(*) FILTER (WHERE pos = 1), count(*)
            INTO v_primeira, v_total
            FROM (
              SELECT (
                SELECT idx
                  FROM jsonb_array_elements_text(q.alternativas)
                       WITH ORDINALITY t(v, idx)
                 WHERE public.fn_texto_comparavel(t.v)
                     = public.fn_texto_comparavel(q.resposta_correta)
                 LIMIT 1
              ) AS pos
                FROM public.questoes q
               WHERE jsonb_typeof(q.alternativas) = 'array'
                 AND jsonb_array_length(q.alternativas) >= 3
            ) p;

          RAISE NOTICE USING MESSAGE =
            'apos o backfill: ' || v_primeira || ' de ' || v_total ||
            ' com a correta na primeira posicao';
        END
        $guard$
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_questoes_alternativas_canonicas ON public.questoes")
    op.execute("DROP FUNCTION IF EXISTS public.fn_questoes_alternativas_canonicas()")
    op.execute("DROP FUNCTION IF EXISTS public.fn_questao_alternativas_em_ordem(bigint, jsonb)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_questao_gabarito_em_texto(jsonb, text)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_questao_alternativas_normalizadas(jsonb)")

    # O espelho volta a ouvir so a coluna, como era antes.
    op.execute("DROP TRIGGER IF EXISTS trg_questoes_espelha_gabarito ON public.questoes")
    op.execute(
        """
        CREATE TRIGGER trg_questoes_espelha_gabarito
          AFTER INSERT OR UPDATE OF resposta_correta ON public.questoes
          FOR EACH ROW
          EXECUTE FUNCTION public.fn_questoes_espelha_gabarito()
        """
    )
