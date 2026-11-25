"""Gabarito de uma letra só: o texto da alternativa vem antes da letra

**O defeito (visto em 24/11, na trilha da web).** Questão com as alternativas "B", "A e B", "A" e
"Nada" e gabarito "B". O aluno marcou "A e B" e a tela disse "Resposta correta!", com "Gabarito: B"
logo abaixo. No caminho comum de `fn_questao_confere` (questão sem texto rico), o laço das
alternativas aceitava o gabarito de três jeitos ao mesmo tempo (texto, índice e letra) em cada
posição. Na 2ª alternativa, "A e B", a resposta casava pelo texto e o gabarito "b" casava pela
letra B. Resultado: verdadeiro.

**A regra agora é a de `fn_questao_posicao_rica` (`20261108_03`) e de
`fn_questao_gabarito_em_texto`**, que é o que a tela mostra como gabarito: a posição de um valor
entre as alternativas sai do texto primeiro. Letra e índice só valem quando nenhuma alternativa
tem aquele texto. Resposta e gabarito viram posições, e a resposta está certa quando as duas são
a mesma. A tela, o banco e a lista que vai ao aparelho (`questao_gabaritos_offline`, `20261124_07`,
que chama esta mesma função) passam a concordar.

O que não muda:
- a igualdade direta entre resposta e gabarito continua valendo antes de tudo;
- o V/F por sinônimo continua igual;
- a múltipla rica continua com a regra dela;
- a lacuna, a dissertativa e as listas também continuam iguais;
- o gabarito que é só letra ("B" sem alternativa chamada "B") continua sendo a 2ª alternativa.

Medido em produção em 24/11 (`BEGIN READ ONLY`): 3 questões têm gabarito igual ao texto de uma
alternativa e, ao mesmo tempo, à letra ou ao índice de outra (ids 7, 37 e 52). Havia 1 resposta
gravada nelas. A nota já gravada não é recalculada aqui.

Corpo de produção lido em 24/11 (`pg_get_functiondef`). O `downgrade` o devolve.
"""

from __future__ import annotations

from alembic import op

revision = "20261124_08"
down_revision = "20261124_07"
branch_labels = None
depends_on = None


def _trocar(sql: str, trocas: list[tuple[str, str, int]]) -> str:
    for velho, novo, vezes in trocas:
        achou = sql.count(velho)
        if achou != vezes:
            raise RuntimeError(f"esperava {vezes} ocorrência(s), achei {achou}: {velho[:80]!r}")
        sql = sql.replace(velho, novo)
    return sql


AJUDANTE = r"""
-- A posição de uma resposta (ou do gabarito) entre as alternativas de uma questão comum: o texto
-- comparável primeiro (a primeira alternativa que casa), depois a letra e por último o índice.
-- Letra e índice só quando nenhum texto casa: com uma alternativa chamada "B", "B" é ela, não a
-- 2ª alternativa (`20261124_08`).
CREATE OR REPLACE FUNCTION public.fn_questao_posicao_simples(p_alts jsonb, p_valor text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valor text := public.fn_texto_comparavel(p_valor);
  v_n integer := CASE WHEN jsonb_typeof(p_alts) = 'array' THEN jsonb_array_length(p_alts) ELSE 0 END;
  i integer;
BEGIN
  IF v_valor = '' OR v_n = 0 THEN RETURN NULL; END IF;
  FOR i IN 0 .. v_n - 1 LOOP
    IF public.fn_texto_comparavel(p_alts ->> i) <> '' AND public.fn_texto_comparavel(p_alts ->> i) = v_valor THEN
      RETURN i;
    END IF;
  END LOOP;
  IF v_valor ~ '^[a-z]$' AND ascii(v_valor) - 97 < v_n THEN
    RETURN ascii(v_valor) - 97;
  END IF;
  IF v_valor ~ '^[0-9]+$' AND length(v_valor) <= 4 AND v_valor::integer < v_n THEN
    RETURN v_valor::integer;
  END IF;
  RETURN NULL;
END;
$$;

-- Só fn_questao_confere (SECURITY DEFINER) chama.
REVOKE ALL ON FUNCTION public.fn_questao_posicao_simples(jsonb, text) FROM PUBLIC, anon, authenticated;
"""

CONFERE_PRODUCAO = r"""
CREATE OR REPLACE FUNCTION public.fn_questao_confere(p_questao_id bigint, p_resposta text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_gabarito text; v_alts jsonb; v_tipo text; v_tipo_atividade text; v_resp text; v_gab text;
  v_i integer; v_texto text; v_aceitas text[]; v_dissertativa boolean;
  v_formato text; v_lacuna_rica boolean;
BEGIN
  SELECT g.resposta_correta, q.alternativas, q.tipo, lower(btrim(COALESCE(a.tipo::text, ''))),
         q.formato_texto
    INTO v_gabarito, v_alts, v_tipo, v_tipo_atividade, v_formato
    FROM public.questoes q
    LEFT JOIN public.questao_gabarito g ON g.questao_id = q.id
    LEFT JOIN public.atividades a ON a.id = q.atividade_id
   WHERE q.id = p_questao_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Múltipla escolha rica: pela posição (`20261108_03`). O texto comparável empata
  -- \ce{CO} com \ce{Co}.
  IF v_formato = 'rico' AND jsonb_typeof(v_alts) = 'array' AND jsonb_array_length(v_alts) > 0
     AND (public.fn_texto_comparavel(COALESCE(v_tipo, '')) IN ('multipla', 'multipla_escolha', 'multipla escolha', 'quiz')
          OR (v_tipo IS NULL AND v_tipo_atividade IN ('quiz', 'multipla', 'multipla_escolha'))) THEN
    RETURN public.fn_questao_posicao_rica(v_alts, p_resposta) IS NOT NULL
       AND public.fn_questao_posicao_rica(v_alts, p_resposta) = public.fn_questao_posicao_rica(v_alts, v_gabarito);
  END IF;

  -- Dissertativa e lacuna: a tolerância do app (`20261108_01`). O tipo vale da questão ou da
  -- atividade, como em QuestionActivity.
  v_dissertativa := lower(btrim(COALESCE(v_tipo, ''))) IN ('dissertativa', 'aberta', 'texto_livre', 'ensaio', 'essay', 'questao_aberta', 'questao aberta', 'open', 'open_ended', 'open-ended', 'open_text', 'open text')
                    OR v_tipo_atividade IN ('dissertativa', 'aberta', 'texto_livre', 'ensaio', 'essay', 'questao_aberta', 'questao aberta', 'open', 'open_ended', 'open-ended', 'open_text', 'open text');
  IF v_dissertativa
     OR lower(btrim(COALESCE(v_tipo, ''))) IN ('fill_blank', 'fili_blank', 'fill in the blank', 'fill-in-the-blank', 'fillblank', 'completar_lacuna', 'completar lacuna', 'lacuna')
     OR v_tipo_atividade IN ('fill_blank', 'fili_blank', 'fill in the blank', 'fill-in-the-blank', 'fillblank', 'completar_lacuna', 'completar lacuna', 'lacuna') THEN
    -- Lacuna rica (`20261108_03`): fn_texto_estrito tira todo símbolo, e a+b viraria a-b.
    v_lacuna_rica := v_formato = 'rico' AND NOT v_dissertativa;
    IF v_lacuna_rica THEN
      IF public.fn_texto_rico_comparavel(p_resposta) = '' THEN RETURN false; END IF;
      RETURN EXISTS (SELECT 1 FROM unnest(public.fn_questao_respostas_aceitas(v_gabarito)) AS x
                      WHERE public.fn_texto_rico_comparavel(x) <> ''
                        AND public.fn_texto_rico_comparavel(x) = public.fn_texto_rico_comparavel(p_resposta));
    END IF;
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
"""

CONFERE = _trocar(
    CONFERE_PRODUCAO,
    [
        (
            "  v_formato text; v_lacuna_rica boolean;\n",
            "  v_formato text; v_lacuna_rica boolean; v_pos_resp integer; v_pos_gab integer;\n",
            1,
        ),
        (
            """  IF jsonb_typeof(v_alts) = 'array' THEN
    FOR v_i IN 0 .. jsonb_array_length(v_alts) - 1 LOOP
      v_texto := public.fn_texto_comparavel(v_alts ->> v_i);
      IF v_texto = '' THEN CONTINUE; END IF;
      IF v_resp = v_texto OR v_resp = v_i::text OR v_resp = lower(chr(65 + v_i)) THEN
        IF v_gab = v_texto OR v_gab = v_i::text OR v_gab = lower(chr(65 + v_i)) THEN RETURN true; END IF;
      END IF;
    END LOOP;
  END IF;
""",
            """  -- Resposta e gabarito viram posições: o texto da alternativa antes da letra (`20261124_08`).
  -- O laço antigo aceitava texto, índice e letra ao mesmo tempo em cada posição, e o gabarito "B"
  -- dava como certa a 2ª alternativa ("A e B") mesmo com uma alternativa chamada "B".
  IF jsonb_typeof(v_alts) = 'array' THEN
    v_pos_resp := public.fn_questao_posicao_simples(v_alts, p_resposta);
    v_pos_gab := public.fn_questao_posicao_simples(v_alts, v_gabarito);
    RETURN v_pos_resp IS NOT NULL AND v_pos_resp = v_pos_gab;
  END IF;
""",
            1,
        ),
    ],
)


def upgrade() -> None:
    op.execute(AJUDANTE)
    op.execute(CONFERE)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    # A função volta antes de o ajudante sumir: o corpo novo depende dele.
    op.execute(CONFERE_PRODUCAO)
    op.execute("DROP FUNCTION IF EXISTS public.fn_questao_posicao_simples(jsonb, text);")
    op.execute("NOTIFY pgrst, 'reload schema'")
