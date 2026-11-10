"""`20261108_03`: a marca de texto rico, a conferência pela posição e as cópias.

Postgres local, esqueleto da produção, `20261108_01` e as cópias de `20261011`, e a migration por
cima. O aluno chama com `SET ROLE authenticated`; o professor duplica com o papel dele.

Os gatilhos de `questoes` que reescrevem alternativas e gabarito ao salvar
(`trg_questoes_alternativas_canonicas`, `trg_questoes_espelha_gabarito`) entram com o corpo de
produção lido em 08/11, porque são eles que mudam o que a conferência recebe. Sem eles, este teste
daria verde num gabarito que em produção chega trocado.

O que se mede:

- múltipla rica: `\\ce{CO}` e `\\ce{Co}` deixam de empatar, pela letra (build novo) e pelo texto
  (app 1.0.x);
- o gatilho grava o gabarito exato mesmo com o empate do texto comparável;
- a questão `'texto'` continua com a regra de antes;
- lacuna rica: `x^2+1` não aceita `x^2-1`, e maiúscula conta;
- `duplicar_atividade` e `duplicar_topico` levam a marca;
- o aluno não chama as funções novas.
"""

from __future__ import annotations

import psycopg
import pytest
from psycopg.types.json import Jsonb

from tests import _f5_banco as f5
from tests import test_e2e_questao_corrigida_no_banco as questao

M_QUESTAO = f5.modulo("20261108_01_questao_corrigida_no_banco.py")
M = f5.modulo("20261108_03_texto_rico.py")
COPIAS = [f5.modulo(a) for a in (
    "20261011_01_duplicar_classe.py", "20261011_03_duplicar_topico.py", "20261011_04_duplicar_atividade.py",
)]

# Corpos de produção de 08/11 (pg_get_functiondef). Só existem lá.
PRODUCAO = r"""
CREATE OR REPLACE FUNCTION public.app_classes_do_professor()
 RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id FROM classe c WHERE c.professor_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.fn_questao_alternativas_normalizadas(p_alts jsonb)
 RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_alts IS NULL THEN NULL
    WHEN jsonb_typeof(p_alts) <> 'array' THEN p_alts
    ELSE COALESCE((
      SELECT jsonb_agg(x.texto ORDER BY x.ord)
        FROM (SELECT t.ord, btrim(CASE jsonb_typeof(t.item)
                   WHEN 'string' THEN t.item #>> '{}'
                   WHEN 'object' THEN COALESCE(t.item ->> 'texto', t.item ->> 'text',
                     t.item ->> 'label', t.item ->> 'titulo', t.item ->> 'descricao', t.item ->> 'id')
                   ELSE t.item #>> '{}' END) AS texto
            FROM jsonb_array_elements(p_alts) WITH ORDINALITY AS t(item, ord)) x
       WHERE COALESCE(x.texto, '') <> ''), '[]'::jsonb)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_questao_alternativas_em_ordem(p_questao_id bigint, p_alts jsonb)
 RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN jsonb_typeof(p_alts) <> 'array' THEN p_alts
    WHEN jsonb_array_length(p_alts) < 3 THEN p_alts
    ELSE (SELECT jsonb_agg(x.texto ORDER BY x.ancora, x.chave, x.texto)
        FROM (SELECT t.item #>> '{}' AS texto,
                 CASE WHEN public.fn_texto_comparavel(t.item #>> '{}') ~ '^(todas|nenhuma|n\.?d\.?a)\y' THEN 1 ELSE 0 END AS ancora,
                 md5(p_questao_id::text || '|' || (t.item #>> '{}')) AS chave
            FROM jsonb_array_elements(p_alts) AS t(item)) x)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_questoes_alternativas_canonicas()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_alts jsonb; v_tipo text := public.fn_texto_comparavel(COALESCE(NEW.tipo, ''));
BEGIN
  IF v_tipo = 'associacao' THEN
    NEW.alternativas := public.fn_questao_associacao_em_ordem(NEW.id, NEW.alternativas, NEW.resposta_correta);
    RETURN NEW;
  END IF;
  v_alts := public.fn_questao_alternativas_normalizadas(NEW.alternativas);
  NEW.alternativas := v_alts;
  IF v_tipo IN ('verdadeiro_falso','true_false','vf') THEN RETURN NEW; END IF;
  IF v_tipo NOT IN ('ordenacao','multipla_resposta') THEN
    NEW.resposta_correta := public.fn_questao_gabarito_em_texto(v_alts, NEW.resposta_correta);
  END IF;
  NEW.alternativas := public.fn_questao_alternativas_em_ordem(NEW.id, v_alts);
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.fn_questoes_espelha_gabarito()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.questao_gabarito (questao_id, resposta_correta)
  VALUES (NEW.id, NEW.resposta_correta)
  ON CONFLICT (questao_id) DO UPDATE
    SET resposta_correta = EXCLUDED.resposta_correta, atualizado_em = now();
  RETURN NEW;
END
$function$;
"""

GATILHOS = """
CREATE TRIGGER trg_questoes_alternativas_canonicas BEFORE INSERT OR UPDATE ON public.questoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_questoes_alternativas_canonicas();
CREATE TRIGGER trg_questoes_espelha_gabarito AFTER INSERT OR UPDATE ON public.questoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_questoes_espelha_gabarito();
"""

ATIV_RICA, ATIV_TEXTO, ATIV_LACUNA = 600, 601, 602
Q_RICA, Q_TEXTO, Q_LACUNA = 910, 911, 912
QUIMICA = ["\\ce{Co}", "\\ce{CO}", "\\ce{C2O}", "\\ce{CO2}"]


def _banco():
    copias = [s for m in COPIAS for s in f5.sql_de(m)]
    return f5.banco(
        questao.PRODUCAO,
        PRODUCAO,
        M.GABARITO_EM_TEXTO_PRODUCAO,
        questao._tabela_de_tentativas(),
        questao.PRAZO,
        *f5.sql_de(M_QUESTAO),
        *copias,
        GATILHOS,
        *f5.sql_de(M),
    )


def _semear(c) -> None:
    f5.semear_turma(c)
    for t in ("atividades", "questoes", "questao_aluno", "atividade_tentativas", "cards", "conteudos"):
        f5.afrouxa(c, t)
    c.execute(
        f"""
INSERT INTO public.atividades (id, topico_id, titulo, tipo, metadata, formato_texto) OVERRIDING SYSTEM VALUE VALUES
  ({ATIV_RICA}, 10, 'Química', 'quiz', '{{}}', 'rico'),
  ({ATIV_TEXTO}, 10, 'Química sem marca', 'quiz', '{{}}', 'texto'),
  ({ATIV_LACUNA}, 10, 'Lacuna', 'fill_blank', '{{}}', 'rico')
"""
    )
    inserir = (
        "INSERT INTO public.questoes (id, atividade_id, enunciado, tipo, alternativas, resposta_correta, formato_texto) "
        "OVERRIDING SYSTEM VALUE VALUES (%s, %s, %s, %s, %s, %s, %s)"
    )
    for linha in (
        (Q_RICA, ATIV_RICA, "Qual é o monóxido de carbono?", "multipla", Jsonb(QUIMICA), "\\ce{CO}", "rico"),
        (Q_TEXTO, ATIV_TEXTO, "Qual é o monóxido de carbono?", "multipla", Jsonb(QUIMICA), "\\ce{CO}", "texto"),
        (Q_LACUNA, ATIV_LACUNA, "Se f(x) = x^2, então f(x) + 1 = ___", None, None, "\\(x^2+1\\) | \\(1+x^2\\)", "rico"),
    ):
        c.execute(inserir, linha)


def _alternativas(c, questao_id: int) -> list[str]:
    return c.execute("SELECT alternativas FROM public.questoes WHERE id = %s", (questao_id,)).fetchone()[0]


def _letra(c, questao_id: int, texto: str) -> str:
    return chr(97 + _alternativas(c, questao_id).index(texto))


def _responder(c, quem, questao_id, resposta):
    return questao._rpc(c, quem, "SELECT public.questao_responder(%s, %s, 5)", (questao_id, resposta))


@f5.e2e
def test_o_gatilho_grava_o_gabarito_exato_mesmo_com_o_empate() -> None:
    with _banco() as c:
        _semear(c)
        for q in (Q_RICA, Q_TEXTO):
            gravado = c.execute(
                "SELECT resposta_correta FROM public.questao_gabarito WHERE questao_id = %s", (q,)
            ).fetchone()[0]
            assert gravado == "\\ce{CO}"


@f5.e2e
def test_multipla_rica_pela_letra_nao_empata_maiuscula() -> None:
    with _banco() as c:
        _semear(c)
        assert _responder(c, f5.A, Q_RICA, _letra(c, Q_RICA, "\\ce{Co}"))["correta"] is False
        assert _responder(c, f5.B, Q_RICA, _letra(c, Q_RICA, "\\ce{CO}"))["correta"] is True


@f5.e2e
def test_multipla_rica_pelo_texto_do_app_antigo() -> None:
    with _banco() as c:
        _semear(c)
        assert _responder(c, f5.A, Q_RICA, "\\ce{Co}")["correta"] is False
        assert _responder(c, f5.B, Q_RICA, " \\ce{CO} ")["correta"] is True
        # Sem casar texto, letra nem índice: errado, e não a primeira alternativa parecida.
        assert _responder(c, f5.C, Q_RICA, "monóxido")["correta"] is False


@f5.e2e
def test_questao_texto_continua_com_a_regra_de_antes() -> None:
    with _banco() as c:
        _semear(c)
        # O texto comparável de antes empata as duas; a marca 'texto' mantém isso de propósito
        # (é o que a marca existe para não mudar). Fica registrado aqui.
        assert _responder(c, f5.A, Q_TEXTO, "\\ce{Co}")["correta"] is True
        assert _responder(c, f5.B, Q_TEXTO, "\\ce{CO2}")["correta"] is False


@pytest.mark.parametrize(
    ("resposta", "esperado"),
    [
        ("\\(x^2+1\\)", True),
        ("x^2 + 1", True),
        ("$1 + x^2$", True),  # a segunda resposta aceita
        ("x^2-1", False),  # fn_texto_estrito empataria
        ("X^2+1", False),  # maiúscula conta
        ("x^2+1+0", False),  # sem Levenshtein
        ("", False),
    ],
)
@f5.e2e
def test_lacuna_rica_sem_tirar_simbolo(resposta: str, esperado: bool) -> None:
    with _banco() as c:
        _semear(c)
        assert _responder(c, f5.A, Q_LACUNA, resposta)["correta"] is esperado


@f5.e2e
def test_as_copias_levam_a_marca() -> None:
    with _banco() as c:
        _semear(c)
        f5.como(c, f5.PROF)
        c.execute("SET ROLE authenticated")
        try:
            nova = c.execute("SELECT public.duplicar_atividade(%s, NULL)", (ATIV_RICA,)).fetchone()[0]
        finally:
            c.execute("RESET ROLE")
        assert c.execute("SELECT formato_texto FROM public.atividades WHERE id = %s", (nova,)).fetchone()[0] == "rico"
        copia = c.execute(
            "SELECT q.formato_texto, g.resposta_correta FROM public.questoes q "
            "JOIN public.questao_gabarito g ON g.questao_id = q.id WHERE q.atividade_id = %s",
            (nova,),
        ).fetchone()
        assert copia == ("rico", "\\ce{CO}")


@f5.e2e
def test_aluno_nao_chama_as_funcoes_novas() -> None:
    with _banco() as c:
        _semear(c)
        for sql in (
            "SELECT public.fn_questao_posicao_rica('[\"a\"]'::jsonb, 'a')",
            "SELECT public.fn_texto_rico_comparavel('a')",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                questao._rpc(c, f5.A, sql)


@f5.e2e
def test_downgrade_volta_e_tira_a_marca() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert c.execute(
            "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' "
            "AND column_name = 'formato_texto'"
        ).fetchone()[0] == 0
        definicao = c.execute(
            "SELECT pg_get_functiondef('public.fn_questao_confere(bigint,text)'::regprocedure)"
        ).fetchone()[0]
        assert "v_formato" not in definicao
