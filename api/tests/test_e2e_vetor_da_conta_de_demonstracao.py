"""`20261120_05` no banco: a conta de demonstração sai do empate em 10, e só ela, e só desse empate.

Esqueleto de produção com `aluno_perfil.afinidade` como em produção (20/11): `numeric(5,2)` com CHECK
de 0 a 100 (o esqueleto de 24/10 ainda tem `text`). Dados sintéticos; o id da conta é o da migration.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from tests import _f5_banco as f5

pytestmark = f5.e2e

M = f5.modulo("20261120_05_vetor_da_conta_de_demonstracao.py")
CONTA = uuid.UUID(M.CONTA)
PERFIS = ("achiever", "conqueror", "daredevil", "mastermind", "seeker", "socializer", "survivor")

COMO_PRODUCAO = """
ALTER TABLE public.aluno_perfil ALTER COLUMN afinidade DROP DEFAULT;
ALTER TABLE public.aluno_perfil ALTER COLUMN afinidade TYPE numeric(5,2) USING afinidade::numeric;
ALTER TABLE public.aluno_perfil ALTER COLUMN afinidade SET DEFAULT 0;
ALTER TABLE public.aluno_perfil ADD CONSTRAINT aluno_perfil_afinidade_check CHECK (afinidade >= 0 AND afinidade <= 100);
"""


def _semear(c, email: str = "demo@trailup.app", afinidades: dict[str, int] | None = None) -> None:
    f5.afrouxa(c, "alunos")
    c.execute(COMO_PRODUCAO)
    c.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s)", (CONTA, email))
    c.execute("INSERT INTO public.alunos (id, nome, email) VALUES (%s, 'Demo', %s)", (CONTA, email))
    for nome in PERFIS:
        pid = c.execute("INSERT INTO public.perfil (nome) VALUES (%s) RETURNING id", (nome,)).fetchone()[0]
        valor = (afinidades or {}).get(nome, 10)
        c.execute(
            "INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) VALUES (%s, %s, %s)", (CONTA, pid, valor)
        )


def _vetor(c) -> dict[str, Decimal]:
    return dict(
        c.execute(
            "SELECT p.nome, ap.afinidade FROM public.aluno_perfil ap JOIN public.perfil p ON p.id = ap.perfil_id"
            " WHERE ap.aluno_id = %s",
            (CONTA,),
        ).fetchall()
    )


def _migrar(c, vezes: int = 1) -> None:
    for _ in range(vezes):
        for sql in f5.sql_de(M):
            c.execute(sql)


def test_empate_em_10_volta_ao_medido_e_mantem_as_7_linhas() -> None:
    with f5.banco() as c:
        _semear(c)
        _migrar(c, vezes=2)
        esperado = {nome: Decimal("0.00") for nome in PERFIS}
        esperado.update(mastermind=Decimal("85.00"), conqueror=Decimal("60.00"))
        assert _vetor(c) == esperado


def test_vetor_que_ja_mudou_nao_e_tocado() -> None:
    with f5.banco() as c:
        _semear(c, afinidades={"seeker": 40})
        antes = _vetor(c)
        _migrar(c)
        assert _vetor(c) == antes


def test_outro_email_no_mesmo_id_nao_e_tocado() -> None:
    with f5.banco() as c:
        _semear(c, email="outra@teste.invalid")
        _migrar(c)
        assert set(_vetor(c).values()) == {Decimal("10.00")}
