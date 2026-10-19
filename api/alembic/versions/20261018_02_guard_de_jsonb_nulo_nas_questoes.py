"""Questao dissertativa nao salva: `jsonb_typeof(NULL) <> 'array'` e NULL, nao TRUE

O professor nao consegue salvar nenhuma questao que nao seja multipla escolha
ou verdadeiro/falso. O INSERT morre com:

    22004 upper bound of FOR loop cannot be null
    CONTEXT: PL/pgSQL function fn_questao_gabarito_em_texto(jsonb,text) line 6

## O mecanismo

`fn_questao_gabarito_em_texto` abre com uma guarda escrita exatamente para o
caso de `p_alts` nao ser uma lista:

    IF v_resp = '' OR jsonb_typeof(p_alts) <> 'array' THEN RETURN p_resposta; END IF;

So que `jsonb_typeof(NULL)` devolve NULL, e `NULL <> 'array'` tambem e NULL --
nao TRUE. A condicao vira `FALSE OR NULL` = NULL, o IF nao dispara, e a
execucao cai no laco seguinte:

    FOR v_i IN 0 .. jsonb_array_length(p_alts) - 1 LOOP

com `jsonb_array_length(NULL)` = NULL. Dai o 22004. A guarda existe para esse
caso e nao o pega.

## Por que todo salvamento de dissertativa cai nele

`normalizeQuestionPayload` (frontend/src/components/console/trilha/useTopicCrud.ts)
tem tres ramos. O ultimo, que pega tudo que nao e `verdadeiro_falso` nem
`multipla`, devolve:

    { tipo, alternativas: null, resposta: params.resposta?.trim() || "Resposta aberta" }

`alternativas` NULL e `resposta` NUNCA vazia -- quando o professor nao escreve
gabarito, entra o literal "Resposta aberta". E precisamente a combinacao que
estoura: a primeira metade da guarda (`v_resp = ''`) tambem nao salva.

Conferido no banco real, com o payload exato do console:

    dissertativa (alternativas NULL + resposta 'Resposta aberta')  FALHOU 22004
    dissertativa com resposta NULL                                 PASSOU
    multipla escolha (alternativas preenchidas)                    PASSOU
    verdadeiro_falso com alternativas NULL                         PASSOU

## A irma tem a mesma guarda

`fn_questao_associacao_em_ordem` abre com
`IF jsonb_typeof(p_alts) <> 'object' THEN RETURN p_alts; END IF`, pelo mesmo
motivo e com o mesmo furo. Ela nao estoura porque os `COALESCE` adiante
absorvem o NULL -- mas devolve `{"termos": [], "definicoes": []}` no lugar do
NULL que recebeu, isto e, inventa um objeto vazio onde nao havia dado.
Verificado: `fn_questao_associacao_em_ordem(1, NULL, NULL)` devolve o objeto.

## Schema nao versionado

Nenhuma das duas esta no Alembic -- foram criadas fora, e esta migracao e a
primeira vez que entram no versionamento (ver
`docs/architecture/schema-nao-versionado.md`). Os corpos abaixo sao os de
producao, com a guarda corrigida e nada mais.

Revision ID: 20261018_02
Revises: 20261018_01
Create Date: 2026-10-18
"""

from alembic import op

revision = "20261018_02"
down_revision = "20261018_01"
branch_labels = None
depends_on = None


# `p_alts IS NULL OR` na frente: `jsonb_typeof(NULL)` e NULL, e comparar NULL
# com qualquer coisa da NULL, que num IF se comporta como falso.
GABARITO_CORRIGIDA = """
CREATE OR REPLACE FUNCTION public.fn_questao_gabarito_em_texto(p_alts jsonb, p_resposta text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_resp text := btrim(COALESCE(p_resposta, '')); v_norm text; v_i integer;
BEGIN
  IF v_resp = '' OR p_alts IS NULL OR jsonb_typeof(p_alts) <> 'array' THEN RETURN p_resposta; END IF;
  v_norm := public.fn_texto_comparavel(v_resp);
  FOR v_i IN 0 .. jsonb_array_length(p_alts) - 1 LOOP
    IF public.fn_texto_comparavel(p_alts ->> v_i) = v_norm THEN RETURN p_alts ->> v_i; END IF;
  END LOOP;
  FOR v_i IN 0 .. jsonb_array_length(p_alts) - 1 LOOP
    IF v_norm = lower(chr(65 + v_i)) OR v_norm = v_i::text THEN RETURN p_alts ->> v_i; END IF;
  END LOOP;
  RETURN p_resposta;
END; $function$
"""

GABARITO_ORIGINAL = """
CREATE OR REPLACE FUNCTION public.fn_questao_gabarito_em_texto(p_alts jsonb, p_resposta text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_resp text := btrim(COALESCE(p_resposta, '')); v_norm text; v_i integer;
BEGIN
  IF v_resp = '' OR jsonb_typeof(p_alts) <> 'array' THEN RETURN p_resposta; END IF;
  v_norm := public.fn_texto_comparavel(v_resp);
  FOR v_i IN 0 .. jsonb_array_length(p_alts) - 1 LOOP
    IF public.fn_texto_comparavel(p_alts ->> v_i) = v_norm THEN RETURN p_alts ->> v_i; END IF;
  END LOOP;
  FOR v_i IN 0 .. jsonb_array_length(p_alts) - 1 LOOP
    IF v_norm = lower(chr(65 + v_i)) OR v_norm = v_i::text THEN RETURN p_alts ->> v_i; END IF;
  END LOOP;
  RETURN p_resposta;
END; $function$
"""

ASSOCIACAO_CORRIGIDA = """
CREATE OR REPLACE FUNCTION public.fn_questao_associacao_em_ordem(p_questao_id bigint, p_alts jsonb, p_gabarito text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_gab text[] := public.fn_questao_resposta_em_lista(p_gabarito);
  v_termos jsonb; v_defs jsonb; v_n integer; v_casam integer; v_sal integer;
BEGIN
  IF p_alts IS NULL OR jsonb_typeof(p_alts) <> 'object' THEN RETURN p_alts; END IF;
  FOR v_sal IN 0 .. 4 LOOP
    SELECT COALESCE(jsonb_agg(v ORDER BY md5(p_questao_id::text || '|t' || v_sal::text || '|' || v)), '[]'::jsonb)
      INTO v_termos FROM jsonb_array_elements_text(COALESCE(p_alts -> 'termos', '[]'::jsonb)) AS a(v);
    SELECT COALESCE(jsonb_agg(v ORDER BY md5(p_questao_id::text || '|d' || v_sal::text || '|' || v)), '[]'::jsonb)
      INTO v_defs FROM jsonb_array_elements_text(COALESCE(p_alts -> 'definicoes', '[]'::jsonb)) AS a(v);
    v_n := jsonb_array_length(v_termos);
    EXIT WHEN cardinality(v_gab) = 0 OR v_n < 2 OR v_n <> jsonb_array_length(v_defs);
    SELECT count(*) INTO v_casam FROM generate_series(0, v_n - 1) AS k
     WHERE (public.fn_texto_comparavel(v_termos ->> k) || '=>' || public.fn_texto_comparavel(v_defs ->> k)) = ANY (v_gab);
    EXIT WHEN v_casam < v_n;
  END LOOP;
  RETURN jsonb_build_object('termos', v_termos, 'definicoes', v_defs);
END; $function$
"""

ASSOCIACAO_ORIGINAL = ASSOCIACAO_CORRIGIDA.replace(
    "IF p_alts IS NULL OR jsonb_typeof(p_alts) <> 'object'",
    "IF jsonb_typeof(p_alts) <> 'object'",
)


def upgrade() -> None:
    op.execute(GABARITO_CORRIGIDA)
    op.execute(ASSOCIACAO_CORRIGIDA)


def downgrade() -> None:
    # Devolve as guardas furadas. Reverter traz o 22004 de volta -- e a unica
    # forma honesta de desfazer.
    op.execute(GABARITO_ORIGINAL)
    op.execute(ASSOCIACAO_ORIGINAL)
