"""`20261104_07`: rank do evento por tempo, contado na janela, num Postgres de verdade (#932).

Usa o banco do e2e da `20261104_01` (ranking, eventos, inscrição e a própria `_01`) e aplica a `_07`
por cima. A telemetria é escrita direto em `telemetria_time_metric_entries`, como o gatilho
`telemetria_resolver_entidade` a deixa: uma linha por lote × escopo, com o tempo daquele lote.

Roda contra Postgres LOCAL (`TRAILUP_E2E_RETENCAO_DATABASE_URL`). Dados sintéticos.
"""

from __future__ import annotations

from contextlib import contextmanager
from decimal import Decimal

import pytest

from tests import _f5_banco as f5
from tests import test_e2e_rank_do_evento as rde

pytestmark = [f5.e2e]

if f5.DSN:
    import psycopg

M = f5.modulo("20261104_07_rank_do_evento_por_tempo.py")

PEQUENA = rde.PEQUENA  # turma 1: 3 alunos
GRANDE = rde.GRANDE  # turma 2: 9 alunos
TIPO_TEMPO = 905
TOPICO_1, TOPICO_1B, TOPICO_2 = 501, 502, 601


@contextmanager
def _banco(aplica: bool = True):
    with rde._banco() as c:
        c.execute(
            "INSERT INTO public.rank_tipo (id, nome, criterio) OVERRIDING SYSTEM VALUE VALUES (%s, 'Tempo', 'tempo')",
            (TIPO_TEMPO,),
        )
        f5.afrouxa(c, "telemetria_time_metric_entries")
        c.execute("ALTER TABLE public.telemetria_time_metric_entries DROP CONSTRAINT fk_telemetria_time_metric_entries_lote, DROP CONSTRAINT fk_telemetria_time_metric_entries_sessao")
        c.execute(
            "INSERT INTO public.topicos (id, classe_id, nome) OVERRIDING SYSTEM VALUE VALUES"
            " (%s, 1, 'T1'), (%s, 1, 'T1b'), (%s, 2, 'T2')",
            (TOPICO_1, TOPICO_1B, TOPICO_2),
        )
        if aplica:
            for sql in f5.sql_de(M):
                c.execute(sql)
        yield c


def _tempo(c, aluno, topico: int, minutos: float, quando: str, scope: str = "topic", classe: int = 1) -> None:
    """Uma linha de lote: `minutos` ativos, capturados em `now() + quando`. Sem lote nem sessão (FK
    afrouxada no banco descartável): a view não as lê."""
    c.execute(
        "INSERT INTO public.telemetria_time_metric_entries"
        " (aluno_id, classe_id, topico_id, scope, active_sec, dwell_sec, captured_at)"
        " VALUES (%s, %s, %s, %s, %s, %s, now() + %s::interval)",
        (aluno, classe, topico, scope, minutos * 60, minutos * 120, quando),
    )


def _rank_de_tempo(c, classe: int = 1, *alunos) -> int:
    evento = rde._evento(c, classe, criterios=("tempo",))
    rde._abrir(c, evento)
    rde._inscreve(c, evento, *alunos)
    return rde._rank(c, evento, TIPO_TEMPO)


def _pontos(c, rank_id: int) -> dict:
    return {aluno: pontos for aluno, (_, pontos, _) in rde._posicoes(c, rank_id).items()}


def test_so_conta_o_tempo_dentro_da_janela() -> None:
    with _banco() as c:
        a, b = PEQUENA[0], PEQUENA[1]
        _tempo(c, a, TOPICO_1, 50, "-2 days")  # antes do evento (que começa em -1 day)
        _tempo(c, a, TOPICO_1, 7, "-1 hour")
        _tempo(c, a, TOPICO_1, 40, "2 days")  # depois do fim (+1 day)
        _tempo(c, b, TOPICO_1, 12, "-2 hours")
        rank = _rank_de_tempo(c, 1, a, b)

        assert _pontos(c, rank) == {a: Decimal("7.00"), b: Decimal("12.00")}
        assert rde._posicoes(c, rank)[b][0] == 1


def test_escopos_nao_se_somam_e_os_lotes_somam() -> None:
    with _banco() as c:
        a = PEQUENA[0]
        # Um intervalo de 5 min aparece nos três escopos aninhados: conta uma vez só.
        for scope in ("topic", "content", "material"):
            _tempo(c, a, TOPICO_1, 5, "-3 hours", scope=scope)
        # Dois lotes seguidos: cada um é o tempo dele, e os dois somam.
        _tempo(c, a, TOPICO_1, 2.5, "-2 hours")
        _tempo(c, a, TOPICO_1B, 1.25, "-1 hour")
        rank = _rank_de_tempo(c, 1, a)

        assert _pontos(c, rank) == {a: Decimal("8.75")}


def test_so_os_topicos_da_turma_e_so_inscrito() -> None:
    with _banco() as c:
        a, fora = PEQUENA[0], PEQUENA[2]
        _tempo(c, a, TOPICO_1, 3, "-1 hour")
        _tempo(c, a, TOPICO_2, 30, "-1 hour", classe=2)  # outra turma
        _tempo(c, fora, TOPICO_1, 90, "-1 hour")  # não entrou no rank
        rank = _rank_de_tempo(c, 1, a, PEQUENA[1])

        assert _pontos(c, rank) == {a: Decimal("3.00"), PEQUENA[1]: Decimal("0")}


def test_rank_de_turma_por_tempo_segue_com_a_matricula_inteira() -> None:
    with _banco() as c:
        a = PEQUENA[0]
        c.execute('UPDATE public.classe_aluno SET "tempoGastoMin" = 123 WHERE classe_id = 1 AND aluno_id = %s', (a,))
        _tempo(c, a, TOPICO_1, 7, "-1 hour")
        c.execute(
            "INSERT INTO public.ranks (id, tipo_id, classe_id, periodo, inicio) OVERRIDING SYSTEM VALUE"
            " VALUES (77, %s, 1, '2026.2-t', now() - interval '1 day')",
            (TIPO_TEMPO,),
        )
        assert _pontos(c, 77)[a] == Decimal(123)


def test_rank_de_tempo_sem_telemetria_mostra_zero_e_nao_some() -> None:
    with _banco() as c:
        rank = _rank_de_tempo(c, 2, *GRANDE[:3])
        assert _pontos(c, rank) == {g: Decimal(0) for g in GRANDE[:3]}


def test_check_aceita_tempo_e_segue_recusando_o_resto() -> None:
    with _banco() as c:
        rde._evento(c, 1, criterios=("tempo", "pontuacao"))
        for criterio in ("percentual", "acertos", "elo"):
            with pytest.raises(psycopg.errors.CheckViolation):
                with c.transaction():
                    rde._evento(c, 1, criterios=(criterio,))


def test_cliente_le_o_rank_de_tempo_pela_view_filtrada() -> None:
    with _banco() as c:
        a = PEQUENA[0]
        _tempo(c, a, TOPICO_1, 4, "-1 hour")
        rank = _rank_de_tempo(c, 1, a)
        with c.transaction():
            rde._como_cliente(c, PEQUENA[1])
            linhas = c.execute(
                "SELECT id_aluno, pontuacao FROM public.vw_rank_posicoes_por_classe WHERE rank_id = %s", (rank,)
            ).fetchall()
        assert linhas == [(a, Decimal("4.00"))]


def test_downgrade_volta_a_view_e_nao_quebra_com_evento_de_tempo() -> None:
    with _banco() as c:
        antes = c.execute("SELECT pg_get_viewdef('public.vw_rank_posicoes_por_classe_todas'::regclass)").fetchone()[0]
        assert "tempo_por_rank" in antes
        rde._evento(c, 1, criterios=("tempo",))
        with c.transaction():
            for sql in f5.sql_de(M, "downgrade"):
                c.execute(sql)
        depois = c.execute("SELECT pg_get_viewdef('public.vw_rank_posicoes_por_classe_todas'::regclass)").fetchone()[0]
        assert "tempo_por_rank" not in depois
        with pytest.raises(psycopg.errors.CheckViolation):
            with c.transaction():
                rde._evento(c, 1, criterios=("tempo",))
