"""`metricas_perfil_formato` (`20261102_26`, #20) num Postgres local descartável.

Turma 1, janela de outubro. A e B têm perfil dominante `achiever` (B empata com `socializer` e
o nome desempata); C não tem `aluno_perfil`. Os números esperados estão calculados à mão nos
comentários: cada um diz de onde vem.
"""

from __future__ import annotations

import datetime
import uuid

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_estudo_coorte as e
from tests.test_e2e_kpis_por_topico import POSSE

M = f5.modulo("20261102_26_metricas_perfil_formato.py")
OUTUBRO = ("2026-10-01", "2026-10-31")


def _banco(*depois: str):
    return f5.banco(
        e.GRANTS_SUPABASE, POSSE, e.APP_E_DEV, e.RETENCAO, *f5.sql_de(e.M_CATALOGO), *f5.sql_de(M), *depois
    )


def _n_minimo(c, n: int) -> None:
    c.execute("UPDATE public.metricas_catalogo SET n_minimo = %s WHERE left(chave, 4) = 'pr3.'", (n,))


def _rpc(c, quem, classes: list[int], janela: tuple[str | None, str | None] = OUTUBRO) -> dict:
    return e._como(c, quem, "SELECT public.metricas_perfil_formato(%s, %s, %s)", (classes, *janela))[0][0]


def _material(c, sid: uuid.UUID, aluno: uuid.UUID, topico: int, tipo: str, ativo: float, quando: str,
              personalizado: bool = True) -> None:
    """Uma linha do escopo `material`, com o `item_key` que o app grava (medido em produção)."""
    item = "content:5:personalization:7:personalized:3:content:5" if personalizado else "content:5"
    lote = uuid.uuid4()
    c.execute(
        "INSERT INTO public.telemetria_lotes (id, sessao_id, aluno_id, classe_id, topico_id, screen_name, route_name,"
        " flush_reason, captured_at, study_elapsed_sec, screen_dwell_sec, active_sec, idle_sec, touch_count,"
        " scroll_distance_px, max_depth_px, payload)"
        " VALUES (%s, %s, %s, %s, %s, 't', 'r', 'interval', %s, 0, %s, %s, 0, 0, 0, 0, '{}')",
        (lote, sid, aluno, f5.TURMA, topico, quando, ativo, ativo),
    )
    c.execute(
        "INSERT INTO public.telemetria_time_metric_entries (lote_id, sessao_id, aluno_id, classe_id, topico_id, scope,"
        " item_key, material_tipo, dwell_sec, active_sec, idle_sec, captured_at)"
        " VALUES (%s, %s, %s, %s, %s, 'material', %s, %s, %s, %s, 0, %s)",
        (lote, sid, aluno, f5.TURMA, topico, item, tipo, ativo, ativo, quando),
    )


def _semear(c) -> None:
    f5.semear_turma(c)
    for tabela in ("atividades", "questoes", "questao_aluno", "conteudo_personalizado"):
        f5.afrouxa(c, tabela)
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES ('{e.OUTRO_PROF}', 'p2@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{e.OUTRO_PROF}', 'Outro');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE
  VALUES (3, 1, '{e.OUTRO_PROF}', 'T3');
INSERT INTO public.perfil (id, nome) VALUES
  (13, 'seeker'), (14, 'achiever'), (15, 'survivor'), (16, 'daredevil'),
  (17, 'mastermind'), (18, 'conqueror'), (19, 'socializer');
INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) VALUES
  ('{f5.A}', 14, 80), ('{f5.A}', 13, 40),
  ('{f5.B}', 14, 60), ('{f5.B}', 19, 60);
INSERT INTO public.atividades (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES (500, 10, 'Quiz'), (501, 11, 'Quiz 2');
INSERT INTO public.questoes (id, atividade_id, enunciado) OVERRIDING SYSTEM VALUE VALUES
  (900, 500, 'Q'), (901, 500, 'Q2'), (902, 501, 'Q3');
"""
    )


def _dados(c) -> None:
    s = uuid.uuid4()
    f5.sessao(c, s, f5.A, "2026-10-01T10:00:00Z", None)
    # A: tópico 10 mais em markdown (600 > 300), tópico 11 só em áudio. Total 1500 s.
    _material(c, s, f5.A, 10, "markdown", 600, "2026-10-10T12:00:00Z")
    _material(c, s, f5.A, 10, "audio", 300, "2026-10-10T13:00:00Z")
    _material(c, s, f5.A, 11, "audio", 600, "2026-10-12T12:00:00Z")
    # Fora da conta: material do professor e estudo antes da janela.
    _material(c, s, f5.A, 10, "markdown", 999, "2026-10-10T14:00:00Z", personalizado=False)
    _material(c, s, f5.A, 10, "markdown", 5000, "2026-09-15T12:00:00Z")
    # B: tópico 10 em áudio. C (sem perfil): conta só na população.
    _material(c, s, f5.B, 10, "audio", 300, "2026-10-11T12:00:00Z")
    _material(c, s, f5.C, 10, "markdown", 100, "2026-10-11T12:00:00Z")
    c.cursor().executemany(
        "INSERT INTO public.questao_aluno (aluno_id, questao_id, atividade_id, tentativa, resposta, correta, criado_em)"
        " VALUES (%s, %s, %s, %s, 'x', %s, %s)",
        [
            (f5.A, 900, 500, 1, True, "2026-10-10T15:00:00Z"),
            (f5.A, 901, 500, 1, False, "2026-10-10T15:00:00Z"),
            (f5.A, 901, 500, 2, True, "2026-10-10T16:00:00Z"),  # 2ª tentativa: fora
            (f5.A, 902, 501, 1, False, "2026-10-12T15:00:00Z"),
            (f5.B, 900, 500, 1, True, "2026-10-11T15:00:00Z"),
        ],
    )
    c.cursor().executemany(
        "INSERT INTO public.conteudo_personalizado (aluno_id, classe_id, topico_id, ciclo_id, formato_prioritario)"
        " VALUES (%s, 1, %s, 'c', %s)",
        [(f5.A, 10, "cards"), (f5.A, 11, "audio"), (f5.B, 10, "cards"), (f5.C, 10, "")],
    )


def _perfil(r: dict, nome: str, chave: str = "por_perfil_dominante") -> dict:
    return next(p for p in r[chave] if p["perfil"] == nome)


def _formato(p: dict, nome: str) -> dict:
    return next(f for f in p["formatos"] if f["formato"] == nome)


@f5.e2e
def test_engajamento_desempenho_e_decisao_por_perfil_dominante() -> None:
    with _banco() as c:
        _semear(c)
        _dados(c)
        _n_minimo(c, 1)
        r = _rpc(c, f5.PROF, [f5.TURMA])
        assert r["janela"] == {"inicio": "2026-10-01", "fim": "2026-10-31", "timezone": "America/Sao_Paulo"}
        assert r["populacao"] == {"alunos": 3, "com_perfil": 2, "sem_perfil": 1, "com_uso_personalizado": 3}
        assert r["formatos"] == ["audio", "cards", "markdown"]
        assert [p["perfil"] for p in r["por_perfil_dominante"]] == sorted(
            ["seeker", "achiever", "survivor", "daredevil", "mastermind", "conqueror", "socializer"]
        )

        ach = _perfil(r, "achiever")
        assert (ach["alunos"], ach["alunos_com_uso"], ach["amostra_insuficiente"], ach["afinidade_media"]) == (
            2, 2, False, 70.0,
        )
        audio, markdown, cards = (_formato(ach, f) for f in ("audio", "markdown", "cards"))
        # Áudio: os dois usaram; 900 + 300 s = 10 min por aluno; fatias 0,6 (A) e 1 (B).
        assert (audio["uso_pct"], audio["tempo_ativo_min_por_aluno"], audio["fatia_do_tempo_pct"]) == (100, 10, 80)
        assert (markdown["uso_pct"], markdown["tempo_ativo_min_por_aluno"], markdown["fatia_do_tempo_pct"]) == (
            50, 5, 20,
        )
        assert (cards["uso_pct"], cards["fatia_do_tempo_pct"]) == (0, 0)
        # Decisão do grafo: 3 personalizações (C, sem perfil e sem formato, não entra): 2 cards, 1 áudio.
        assert (cards["prioritario_pct"], audio["prioritario_pct"], markdown["prioritario_pct"]) == (66.67, 33.33, 0)
        # Desempenho pelo formato dominante do tópico: A/10 markdown (1 de 2), A/11 áudio (0 de 1),
        # B/10 áudio (1 de 1). A 2ª tentativa de A não conta.
        assert audio["desempenho"] == {
            "alunos": 2, "amostra_insuficiente": False, "topicos": 2, "respostas": 2,
            "acerto_primeira_tentativa_pct": 50, "ic95_pct": [9.45, 90.55],
        }
        assert markdown["desempenho"]["respostas"] == 2
        assert markdown["desempenho"]["acerto_primeira_tentativa_pct"] == 50
        assert cards["desempenho"] == {
            "alunos": 0, "amostra_insuficiente": True, "topicos": None, "respostas": None,
            "acerto_primeira_tentativa_pct": None, "ic95_pct": None,
        }
        # Socializer não é dominante de ninguém (B empata e o nome desempata).
        soc = _perfil(r, "socializer")
        assert (soc["alunos"], soc["amostra_insuficiente"]) == (0, True)
        assert all(f["uso_pct"] is None for f in soc["formatos"])


@f5.e2e
def test_vetor_de_afinidades_pesa_cada_aluno_em_todos_os_perfis() -> None:
    with _banco() as c:
        _semear(c)
        _dados(c)
        _n_minimo(c, 1)
        r = _rpc(c, f5.PROF, [f5.TURMA])
        ach = _perfil(r, "achiever", "por_afinidade")
        audio = _formato(ach, "audio")
        # Pesos 0,8 (A) e 0,6 (B): fatia (0,8·0,6 + 0,6·1) / 1,4; n efetivo 1,4² / (0,64 + 0,36).
        assert (audio["fatia_do_tempo_pct"], audio["n_efetivo"]) == (77.14, 1.96)
        # Acerto: (0,8·0 + 0,6·1) / (0,8·1 + 0,6·1).
        assert audio["desempenho"] == {"n_efetivo": 1.96, "amostra_insuficiente": False,
                                       "acerto_primeira_tentativa_pct": 42.86}
        assert _formato(ach, "markdown")["desempenho"]["n_efetivo"] == 1
        # Quem não é dominante também entra: A no seeker (0,4), B no socializer (0,6).
        assert _formato(_perfil(r, "seeker", "por_afinidade"), "audio")["fatia_do_tempo_pct"] == 60
        assert _formato(_perfil(r, "socializer", "por_afinidade"), "audio")["fatia_do_tempo_pct"] == 100
        assert _formato(_perfil(r, "survivor", "por_afinidade"), "audio") == {
            "formato": "audio", "n_efetivo": 0, "amostra_insuficiente": True, "fatia_do_tempo_pct": None,
            "desempenho": {"n_efetivo": 0, "amostra_insuficiente": True, "acerto_primeira_tentativa_pct": None},
        }


@f5.e2e
def test_abaixo_do_minimo_so_a_contagem_de_alunos_sai() -> None:
    with _banco() as c:
        _semear(c)
        _dados(c)  # n_minimo do catálogo: 5
        r = _rpc(c, f5.PROF, [f5.TURMA])
        assert r["n_minimo"] == 5
        ach = _perfil(r, "achiever")
        assert (ach["alunos"], ach["alunos_com_uso"], ach["amostra_insuficiente"], ach["afinidade_media"]) == (
            2, 2, True, None,
        )
        for f in ach["formatos"]:
            numeros = {k: v for k, v in f.items() if k not in ("formato", "desempenho")}
            assert set(numeros.values()) == {None}, f
            assert {k: v for k, v in f["desempenho"].items() if k not in ("alunos", "amostra_insuficiente")} == {
                "topicos": None, "respostas": None, "acerto_primeira_tentativa_pct": None, "ic95_pct": None,
            }
        for p in r["por_afinidade"]:
            for f in p["formatos"]:
                assert f["fatia_do_tempo_pct"] is None and f["desempenho"]["acerto_primeira_tentativa_pct"] is None


@f5.e2e
def test_janela_padrao_sao_os_ultimos_90_dias() -> None:
    with _banco() as c:
        _semear(c)
        r = _rpc(c, f5.PROF, [f5.TURMA], (None, None))
        hoje = c.execute("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date").fetchone()[0]
        assert r["janela"]["fim"] == hoje.isoformat()
        assert r["janela"]["inicio"] == (hoje - datetime.timedelta(days=89)).isoformat()
        assert r["populacao"]["com_uso_personalizado"] == 0
        assert r["formatos"] == []


@f5.e2e
def test_so_o_professor_dono_le_e_a_janela_e_validada() -> None:
    with _banco() as c:
        _semear(c)
        _dados(c)
        for quem, turmas in ((e.OUTRO_PROF, [f5.TURMA]), (f5.PROF, [f5.TURMA, 3]), (f5.A, [f5.TURMA]), (f5.PROF, [])):
            with pytest.raises(psycopg.errors.InsufficientPrivilege, match="turma_nao_encontrada"):
                _rpc(c, quem, turmas)
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="janela_invalida"):
            _rpc(c, f5.PROF, [f5.TURMA], ("2026-10-31", "2026-10-01"))
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="janela_invalida"):
            _rpc(c, f5.PROF, [f5.TURMA], ("2025-01-01", "2026-10-31"))
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            e._anon(c, "SELECT public.metricas_perfil_formato(ARRAY[1]::bigint[])")


@f5.e2e
def test_downgrade_limpa() -> None:
    with _banco(*f5.sql_de(M, "downgrade")) as c:
        assert c.execute("SELECT count(*) FROM pg_proc WHERE proname = 'metricas_perfil_formato'").fetchone() == (0,)
        assert c.execute(
            "SELECT count(*) FROM public.metricas_catalogo WHERE left(chave, 4) = 'pr3.'"
        ).fetchone() == (0,)
