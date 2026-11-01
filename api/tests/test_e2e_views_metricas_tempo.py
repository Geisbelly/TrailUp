"""`20261031_04`: tempo de uso sem fan-out, tempo ativo de uma fonte e dia de Brasília (F5, Task 2).

O dado sintético, com o resultado calculado à mão:

    Aluno A, turma 1:
      S1  20/10 12:00–12:20 UTC (09:00 de Brasília)  → 1200 s de sessão
          topic 10: ativo 300, ocioso 100 · topic 11: ativo 200, ocioso 0
          content 10: ativo 300 (o mesmo intervalo do topic 10: não pode somar)
          topic_open 10 às 12:01 → topic_complete 10 às 12:06 (300 s); topic_open 11 às 12:07, sem conclusão
      S2  21/10 01:30–01:40 UTC = 20/10 22:30 de Brasília → 600 s de sessão
          topic 10: ativo 100, ocioso 0 · topic_open 10 às 01:31, sem conclusão
    Aluno C: S3 20/10 15:00–15:05 UTC, um lote SEM linha de tempo → tempo ativo desconhecido (NULL)
    Aluno B: matriculado, sem telemetria.

    Esperado para A: uso 1800 s (1200 + 600; a view velha dava 3 × 1800 = 5400, uma vez por abertura);
    2 sessões, ambas no dia 20/10 de Brasília; ativo 600 (300 + 200 + 100, só escopo topic); média por
    tópico (400 + 200) / 2 = 300; conclusão média 300 s (só a abertura concluída).
"""

from __future__ import annotations

import uuid
from datetime import date

from tests import _f5_banco as f5

M1 = f5.modulo("20261031_03_views_de_metricas_no_alembic.py")
M2 = f5.modulo("20261031_04_views_de_metricas_tempo_e_sessoes.py")
I16 = f5.modulo("20261029_03_invariantes_das_metricas.py").INVARIANTES["16"]

S1, S2, S3 = (uuid.UUID(int=i) for i in (101, 102, 103))


def _semear(c) -> None:
    f5.semear_turma(c)
    f5.sessao(c, S1, f5.A, "2026-10-20T12:00:00Z", "2026-10-20T12:20:00Z")
    f5.tempo(c, S1, f5.A, "topic", 10, 300, 100, "2026-10-20T12:06:00Z")
    f5.tempo(c, S1, f5.A, "topic", 11, 200, 0, "2026-10-20T12:15:00Z")
    f5.tempo(c, S1, f5.A, "content", 10, 300, 100, "2026-10-20T12:06:00Z")
    f5.evento(c, S1, f5.A, "topic_open", 10, "2026-10-20T12:01:00Z")
    f5.evento(c, S1, f5.A, "topic_complete", 10, "2026-10-20T12:06:00Z")
    f5.evento(c, S1, f5.A, "topic_open", 11, "2026-10-20T12:07:00Z")
    f5.sessao(c, S2, f5.A, "2026-10-21T01:30:00Z", "2026-10-21T01:40:00Z")
    f5.tempo(c, S2, f5.A, "topic", 10, 100, 0, "2026-10-21T01:35:00Z")
    f5.evento(c, S2, f5.A, "topic_open", 10, "2026-10-21T01:31:00Z")
    f5.sessao(c, S3, f5.C, "2026-10-20T15:00:00Z", "2026-10-20T15:05:00Z")
    c.execute(
        "INSERT INTO public.telemetria_lotes (id, sessao_id, aluno_id, classe_id, screen_name, route_name, flush_reason,"
        " captured_at, study_elapsed_sec, screen_dwell_sec, active_sec, idle_sec, touch_count, scroll_distance_px,"
        " max_depth_px, payload) VALUES (%s, %s, %s, 1, 't', 'r', 'interval', '2026-10-20T15:04:00Z', 0, 240, 200, 40,"
        " 0, 0, 0, '{}')",
        (uuid.uuid4(), S3, f5.C),
    )


def _banco(*, corrigido: bool = True):
    sql = f5.sql_de(M1) + (f5.sql_de(M2) if corrigido else [])
    return f5.banco(*sql)


def _engajamento(c, aluno):
    cur = c.execute("SELECT * FROM public.vw_metricas_engajamento_aluno_classe WHERE aluno_id = %s", (aluno,))
    linha = cur.fetchone()
    return None if linha is None else dict(zip([d.name for d in cur.description], linha))


@f5.e2e
def test_antes_da_correcao_a_i16_acusa_o_fan_out() -> None:
    """O defeito reproduzido: 3 aberturas de tópico, uso multiplicado por 3."""
    with _banco(corrigido=False) as c:
        _semear(c)
        assert _engajamento(c, f5.A)["tempo_total_uso_seg"] == 5400
        assert len(c.execute(I16).fetchall()) == 1


@f5.e2e
def test_i16_passa() -> None:
    with _banco() as c:
        _semear(c)
        assert c.execute(I16).fetchall() == []


@f5.e2e
def test_tempo_total_e_a_soma_das_sessoes() -> None:
    with _banco() as c:
        _semear(c)
        e = _engajamento(c, f5.A)
        assert e["tempo_total_uso_seg"] == 1800
        assert e["numero_sessoes"] == 2
        assert e["tempo_medio_sessao_seg"] == 900


@f5.e2e
def test_sessao_das_22h30_conta_no_dia_de_brasilia() -> None:
    with _banco() as c:
        _semear(c)
        dia = c.execute("SELECT dia FROM public.vw_metricas_sessoes_aluno_dia WHERE sessao_id = %s", (S2,)).fetchone()[0]
        assert dia == date(2026, 10, 20)
        assert _engajamento(c, f5.A)["sessoes_por_dia"] == 2


@f5.e2e
def test_tempo_ativo_vem_so_do_escopo_topic() -> None:
    with _banco() as c:
        _semear(c)
        e = _engajamento(c, f5.A)
        assert e["tempo_ativo_seg"] == 600  # com o escopo content junto seriam 900
        assert e["tempo_medio_topico_seg"] == 300


@f5.e2e
def test_conclusao_media_ignora_abertura_sem_conclusao() -> None:
    with _banco() as c:
        _semear(c)
        assert _engajamento(c, f5.A)["tempo_medio_conclusao_topico_seg"] == 300


@f5.e2e
def test_sem_linha_de_tempo_o_tempo_ativo_e_nulo_nao_zero() -> None:
    with _banco() as c:
        _semear(c)
        ativo = c.execute(
            "SELECT tempo_ativo_seg FROM public.vw_metricas_sessoes_aluno_dia WHERE sessao_id = %s", (S3,)
        ).fetchone()[0]
        assert ativo is None
        e = _engajamento(c, f5.C)
        assert e["tempo_ativo_seg"] is None
        assert e["tempo_medio_conclusao_topico_seg"] is None
        assert e["taxa_abandono_pct"] is None  # sem linha em topico_aluno: sem dado, não 0%


@f5.e2e
def test_aluno_sem_telemetria_nao_ganha_linha() -> None:
    with _banco() as c:
        _semear(c)
        assert _engajamento(c, f5.B) is None


@f5.e2e
def test_as_dependentes_continuam_de_pe() -> None:
    with _banco() as c:
        _semear(c)
        for view in ("vw_metricas_turma_geral_classe", "vw_metricas_turma_perfil_classe",
                     "vw_metricas_distribuicao_turma_classe"):
            c.execute(f"SELECT * FROM public.{view}").fetchall()


@f5.e2e
def test_downgrade_volta_ao_texto_de_producao() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M2, "downgrade"):
            c.execute(sql)
        for nome, corpo in M1.VIEWS:
            atual = c.execute("SELECT pg_get_viewdef(%s::regclass, true)", (f"public.{nome}",)).fetchone()[0]
            assert atual == corpo, nome
