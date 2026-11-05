"""`20261105_10` (#19): análise longitudinal por semana, com ganho sustentado × pico isolado.

Mesmo banco do e2e do estudo, com o consentimento por baixo (`20261104_04`). A e C consentiram
pesquisa, B não; D entrou depois do corte. Então os pareados da turma 1 são A e C.

Turma 1, intervenção: baseline 04/10–17/10 (semanas −2 e −1), pós 18/10–31/10 (semanas 0 e 1).
Tempo ativo do escopo topic dos pareados, calculado à mão:

| semana | A      | C | min por aluno |
|--------|--------|---|---------------|
| −2     | 600 s  | 0 | 5,0           |
| −1     | 0      | 0 | 0,0           |
| 0      | 1200 s | 0 | 10,0          |
| 1      | 0      | 0 | 0,0           |

Baseline = 10 min / 2 alunos / 2 semanas = 2,5; limiar = desvio-padrão de (5, 0) = 3,54.
Ganho: semana 0 = 7,5 (acima), semana 1 = −2,5 → `pico_isolado`.
"""

from __future__ import annotations

import uuid

import pytest

from tests import _f5_banco as f5
from tests import test_e2e_agregados_so_quem_consentiu as ag
from tests import test_e2e_estudo_coorte as e

M_CONSENTIU = f5.modulo("20261104_04_agregados_so_quem_consentiu.py")
M = f5.modulo("20261105_10_metricas_estudo_longitudinal.py")

PERFIS = """
INSERT INTO public.perfil (id, nome) VALUES
  (13, 'seeker'), (14, 'achiever'), (15, 'survivor'), (16, 'daredevil'),
  (17, 'mastermind'), (18, 'conqueror'), (19, 'socializer');
"""


def _banco(*depois: str):
    return ag._banco(*f5.sql_de(M_CONSENTIU), *f5.sql_de(M), *depois)


def _semear(c) -> None:
    ag._semear_estudo(c)
    c.execute(PERFIS)
    # A: achiever (80 > 40). C: seeker.
    c.execute(
        "INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) VALUES"
        " (%s, 14, 80), (%s, 13, 40), (%s, 13, 70)",
        (f5.A, f5.A, f5.C),
    )
    e._n_minimo(c, 1)


def _rpc(c, classes: list[int]) -> dict:
    return e._como(c, f5.PROF, "SELECT public.metricas_estudo_longitudinal(%s)", (classes,))[0][0]


def _grupo(r: dict, nivel: str, *, braco: str = "intervencao", classe_id=None, perfil=None) -> dict:
    achados = [
        g for g in r["grupos"]
        if g["nivel"] == nivel and g["braco"] == braco and g["classe_id"] == classe_id and g["perfil"] == perfil
    ]
    assert len(achados) == 1, achados
    return achados[0]


@f5.e2e
@pytest.mark.parametrize(
    ("ganhos", "limiar", "esperado"),
    [
        ([5, 6], 1, "sustentado"),
        ([5, None, 6], 1, "sustentado"),  # semana sem amostra não quebra a sequência
        ([5, 6, 0], 1, "ganho_nao_mantido"),
        ([5, 0, 6], 1, "pico_isolado"),
        ([0, 0], 1, "sem_ganho"),
        ([1, 1], None, "sustentado"),  # sem limiar, vale 0
        ([5], 1, "amostra_insuficiente"),
        ([None, None], 1, "amostra_insuficiente"),
    ],
)
def test_classificacao_da_serie(ganhos, limiar, esperado) -> None:
    with _banco() as c:
        r = c.execute("SELECT public.estudo_classificar_serie(%s::numeric[], %s)", (ganhos, limiar)).fetchone()
        assert r[0] == esperado


@f5.e2e
def test_serie_do_braco_com_ganho_limiar_e_marcos() -> None:
    with _banco() as c:
        _semear(c)
        r = _rpc(c, [f5.TURMA])
        g = _grupo(r, "braco")
        assert g["baseline"]["pareados"] == 2
        assert g["baseline"]["tempo_ativo_min_por_aluno_semana"] == 2.5
        assert g["baseline"]["semanas_com_amostra"] == 2
        serie = g["serie"]
        assert [(s["semana"], s["fase"]) for s in serie] == [(-2, "pre"), (-1, "pre"), (0, "pos"), (1, "pos")]
        assert [s["tempo_ativo_min_por_aluno_semana"] for s in serie] == [5.0, 0.0, 10.0, 0.0]
        assert serie[0]["ganho_sobre_baseline"] is None
        assert serie[2]["ganho_sobre_baseline"]["tempo_ativo_min_por_aluno_semana"] == 7.5
        assert serie[3]["ganho_sobre_baseline"]["tempo_ativo_min_por_aluno_semana"] == -2.5
        tempo = g["classificacao"]["tempo_ativo_min_por_aluno_semana"]
        assert tempo == {"resultado": "pico_isolado", "comparado_com": "baseline_do_proprio_grupo", "limiar": 3.54}
        # Marcos na semana em que caíram: o global no baseline, o da turma na semana 0.
        assert [[m["descricao"] for m in s["marcos"]] for s in serie] == [
            ["deploy da api"], [], ["aula de revisao"], [],
        ]
        # Uma turma só: o nível turma repete o braço.
        assert _grupo(r, "turma", classe_id=f5.TURMA)["serie"] == serie
        assert "variacao semanal do baseline" in r["limitacoes"][0]


@f5.e2e
def test_segmento_por_perfil_dominante() -> None:
    with _banco() as c:
        _semear(c)
        r = _rpc(c, [f5.TURMA])
        ach = _grupo(r, "perfil", perfil="achiever")  # só A
        assert [s["tempo_ativo_min_por_aluno_semana"] for s in ach["serie"]] == [10.0, 0.0, 20.0, 0.0]
        assert ach["baseline"]["pareados"] == 1
        assert ach["classificacao"]["tempo_ativo_min_por_aluno_semana"]["resultado"] == "pico_isolado"
        seeker = _grupo(r, "perfil", perfil="seeker")  # só C, sem tempo nenhum
        assert seeker["classificacao"]["tempo_ativo_min_por_aluno_semana"]["resultado"] == "sem_ganho"
        vazio = _grupo(r, "perfil", perfil="conqueror")
        assert vazio["baseline"]["amostra_insuficiente"] is True
        assert vazio["classificacao"]["tempo_ativo_min_por_aluno_semana"]["resultado"] == "amostra_insuficiente"
        assert all(s["pareados"] is None for s in vazio["serie"])


@f5.e2e
def test_supressao_abaixo_do_minimo() -> None:
    with _banco() as c:
        _semear(c)
        e._n_minimo(c, 2)
        r = _rpc(c, [f5.TURMA])
        assert _grupo(r, "braco")["baseline"]["pareados"] == 2
        ach = _grupo(r, "perfil", perfil="achiever")  # 1 aluno < 2
        assert ach["baseline"]["pareados"] is None
        assert all(s["tempo_ativo_min_por_aluno_semana"] is None for s in ach["serie"])


@f5.e2e
def test_diferenca_em_diferencas_semana_a_semana() -> None:
    """Comparação (turma 2): só C conta (B não consentiu). C: 420 s nas semanas −2 e 0.
    Comparação por semana: 7, 0, 7, 0; baseline 3,5; ganho 3,5 e −3,5.
    DiD: semana 0 = 7,5 − 3,5 = 4,0 (acima de 3,54); semana 1 = −2,5 + 3,5 = 1,0."""
    with _banco() as c:
        _semear(c)
        e._coorte(c, e.TURMA2, "comparacao", "2026-10-04", "2026-10-18", "2026-10-31", rotulo="B")
        s = uuid.uuid4()
        f5.sessao(c, s, f5.C, "2026-10-05T10:00:00Z", None)
        c.execute("UPDATE public.telemetria_sessoes SET classe_id = %s WHERE id = %s", (e.TURMA2, s))
        for quando in ("2026-10-07T10:00:00Z", "2026-10-20T10:00:00Z"):
            f5.tempo(c, s, f5.C, "topic", 20, 420, 0, quando)
        c.execute("UPDATE public.telemetria_time_metric_entries SET classe_id = %s WHERE topico_id = 20", (e.TURMA2,))
        r = _rpc(c, [f5.TURMA, e.TURMA2])
        g = _grupo(r, "braco")
        dids = [s["diferenca_em_diferencas"] for s in g["serie"]]
        assert dids[:2] == [None, None]
        assert [d["tempo_ativo_min_por_aluno_semana"] for d in dids[2:]] == [4.0, 1.0]
        tempo = g["classificacao"]["tempo_ativo_min_por_aluno_semana"]
        assert tempo["comparado_com"] == "diferenca_em_diferencas"
        assert tempo["resultado"] == "pico_isolado"
        comp = _grupo(r, "braco", braco="comparacao")
        assert all(s["diferenca_em_diferencas"] is None for s in comp["serie"])
        assert r["cortes_alinhados"] is True


@f5.e2e
def test_so_o_professor_dono_e_turma_com_coorte() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(Exception, match="turma_nao_encontrada_ou_sem_permissao"):
            e._como(c, e.OUTRO_PROF, "SELECT public.metricas_estudo_longitudinal(%s)", ([f5.TURMA],))
        with pytest.raises(Exception, match="turma_sem_coorte"):
            _rpc(c, [e.TURMA2])
        with pytest.raises(Exception, match="permission denied"):
            e._anon(c, f"SELECT public.metricas_estudo_longitudinal(ARRAY[{f5.TURMA}]::bigint[])")


@f5.e2e
def test_a_rpc_da_13_continua_igual_com_a_janela_nova() -> None:
    """A janela ganhou `p_perfil` com padrão NULL: chamar com 5 argumentos dá o mesmo número."""
    with _banco() as c:
        _semear(c)
        pos = e._rpc(c, f5.PROF, [f5.TURMA])["coortes"][0]["pos"]
        assert pos["pareados"] == 2
        assert pos["pr1"]["tempo_ativo_min_por_aluno_semana"] == pytest.approx(5.0)


@f5.e2e
def test_downgrade_limpa() -> None:
    with _banco(*f5.sql_de(M, "downgrade")) as c:
        _semear(c)
        assert e._rpc(c, f5.PROF, [f5.TURMA])["coortes"][0]["pos"]["pareados"] == 2
        existe = c.execute(
            "SELECT count(*) FROM pg_proc WHERE proname IN ('metricas_estudo_longitudinal', 'estudo_classificar_serie')"
        ).fetchone()[0]
        assert existe == 0
