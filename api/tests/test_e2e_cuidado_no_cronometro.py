"""`20261121_02` contra a função real que abre a tentativa (`atividade_iniciar_tentativa`, `20261101_13`).

O e2e dos momentos testa `fn_cronometro_ligado` sozinha, numa cópia mínima. Este liga o caminho
de verdade: esqueleto de produção, a `20261101_13`, a `20261111_01` (vetor de perfil) e as duas
migrations do cuidado por cima. O momento entra direto como dono: aqui interessa o cronômetro, não
o consentimento (coberto em `test_e2e_consentimento_cuidado.py`).
"""

from __future__ import annotations

from tests import _f5_banco as f5
from tests import test_e2e_tentativas_com_tempo_do_servidor as base
from tests.test_e2e_kpis_por_topico import _trecho

_ANONIMIZA = _trecho(
    "20261024_03_retencao_e_expurgo.py",
    "CREATE OR REPLACE FUNCTION public.trg_consentimento_anonimiza()",
    "$function$;\n",
)


def _sql(*arquivos: str) -> list[str]:
    return [s for a in arquivos for s in f5.sql_de(f5.modulo(a))]


def _banco():
    return base._banco(
        *_sql(
            "20261111_01_vetor_perfil_no_banco.py",
            "20261003_10_consentimento_provavel.py",
            "20261024_02_consentimento_do_responsavel.py",
        ),
        _ANONIMIZA,
        *_sql("20261121_01_consentimento_cuidado.py", "20261121_02_momentos_de_cuidado.py"),
    )


def _momento(c, *, minutos: int = 120) -> None:
    c.execute(
        "INSERT INTO public.aluno_momento_cuidado (aluno_id, classe_id, origem, fatos, acoes, expira_em)"
        " VALUES (%s, %s, 'sinais_de_uso', '{}'::jsonb, '{}'::jsonb, now() + make_interval(mins => %s))",
        (f5.A, f5.TURMA, minutos),
    )


def _expirar(c) -> None:
    c.execute("UPDATE public.aluno_momento_cuidado SET expira_em = now() - interval '1 second'")


@f5.e2e
def test_tentativa_nova_durante_o_cuidado_nao_tem_cronometro() -> None:
    with _banco() as c:
        base._semear(c)  # A é Achiever: cronômetro ligado pelo perfil
        _momento(c)
        t = base._iniciar(c)
        assert (t["cronometrada"], t["limite_seg"]) == (False, None)


@f5.e2e
def test_tentativa_ja_aberta_mantem_o_cronometro() -> None:
    # Decisão registrada: o cuidado não mexe no prazo da tentativa (#136). A tela esconde a contagem.
    with _banco() as c:
        base._semear(c)
        aberta = base._iniciar(c)
        assert aberta["cronometrada"] is True
        _momento(c)
        reaberta = base._iniciar(c)
        assert (reaberta["tentativa_id"], reaberta["cronometrada"]) == (aberta["tentativa_id"], True)


@f5.e2e
def test_sem_cronometro_no_cuidado_nao_ha_bonus_de_tempo() -> None:
    with _banco() as c:
        base._semear(c)
        _momento(c)
        t = base._iniciar(c)
        base._responder(c, t["tentativa_id"], 100, 10)
        assert base._bonus(c) == []
        assert base._nota(c)[0] == 10  # a nota não muda


@f5.e2e
def test_cuidado_expirado_devolve_o_cronometro_na_tentativa_seguinte() -> None:
    with _banco() as c:
        base._semear(c)
        _momento(c)
        t = base._iniciar(c)
        base._responder(c, t["tentativa_id"], 50, 5)
        _expirar(c)
        nova = base._iniciar(c)
        assert nova["tentativa_id"] != t["tentativa_id"]
        assert (nova["cronometrada"], nova["limite_seg"]) == (True, 120)
