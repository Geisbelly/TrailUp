"""`20261110_05`: o tempo da tentativa sai das questões, e sair da atividade pausa o relógio.

Mesmo banco do e2e da `20261101_13`, com esta migration por cima. As RPCs são chamadas como
`authenticated` com as claims do aluno, como o PostgREST faria.
"""

from __future__ import annotations

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_tentativas_com_tempo_do_servidor as base

pytestmark = f5.e2e

M = f5.modulo("20261110_05_cronometro_pelas_questoes_e_pausa.py")
ATIVIDADE = base.ATIVIDADE


def _banco():
    return base._banco(*f5.sql_de(M))


def _questoes(c, *linhas: tuple[str | None, str, str | None]) -> None:
    f5.afrouxa(c, "questoes")
    for tipo, enunciado, alternativas in linhas:
        c.execute(
            "INSERT INTO public.questoes (atividade_id, enunciado, tipo, alternativas) VALUES (%s, %s, %s, %s::jsonb)",
            (ATIVIDADE, enunciado, tipo, alternativas),
        )


def _rpc(c, nome: str, tentativa: int, quem=f5.A) -> dict:
    return base._como(c, quem, f"SELECT public.{nome}(%s)", (tentativa,))[0][0]


def _ha_segundos(c, tentativa: int, coluna: str, segundos: int) -> None:
    c.execute(
        f"UPDATE public.atividade_tentativas SET {coluna} = {coluna} - make_interval(secs => %s) WHERE id = %s",
        (segundos, tentativa),
    )


def test_o_limite_e_a_soma_do_tempo_de_cada_questao() -> None:
    with _banco() as c:
        base._semear(c)
        # 15 caracteres por segundo de leitura: enunciado de 30 = 2 s.
        _questoes(
            c,
            ("verdadeiro_falso", "x" * 30, None),  # 30 + 2
            ("multipla", "x" * 30, '["a", "b"]'),  # 45 + ceil((30 + 10) / 15) = 45 + 3
            ("codigo", "x" * 15, None),  # 600 + 1
        )
        t = base._iniciar(c)
        assert t["limite_seg"] == 685  # 681, arredondado para cima em 5
        assert (t["pausado_seg"], t["pausada_em"]) == (0, None)


def test_tipos_diferentes_dao_tempos_diferentes() -> None:
    def limite(tipo: str) -> int:
        with _banco() as c:
            base._semear(c)
            _questoes(c, (tipo, "", None))
            return base._iniciar(c)["limite_seg"]

    assert limite("verdadeiro_falso") < limite("multipla") < limite("dissertativa") < limite("codigo")


def test_questao_sem_tipo_usa_o_tipo_da_atividade() -> None:
    with _banco() as c:
        base._semear(c)
        c.execute("UPDATE public.atividades SET tipo = 'essay' WHERE id = %s", (ATIVIDADE,))
        _questoes(c, (None, "", None))
        assert base._iniciar(c)["limite_seg"] == 300


def test_atividade_sem_questao_fica_com_o_padrao_e_o_teto_vale() -> None:
    with _banco() as c:
        base._semear(c)
        assert base._iniciar(c)["limite_seg"] == 120
    with _banco() as c:
        base._semear(c)
        _questoes(c, *[("codigo", "", None)] * 10)  # 6000 s
        assert base._iniciar(c)["limite_seg"] == 3600


def test_o_tempo_por_tipo_vem_do_app_config() -> None:
    with _banco() as c:
        base._semear(c)
        c.execute("UPDATE public.app_config SET valor = '90' WHERE chave = 'cronometro_seg_multipla'")
        _questoes(c, ("multipla", "", None))
        assert base._iniciar(c)["limite_seg"] == 90


def test_pausa_desconta_o_tempo_fora_e_o_bonus_continua() -> None:
    with _banco() as c:
        base._semear(c)
        _questoes(c, ("multipla", "", None))  # 45 s
        t = base._iniciar(c)
        tid = t["tentativa_id"]
        base._atrasar(c, tid, 30)  # 30 s respondendo
        p = _rpc(c, "atividade_pausar_tentativa", tid)
        assert p["pausada_em"] is not None
        _ha_segundos(c, tid, "pausada_em", 600)  # 10 min fora da atividade
        base._atrasar(c, tid, 600)  # o relógio de parede andou o mesmo
        r = _rpc(c, "atividade_retomar_tentativa", tid)
        assert r["pausada_em"] is None
        assert r["pausado_seg"] in (600, 601)
        assert r["limite_seg"] - r["pausado_seg"] == 45  # o tempo efetivo não muda
        # 630 s de parede, mas só 30 s na atividade: ainda no tempo.
        assert base._responder(c, tid, 100, 10)["no_tempo"] is True


def test_sem_pausa_dez_minutos_depois_sai_do_tempo() -> None:
    # Prova que o teste acima mede a pausa: o mesmo atraso sem pausar perde o bônus.
    with _banco() as c:
        base._semear(c)
        _questoes(c, ("multipla", "", None))
        tid = base._iniciar(c)["tentativa_id"]
        base._atrasar(c, tid, 630)
        assert base._responder(c, tid, 100, 10)["no_tempo"] is False


def test_pausar_e_retomar_sao_idempotentes_e_reabrir_mostra_a_pausa() -> None:
    with _banco() as c:
        base._semear(c)
        tid = base._iniciar(c)["tentativa_id"]
        primeira = _rpc(c, "atividade_pausar_tentativa", tid)["pausada_em"]
        assert _rpc(c, "atividade_pausar_tentativa", tid)["pausada_em"] == primeira
        reaberta = base._iniciar(c)
        assert (reaberta["tentativa_id"], reaberta["pausada_em"]) == (tid, primeira)
        assert _rpc(c, "atividade_retomar_tentativa", tid)["pausada_em"] is None
        segunda = _rpc(c, "atividade_retomar_tentativa", tid)
        assert segunda["limite_seg"] == 120 + segunda["pausado_seg"]


def test_tentativa_respondida_ou_sem_cronometro_nao_pausa() -> None:
    with _banco() as c:
        base._semear(c)
        tid = base._iniciar(c)["tentativa_id"]
        base._responder(c, tid, 100, 10)
        assert _rpc(c, "atividade_pausar_tentativa", tid)["pausada_em"] is None
        sem = base._iniciar(c, f5.B)  # Seeker: sem cronômetro
        assert _rpc(c, "atividade_pausar_tentativa", sem["tentativa_id"], f5.B)["pausada_em"] is None


def test_so_o_dono_pausa_e_sem_sessao_e_recusado() -> None:
    with _banco() as c:
        base._semear(c)
        tid = base._iniciar(c)["tentativa_id"]
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="tentativa_nao_encontrada"):
            _rpc(c, "atividade_pausar_tentativa", tid, f5.B)
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="sem_sessao"):
            _rpc(c, "atividade_retomar_tentativa", tid, None)


def test_o_aluno_nao_chama_a_conta_do_tempo_direto() -> None:
    with _banco() as c:
        base._semear(c)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            base._como(c, f5.A, "SELECT public.fn_tempo_da_atividade(%s)", (ATIVIDADE,))


def test_downgrade_volta_ao_padrao_para_toda_atividade() -> None:
    with _banco() as c:
        base._semear(c)
        _questoes(c, ("codigo", "", None))
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        t = base._iniciar(c)
        assert t["limite_seg"] == 120
        assert "pausado_seg" not in t
        assert c.execute(
            "SELECT count(*) FROM public.app_config WHERE chave LIKE 'cronometro_seg_%%'"
        ).fetchone()[0] == 0
