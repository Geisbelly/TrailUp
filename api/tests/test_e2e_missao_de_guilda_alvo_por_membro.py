"""`20261105_13` (#154, D6): na missão de guilda, o alvo vale por membro ativo.

O avaliador é chamado direto (o gatilho de `eventos_aluno` é de produção e não está no esqueleto).
Guilda G com A, B e C. Missão "2 atividades concluídas":

- **nova** (`alvo_por_membro = true`): alvo 2 × 3 membros = 6;
- **antiga** (`false`, como as anteriores à migration): alvo 2, como na `20261021_15`.
"""

from __future__ import annotations

import json
import uuid

from tests import _f5_banco as f5

M_SOMA = f5.modulo("20261021_15_missao_de_guilda_soma_os_membros.py")
M = f5.modulo("20261105_13_missao_de_guilda_alvo_por_membro.py")
G = uuid.UUID(int=500)

# Fora do que está em teste: nenhum tipo de evento é "creditado" aqui.
CREDITADO = """
CREATE OR REPLACE FUNCTION public.fn_evento_creditado(p_tipo text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;
"""


def _banco(*depois: str):
    return f5.banco(CREDITADO, M_SOMA.PROGRESSO, M_SOMA.AVALIAR, *depois)


def _semear(c) -> None:
    f5.semear_turma(c)
    for tabela in ("guildas", "missoes", "eventos_aluno"):
        f5.afrouxa(c, tabela)
    c.execute(
        "INSERT INTO public.guildas (id, classe_id, nome, criado_por) VALUES (%s, %s, 'G', %s)",
        (G, f5.TURMA, f5.A),
    )
    for aluno in (f5.A, f5.B, f5.C):
        c.execute(
            "INSERT INTO public.guilda_membros (guilda_id, classe_id, aluno_id, joined_at)"
            " VALUES (%s, %s, %s, now() - interval '10 days')",
            (G, f5.TURMA, aluno),
        )


def _missao(c, *, por_membro: bool | None) -> int:
    colunas = "classe_id, origem, escopo, titulo, criterio, recompensa_tipo, janela_inicio"
    valores = "%s, 'professor', 'guilda', 'Missão', %s, 'missao_cumprida', now() - interval '1 day'"
    params: list = [f5.TURMA, json.dumps({"metrica": "atividades_concluidas", "minimo": 2})]
    if por_membro is not None:
        colunas += ", alvo_por_membro"
        valores += ", %s"
        params.append(por_membro)
    return c.execute(f"INSERT INTO public.missoes ({colunas}) VALUES ({valores}) RETURNING id", params).fetchone()[0]


def _concluir(c, aluno, n: int) -> None:
    for _ in range(n):
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, tipo, criado_em) VALUES (%s, 'atividade_concluida', now() at time zone 'UTC')",
            (aluno,),
        )


def _avaliar(c, missao: int) -> bool:
    return c.execute("SELECT public.fn_missao_guilda_avaliar(%s, %s)", (missao, G)).fetchone()[0]


def _estado(c, missao: int) -> list[tuple]:
    return c.execute(
        "SELECT status, progresso FROM public.missao_aluno WHERE missao_id = %s ORDER BY aluno_id", (missao,)
    ).fetchall()


def _premios(c, missao: int) -> int:
    return c.execute(
        "SELECT count(*) FROM public.eventos_aluno WHERE tipo = 'missao_cumprida' AND referencia = %s",
        (f"missao:{missao}",),
    ).fetchone()[0]


@f5.e2e
def test_missao_nova_nasce_por_membro_e_antiga_fica_como_estava() -> None:
    with _banco() as c:
        _semear(c)
        antiga = _missao(c, por_membro=None)  # criada antes da migration
        c.execute(";".join(f5.sql_de(M)))
        nova = _missao(c, por_membro=None)
        linhas = dict(c.execute("SELECT id, alvo_por_membro FROM public.missoes").fetchall())
        assert linhas == {antiga: False, nova: True}


@f5.e2e
def test_alvo_multiplica_pelos_membros_ativos() -> None:
    with _banco(*f5.sql_de(M)) as c:
        _semear(c)
        m = _missao(c, por_membro=True)
        _concluir(c, f5.A, 3)
        assert _avaliar(c, m) is False
        # 3 de 6: 50% para os três membros, ninguém premiado.
        assert {p for _, p in _estado(c, m)} == {50}
        assert _premios(c, m) == 0
        _concluir(c, f5.B, 3)
        assert _avaliar(c, m) is True
        assert {s for s, _ in _estado(c, m)} == {"concluida"}
        assert _premios(c, m) == 3


@f5.e2e
def test_missao_antiga_segue_com_o_alvo_da_guilda_inteira() -> None:
    with _banco(*f5.sql_de(M)) as c:
        _semear(c)
        m = _missao(c, por_membro=False)
        _concluir(c, f5.A, 2)
        assert _avaliar(c, m) is True
        assert _premios(c, m) == 3


@f5.e2e
def test_quem_sai_tira_a_sua_parte_do_alvo() -> None:
    with _banco(*f5.sql_de(M)) as c:
        _semear(c)
        m = _missao(c, por_membro=True)
        _concluir(c, f5.A, 4)
        assert _avaliar(c, m) is False  # 4 de 6
        c.execute("UPDATE public.guilda_membros SET left_at = now() WHERE aluno_id = %s", (f5.C,))
        assert _avaliar(c, m) is True  # 4 de 2 × 2
        assert _premios(c, m) == 2  # C saiu antes e não recebe


@f5.e2e
def test_downgrade_volta_ao_avaliador_da_15() -> None:
    with _banco(*f5.sql_de(M), *f5.sql_de(M, "downgrade")) as c:
        _semear(c)
        existe = c.execute(
            "SELECT count(*) FROM information_schema.columns WHERE table_name = 'missoes' AND column_name = 'alvo_por_membro'"
        ).fetchone()[0]
        assert existe == 0
        m = _missao(c, por_membro=None)
        _concluir(c, f5.A, 2)
        assert _avaliar(c, m) is True
