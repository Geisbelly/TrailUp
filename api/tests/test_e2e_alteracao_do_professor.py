"""`20261101_12`: a alteração do professor chega ao aluno, e a IA decide a revisão (decisões de 01/11).

Postgres local, esqueleto da produção, a cadeia da nota (`20261101_10`) e a `20261101_12` por cima.
`fn_texto_comparavel` não está no git (schema não versionado): o dublê normaliza como ela (caixa,
espaço e acento), o bastante para a recorreção casar "B" com "b ".

O que se mede:

- só o professor da turma registra alteração, e só de quem já viu ou fez; a API (sem sessão) não;
- saves seguidos do mesmo item viram uma linha; linha já reivindicada não recebe mais nada;
- gabarito corrigido recorrige quem errou pelo gabarito velho, e ninguém perde ponto;
- fila do worker: folga, reivindicação, espera entre falhas, e parada sem inventar decisão;
- decisão da IA: cosmética não avisa; revisão só para quem fez; aviso entra em `notificacoes_ia`;
- nota: a de antes vale até refazer, depois a maior;
- revisão feita quando as questões mudadas são respondidas depois do pedido;
- o professor desfaz (e só o da turma), o aluno marca como visto (só o próprio);
- RLS: o aluno não lê o gabarito de antes; o downgrade devolve a conta da nota.
"""

from __future__ import annotations

from decimal import Decimal

import psycopg
import pytest

from tests import _f5_banco as f5
from tests.test_e2e_nota_media_da_matricula import _banco as _banco_da_nota

M12 = f5.modulo("20261101_12_alteracao_do_professor.py")
M_GABARITO = f5.modulo("20261018_02_guard_de_jsonb_nulo_nas_questoes.py")
RETENCAO = (f5.VERSOES / "20261024_03_retencao_e_expurgo.py").read_text(encoding="utf-8")
POSSE = (f5.VERSOES / "20260826_09_rls_posse_por_tabela.py").read_text(encoding="utf-8")


def _trecho(texto: str, inicio: str, fim: str) -> str:
    a = texto.index(inicio)
    return texto[a : texto.index(fim, a) + len(fim)]


DEPENDENCIAS = [
    _trecho(RETENCAO, "CREATE TABLE IF NOT EXISTS public.retencao_politica (", ");"),
    _trecho(POSSE, "CREATE OR REPLACE FUNCTION public.app_classes_do_professor()", "$$;"),
    """
CREATE OR REPLACE FUNCTION public.fn_texto_comparavel(p text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(btrim(translate(COALESCE(p, ''), 'áàâãéêíóôõúç', 'aaaaeeiooouc')), '\\s+', ' ', 'g'))
$$;
""",
    M_GABARITO.GABARITO_CORRIGIDA,
]

OUTRO_PROF = f5.uuid.UUID(int=12)
ATIVIDADE, Q1, Q2, CONTEUDO = 500, 900, 901, 700


def _banco():
    return _banco_da_nota(extra=(*DEPENDENCIAS, *f5.sql_de(M12)))


def _semear(c) -> None:
    f5.semear_turma(c)
    for t in ("atividades", "atividade_aluno", "conteudos", "conteudo_aluno", "questoes", "questao_aluno"):
        f5.afrouxa(c, t)
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES ('{OUTRO_PROF}', 'p2@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{OUTRO_PROF}', 'Outro');
INSERT INTO public.atividades (id, topico_id, titulo, pontuacao_maxima) OVERRIDING SYSTEM VALUE
  VALUES ({ATIVIDADE}, 10, 'Frações', 10);
INSERT INTO public.questoes (id, atividade_id, enunciado, tipo, alternativas, resposta_correta) OVERRIDING SYSTEM VALUE
  VALUES ({Q1}, {ATIVIDADE}, 'Quanto é 1/2 + 1/2?', 'multiple_choice', '["1", "2", "1/4"]', '2'),
         ({Q2}, {ATIVIDADE}, 'Quanto é 1/4 + 1/4?', 'multiple_choice', '["1/2", "1/8"]', '1/2');
INSERT INTO public.conteudos (id, topico_id, titulo, tipo, conteudo) OVERRIDING SYSTEM VALUE
  VALUES ({CONTEUDO}, 10, 'Introdução', 'texto', 'Uma fração é...');
-- A fez a atividade (errou Q1 pelo gabarito velho), B só abriu, C nunca tocou.
INSERT INTO public.atividade_aluno (aluno_id, atividade_id, status, pontuacao_obtida, pontuacao_maxima, acertos_percentual)
  VALUES ('{f5.A}', {ATIVIDADE}, 'concluido', 5, 10, 50),
         ('{f5.B}', {ATIVIDADE}, 'em andamento', NULL, NULL, 0),
         ('{f5.C}', {ATIVIDADE}, 'não iniciado', NULL, NULL, 0);
INSERT INTO public.questao_aluno (aluno_id, questao_id, atividade_id, tentativa, resposta, correta, acertos_percentual)
  VALUES ('{f5.A}', {Q1}, {ATIVIDADE}, 1, '1', false, 0),
         ('{f5.A}', {Q2}, {ATIVIDADE}, 1, '1/2', true, 100);
INSERT INTO public.conteudo_aluno (aluno_id, conteudo_id, status, percentual_concluido)
  VALUES ('{f5.A}', {CONTEUDO}, 'concluido', 100), ('{f5.B}', {CONTEUDO}, 'não iniciado', 0),
         ('{f5.C}', {CONTEUDO}, 'não iniciado', 0);
"""
    )
    c.execute(f"SELECT public.trailup_recalcular_classe_aluno('{f5.A}', {f5.TURMA})")


def _alteracoes(c):
    return c.execute(
        "SELECT id, alvo_tipo, status, jsonb_array_length(mudancas) FROM public.alteracao_professor ORDER BY id"
    ).fetchall()


def _alunos(c, alteracao_id):
    return {
        str(r[0]): r[1:]
        for r in c.execute(
            "SELECT aluno_id, situacao, decisao_efetiva FROM public.alteracao_aluno WHERE alteracao_id = %s",
            (alteracao_id,),
        ).fetchall()
    }


def _vence(c) -> None:
    c.execute("UPDATE public.alteracao_professor SET proxima_tentativa_em = now() - interval '1 second'")


def _nota(c, aluno=f5.A):
    return c.execute(
        'SELECT "notaMedia" FROM public.classe_aluno WHERE aluno_id = %s AND classe_id = %s', (aluno, f5.TURMA)
    ).fetchone()[0]


def _decide(c, alteracao_id, classificacao="relevante", alunos="[]"):
    f5.como(c, None)
    return c.execute(
        "SELECT public.fn_alteracao_registrar_decisao(%s, %s, 'Questão 1 reescrita.', 'Mudou o enunciado.', %s::jsonb)",
        (alteracao_id, classificacao, alunos),
    ).fetchone()[0]


def _revisar_a(c) -> int:
    f5.como(c, f5.PROF)
    c.execute(f"UPDATE public.questoes SET enunciado = 'Some 1/2 com 1/2.' WHERE id = {Q1}")
    (alt,) = c.execute("SELECT max(id) FROM public.alteracao_professor WHERE status = 'pendente_analise'").fetchone()
    _decide(c, alt, alunos=f'[{{"aluno_id": "{f5.A}", "revisar": true, "motivo": "acertou pouco"}}]')
    return alt


@f5.e2e
def test_so_o_professor_da_turma_registra_e_so_de_quem_ja_viu_ou_fez() -> None:
    with _banco() as c:
        _semear(c)
        f5.como(c, None)  # a API, sem sessão
        c.execute(f"UPDATE public.atividades SET metadata = '{{\"boss\": 1}}' WHERE id = {ATIVIDADE}")
        f5.como(c, OUTRO_PROF)  # sessão de outro professor
        c.execute(f"UPDATE public.atividades SET titulo = 'X' WHERE id = {ATIVIDADE}")
        assert _alteracoes(c) == []

        f5.como(c, f5.PROF)
        c.execute(f"UPDATE public.questoes SET enunciado = 'Some 1/2 com 1/2.' WHERE id = {Q1}")
        ((alt, alvo, status, n),) = _alteracoes(c)
        assert (alvo, status, n) == ("atividade", "pendente_analise", 1)
        assert _alunos(c, alt) == {str(f5.A): ("fez", "pendente_analise"), str(f5.B): ("viu", "pendente_analise")}
        (mudanca,) = c.execute("SELECT mudancas -> 0 FROM public.alteracao_professor").fetchone()
        assert mudanca["campos"] == ["enunciado"] and mudanca["depois"] == {"enunciado": "Some 1/2 com 1/2."}

        # Reordenar não conta; conteúdo que só A concluiu entra só para A.
        c.execute(f"UPDATE public.conteudos SET ordem = 3 WHERE id = {CONTEUDO}")
        assert len(_alteracoes(c)) == 1
        c.execute(f"UPDATE public.conteudos SET conteudo = 'Uma fração representa...' WHERE id = {CONTEUDO}")
        alt_c = _alteracoes(c)[1][0]
        assert _alunos(c, alt_c) == {str(f5.A): ("fez", "pendente_analise")}


@f5.e2e
def test_saves_seguidos_viram_uma_linha_ate_o_worker_pegar() -> None:
    with _banco() as c:
        _semear(c)
        f5.como(c, f5.PROF)
        c.execute(f"UPDATE public.questoes SET enunciado = 'v2' WHERE id = {Q1}")
        c.execute(f"UPDATE public.questoes SET enunciado = 'v3' WHERE id = {Q1}")
        c.execute(f"INSERT INTO public.questoes (atividade_id, enunciado, tipo) VALUES ({ATIVIDADE}, 'Nova', 'essay')")
        assert [(r[2], r[3]) for r in _alteracoes(c)] == [("pendente_analise", 3)]

        f5.como(c, None)
        assert c.execute("SELECT * FROM public.fn_alteracao_reivindicar(5, 600)").fetchall() == []  # folga
        _vence(c)
        (alt,) = c.execute("SELECT * FROM public.fn_alteracao_reivindicar(5, 600)").fetchone()

        f5.como(c, f5.PROF)
        c.execute(f"UPDATE public.questoes SET enunciado = 'v4' WHERE id = {Q1}")
        linhas = _alteracoes(c)
        assert len(linhas) == 2 and linhas[0][0] == alt and linhas[0][3] == 3


@f5.e2e
def test_gabarito_corrigido_recorrige_e_ninguem_perde_ponto() -> None:
    with _banco() as c:
        _semear(c)
        assert _nota(c) == Decimal("5.00")
        f5.como(c, f5.PROF)
        # O gabarito de Q1 estava errado: era "1". A marcou "1" e levou errado.
        c.execute(f"UPDATE public.questoes SET resposta_correta = '1' WHERE id = {Q1}")
        assert c.execute(f"SELECT correta FROM public.questao_aluno WHERE questao_id = {Q1}").fetchone() == (True,)
        obtida, acertos = c.execute(
            f"SELECT pontuacao_obtida, acertos_percentual FROM public.atividade_aluno"
            f" WHERE aluno_id = '{f5.A}' AND atividade_id = {ATIVIDADE}"
        ).fetchone()
        assert (obtida, acertos) == (Decimal("10.00"), Decimal("100.00"))
        assert _nota(c) == Decimal("10.00")
        (alt,) = c.execute("SELECT id FROM public.alteracao_professor").fetchone()
        assert c.execute(
            "SELECT recorrigida FROM public.alteracao_aluno WHERE alteracao_id = %s AND aluno_id = %s", (alt, f5.A)
        ).fetchone() == (True,)

        # Agora Q2 muda de gabarito: A tinha acertado pelo velho e não perde.
        c.execute(f"UPDATE public.questoes SET resposta_correta = '1/8' WHERE id = {Q2}")
        assert c.execute(f"SELECT correta FROM public.questao_aluno WHERE questao_id = {Q2}").fetchone() == (True,)
        assert _nota(c) == Decimal("10.00")


@f5.e2e
def test_sem_modelo_espaca_e_para_sem_inventar_decisao() -> None:
    with _banco() as c:
        _semear(c)
        f5.como(c, f5.PROF)
        c.execute(f"UPDATE public.atividades SET descricao = 'Nova' WHERE id = {ATIVIDADE}")
        f5.como(c, None)
        for _ in range(M12.MAX_TENTATIVAS):
            _vence(c)
            (alt,) = c.execute("SELECT * FROM public.fn_alteracao_reivindicar(5, 600)").fetchone()
            c.execute("SELECT public.fn_alteracao_falhou(%s, 'sem modelo')", (alt,))
        _vence(c)
        assert c.execute("SELECT * FROM public.fn_alteracao_reivindicar(5, 600)").fetchall() == []
        assert _alteracoes(c)[0][2] == "pendente_analise"
        assert set(d for _, d in _alunos(c, alt).values()) == {"pendente_analise"}
        assert c.execute("SELECT count(*) FROM public.notificacoes_ia").fetchone() == (0,)


@f5.e2e
def test_cosmetica_nao_avisa_e_relevante_avisa_pelo_motor() -> None:
    with _banco() as c:
        _semear(c)
        f5.como(c, f5.PROF)
        c.execute(f"UPDATE public.questoes SET enunciado = 'Quanto e 1/2 + 1/2?' WHERE id = {Q1}")
        (alt,) = c.execute("SELECT id FROM public.alteracao_professor").fetchone()
        assert _decide(c, alt, "cosmetica") == 2
        assert set(d for _, d in _alunos(c, alt).values()) == {"cosmetica"}
        assert c.execute("SELECT count(*) FROM public.notificacoes_ia").fetchone() == (0,)
        assert _decide(c, alt, "relevante") == 0  # já decidida: nada muda

        alt = _revisar_a(c)
        assert _alunos(c, alt) == {str(f5.A): ("fez", "revisar"), str(f5.B): ("viu", "destacar")}
        avisos = c.execute(
            "SELECT aluno_id, titulo, contexto ->> 'decisao', contexto ->> 'topico_id', origem"
            " FROM public.notificacoes_ia ORDER BY aluno_id"
        ).fetchall()
        assert [(str(a), t, d, tp, o) for a, t, d, tp, o in avisos] == [
            (str(f5.A), "Atividade para revisar", "revisar", "10", "professor"),
            (str(f5.B), "Atividade atualizada", "destacar", "10", "professor"),
        ]


@f5.e2e
def test_revisao_so_para_quem_fez() -> None:
    with _banco() as c:
        _semear(c)
        f5.como(c, f5.PROF)
        c.execute(f"UPDATE public.questoes SET enunciado = 'v2' WHERE id = {Q1}")
        (alt,) = c.execute("SELECT id FROM public.alteracao_professor").fetchone()
        _decide(c, alt, alunos=f'[{{"aluno_id": "{f5.B}", "revisar": true}}]')
        assert _alunos(c, alt)[str(f5.B)] == ("viu", "destacar")


@f5.e2e
def test_nota_antiga_vale_ate_refazer_e_depois_a_maior() -> None:
    with _banco() as c:
        _semear(c)
        _revisar_a(c)
        assert c.execute(
            "SELECT nota_anterior, maxima_anterior FROM public.alteracao_aluno WHERE aluno_id = %s", (f5.A,)
        ).fetchone() == (Decimal("5"), Decimal("10"))

        # O app regrava a nota ao refazer (upsert de registrarConclusao). Pior: a de antes fica.
        c.execute(
            f"UPDATE public.atividade_aluno SET pontuacao_obtida = 2 WHERE aluno_id = '{f5.A}' AND atividade_id = {ATIVIDADE}"
        )
        assert _nota(c) == Decimal("5.00")
        c.execute(
            f"UPDATE public.atividade_aluno SET pontuacao_obtida = 9 WHERE aluno_id = '{f5.A}' AND atividade_id = {ATIVIDADE}"
        )
        assert _nota(c) == Decimal("9.00")
        # Pontos da atividade dobram: a de antes vale na proporção (5/10 de 20).
        c.execute(
            f"UPDATE public.atividade_aluno SET pontuacao_obtida = 4, pontuacao_maxima = 20 WHERE aluno_id = '{f5.A}'"
        )
        assert _nota(c) == Decimal("5.00")


@f5.e2e
def test_revisao_feita_quando_as_questoes_mudadas_sao_respondidas_depois_do_pedido() -> None:
    with _banco() as c:
        _semear(c)
        _revisar_a(c)
        revisada = "SELECT revisada_em IS NOT NULL FROM public.alteracao_aluno WHERE aluno_id = %s"
        f5.como(c, f5.A)
        c.execute(
            f"INSERT INTO public.questao_aluno (aluno_id, questao_id, atividade_id, tentativa, resposta, correta)"
            f" VALUES ('{f5.A}', {Q2}, {ATIVIDADE}, 2, '1/2', true)"
        )
        assert c.execute(revisada, (f5.A,)).fetchone() == (False,)  # Q2 não mudou
        c.execute(
            f"INSERT INTO public.questao_aluno (aluno_id, questao_id, atividade_id, tentativa, resposta, correta)"
            f" VALUES ('{f5.A}', {Q1}, {ATIVIDADE}, 2, '2', true)"
        )
        assert c.execute(revisada, (f5.A,)).fetchone() == (True,)


@f5.e2e
def test_o_professor_da_turma_desfaz_e_o_aluno_marca_o_que_viu() -> None:
    with _banco() as c:
        _semear(c)
        alt = _revisar_a(c)
        for quem in (OUTRO_PROF, f5.A):
            f5.como(c, quem)
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute("SELECT public.alteracao_decidir(%s, %s, 'destacar')", (alt, f5.A))

        f5.como(c, f5.PROF)
        assert c.execute("SELECT public.alteracao_decidir(%s, %s, 'destacar')", (alt, f5.A)).fetchone() == (1,)
        assert _alunos(c, alt)[str(f5.A)] == ("fez", "destacar")
        assert c.execute("SELECT public.alteracao_decidir(%s, NULL, 'revisar')", (alt,)).fetchone() == (1,)  # B só viu
        c.execute("SELECT public.alteracao_decidir(%s, NULL, 'ia')", (alt,))
        assert _alunos(c, alt)[str(f5.A)] == ("fez", "revisar")

        f5.como(c, f5.B)
        assert c.execute("SELECT public.alteracao_marcar_vista(NULL, %s)", (ATIVIDADE,)).fetchone() == (1,)
        vistas = c.execute("SELECT aluno_id FROM public.alteracao_aluno WHERE vista_em IS NOT NULL").fetchall()
        assert [str(v) for (v,) in vistas] == [str(f5.B)]


@f5.e2e
def test_rls_o_aluno_le_so_o_proprio_e_nunca_o_gabarito_de_antes() -> None:
    with _banco() as c:
        _semear(c)
        _revisar_a(c)
        for quem, alteracoes, linhas in ((f5.A, 0, 1), (f5.C, 0, 0), (f5.PROF, 1, 2), (OUTRO_PROF, 0, 0)):
            f5.como(c, quem)
            c.execute("SET ROLE authenticated")
            try:
                assert c.execute("SELECT count(*) FROM public.alteracao_professor").fetchone() == (alteracoes,)
                assert c.execute("SELECT count(*) FROM public.alteracao_aluno").fetchone() == (linhas,)
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    c.execute("UPDATE public.alteracao_aluno SET decisao = 'cosmetica'")
            finally:
                c.execute("RESET ROLE")


@f5.e2e
def test_downgrade_devolve_a_conta_da_nota() -> None:
    with _banco() as c:
        _semear(c)
        _revisar_a(c)
        f5.como(c, None)
        for sql in f5.sql_de(M12, "downgrade"):
            c.execute(sql)
        assert c.execute("SELECT to_regclass('public.alteracao_aluno')").fetchone() == (None,)
        c.execute(f"UPDATE public.atividade_aluno SET pontuacao_obtida = 2 WHERE aluno_id = '{f5.A}'")
        assert _nota(c) == Decimal("2.00")
