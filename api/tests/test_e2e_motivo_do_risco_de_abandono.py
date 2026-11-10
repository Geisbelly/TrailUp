"""`20261110_01`: o rótulo do que pesou no risco de abandono, medido em Postgres.

A função recebe as mesmas nove entradas de `trailup_risco_evasao`; a coluna só sai quando a faixa é do
modelo e não é `normal`.
"""

from __future__ import annotations

import pytest

from tests import _f5_banco as f5
from tests.test_e2e_nota_media_da_matricula import _banco as _banco_ate_10

M = f5.modulo("20261110_01_motivo_do_risco_de_abandono.py")
CLIQUES = 14


def _banco():
    return _banco_ate_10(extra=tuple(f5.sql_de(M)))


def _motivo(c, *args) -> str | None:
    return c.execute(
        "SELECT public.trailup_motivo_risco_evasao(%s, %s, %s, %s, %s, %s, %s, %s, %s)", args
    ).fetchone()[0]


# (cliques semana, 4 semanas anteriores, semanas sem acesso, semana do curso, nota, feitas, perdidas,
#  taxa, atraso)
EM_DIA = (20, 80, 0, 10, 80, 4, 0, 1, -1)


@f5.e2e
@pytest.mark.parametrize(
    ("entradas", "esperado"),
    [
        (EM_DIA, None),  # nada se destaca
        ((20, 80, 0, 10, 80, 2, 2, 0.5, -1), "entregas_perdidas"),
        ((2, 80, 0, 10, 80, 4, 0, 1, -1), "uso_caiu"),  # 2 contra média de 20
        ((20, 80, 0, 10, 80, 4, 0, 1, 12), "entrega_atrasada"),  # 12 dias: 0,23
        ((20, 80, 0, 10, -1, 0, 0, 1, 0), "sem_nota"),
        ((20, 80, 0, 10, 20, 4, 0, 1, -1), "nota_baixa"),
        # A semana do curso não é motivo, por maior que seja o risco que ela traz.
        ((20, 80, 0, 0, 80, 4, 0, 1, -1), None),
        # Duas perdas pesam mais que a nota baixa.
        ((20, 80, 0, 10, 30, 2, 2, 0.5, -1), "entregas_perdidas"),
    ],
)
def test_funcao_nomeia_a_entrada_que_mais_pesou(entradas, esperado) -> None:
    with _banco() as c:
        assert _motivo(c, *entradas) == esperado


@f5.e2e
def test_motivo_so_quando_a_faixa_e_do_modelo_e_nao_e_normal() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        for t in ("atividades", "questoes"):
            f5.afrouxa(c, t)
        # Aluno novo, ativo hoje, num tópico começado com atividade avaliável e sem nota: o modelo decide.
        quando = c.execute("SELECT now() - interval '1 hour'").fetchone()[0]
        c.execute("UPDATE public.classe_aluno SET created_at = now() WHERE aluno_id = %s", (f5.A,))
        sid = f5.uuid.uuid4()
        f5.sessao(c, sid, f5.A, quando, None)
        f5.tempo(c, sid, f5.A, "topic", 10, 60, 0, quando)
        for _ in range(CLIQUES):
            f5.evento(c, sid, f5.A, "tap", 10, quando, "interaction")
        c.execute(
            "INSERT INTO public.atividades (id, topico_id, titulo, pontuacao_maxima) OVERRIDING SYSTEM VALUE"
            " VALUES (500, 10, 'A', NULL)"
        )
        c.execute("INSERT INTO public.questoes (atividade_id, enunciado) VALUES (500, 'Q')")
        c.execute(
            "INSERT INTO public.topico_aluno (aluno_id, topico_id, status, percentual_concluido)"
            " VALUES (%s, 10, 'em andamento', 30)",
            (f5.A,),
        )
        faixa, origem, motivo = c.execute(
            "SELECT risco_abandono_faixa, risco_abandono_origem, risco_abandono_motivo"
            "  FROM public.vw_metricas_engajamento_aluno_classe WHERE aluno_id = %s",
            (f5.A,),
        ).fetchone()
        assert origem == "modelo"
        assert faixa in ("alto", "atencao")
        # Sem nota e sem entrega vencida; a semana tem mais uso que as anteriores.
        assert motivo == "sem_nota"

        # Quem não tem atividade nenhuma fica sem motivo (sem dado).
        assert c.execute(
            "SELECT risco_abandono_motivo FROM public.vw_metricas_engajamento_aluno_classe WHERE aluno_id = %s",
            (f5.B,),
        ).fetchone()[0] is None


@f5.e2e
def test_downgrade_deixa_a_coluna_nula() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert c.execute(
            "SELECT count(*) FROM public.vw_metricas_engajamento_aluno_classe WHERE risco_abandono_motivo IS NOT NULL"
        ).fetchone()[0] == 0
        assert c.execute(
            "SELECT count(*) FROM pg_proc WHERE proname = 'trailup_motivo_risco_evasao'"
        ).fetchone()[0] == 0
