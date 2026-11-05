"""`20261105_20` (#154): `arena_professor_resumo` devolve o `evento_id` de cada duelo.

Banco do e2e do duelo no evento (`20261105_15`); `fn_arena_equipes` é dublê (fora do que está em teste).
"""

from __future__ import annotations

from tests import _f5_banco as f5
from tests import test_e2e_duelo_no_evento as fase2
from tests import test_e2e_rank_do_evento as rde

pytestmark = [f5.e2e]

M = f5.modulo("20261105_20_duelos_do_evento_no_console.py")

EQUIPES = """
CREATE OR REPLACE FUNCTION public.fn_arena_equipes(p_desafio_id uuid)
RETURNS TABLE (equipe smallint, pontos integer, integrantes integer) LANGUAGE sql AS $f$ SELECT 1::smallint, 0, 1 $f$;
"""


def _resumo(c) -> dict:
    with c.transaction():
        rde._como_cliente(c, rde.PROF)
        return c.execute("SELECT public.arena_professor_resumo(1)").fetchone()[0]


def test_o_professor_ve_de_qual_evento_e_o_duelo() -> None:
    with fase2._banco() as c:
        c.execute(EQUIPES)
        c.execute(M.resumo_anterior())
        evento = fase2._evento_aberto(c, fase2.ALUNO, fase2.RIVAL)
        do_evento = fase2._criar(c, fase2.ALUNO, evento, [fase2.RIVAL])["id"]
        assert "evento_id" not in _resumo(c)["duelos"][0]  # antes da migration
        for sql in f5.sql_de(M):
            c.execute(sql)
        duelos = {d["id"]: d for d in _resumo(c)["duelos"]}
        assert duelos[do_evento]["evento_id"] == str(evento)
        assert duelos[do_evento]["consequencia"] == "evento"
