"""`20261120_04` no banco: o estado da I13 medido em produção (20/11) fecha, menos a conquista apagada.

Esqueleto de produção, sem os gatilhos de `eventos_aluno` (os prêmios entram direto, como o razão os
guarda). Dados sintéticos.
"""

from __future__ import annotations

import datetime as dt

from tests import _f5_banco as f5

pytestmark = f5.e2e

M = f5.modulo("20261120_04_registra_conquistas_pagas_sem_registro.py")

I13 = """
SELECT e.referencia
  FROM public.eventos_aluno e
 WHERE e.tipo = 'conquista_desbloqueada'
   AND NOT EXISTS (SELECT 1 FROM public.conquistas_aluno c
                    WHERE c.aluno_id = e.aluno_id
                      AND c.conquista_id::text = split_part(e.referencia, ':', 2))
 ORDER BY 1
"""


def _semear(c) -> tuple[int, int, int]:
    f5.semear_turma(c)
    f5.afrouxa(c, "conquistas")
    ids = [
        c.execute(
            "INSERT INTO public.conquistas (nome, criterio, pontos_recompensa) VALUES (%s, '{}', 10) RETURNING id",
            (nome,),
        ).fetchone()[0]
        for nome in ("Sem registro", "Com registro", "Com dois premios")
    ]
    sem, com, dois = ids
    premio = "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em) VALUES (%s, 'conquista_desbloqueada', %s, 10, %s)"
    c.execute(premio, (f5.A, f"conquista:{sem}", "2026-09-10 00:44:57.463539"))
    c.execute(premio, (f5.A, f"conquista:{com}", "2026-09-10 00:44:57"))
    c.execute(premio, (f5.B, f"conquista:{dois}", "2026-09-12 10:00:00"))
    c.execute(premio, (f5.B, f"conquista:{dois}", "2026-09-11 10:00:00"))
    c.execute(premio, (f5.A, "conquista:999999", "2026-09-20 20:37:22"))  # conquista apagada
    c.execute(
        "INSERT INTO public.conquistas_aluno (aluno_id, conquista_id, data_conquista, progresso, concluida)"
        " VALUES (%s, %s, '2026-09-10T00:44:57Z', 100, true)",
        (f5.A, com),
    )
    return sem, com, dois


def test_registra_o_que_falta_com_a_data_do_premio() -> None:
    with f5.banco() as c:
        sem, com, dois = _semear(c)
        # Uma linha por prêmio: a conquista "dois" aparece duas vezes.
        assert {r[0] for r in c.execute(I13).fetchall()} == {f"conquista:{sem}", f"conquista:{dois}", "conquista:999999"}
        for sql in f5.sql_de(M):
            c.execute(sql)
        # Só a conquista apagada sobra: a FK não deixaria registrá-la.
        assert c.execute(I13).fetchall() == [("conquista:999999",)]
        linhas = c.execute(
            "SELECT aluno_id, conquista_id, data_conquista, progresso, concluida FROM public.conquistas_aluno ORDER BY conquista_id"
        ).fetchall()
        utc = dt.timezone.utc
        assert linhas == [
            (f5.A, sem, dt.datetime(2026, 9, 10, 0, 44, 57, 463539, tzinfo=utc), 100, True),
            (f5.A, com, dt.datetime(2026, 9, 10, 0, 44, 57, tzinfo=utc), 100, True),
            # Dois prêmios da mesma conquista: um registro só, com a data do mais antigo.
            (f5.B, dois, dt.datetime(2026, 9, 11, 10, 0, tzinfo=utc), 100, True),
        ]


def test_rodar_de_novo_nao_duplica() -> None:
    with f5.banco() as c:
        _semear(c)
        for _ in range(2):
            for sql in f5.sql_de(M):
                c.execute(sql)
        assert c.execute("SELECT count(*) FROM public.conquistas_aluno").fetchone()[0] == 3
