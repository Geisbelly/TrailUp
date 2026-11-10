"""`20261110_02`: código, numérica e expressão, com o gabarito fora de `questoes`.

Postgres local, esqueleto da produção, a cadeia que esta migration redefine (`20261108_01`,
`20261108_03`, as cópias de `20261011`, `20261018_05`) e a migration por cima.

Entram com o corpo de produção lido em 10/11, porque só existem lá e mudam o que se mede:

- os gatilhos de `questoes` (`test_e2e_texto_rico.PRODUCAO`): o espelho é quem levaria a esperada
  para `questao_gabarito`;
- o CHECK `atividades_tipo_conhecido`, `questao_gabarito_do_aluno` e `app_classe_da_atividade`;
- a RLS e as policies de `questoes` e de `questao_gabarito` (só a do professor), com os GRANTs.

Aluno e professor chamam com `SET ROLE authenticated`; a edge, com `SET ROLE service_role`.
"""

from __future__ import annotations

import uuid

import psycopg
import pytest
from psycopg.types.json import Jsonb

from tests import _f5_banco as f5
from tests import test_e2e_questao_corrigida_no_banco as questao
from tests import test_e2e_texto_rico as texto_rico

M = f5.modulo("20261110_02_respostas_ricas.py")
NOTAS_FILA = f5.modulo("20261018_05_notas_fila_aceita_apelidos_de_dissertativa.py")

# Corpos e policies de produção de 10/11 (pg_get_functiondef, pg_policies). Só existem lá.
PRODUCAO = r"""
CREATE OR REPLACE FUNCTION public.app_classe_da_atividade(p_atividade bigint)
 RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT t.classe_id FROM atividades a JOIN topicos t ON t.id = a.topico_id
   WHERE a.id = p_atividade
$function$;

ALTER TABLE public.atividades ADD CONSTRAINT atividades_tipo_conhecido
  CHECK (((tipo IS NULL) OR (tipo = ANY (ARRAY['quiz'::text, 'true_false'::text, 'fill_blank'::text, 'essay'::text, 'missao'::text]))));

ALTER TABLE public.questoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questao_gabarito ENABLE ROW LEVEL SECURITY;
CREATE POLICY aluno_select_questoes ON public.questoes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM atividades a JOIN topicos t ON t.id = a.topico_id
                   JOIN classe_aluno ca ON ca.classe_id = t.classe_id
                  WHERE a.id = questoes.atividade_id AND ca.aluno_id = auth.uid()));
CREATE POLICY professor_all_questoes ON public.questoes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM atividades a JOIN topicos t ON t.id = a.topico_id
                   JOIN classe c ON c.id = t.classe_id
                  WHERE a.id = questoes.atividade_id AND c.professor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM atividades a JOIN topicos t ON t.id = a.topico_id
                   JOIN classe c ON c.id = t.classe_id
                  WHERE a.id = questoes.atividade_id AND c.professor_id = auth.uid()));
CREATE POLICY questao_gabarito_professor ON public.questao_gabarito FOR ALL TO authenticated
  USING (app_classe_da_atividade((SELECT q.atividade_id FROM questoes q WHERE q.id = questao_gabarito.questao_id))
         IN (SELECT app_classes_do_professor() AS app_classes_do_professor))
  WITH CHECK (app_classe_da_atividade((SELECT q.atividade_id FROM questoes q WHERE q.id = questao_gabarito.questao_id))
         IN (SELECT app_classes_do_professor() AS app_classes_do_professor));
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.questoes, public.questao_gabarito TO authenticated;
"""

ATIV_NUM, ATIV_COD, ATIV_EXP, ATIV_ALHEIA = 700, 701, 702, 710
Q_NUM, Q_COD, Q_EXP, Q_MULT, Q_ALHEIA = 950, 951, 952, 953, 960
PROF2 = uuid.UUID(int=12)
FORA = uuid.UUID(int=24)  # aluno fora da turma


def _banco():
    copias = [s for m in texto_rico.COPIAS for s in f5.sql_de(m)]
    return f5.banco(
        questao.PRODUCAO,
        texto_rico.PRODUCAO,
        texto_rico.M.GABARITO_EM_TEXTO_PRODUCAO,
        questao._tabela_de_tentativas(),
        questao.PRAZO,
        *f5.sql_de(texto_rico.M_QUESTAO),
        *copias,
        texto_rico.GATILHOS,
        *f5.sql_de(texto_rico.M),
        *f5.sql_de(NOTAS_FILA),
        M.GABARITO_DO_ALUNO_PRODUCAO,
        PRODUCAO,
        *f5.sql_de(M),
    )


def _semear(c) -> None:
    f5.semear_turma(c)
    for t in ("atividades", "questoes", "questao_aluno", "atividade_tentativas", "atividade_aluno"):
        f5.afrouxa(c, t)
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES ('{PROF2}', 'p2@teste.invalid'), ('{FORA}', 'f@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{PROF2}', 'Prof 2');
INSERT INTO public.alunos (id, nome, email) VALUES ('{FORA}', 'Fora', 'f@teste.invalid');
UPDATE public.alunos SET modo_resposta = 'pensante' WHERE id = '{f5.B}';
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES (2, 1, '{PROF2}', 'T2');
INSERT INTO public.topicos (id, classe_id, nome, ordem) OVERRIDING SYSTEM VALUE VALUES (20, 2, 'Outra', 1);
INSERT INTO public.atividades (id, topico_id, titulo, tipo, metadata) OVERRIDING SYSTEM VALUE VALUES
  ({ATIV_NUM}, 10, 'Cinemática', 'numeric', '{{}}'),
  ({ATIV_COD}, 10, 'Laço', 'code', '{{}}'),
  ({ATIV_EXP}, 10, 'Derivada', 'expression', '{{}}'),
  ({ATIV_ALHEIA}, 20, 'Alheia', 'numeric', '{{}}');
"""
    )
    inserir = (
        "INSERT INTO public.questoes (id, atividade_id, enunciado, tipo, alternativas, resposta_correta, config_resposta) "
        "OVERRIDING SYSTEM VALUE VALUES (%s, %s, %s, %s, %s, %s, %s)"
    )
    for linha in (
        (Q_NUM, ATIV_NUM, "Velocidade média?", "numerica", None, None, Jsonb({"dimensao": "velocidade"})),
        (Q_COD, ATIV_COD, "Some 1..n", "codigo", None, None, Jsonb({"linguagem": "python"})),
        (Q_EXP, ATIV_EXP, "Derive x^2+2x", "expressao", None, None, Jsonb({"variaveis": ["x"]})),
        (Q_MULT, ATIV_NUM, "Unidade de velocidade?", "multipla", Jsonb(["kg", "m/s", "N"]), "m/s", None),
        (Q_ALHEIA, ATIV_ALHEIA, "Alheia", "numerica", None, None, None),
    ):
        c.execute(inserir, linha)
    # O console grava a esperada dos tipos novos direto aqui (o espelho não cria a linha).
    gabarito = "INSERT INTO public.questao_gabarito (questao_id, resposta_correta, criterios) VALUES (%s, %s, %s)"
    for linha in (
        (Q_NUM, "10 m/s", Jsonb({"tolerancia": 0.05, "tipo_tolerancia": "relativa"})),
        (Q_COD, "def soma(n):\n    return n * (n + 1) // 2", Jsonb(["usa fórmula fechada"])),
        (Q_EXP, "2x + 2", Jsonb({"dominio": [-10, 10], "pontos": 20})),
        (Q_ALHEIA, "3 m/s", None),
    ):
        c.execute(gabarito, linha)


def _como(c, quem, papel: str, sql: str, args: tuple = ()):
    f5.como(c, quem)
    c.execute(f"SET ROLE {papel}")
    try:
        return c.execute(sql, args).fetchall()
    finally:
        c.execute("RESET ROLE")


def _aluno(c, quem, sql, args=()):
    linhas = _como(c, quem, "authenticated", sql, args)
    return linhas[0][0] if linhas else None


def _servico(c, sql, args=()):
    return _como(c, None, "service_role", sql, args)[0][0]


def _gabarito(c, questao_id):
    return c.execute(
        "SELECT resposta_correta, criterios FROM public.questao_gabarito WHERE questao_id = %s", (questao_id,)
    ).fetchone()


REGISTRAR = "SELECT public.questao_registrar_correcao_servidor(%s, %s, %s, %s, 9)"


@f5.e2e
def test_espelho_nao_cria_nem_apaga_a_esperada_dos_tipos_novos() -> None:
    with _banco() as c:
        _semear(c)
        # O espelho pulou os tipos novos: a linha é a que o console gravou.
        assert _gabarito(c, Q_NUM)[0] == "10 m/s"
        # E salvar a questão de novo não a apaga com NULL.
        c.execute("UPDATE public.questoes SET enunciado = 'Velocidade média em m/s?' WHERE id = %s", (Q_NUM,))
        assert _gabarito(c, Q_NUM) == ("10 m/s", {"tolerancia": 0.05, "tipo_tolerancia": "relativa"})
        # A objetiva continua espelhada.
        assert _gabarito(c, Q_MULT)[0] == "m/s"


@f5.e2e
def test_tipo_novo_nao_aceita_gabarito_em_questoes() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.CheckViolation):
            c.execute("UPDATE public.questoes SET resposta_correta = '10 m/s' WHERE id = %s", (Q_NUM,))


@f5.e2e
def test_check_de_atividades() -> None:
    with _banco() as c:
        _semear(c)
        c.execute("INSERT INTO public.atividades (topico_id, titulo, tipo) VALUES (10, 'Nula', NULL)")
        with pytest.raises(psycopg.errors.CheckViolation):
            c.execute("INSERT INTO public.atividades (topico_id, titulo, tipo) VALUES (10, 'X', 'numerica')")


@f5.e2e
def test_aluno_nao_le_a_esperada_nem_os_criterios() -> None:
    with _banco() as c:
        _semear(c)
        assert _como(c, f5.A, "authenticated", "SELECT criterios FROM public.questao_gabarito") == []
        assert _como(c, f5.A, "authenticated",
                     "SELECT resposta_correta, config_resposta FROM public.questoes WHERE tipo = 'numerica'") == [
            (None, {"dimensao": "velocidade"})
        ]


@pytest.mark.parametrize("questao_id", [Q_NUM, Q_COD, Q_EXP])
@f5.e2e
def test_questao_responder_recusa_os_tipos_novos(questao_id: int) -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="questao_corrigida_no_servidor"):
            questao._responder(c, f5.A, questao_id, "10")
        assert c.execute("SELECT count(*) FROM public.questao_aluno").fetchone()[0] == 0
        # A objetiva segue pelo banco.
        assert questao._responder(c, f5.A, Q_MULT, "m/s")["correta"] is True


@f5.e2e
def test_aluno_nao_chama_as_funcoes_novas() -> None:
    with _banco() as c:
        _semear(c)
        for sql in (
            f"SELECT public.questao_conferencia_contexto('{f5.A}', {Q_NUM})",
            f"SELECT public.questao_registrar_correcao_servidor('{f5.A}', {Q_NUM}, '10 m/s', true, 5)",
            f"SELECT public.fn_questao_corrigida_por_ia({Q_COD})",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                _aluno(c, f5.A, sql)


@f5.e2e
def test_professor_grava_criterios_so_na_propria_turma() -> None:
    with _banco() as c:
        _semear(c)
        _como(c, f5.PROF, "authenticated",
              "INSERT INTO public.questao_gabarito (questao_id, resposta_correta, criterios) VALUES (%s, '12 m/s', %s) "
              "ON CONFLICT (questao_id) DO UPDATE SET resposta_correta = EXCLUDED.resposta_correta, "
              "criterios = EXCLUDED.criterios RETURNING questao_id",
              (Q_NUM, Jsonb({"tolerancia": 0.1, "tipo_tolerancia": "absoluta"})))
        assert _gabarito(c, Q_NUM) == ("12 m/s", {"tolerancia": 0.1, "tipo_tolerancia": "absoluta"})
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _como(c, f5.PROF, "authenticated",
                  "INSERT INTO public.questao_gabarito (questao_id, resposta_correta) VALUES (%s, '1 m/s') "
                  "ON CONFLICT (questao_id) DO UPDATE SET resposta_correta = EXCLUDED.resposta_correta "
                  "RETURNING questao_id", (Q_ALHEIA,))
        assert _gabarito(c, Q_ALHEIA)[0] == "3 m/s"


@f5.e2e
def test_contexto_da_conferencia() -> None:
    with _banco() as c:
        _semear(c)
        contexto = _servico(c, "SELECT public.questao_conferencia_contexto(%s, %s)", (f5.A, Q_NUM))
        assert contexto == {
            "tipo": "numerica",
            "resposta_esperada": "10 m/s",
            "criterios": {"tolerancia": 0.05, "tipo_tolerancia": "relativa"},
            "config_resposta": {"dimensao": "velocidade"},
        }
        # Código vai pela IA.
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="questao_nao_conferida_no_servidor"):
            _servico(c, "SELECT public.questao_conferencia_contexto(%s, %s)", (f5.A, Q_COD))
        # Quem não é da turma não lê a esperada.
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _servico(c, "SELECT public.questao_conferencia_contexto(%s, %s)", (FORA, Q_NUM))


@f5.e2e
def test_registro_do_servidor_usa_a_pontuacao_do_banco() -> None:
    with _banco() as c:
        _semear(c)
        # Modo imediato (A): o erro libera a esperada, como na múltipla, e grava a revelação.
        erro = _servico(c, REGISTRAR, (f5.A, Q_NUM, "12 m/s", False))
        assert (erro["correta"], erro["acertos_percentual"], erro["gabarito_liberado"], erro["resposta_correta"]) == (
            False, 0, True, "10 m/s")
        certo = _servico(c, REGISTRAR, (f5.A, Q_NUM, "10,0 m/s", True))
        assert (certo["acertos_percentual"], certo["regra"]) == (20, "viu_gabarito")
        # Modo pensante (B): o erro não libera; a repetida vale 50%.
        erro = _servico(c, REGISTRAR, (f5.B, Q_EXP, "2x", False))
        assert (erro["gabarito_liberado"], erro["resposta_correta"]) == (False, None)
        certo = _servico(c, REGISTRAR, (f5.B, Q_EXP, "2(x+1)", True))
        assert (certo["acertos_percentual"], certo["regra"], certo["gabarito_liberado"]) == (50, "resposta_repetida", True)
        # Primeira e certa: 100.
        assert _servico(c, REGISTRAR, (f5.C, Q_NUM, "10 m/s", True))["acertos_percentual"] == 100
        # Código não passa por aqui.
        with pytest.raises(psycopg.errors.InvalidParameterValue):
            _servico(c, REGISTRAR, (f5.C, Q_COD, "x", True))


@f5.e2e
def test_codigo_vai_pela_ia_e_nunca_libera_a_referencia() -> None:
    with _banco() as c:
        _semear(c)
        contexto = _servico(c, "SELECT public.questao_correcao_ia_contexto(%s, %s)", (f5.A, Q_COD))
        assert contexto["tipo"] == "codigo"
        assert contexto["config_resposta"] == {"linguagem": "python"}
        assert contexto["criterios"] == ["usa fórmula fechada"]
        assert contexto["resposta_esperada"].startswith("def soma")
        registrar = "SELECT public.questao_registrar_correcao_ia(%s, %s, %s, %s, %s, 30)"
        for _ in range(2):
            resultado = _servico(c, registrar, (f5.A, Q_COD, "for i in range(n): s += i", False, 40))
            assert (resultado["gabarito_liberado"], resultado["resposta_correta"]) == (False, None)
        revelar = _aluno(c, f5.A, "SELECT public.questao_revelar_gabarito(%s)", (Q_COD,))
        assert (revelar["gabarito_liberado"], revelar["resposta_correta"]) == (False, None)
        # Dois erros: a função antiga entregava a referência.
        antiga = _aluno(c, f5.A, "SELECT public.questao_gabarito_do_aluno(%s)", (Q_COD,))
        assert (antiga["gabarito_liberado"], antiga["resposta_correta"]) == (False, None)


@f5.e2e
def test_gabarito_do_aluno_continua_liberando_a_objetiva() -> None:
    with _banco() as c:
        _semear(c)
        questao._responder(c, f5.A, Q_MULT, "kg")
        questao._responder(c, f5.A, Q_MULT, "N")
        antiga = _aluno(c, f5.A, "SELECT public.questao_gabarito_do_aluno(%s)", (Q_MULT,))
        assert (antiga["gabarito_liberado"], antiga["resposta_correta"]) == (True, "m/s")


@f5.e2e
def test_copias_levam_config_e_gabarito() -> None:
    with _banco() as c:
        _semear(c)
        c.execute("UPDATE public.questao_gabarito SET criterios = %s WHERE questao_id = %s",
                  (Jsonb({"nota": "só a unidade"}), Q_MULT))
        f5.como(c, f5.PROF)
        c.execute("SET ROLE authenticated")
        try:
            nova = c.execute("SELECT public.duplicar_atividade(%s, NULL)", (ATIV_NUM,)).fetchone()[0]
            novo_topico = c.execute("SELECT public.duplicar_topico(%s)", (10,)).fetchone()[0]
        finally:
            c.execute("RESET ROLE")
        copias = c.execute(
            "SELECT q.tipo, q.resposta_correta, q.config_resposta, g.resposta_correta, g.criterios "
            "FROM public.questoes q LEFT JOIN public.questao_gabarito g ON g.questao_id = q.id "
            "WHERE q.atividade_id = %s ORDER BY q.id",
            (nova,),
        ).fetchall()
        assert copias == [
            ("numerica", None, {"dimensao": "velocidade"}, "10 m/s",
             {"tolerancia": 0.05, "tipo_tolerancia": "relativa"}),
            ("multipla", "m/s", None, "m/s", {"nota": "só a unidade"}),
        ]
        do_topico = c.execute(
            "SELECT q.tipo, g.resposta_correta, g.criterios FROM public.questoes q "
            "JOIN public.atividades a ON a.id = q.atividade_id "
            "LEFT JOIN public.questao_gabarito g ON g.questao_id = q.id "
            "WHERE a.topico_id = %s AND q.tipo IN ('codigo', 'expressao') ORDER BY q.tipo",
            (novo_topico,),
        ).fetchall()
        assert do_topico == [
            ("codigo", "def soma(n):\n    return n * (n + 1) // 2", ["usa fórmula fechada"]),
            ("expressao", "2x + 2", {"dominio": [-10, 10], "pontos": 20}),
        ]


@f5.e2e
def test_notas_fila_traz_o_codigo_com_a_referencia() -> None:
    with _banco() as c:
        _semear(c)
        _servico(c, "SELECT public.questao_registrar_correcao_ia(%s, %s, %s, %s, %s, 30)",
                 (f5.A, Q_COD, "for i in range(n): s += i", False, 40))
        linhas = _como(c, f5.PROF, "authenticated",
                       "SELECT atividade_id, gabarito, resposta FROM public.notas_fila(1) WHERE aluno_id = %s",
                       (f5.A,))
        assert (ATIV_COD, "def soma(n):\n    return n * (n + 1) // 2", "for i in range(n): s += i") in linhas
        assert all(a != ATIV_NUM for a, _, _ in linhas)


@f5.e2e
def test_downgrade_volta_e_tira_as_colunas() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        colunas = c.execute(
            "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' "
            "AND column_name IN ('config_resposta', 'criterios')"
        ).fetchone()[0]
        assert colunas == 0
        assert c.execute("SELECT to_regprocedure('public.questao_conferencia_contexto(uuid,bigint)')").fetchone()[0] is None
        f5.afrouxa(c, "atividades")
        with pytest.raises(psycopg.errors.CheckViolation):
            c.execute("INSERT INTO public.atividades (topico_id, titulo, tipo) VALUES (NULL, 'X', 'code')")


@f5.e2e
def test_downgrade_recusa_com_atividade_nova_gravada() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.CheckViolation):
            for sql in f5.sql_de(M, "downgrade"):
                c.execute(sql)
