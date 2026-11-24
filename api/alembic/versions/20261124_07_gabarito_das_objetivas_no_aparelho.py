"""Gabarito das questões objetivas no aparelho do aluno, para corrigir na hora e sem rede

**Decisão da autora em 24/11.** A fase 3 da questão corrigida no banco (`20261108_01`,
`20261110_04`) tirou o gabarito do app: o aluno não lê `questoes.resposta_correta`, e quem corrige é
`questao_responder`. Na web, em 24/11, essa chamada levou de 5 a 7 s por questão de marcar, e o aluno
ficou esperando o "Enviando resposta..." a cada toque. A autora decidiu levar o gabarito ao aparelho,
cifrado, e aceitou o risco de um aluno extrair as respostas. Isto reabre o que a fase 3 fechou, **só
para as objetivas** (múltipla escolha e verdadeiro/falso). Dissertativa, lacuna, código, numérica e
expressão continuam corrigidas só no servidor.

## `questao_gabaritos_offline(p_classe_id bigint)`

Devolve, para cada questão objetiva da turma, o que o app pode mandar e o banco aceitaria:
`aceitas` é a lista das respostas candidatas (o texto de cada alternativa; a letra, na múltipla rica;
`Verdadeiro` e `Falso`, no V/F) para as quais `fn_questao_confere` devolve verdadeiro.

- **A regra é a do banco, não uma cópia dela.** Quem decide cada candidata é a mesma
  `fn_questao_confere` que `questao_responder` chama. O app só confere se a resposta que vai mandar
  está na lista. Por construção, o aparelho e o banco concordam sobre tudo o que o app manda, e o
  que ficar fora da lista o app não corrige sozinho: espera o banco.
- **Mesmo portão de `fn_questao_acesso`, sem o prazo:** só o aluno matriculado na turma
  (`classe_aluno`), e só de tópico liberado (`app_topico_liberado`). O prazo não entra: responder
  fora dele continua recusado por `questao_responder`, que é quem grava.
- **O tipo vale como em `QuestionActivity`:** o da questão ou o da atividade. Sai do lote toda
  questão cujo tipo (de um dos dois) seja dissertativa, lacuna, código, numérica, expressão,
  associação, ordenação ou múltipla resposta.
- **A nota continua do banco.** O app mostra o resultado na hora e manda a resposta a
  `questao_responder` quando houver rede; se o banco discordar, vale o banco.

`EXECUTE` só para `authenticated`. Sem tabela nova.
"""

from __future__ import annotations

from alembic import op

revision = "20261124_07"
down_revision = "20261124_06"
branch_labels = None
depends_on = None


TIPOS_FORA = (
    # Dissertativa (a mesma lista de `isDissertativaType` e de `fn_questao_confere`).
    "'dissertativa', 'aberta', 'texto_livre', 'ensaio', 'essay', 'questao_aberta', 'questao aberta', "
    "'open', 'open_ended', 'open-ended', 'open_text', 'open text', "
    # Lacuna (`isFillBlankType`).
    "'fill_blank', 'fili_blank', 'fill in the blank', 'fill-in-the-blank', 'fillblank', "
    "'completar_lacuna', 'completar lacuna', 'lacuna', "
    # Spec B (`formaDaResposta`): corrigidas pelas edge functions.
    "'codigo', 'code', 'numerica', 'numeric', 'expressao', 'expression', "
    # Listas (`fn_questao_confere_lista`): o app não as desenha como alternativas.
    "'associacao', 'ordenacao', 'multipla_resposta'"
)

TIPOS_VF = (
    "'true_false', 'true or false', 'true_or_false', 'truefalse', 'verdadeiro_falso', "
    "'verdadeiro ou falso', 'verdadeiro/falso', 'booleano'"
)

SQL = rf"""
CREATE OR REPLACE FUNCTION public.questao_gabaritos_offline(p_classe_id bigint)
RETURNS TABLE (questao_id bigint, atividade_id bigint, aceitas text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  r record;
  v_candidatas text[];
  v_i integer;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'questao_sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.classe_aluno ca
                  WHERE ca.classe_id = p_classe_id AND ca.aluno_id = v_me) THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT q.id, q.atividade_id AS atividade, q.alternativas AS alts,
           COALESCE(q.formato_texto, 'texto') AS formato,
           lower(btrim(COALESCE(q.tipo::text, ''))) AS tipo_q,
           lower(btrim(COALESCE(a.tipo::text, ''))) AS tipo_a
      FROM public.questoes q
      JOIN public.atividades a ON a.id = q.atividade_id
      JOIN public.topicos t ON t.id = a.topico_id
     WHERE t.classe_id = p_classe_id
       AND public.app_topico_liberado(t.publicacao::text, t.publicar_em)
     ORDER BY q.id
  LOOP
    CONTINUE WHEN r.tipo_q IN ({TIPOS_FORA}) OR r.tipo_a IN ({TIPOS_FORA});

    IF r.tipo_q IN ({TIPOS_VF}) OR r.tipo_a IN ({TIPOS_VF}) THEN
      -- O app desenha só "Verdadeiro" e "Falso" e manda o rótulo.
      v_candidatas := ARRAY['Verdadeiro', 'Falso'];
    ELSIF jsonb_typeof(r.alts) = 'array' AND jsonb_array_length(r.alts) > 0 THEN
      v_candidatas := ARRAY[]::text[];
      FOR v_i IN 0 .. jsonb_array_length(r.alts) - 1 LOOP
        -- O app manda `String(alternativas[i])`; na rica, a letra (`letraDaAlternativa`).
        v_candidatas := v_candidatas || COALESCE(r.alts ->> v_i, '');
        IF r.formato = 'rico' THEN
          v_candidatas := v_candidatas || chr(65 + v_i);
        END IF;
      END LOOP;
    ELSE
      CONTINUE;
    END IF;

    questao_id := r.id;
    atividade_id := r.atividade;
    aceitas := ARRAY(
      SELECT DISTINCT c FROM unnest(v_candidatas) AS c
       WHERE btrim(c) <> '' AND public.fn_questao_confere(r.id, c)
    );
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.questao_gabaritos_offline(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.questao_gabaritos_offline(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
"""


DOWNGRADE_SQL = r"""
DROP FUNCTION IF EXISTS public.questao_gabaritos_offline(bigint);
NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
