"""`20261115_04`: sessão de estudo por inatividade, funil de ativação e estados de retenção.

Banco local do e2e do estudo (`test_e2e_estudo_coorte`), com o validador de fuso. A RPC é chamada
como `authenticated` com as claims do professor. Tudo em UTC, para a conta à mão não depender de fuso.

Turma 1: A, B e C matriculados em 01/10 12:00; D em 25/10 12:00. Período pedido: 05/10 a 25/10,
que contém três semanas completas (05/10, 12/10 e 19/10). Fatos de estudo:

| aluno | 28/09            | 05/10            | 12/10          | 19/10           |
|-------|------------------|------------------|----------------|-----------------|
| A     | lote 30 s (02/10)| lote 40 s (06/10)| entrega (13/10)| conclusão (20/10)|
| B     |                  | lote 20 s (07/10)|                | lote 10 s (21/10)|
| C     |                  |                  | entrega (14/10)|                 |
| D     |                  |                  |                |                 |

C não tem telemetria: aparece só pela entrega. Cada asserção diz a conta.
"""

from __future__ import annotations

import uuid

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_estudo_coorte as e

M = f5.modulo("20261115_04_metricas_continuidade_turma.py")
FUSO = f5.modulo("20261102_15_fuso_sem_pg_timezone_names.py").VALIDADOR


def _banco():
    return e._banco(FUSO, *f5.sql_de(M))


def _lote(c, aluno, topico: int, quando: str, ativo: float, ocioso: float = 0, tela: uuid.UUID | None = None,
          escopo: str = "topic") -> uuid.UUID:
    tela = tela or uuid.uuid4()
    if not c.execute("SELECT 1 FROM public.telemetria_sessoes WHERE id = %s", (tela,)).fetchone():
        f5.sessao(c, tela, aluno, quando, None)
    f5.tempo(c, tela, aluno, escopo, topico, ativo, ocioso, quando)
    return tela


def _entrega(c, aluno, atividade: int, quando: str, numero: int = 1) -> None:
    c.execute(
        "INSERT INTO public.atividade_tentativas (aluno_id, atividade_id, classe_id, numero, iniciada_em,"
        " respondida_em, cronometrada, acertos_percentual) VALUES (%s, %s, %s, %s, %s, %s, false, 50)",
        (aluno, atividade, f5.TURMA, numero, quando, quando),
    )


def _semear(c) -> None:
    e._semear(c)
    f5.afrouxa(c, "aluno_sessoes_app")
    _lote(c, f5.A, 10, "2026-10-02T10:00:00Z", 30)
    _lote(c, f5.A, 10, "2026-10-06T10:00:00Z", 40)
    _entrega(c, f5.A, 500, "2026-10-13T15:00:00Z")
    c.execute(
        "INSERT INTO public.topico_aluno_conclusao (aluno_id, topico_id, classe_id, concluido_em)"
        " VALUES (%s, 10, %s, '2026-10-20T09:00:00Z')",
        (f5.A, f5.TURMA),
    )
    _lote(c, f5.B, 10, "2026-10-07T10:00:00Z", 20)
    _lote(c, f5.B, 10, "2026-10-21T10:00:00Z", 10)
    _entrega(c, f5.C, 500, "2026-10-14T08:00:00Z")
    for aluno, quando in (
        (f5.A, "2026-09-30T10:00:00Z"),  # antes da matrícula: não conta
        (f5.A, "2026-10-01T13:00:00Z"),
        (f5.B, "2026-10-07T09:00:00Z"),
        (f5.C, "2026-10-03T12:00:00Z"),
    ):
        c.execute("INSERT INTO public.aluno_sessoes_app (aluno_id, iniciada_em) VALUES (%s, %s)", (aluno, quando))


def _rpc(c, quem=f5.PROF, classe: int = f5.TURMA, inicio="2026-10-05", fim="2026-10-25", fuso="UTC") -> dict:
    return e._como(
        c, quem, "SELECT public.metricas_continuidade_turma(%s, %s::date, %s::date, %s)", (classe, inicio, fim, fuso)
    )[0][0]


# --------------------------------------------------------------------------- a view


@f5.e2e
def test_view_funde_lotes_por_30_min_e_ignora_os_outros_escopos() -> None:
    """Quatro lotes de A no mesmo dia:

    - 10:00–10:10 (300 ativo) e 10:30–10:35 (5 ativo): intervalo de 20 min, mesma sessão;
    - 11:05–11:10 (100 ativo), outra tela e outro tópico: intervalo de 30 min exatos, ainda a mesma;
    - 11:59–12:00 (4 ativo): 49 min depois, sessão nova, e não engajada (menos de 10 s ativos).

    O lote de escopo `content` às 15:00 não abre sessão: só o escopo `topic` entra.
    """
    with _banco() as c:
        e._semear(c)
        tela = _lote(c, f5.A, 10, "2026-10-08T10:10:00Z", 300, 300)
        _lote(c, f5.A, 10, "2026-10-08T10:35:00Z", 5, 295, tela=tela)
        _lote(c, f5.A, 11, "2026-10-08T11:10:00Z", 100, 200)
        _lote(c, f5.A, 10, "2026-10-08T12:00:00Z", 4, 56)
        _lote(c, f5.A, 10, "2026-10-08T15:00:00Z", 50, 0, escopo="content")
        cur = c.execute(
            "SELECT numero, inicio AT TIME ZONE 'UTC', fim AT TIME ZONE 'UTC', duracao_seg, presenca_seg,"
            " tempo_ativo_seg, lotes, topicos, telas, engajada, dia"
            " FROM public.vw_metricas_sessoes_estudo WHERE aluno_id = %s AND classe_id = %s ORDER BY numero",
            (f5.A, f5.TURMA),
        )
        linhas = cur.fetchall()
        assert len(linhas) == 2
        um, dois = linhas
        assert str(um[1]) == "2026-10-08 10:00:00" and str(um[2]) == "2026-10-08 11:10:00"
        assert um[3] == 4200  # 10:00 → 11:10
        assert um[4] == 1200  # 600 + 300 + 300 de presença
        assert um[5] == 405  # 300 + 5 + 100 de tempo ativo
        assert (um[6], um[7], um[8], um[9]) == (3, 2, 2, True)
        assert str(um[10]) == "2026-10-08"
        assert (dois[3], dois[5], dois[6], dois[9]) == (60, 4, 1, False)


@f5.e2e
def test_view_nao_abre_sessao_falsa_com_lote_fora_de_ordem() -> None:
    """Um lote longo (10:00–11:00) cobre um curto (10:05–10:10). O seguinte começa às 11:20: 20 min
    depois do MAIOR fim (11:00), embora 70 min depois do fim do lote anterior na ordem. Uma sessão."""
    with _banco() as c:
        e._semear(c)
        _lote(c, f5.A, 10, "2026-10-08T11:00:00Z", 600, 3000)
        _lote(c, f5.A, 10, "2026-10-08T10:10:00Z", 100, 200)
        _lote(c, f5.A, 10, "2026-10-08T11:25:00Z", 100, 200)
        n = c.execute("SELECT count(*) FROM public.vw_metricas_sessoes_estudo WHERE aluno_id = %s", (f5.A,)).fetchone()[0]
        assert n == 1


@f5.e2e
def test_view_e_security_invoker_e_anon_nao_le() -> None:
    with _banco() as c:
        opcoes = c.execute(
            "SELECT reloptions FROM pg_class WHERE relname = 'vw_metricas_sessoes_estudo'"
        ).fetchone()[0]
        assert "security_invoker=on" in opcoes
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            e._anon(c, "SELECT count(*) FROM public.vw_metricas_sessoes_estudo")


# --------------------------------------------------------------------------- a RPC


@f5.e2e
def test_sessoes_de_estudo_do_periodo() -> None:
    """No período caem três lotes isolados: A 40 s (06/10), B 20 s (07/10) e B 10 s (21/10). O de A em
    02/10 fica fora. Sessões por aluno: A 1, B 2 → mediana 1,5; por semana = 1,5 × 7 ÷ 21 dias = 0,5."""
    with _banco() as c:
        _semear(c)
        r = _rpc(c)
        s = r["sessoes_estudo"]
        assert r["matriculados"] == 4
        assert (s["sessoes"], s["alunos_com_sessao"]) == (3, 2)
        assert s["sessoes_por_aluno"] == {"mediana": 1.5, "p25": 1.25, "p75": 1.75}
        assert s["sessoes_por_aluno_semana_mediana"] == 0.5
        assert s["duracao_mediana_seg"] == 20  # 40, 20, 10
        assert s["tempo_ativo_mediano_seg"] == 20
        assert (s["engajadas"], s["engajadas_pct"]) == (3, 100)


@f5.e2e
def test_funil_conta_cada_passo_sozinho_e_so_quem_completou_7_dias() -> None:
    """Limite = fim do período (26/10 00:00). D se matriculou em 25/10: não completou 7 dias.

    | passo     | quem e quando                              | dias desde 01/10 12:00 | mediana |
    |-----------|--------------------------------------------|------------------------|---------|
    | entrou    | A 01/10 13:00, C 03/10 12:00, B 07/10 09:00| 0,04 · 2,0 · 5,875     | 2,0     |
    | abriu     | A 02/10 10:00, B 07/10 10:00               | 0,917 · 5,917          | 3,4     |
    | estudou   | A em 06/10 10:00 (30 + 40 = 70 s)          | 4,917                  | 4,9     |
    | entregou  | A 13/10 15:00, C 14/10 08:00               | 12,125 · 12,833        | 12,5    |
    | concluiu  | A 20/10 09:00                              | 18,875                 | 18,9    |

    C entregou sem abrir tópico (sem telemetria): aparece no passo 4 e não no 2.
    """
    with _banco() as c:
        _semear(c)
        funil = {p["passo"]: p for p in _rpc(c)["funil"]}
        assert [p["passo"] for p in _rpc(c)["funil"]] == [
            "entrou_no_app", "abriu_topico", "estudou_1_min", "entregou_atividade", "concluiu_topico",
        ]
        esperado = {
            "entrou_no_app": (3, 2.0, 3),
            "abriu_topico": (2, 3.4, 2),
            "estudou_1_min": (1, 4.9, 1),
            "entregou_atividade": (2, 12.5, 0),
            "concluiu_topico": (1, 18.9, 0),
        }
        for passo, (alunos, mediana, em7) in esperado.items():
            p = funil[passo]
            assert (p["alunos"], p["mediana_dias"], p["chegaram_em_7_dias"]) == (alunos, mediana, em7), passo
            assert p["com_7_dias_de_matricula"] == 3, passo


@f5.e2e
def test_estados_e_taxas_por_semana() -> None:
    """Semana 05/10 (A, B, C): A atual (28/09 e 05/10), B novo, C nunca ativo.
    Semana 12/10: A atual, B em risco, C novo. Retorno 1 de 2 (A e B ativos na anterior, só A voltou).
    Semana 19/10 (entra D): A atual, B reativado (ativo em 05/10, duas semanas antes), C em risco,
    D nunca ativo. Reativação 1 de 1: B estava parado na anterior e voltou."""
    with _banco() as c:
        _semear(c)
        semanas = _rpc(c)["semanas"]
        assert [s["semana_inicio"] for s in semanas] == ["2026-10-05", "2026-10-12", "2026-10-19"]
        zero = dict.fromkeys(("novo", "atual", "reativado", "ressuscitado", "em_risco", "dormente", "nunca_ativo"), 0)

        s1, s2, s3 = semanas
        assert (s1["matriculados"], s1["ativos"]) == (3, 2)
        assert s1["estados"] == {**zero, "atual": 1, "novo": 1, "nunca_ativo": 1}
        assert s1["retorno"] == {"ativos_na_anterior": 1, "voltaram": 1, "pct": 100}
        assert s1["retorno_de_novos"] == {"novos_na_anterior": 1, "voltaram": 1, "pct": 100}
        assert s1["reativacao"] == {"parados_na_anterior": 0, "voltaram": 0, "pct": None}

        assert (s2["matriculados"], s2["ativos"]) == (3, 2)
        assert s2["estados"] == {**zero, "atual": 1, "em_risco": 1, "novo": 1}
        assert s2["retorno"] == {"ativos_na_anterior": 2, "voltaram": 1, "pct": 50}
        assert s2["retorno_de_novos"] == {"novos_na_anterior": 1, "voltaram": 0, "pct": 0}

        assert (s3["matriculados"], s3["ativos"], s3["semana_fim"]) == (4, 2, "2026-10-25")
        assert s3["estados"] == {**zero, "atual": 1, "reativado": 1, "em_risco": 1, "nunca_ativo": 1}
        assert s3["retorno"] == {"ativos_na_anterior": 2, "voltaram": 1, "pct": 50}
        assert s3["retorno_de_novos"] == {"novos_na_anterior": 1, "voltaram": 0, "pct": 0}
        assert s3["reativacao"] == {"parados_na_anterior": 1, "voltaram": 1, "pct": 100}
        for s in semanas:
            assert sum(s["estados"].values()) == s["matriculados"]


@f5.e2e
def test_ressuscitado_e_dormente() -> None:
    """A estudou só em 02/10 (semana 28/09) e voltou em 03/11 (semana 02/11): cinco semanas depois.
    Nas semanas 12/10 a 26/10 é dormente; em 02/11 é ressuscitado, não reativado."""
    with _banco() as c:
        e._semear(c)
        _lote(c, f5.A, 10, "2026-10-02T10:00:00Z", 30)
        _lote(c, f5.A, 10, "2026-11-03T10:00:00Z", 30)
        semanas = {s["semana_inicio"]: s for s in _rpc(c, inicio="2026-10-05", fim="2026-11-08")["semanas"]}
        assert semanas["2026-10-05"]["estados"]["em_risco"] == 1
        for inicio in ("2026-10-12", "2026-10-19", "2026-10-26"):
            assert semanas[inicio]["estados"]["dormente"] == 1, inicio
        assert semanas["2026-11-02"]["estados"]["ressuscitado"] == 1
        assert semanas["2026-11-02"]["estados"]["reativado"] == 0
        assert semanas["2026-11-02"]["reativacao"] == {"parados_na_anterior": 1, "voltaram": 1, "pct": 100}


@f5.e2e
def test_retencao_por_semana_do_curso_so_conta_quem_completou_a_semana() -> None:
    """Matrícula de A, B e C em 01/10 12:00; limite em 26/10 00:00. Semanas 1 a 3 completas para os
    três (a 3ª termina em 22/10 12:00); a 4ª terminaria em 29/10: ninguém elegível, percentual nulo.
    D (25/10) não completou nenhuma.

    - semana 1 (01/10–08/10): A (02 e 06/10) e B (07/10) → 2 de 3;
    - semana 2 (08/10–15/10): A (13/10) e C (14/10) → 2 de 3;
    - semana 3 (15/10–22/10): A (20/10) e B (21/10) → 2 de 3.
    """
    with _banco() as c:
        _semear(c)
        ret = _rpc(c)["retencao_por_semana_do_curso"]
        assert [x["semana"] for x in ret] == list(range(1, 9))
        for k in (0, 1, 2):
            assert (ret[k]["elegiveis"], ret[k]["ativos"], ret[k]["pct"]) == (3, 2, 66.67), k
        for k in range(3, 8):
            assert (ret[k]["elegiveis"], ret[k]["ativos"], ret[k]["pct"]) == (0, 0, None), k


@f5.e2e
def test_turma_sem_dado_devolve_nulo_e_nao_zero() -> None:
    with _banco() as c:
        e._semear(c)
        r = _rpc(c)
        s = r["sessoes_estudo"]
        assert s["sessoes"] == 0 and s["duracao_mediana_seg"] is None and s["engajadas_pct"] is None
        assert s["sessoes_por_aluno"] == {"mediana": None, "p25": None, "p75": None}
        assert all(p["alunos"] == 0 and p["mediana_dias"] is None for p in r["funil"])
        assert all(x["estados"]["nunca_ativo"] == x["matriculados"] for x in r["semanas"])


@f5.e2e
def test_so_semana_completa_contida_no_periodo() -> None:
    """06/10 (terça) a 18/10 (domingo): a semana de 05/10 começa antes do período e fica fora."""
    with _banco() as c:
        _semear(c)
        assert [s["semana_inicio"] for s in _rpc(c, inicio="2026-10-06", fim="2026-10-18")["semanas"]] == ["2026-10-12"]
        assert _rpc(c, inicio="2026-10-06", fim="2026-10-10")["semanas"] == []


@f5.e2e
def test_so_o_professor_dono_chama() -> None:
    with _banco() as c:
        _semear(c)
        for quem in (e.OUTRO_PROF, f5.A):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                _rpc(c, quem=quem)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            e._anon(c, "SELECT public.metricas_continuidade_turma(1, DATE '2026-10-05', DATE '2026-10-25')")


@f5.e2e
@pytest.mark.parametrize(
    ("inicio", "fim", "fuso"),
    [("2026-10-25", "2026-10-05", "UTC"), ("2025-01-01", "2026-10-05", "UTC"), ("2026-10-05", "2026-10-25", "-03")],
)
def test_recusa_periodo_e_fuso_invalidos(inicio: str, fim: str, fuso: str) -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InvalidParameterValue):
            _rpc(c, inicio=inicio, fim=fim, fuso=fuso)


@f5.e2e
def test_catalogo_ganha_as_quatro_chaves_e_o_downgrade_limpa() -> None:
    with _banco() as c:
        chaves = {r[0] for r in c.execute("SELECT chave FROM public.metricas_catalogo").fetchall()}
        assert set(M.CHAVES) <= chaves
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        chaves = {r[0] for r in c.execute("SELECT chave FROM public.metricas_catalogo").fetchall()}
        assert not set(M.CHAVES) & chaves
        assert c.execute("SELECT to_regclass('public.vw_metricas_sessoes_estudo')").fetchone()[0] is None
        assert c.execute("SELECT count(*) FROM pg_proc WHERE proname = 'metricas_continuidade_turma'").fetchone()[0] == 0
        # E sobe de novo sem erro.
        for sql in f5.sql_de(M):
            c.execute(sql)
