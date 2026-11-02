"""`20261102_08`: toda atividade tem limite de tentativas, e a segunda chance espera a grátis (#136).

Banco local com o esqueleto de produção, a `20261101_13` inteira (tentativas pelo relógio do banco)
e a regra de limite da loja de `20261020_06`, e as RPCs chamadas como `authenticated`.
"""

from __future__ import annotations

import pytest

from tests import _f5_banco as f5
from tests.test_e2e_tentativas_com_tempo_do_servidor import (
    ATIVIDADE,
    OUTRO,
    _banco,
    _como,
    _iniciar,
    _responder,
    _semear,
)

M = f5.modulo("20261102_08_tentativas_com_limite.py")
LOJA = f5.modulo("20261020_06_loja_quantidade_e_limites_de_uso.py")
GRANTS = "GRANT SELECT, INSERT, UPDATE ON public.atividades TO authenticated;"


def _migrar(c) -> None:
    for sql in f5.sql_de(M):
        c.execute(sql)


def _maximo(c, atividade: int = ATIVIDADE):
    return c.execute("SELECT tentativas_max FROM public.atividades WHERE id = %s", (atividade,)).fetchone()[0]


def _situacao(c, quem=f5.A) -> dict:
    return _como(c, quem, "SELECT public.atividade_situacao_tentativas(%s)", (ATIVIDADE,))[0][0]


def _bloqueio(c, item: str, aluno=f5.A):
    return c.execute(
        "SELECT public.fn_loja_checa_limite(%s, %s, %s, %s, 10, NULL) ->> 'bloqueio'",
        (aluno, f5.TURMA, item, ATIVIDADE),
    ).fetchone()[0]


def _itens(c) -> None:
    c.execute(
        "INSERT INTO public.loja_itens (codigo, nome, descricao, efeito, preco_base) VALUES"
        " ('segunda_chance', 'Segunda chance', '', 'segunda_chance', 10),"
        " ('prazo_extra', 'Mais prazo', '', 'prazo_extra', 10)"
    )


@f5.e2e
def test_atividade_sem_limite_ganha_o_padrao_e_null_nunca_mais_entra() -> None:
    with _banco(GRANTS) as c:
        _semear(c)  # tentativas_max NULL: "ilimitadas" antes desta migration
        assert _maximo(c) is None
        _migrar(c)
        assert _maximo(c) == M.TENTATIVAS_PADRAO

        # Sem a coluna, com NULL explícito (o console de antes manda assim) e num UPDATE.
        c.execute("INSERT INTO public.atividades (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES (501, 10, 'B')")
        c.execute(
            "INSERT INTO public.atividades (id, topico_id, titulo, tentativas_max)"
            " OVERRIDING SYSTEM VALUE VALUES (502, 10, 'C', NULL)"
        )
        assert (_maximo(c, 501), _maximo(c, 502)) == (3, 3)
        c.execute("UPDATE public.atividades SET tentativas_max = 5 WHERE id = 501")
        assert _maximo(c, 501) == 5
        c.execute("UPDATE public.atividades SET tentativas_max = NULL WHERE id = 501")
        assert _maximo(c, 501) == 3
        # Mudar outra coluna não mexe no limite escolhido.
        c.execute("UPDATE public.atividades SET tentativas_max = 7 WHERE id = 502")
        c.execute("UPDATE public.atividades SET titulo = 'C2' WHERE id = 502")
        assert _maximo(c, 502) == 7


@f5.e2e
def test_o_padrao_limita_as_tentativas_no_servidor() -> None:
    with _banco() as c:
        _semear(c)
        _migrar(c)
        for _ in range(M.TENTATIVAS_PADRAO):
            t = _iniciar(c)
            _responder(c, t["tentativa_id"], 50, 5)
        with pytest.raises(Exception, match="sem_tentativas"):
            _iniciar(c)


@f5.e2e
def test_situacao_conta_respondidas_e_a_aberta_ainda_pode_ser_respondida() -> None:
    with _banco() as c:
        _semear(c, tentativas_max=2)
        _migrar(c)
        assert _situacao(c) == {"maximo": 2, "feitas": 0, "aberta": False, "restantes": 2}
        t = _iniciar(c)
        assert _situacao(c) == {"maximo": 2, "feitas": 0, "aberta": True, "restantes": 2}
        _responder(c, t["tentativa_id"], 50, 5)
        assert _situacao(c) == {"maximo": 2, "feitas": 1, "aberta": False, "restantes": 1}
        t = _iniciar(c)
        _responder(c, t["tentativa_id"], 50, 5)
        assert _situacao(c)["restantes"] == 0
        # Só o próprio aluno, matriculado e com sessão.
        assert _situacao(c, f5.B)["feitas"] == 0
        with pytest.raises(Exception, match="sem_matricula"):
            _situacao(c, OUTRO)
        with pytest.raises(Exception, match="sem_sessao"):
            _como(c, None, "SELECT public.atividade_situacao_tentativas(%s)", (ATIVIDADE,))


@f5.e2e
def test_segunda_chance_bloqueada_enquanto_houver_tentativa_gratis() -> None:
    with _banco(LOJA.LIMITES) as c:
        _semear(c, tentativas_max=2)
        _itens(c)
        assert _bloqueio(c, "segunda_chance") is None  # o defeito: gastava o item com tentativa sobrando
        _migrar(c)

        assert _bloqueio(c, "segunda_chance") == "tem_tentativa_livre"
        t = _iniciar(c)  # 1ª aberta: ainda sobra a 2ª
        assert _bloqueio(c, "segunda_chance") == "tem_tentativa_livre"
        _responder(c, t["tentativa_id"], 50, 5)
        _iniciar(c)  # a última aberta: agora o item pode valer
        assert _bloqueio(c, "segunda_chance") is None
        # Outro aluno ainda tem as dele; outro item não muda.
        assert _bloqueio(c, "segunda_chance", f5.B) == "tem_tentativa_livre"
        assert _bloqueio(c, "prazo_extra") is None


@f5.e2e
def test_downgrade_volta_ao_que_era() -> None:
    with _banco(LOJA.LIMITES) as c:
        _semear(c, tentativas_max=2)
        _itens(c)
        _migrar(c)
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert _bloqueio(c, "segunda_chance") is None
        c.execute(
            "INSERT INTO public.atividades (id, topico_id, titulo, tentativas_max)"
            " OVERRIDING SYSTEM VALUE VALUES (503, 10, 'D', NULL)"
        )
        assert _maximo(c, 503) is None
        for funcao in ("atividade_situacao_tentativas", "fn_tentativas_livres", "fn_atividades_tentativas_padrao"):
            assert c.execute("SELECT count(*) FROM pg_proc WHERE proname = %s", (funcao,)).fetchone()[0] == 0
