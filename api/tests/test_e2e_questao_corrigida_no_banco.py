"""`20261108_01`: a questão é corrigida no banco, e o gabarito só sai quando o app o mostraria.

Postgres local, esqueleto da produção e a migration por cima. As chamadas do aluno rodam com
`SET ROLE authenticated`, para a falta de EXECUTE aparecer como na produção.

Funções que só existem em produção (schema não versionado) entram com o corpo de produção lido
em 07/11: `fn_texto_comparavel`, `fn_questao_resposta_em_lista` e `fn_questao_confere_lista`.
`questao_responder` e `fn_questao_confere` também eram só de produção; a migration as cria.

O que se mede:

- o oráculo fechou: `fn_questao_confere` sem EXECUTE para o aluno;
- objetiva no modo imediato: o erro devolve o gabarito e grava a revelação; a resposta seguinte
  vale 20%;
- modo pensante: o erro não devolve o gabarito; responder de novo vale 50%; "ver gabarito" exige
  resposta e grava a revelação;
- nova tentativa: a questão errada antes da tentativa aberta vale `1 − penalty_retry_pct`;
- lacuna e dissertativa com a tolerância do app ("15 min" para "15 minutos");
- dissertativa: nunca devolve a resposta esperada ao aluno; só a chave de serviço lê o contexto da
  IA e grava a nota dela;
- quem não é da turma, ou está fora do prazo, não grava nada;
- o downgrade devolve os corpos de produção.
"""

from __future__ import annotations

import json
import uuid

import psycopg
import pytest

from tests import _f5_banco as f5

M = f5.modulo("20261108_01_questao_corrigida_no_banco.py")
PRAZO = f5.modulo("20261020_04_economia_correcoes_e2e.py").PRAZO
TENTATIVAS = (f5.VERSOES / "20261101_13_tentativas_com_tempo_do_servidor.py")

# Corpos de produção de 07/11 (pg_get_functiondef), que não estão em migration nenhuma.
PRODUCAO = r"""
CREATE OR REPLACE FUNCTION public.fn_texto_comparavel(p_texto text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT btrim(lower(translate(
    COALESCE(p_texto, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  )));
$function$;

CREATE OR REPLACE FUNCTION public.fn_questao_resposta_em_lista(p_valor text)
 RETURNS text[] LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_json jsonb; v_saida text[];
BEGIN
  IF p_valor IS NULL OR btrim(p_valor) = '' THEN RETURN ARRAY[]::text[]; END IF;
  BEGIN v_json := p_valor::jsonb; EXCEPTION WHEN OTHERS THEN v_json := NULL; END;
  IF v_json IS NOT NULL AND jsonb_typeof(v_json) = 'array' THEN
    SELECT array_agg(item ORDER BY ord) INTO v_saida FROM (
      SELECT ord, CASE
        WHEN jsonb_typeof(e.valor) = 'array' THEN
          public.fn_texto_comparavel(e.valor ->> 0) || '=>' || public.fn_texto_comparavel(e.valor ->> 1)
        WHEN jsonb_typeof(e.valor) = 'object' THEN
          public.fn_texto_comparavel(COALESCE(e.valor ->> 'termo', e.valor ->> 'esquerda', e.valor ->> 'chave'))
          || '=>' || public.fn_texto_comparavel(COALESCE(e.valor ->> 'definicao', e.valor ->> 'direita', e.valor ->> 'valor'))
        ELSE public.fn_texto_comparavel(e.valor #>> '{}') END AS item
        FROM jsonb_array_elements(v_json) WITH ORDINALITY AS e(valor, ord)) x
     WHERE x.item <> '' AND x.item <> '=>';
    RETURN COALESCE(v_saida, ARRAY[]::text[]);
  END IF;
  SELECT array_agg(public.fn_texto_comparavel(parte) ORDER BY ord) INTO v_saida FROM (
    SELECT parte, ord FROM regexp_split_to_table(p_valor, '\|') WITH ORDINALITY AS t(parte, ord)) y
   WHERE public.fn_texto_comparavel(parte) <> '';
  RETURN COALESCE(v_saida, ARRAY[]::text[]);
END; $function$;

CREATE OR REPLACE FUNCTION public.fn_questao_confere_lista(p_tipo text, p_gabarito text, p_resposta text)
 RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_gab text[] := public.fn_questao_resposta_em_lista(p_gabarito);
  v_resp text[] := public.fn_questao_resposta_em_lista(p_resposta);
  v_tipo text := public.fn_texto_comparavel(COALESCE(p_tipo, ''));
BEGIN
  IF cardinality(v_gab) = 0 OR cardinality(v_resp) = 0 THEN RETURN false; END IF;
  IF v_tipo = 'ordenacao' THEN RETURN v_gab = v_resp; END IF;
  RETURN cardinality(v_gab) = cardinality(v_resp)
     AND NOT EXISTS (SELECT unnest(v_gab) EXCEPT SELECT unnest(v_resp))
     AND NOT EXISTS (SELECT unnest(v_resp) EXCEPT SELECT unnest(v_gab));
END; $function$;

-- O que a migration lê de alteracao_aluno (a tabela inteira é da 20261101_12).
CREATE TABLE IF NOT EXISTS public.alteracao_aluno (
  aluno_id uuid, atividade_id bigint, decisao_efetiva text, revisar_desde timestamptz, revisada_em timestamptz
);
"""


def _tabela_de_tentativas() -> str:
    texto = TENTATIVAS.read_text(encoding="utf-8")
    inicio = texto.index("CREATE TABLE IF NOT EXISTS public.atividade_tentativas (")
    return texto[inicio : texto.index(");", inicio) + 2]


ATIV_OBJ, ATIV_LACUNA, ATIV_DISS = 500, 501, 502
Q_MULT, Q_LACUNA, Q_DISS, Q_LISTA = 900, 901, 902, 903
D = uuid.UUID(int=24)  # aluno fora da turma


def _banco():
    return f5.banco(PRODUCAO, _tabela_de_tentativas(), PRAZO, *f5.sql_de(M))


def _semear(c) -> None:
    f5.semear_turma(c)
    for t in ("atividades", "questoes", "questao_aluno", "atividade_tentativas"):
        f5.afrouxa(c, t)
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES ('{D}', 'd@teste.invalid');
INSERT INTO public.alunos (id, nome, email) VALUES ('{D}', 'D', 'd@teste.invalid');
UPDATE public.alunos SET modo_resposta = 'pensante' WHERE id = '{f5.B}';
INSERT INTO public.atividades (id, topico_id, titulo, tipo, metadata) OVERRIDING SYSTEM VALUE VALUES
  ({ATIV_OBJ}, 10, 'Frações', 'quiz', '{{"grading_rules": {{"penalty_retry_pct": 30}}}}'),
  ({ATIV_LACUNA}, 10, 'Lacuna', 'fill_blank', '{{}}'),
  ({ATIV_DISS}, 10, 'Explique', 'quiz', '{{}}');
INSERT INTO public.questoes (id, atividade_id, enunciado, tipo, alternativas, resposta_correta) OVERRIDING SYSTEM VALUE VALUES
  ({Q_MULT}, {ATIV_OBJ}, 'Metade de 1?', 'multipla', '["1/4", "1/3", "1/2", "1"]', '1/2'),
  ({Q_LACUNA}, {ATIV_LACUNA}, 'O intervalo dura ___', NULL, NULL, '15 minutos | um quarto de hora'),
  ({Q_DISS}, {ATIV_DISS}, 'Compare 1/2 e 3/4', 'dissertativa', NULL, 'Converter para o mesmo denominador: 2/4 < 3/4.'),
  ({Q_LISTA}, {ATIV_OBJ}, 'Ordene', 'ordenacao', NULL, '["a","b","c"]');
INSERT INTO public.questao_gabarito (questao_id, resposta_correta)
  SELECT id, resposta_correta FROM public.questoes;
"""
    )


def _rpc(c, quem: uuid.UUID, sql: str, args: tuple = ()):
    f5.como(c, quem)
    c.execute("SET ROLE authenticated")
    try:
        linha = c.execute(sql, args).fetchone()
        return linha[0] if linha else None
    finally:
        c.execute("RESET ROLE")


def _responder(c, quem, questao, resposta):
    return _rpc(c, quem, "SELECT public.questao_responder(%s, %s, 12)", (questao, resposta))


def _revelado(c, quem, questao) -> bool:
    return c.execute(
        "SELECT count(*) FROM public.questao_gabarito_revelado WHERE aluno_id = %s AND questao_id = %s",
        (quem, questao),
    ).fetchone()[0] == 1


@f5.e2e
def test_o_oraculo_fechou() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _rpc(c, f5.A, "SELECT public.fn_questao_confere(%s, 'C')", (Q_MULT,))


@f5.e2e
def test_imediato_erro_devolve_o_gabarito_e_grava_a_revelacao() -> None:
    with _banco() as c:
        _semear(c)
        r = _responder(c, f5.A, Q_MULT, "1/3")
        assert (r["correta"], r["acertos_percentual"], r["regra"]) == (False, 0, "primeira")
        assert (r["gabarito_liberado"], r["resposta_correta"]) == (True, "1/2")
        assert _revelado(c, f5.A, Q_MULT)

        r = _responder(c, f5.A, Q_MULT, "1/2")
        assert (r["correta"], r["acertos_percentual"], r["regra"], r["tentativa"]) == (True, 20, "viu_gabarito", 2)
        gravadas = c.execute(
            "SELECT tentativa, correta, acertos_percentual, tempo_gasto_seg FROM public.questao_aluno "
            "WHERE aluno_id = %s ORDER BY tentativa",
            (f5.A,),
        ).fetchall()
        assert [(t, ok, float(p), s) for t, ok, p, s in gravadas] == [(1, False, 0.0, 12), (2, True, 20.0, 12)]


@f5.e2e
def test_acerto_de_primeira_vale_tudo_e_aceita_letra_e_indice() -> None:
    with _banco() as c:
        _semear(c)
        r = _responder(c, f5.C, Q_MULT, "1/2")
        assert (r["correta"], r["acertos_percentual"], r["regra"]) == (True, 100, "primeira")
        assert not _revelado(c, f5.C, Q_MULT)
        assert _responder(c, f5.A, Q_MULT, "C")["correta"] is True
        assert _responder(c, f5.B, Q_MULT, "2")["correta"] is True


@f5.e2e
def test_pensante_nao_ve_o_gabarito_ao_errar_e_ver_fica_gravado() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.RaiseException, match="questao_nao_respondida"):
            _rpc(c, f5.B, "SELECT public.questao_revelar_gabarito(%s)", (Q_MULT,))

        r = _responder(c, f5.B, Q_MULT, "1")
        assert (r["correta"], r["gabarito_liberado"], r["resposta_correta"]) == (False, False, None)
        assert not _revelado(c, f5.B, Q_MULT)

        r = _responder(c, f5.B, Q_MULT, "1/2")
        assert (r["correta"], r["acertos_percentual"], r["regra"]) == (True, 50, "resposta_repetida")

        r = _rpc(c, f5.B, "SELECT public.questao_revelar_gabarito(%s)", (Q_MULT,))
        assert (r["resposta_correta"], r["correta"], r["erros"]) == ("1/2", True, 1)
        assert _revelado(c, f5.B, Q_MULT)


@f5.e2e
def test_nova_tentativa_usa_a_penalidade_do_professor() -> None:
    with _banco() as c:
        _semear(c)
        c.execute(
            f"INSERT INTO public.atividade_tentativas (aluno_id, atividade_id, classe_id, numero, cronometrada, "
            f"iniciada_em, respondida_em) VALUES ('{f5.C}', {ATIV_OBJ}, 1, 1, false, now() - interval '1 hour', now())"
        )
        assert _responder(c, f5.C, Q_MULT, "1")["correta"] is False  # sem tentativa aberta
        c.execute(
            f"INSERT INTO public.atividade_tentativas (aluno_id, atividade_id, classe_id, numero, cronometrada) "
            f"VALUES ('{f5.C}', {ATIV_OBJ}, 1, 2, false)"
        )
        # O gabarito que C viu no erro foi antes desta tentativa: não conta aqui.
        r = _responder(c, f5.C, Q_MULT, "1/2")
        assert (r["correta"], r["acertos_percentual"], r["regra"]) == (True, 70, "nova_tentativa")


@f5.e2e
@pytest.mark.parametrize(
    ("resposta", "esperado"),
    [
        ("15 minutos", True),
        ("15 Minutos!", True),
        ("15 min", True),  # contém, 6 caracteres
        ("15 minuto", True),  # Levenshtein 1/10
        ("um quarto de hora", True),  # a segunda resposta aceita
        ("quinze", False),
        ("15", False),  # contém, mas com menos de 4 caracteres
        ("", False),
    ],
)
def test_lacuna_tem_a_tolerancia_do_app(resposta: str, esperado: bool) -> None:
    with _banco() as c:
        _semear(c)
        assert _responder(c, f5.A, Q_LACUNA, resposta)["correta"] is esperado


@f5.e2e
def test_lista_continua_com_a_regra_de_producao() -> None:
    with _banco() as c:
        _semear(c)
        assert _responder(c, f5.A, Q_LISTA, '["a","b","c"]')["correta"] is True
        assert _responder(c, f5.C, Q_LISTA, '["b","a","c"]')["correta"] is False


@f5.e2e
def test_dissertativa_nunca_devolve_a_resposta_esperada_ao_aluno() -> None:
    with _banco() as c:
        _semear(c)
        r = _responder(c, f5.A, Q_DISS, "Converter para o mesmo denominador: 2/4 < 3/4")
        assert (r["correta"], r["gabarito_liberado"], r["resposta_correta"]) == (True, False, None)
        r = _rpc(c, f5.A, "SELECT public.questao_revelar_gabarito(%s)", (Q_DISS,))
        assert r["resposta_correta"] is None
        assert not _revelado(c, f5.A, Q_DISS)

        for sql in (
            "SELECT public.questao_correcao_ia_contexto(%s, %s)",
            "SELECT public.questao_registrar_correcao_ia(%s, %s, 'texto', true, 100)",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                _rpc(c, f5.A, sql, (str(f5.A), Q_DISS))


@f5.e2e
def test_a_chave_de_servico_le_o_contexto_e_grava_a_nota_da_ia() -> None:
    with _banco() as c:
        _semear(c)
        f5.como(c, None)
        c.execute("SET ROLE service_role")
        try:
            ctx = c.execute("SELECT public.questao_correcao_ia_contexto(%s, %s)", (str(f5.B), Q_DISS)).fetchone()[0]
            assert ctx["resposta_esperada"].startswith("Converter")
            r = c.execute(
                "SELECT public.questao_registrar_correcao_ia(%s, %s, 'minha resposta', false, 40, 30)",
                (str(f5.B), Q_DISS),
            ).fetchone()[0]
            assert (r["correta"], r["acertos_percentual"], r["resposta_correta"]) == (False, 40, None)
            r = c.execute(
                "SELECT public.questao_registrar_correcao_ia(%s, %s, 'outra', true, 90, 30)", (str(f5.B), Q_DISS)
            ).fetchone()[0]
            assert (r["acertos_percentual"], r["regra"]) == (45, "resposta_repetida")
            with pytest.raises(psycopg.errors.InvalidParameterValue, match="questao_nao_dissertativa"):
                c.execute("SELECT public.questao_correcao_ia_contexto(%s, %s)", (str(f5.B), Q_MULT))
        finally:
            c.execute("RESET ROLE")


@f5.e2e
def test_fora_da_turma_ou_do_prazo_nao_grava_nada() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="questao_sem_permissao"):
            _responder(c, D, Q_MULT, "1/2")
        c.execute(f"UPDATE public.atividades SET data_entrega = now() - interval '1 day' WHERE id = {ATIV_OBJ}")
        with pytest.raises(psycopg.errors.RaiseException, match="prazo_expirado"):
            _responder(c, f5.A, Q_MULT, "1/2")
        assert c.execute("SELECT count(*) FROM public.questao_aluno").fetchone() == (0,)


@f5.e2e
def test_anon_nao_chama_nada() -> None:
    with _banco() as c:
        _semear(c)
        f5.como(c, None)
        c.execute("SET ROLE anon")
        try:
            for sql in ("SELECT public.questao_responder(900, '1/2')", "SELECT public.questao_revelar_gabarito(900)"):
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    c.execute(sql)
        finally:
            c.execute("RESET ROLE")


@f5.e2e
def test_downgrade_devolve_os_corpos_de_producao() -> None:
    with _banco() as c:
        _semear(c)
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        # Produção: o erro não devolve o gabarito, o 2º erro devolve; nada grava a revelação.
        assert _responder(c, f5.A, Q_MULT, "1")["resposta_correta"] is None
        assert _responder(c, f5.A, Q_MULT, "1/3")["resposta_correta"] == "1/2"
        assert not _revelado(c, f5.A, Q_MULT)
        assert _rpc(c, f5.A, "SELECT public.fn_questao_confere(%s, 'C')", (Q_MULT,)) is True
        sobrou = c.execute(
            "SELECT count(*) FROM pg_proc WHERE proname IN ('questao_revelar_gabarito', 'fn_questao_registrar_resposta', "
            "'fn_texto_parecido', 'fn_levenshtein', 'questao_correcao_ia_contexto')"
        ).fetchone()
        assert sobrou == (0,)


@f5.e2e
def test_levenshtein() -> None:
    with _banco() as c:
        casos = [("", "", 0), ("abc", "", 3), ("kitten", "sitting", 3), ("flaw", "lawn", 2), ("ação", "acao", 2)]
        for a, b, d in casos:
            assert c.execute("SELECT public.fn_levenshtein(%s, %s)", (a, b)).fetchone() == (d,), (a, b)


@f5.e2e
def test_respostas_aceitas_seguem_o_app() -> None:
    with _banco() as c:
        casos = {
            "a | b; c\nd": ["a", "b", "c", "d"],
            '["x", "y"]': ["x", "y"],
            json.dumps({"acceptedAnswers": ["p", "q|r"]}): ["p", "q", "r"],
            "  ": [],
        }
        for entrada, esperado in casos.items():
            assert c.execute("SELECT public.fn_questao_respostas_aceitas(%s)", (entrada,)).fetchone() == (esperado,)
