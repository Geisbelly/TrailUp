"""`20261110_03`: a fila de correção traz só o que o professor corrige.

Banco local com a cadeia do e2e das respostas ricas (`20261110_02` e o que ela redefine) e esta
migration por cima. O professor chama `notas_fila` como `authenticated`, como o console.

O caso de produção que motivou: atividade com `tipo` NULL e uma questão de múltipla escolha,
respondida, aparecia como pendente de correção (atividade 1367, turma 66, 10/11).
"""

from __future__ import annotations

from tests import _f5_banco as f5
from tests import test_e2e_respostas_ricas as ricas

pytestmark = f5.e2e

M = f5.modulo("20261110_03_fila_de_notas_so_o_que_o_professor_corrige.py")

SEM_TIPO, V_OU_F, DISSERTATIVA, MISTA, ENTREGA = 800, 801, 802, 803, 804
Q_SEM_TIPO, Q_VF, Q_DISS, Q_MISTA_OBJ, Q_MISTA_DISS = 970, 971, 972, 973, 974


def _banco(*, com_a_migration: bool = True):
    return f5.banco(*_corpos(), *(f5.sql_de(M) if com_a_migration else []))


def _corpos() -> list[str]:
    copias = [s for m in ricas.texto_rico.COPIAS for s in f5.sql_de(m)]
    q, tr = ricas.questao, ricas.texto_rico
    return [
        q.PRODUCAO, tr.PRODUCAO, tr.M.GABARITO_EM_TEXTO_PRODUCAO, q._tabela_de_tentativas(), q.PRAZO,
        *f5.sql_de(tr.M_QUESTAO), *copias, tr.GATILHOS, *f5.sql_de(tr.M), *f5.sql_de(ricas.NOTAS_FILA),
        ricas.M.GABARITO_DO_ALUNO_PRODUCAO, ricas.PRODUCAO, *f5.sql_de(ricas.M),
    ]


def _semear(c) -> None:
    ricas._semear(c)
    c.execute(
        """
INSERT INTO public.atividades (id, topico_id, titulo, tipo, data_entrega) OVERRIDING SYSTEM VALUE VALUES
  (%s, 10, 'Desafio: encontre o x', NULL, NULL),
  (%s, 10, 'Certo ou errado', 'true_false', NULL),
  (%s, 10, 'Explique', 'essay', NULL),
  (%s, 10, 'Quiz com uma aberta', 'quiz', NULL),
  (%s, 10, 'Trabalho', 'essay', now() - interval '1 day')
""",
        (SEM_TIPO, V_OU_F, DISSERTATIVA, MISTA, ENTREGA),
    )
    c.execute(
        """
INSERT INTO public.questoes (id, atividade_id, enunciado, tipo, alternativas, resposta_correta) OVERRIDING SYSTEM VALUE VALUES
  (%s, %s, 'Quanto vale x?', 'multipla', '["1", "2", "3"]', '2'),
  (%s, %s, 'O céu é azul?', 'verdadeiro_falso', NULL, 'verdadeiro'),
  (%s, %s, 'Por que 1/2 > 1/3?', 'dissertativa', NULL, 'Partes maiores.'),
  (%s, %s, 'Qual é a maior?', 'multipla', '["1/2", "1/3"]', '1/2'),
  (%s, %s, 'Justifique', 'dissertativa', NULL, 'Denominador menor.')
""",
        (Q_SEM_TIPO, SEM_TIPO, Q_VF, V_OU_F, Q_DISS, DISSERTATIVA, Q_MISTA_OBJ, MISTA, Q_MISTA_DISS, MISTA),
    )
    # As respostas entram como dono (a RPC grava assim); a fila só lê.
    for questao, atividade, resposta, correta in (
        (Q_SEM_TIPO, SEM_TIPO, "2", True),
        (Q_VF, V_OU_F, "verdadeiro", True),
        (Q_DISS, DISSERTATIVA, "Porque a parte é maior.", None),
        (Q_MISTA_DISS, MISTA, "O denominador é menor.", None),
        (Q_MISTA_OBJ, MISTA, "1/2", True),  # a última da atividade, de propósito
    ):
        c.execute(
            "INSERT INTO public.questao_aluno (aluno_id, questao_id, atividade_id, tentativa, resposta, correta)"
            " VALUES (%s, %s, %s, 1, %s, %s)",
            (f5.A, questao, atividade, resposta, correta),
        )


def _fila(c) -> dict[int, tuple]:
    linhas = ricas._como(
        c, f5.PROF, "authenticated",
        "SELECT atividade_id, enunciado, resposta FROM public.notas_fila(1) WHERE aluno_id = %s", (f5.A,),
    )
    return {a: (e, r) for a, e, r in linhas}


def test_objetiva_nao_espera_o_professor_qualquer_que_seja_o_tipo_da_atividade() -> None:
    with _banco() as c:
        _semear(c)
        fila = _fila(c)
        assert SEM_TIPO not in fila  # o caso de produção
        assert V_OU_F not in fila
        assert ricas.ATIV_NUM not in fila and ricas.ATIV_EXP not in fila


def test_dissertativa_e_entrega_continuam_na_fila() -> None:
    with _banco() as c:
        _semear(c)
        fila = _fila(c)
        assert fila[DISSERTATIVA] == ("Por que 1/2 > 1/3?", "Porque a parte é maior.")
        # Trabalho sem questão, prazo vencido: aparece como sem entrega, como antes.
        assert fila[ENTREGA] == ("", None)


def test_mista_mostra_a_questao_aberta_e_a_resposta_dela() -> None:
    with _banco() as c:
        _semear(c)
        assert _fila(c)[MISTA] == ("Justifique", "O denominador é menor.")


def test_antes_desta_migration_a_objetiva_sem_tipo_caia_na_fila() -> None:
    # Prova que o teste mede a mudança: com a fila da 20261110_02, o caso de produção aparece.
    with _banco(com_a_migration=False) as c:
        _semear(c)
        assert SEM_TIPO in _fila(c)


def test_downgrade_devolve_a_fila_da_20261110_02() -> None:
    with _banco() as c:
        _semear(c)
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert SEM_TIPO in _fila(c)
