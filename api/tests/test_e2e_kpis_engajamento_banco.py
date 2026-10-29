"""KPIs de engajamento contra PostgreSQL real.

Roda apenas quando ``TRAILUP_KPIS_E2E_DATABASE_URL`` aponta para um banco
local descartável já migrado até a head. Nunca use produção: o fixture cria e
remove professor, alunos, turma, telemetria e personalizações.
"""

from __future__ import annotations

import json
import os
import random
import uuid
from contextlib import contextmanager

import pytest

DSN = os.environ.get("TRAILUP_KPIS_E2E_DATABASE_URL", "")
pytestmark = pytest.mark.skipif(
    not DSN,
    reason="TRAILUP_KPIS_E2E_DATABASE_URL não definido (e2e só em banco descartável)",
)

if DSN:
    import psycopg
    from psycopg import errors
    from psycopg.rows import dict_row

    if any(host in DSN for host in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e de KPIs recusa banco hospedado; use PostgreSQL local")


def _admin():
    return psycopg.connect(DSN, autocommit=True, row_factory=dict_row)


@contextmanager
def _como(uid: uuid.UUID):
    c = psycopg.connect(DSN, autocommit=True, row_factory=dict_row)
    try:
        c.execute("SET ROLE authenticated")
        c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (str(uid),))
        yield c
    finally:
        c.close()


def _rpc(c, classe: int, inicio: str, fim: str):
    return c.execute(
        "SELECT public.metricas_engajamento_turma(%s, %s, %s, 'UTC') AS r",
        (classe, inicio, fim),
    ).fetchone()["r"]


def _rpc_coortes(c, classe: int, inicio: str, fim: str):
    return c.execute(
        "SELECT public.metricas_engajamento_coortes_turma(%s, %s, %s, 'UTC') AS r",
        (classe, inicio, fim),
    ).fetchone()["r"]


@pytest.fixture(scope="module")
def mundo():
    ids = {
        nome: uuid.uuid4()
        for nome in ("professor", "outro_professor", "aluno1", "aluno2", "aluno3", "aluno_fora")
    }
    base = random.randint(100_000_000, 800_000_000)
    ids["classe"] = base
    ids["outra_classe"] = base + 1
    ids["topico1"] = base + 10
    ids["topico2"] = base + 11
    ids["topico_fora"] = base + 12
    ids["sessao_concluida"] = uuid.uuid4()
    ids["sessao_sem_conclusao"] = uuid.uuid4()
    ids["sessao_aberta"] = uuid.uuid4()
    ids["lote1"] = uuid.uuid4()
    ids["lote2"] = uuid.uuid4()
    ids["lote3"] = uuid.uuid4()
    ids["lote_content"] = uuid.uuid4()

    with _admin() as a:
        for nome in ("professor", "outro_professor", "aluno1", "aluno2", "aluno3", "aluno_fora"):
            a.execute(
                "INSERT INTO auth.users (id, email, aud, role) "
                "VALUES (%s, %s, 'authenticated', 'authenticated')",
                (ids[nome], f"{nome}-{ids[nome].hex[:8]}@kpis.local"),
            )
        for nome in ("professor", "outro_professor"):
            a.execute(
                "INSERT INTO public.professor (id, nome, liberado) VALUES (%s, %s, true)",
                (ids[nome], nome),
            )
        for nome in ("aluno1", "aluno2", "aluno3", "aluno_fora"):
            a.execute(
                "INSERT INTO public.alunos (id, nome, email) VALUES (%s, %s, %s)",
                (ids[nome], nome, f"{nome}-{ids[nome].hex[:8]}@kpis.local"),
            )
        a.execute(
            "INSERT INTO public.classe (id, professor_id, descricao) "
            "VALUES (%s, %s, 'KPIs'), (%s, %s, 'Fora')",
            (ids["classe"], ids["professor"], ids["outra_classe"], ids["outro_professor"]),
        )
        for nome in ("aluno1", "aluno2", "aluno3"):
            a.execute(
                "INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (%s, %s)",
                (ids["classe"], ids[nome]),
            )
        a.execute(
            "INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (%s, %s)",
            (ids["outra_classe"], ids["aluno_fora"]),
        )
        a.execute(
            "INSERT INTO public.topicos (id, classe_id, nome) "
            "VALUES (%s,%s,'T1'),(%s,%s,'T2'),(%s,%s,'Fora')",
            (
                ids["topico1"], ids["classe"],
                ids["topico2"], ids["classe"],
                ids["topico_fora"], ids["outra_classe"],
            ),
        )

        perfis = {
            row["nome"].lower(): row["id"]
            for row in a.execute(
                "SELECT id, nome FROM public.perfil "
                "WHERE lower(nome) = ANY(%s)",
                ([
                    "seeker", "survivor", "daredevil", "mastermind",
                    "conqueror", "socializer", "achiever",
                ],),
            ).fetchall()
        }
        assert len(perfis) == 7, "o banco e2e precisa dos sete perfis BrainHex"
        a.execute(
            "INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) "
            "VALUES (%s,%s,90),(%s,%s,30),(%s,%s,80),(%s,%s,20)",
            (
                ids["aluno1"], perfis["seeker"],
                ids["aluno1"], perfis["achiever"],
                ids["aluno2"], perfis["survivor"],
                ids["aluno2"], perfis["achiever"],
            ),
        )

        sessoes = [
            (
                ids["sessao_concluida"], ids["aluno1"],
                "2026-10-06T12:00:00Z", "2026-10-06T12:20:00Z",
            ),
            (
                ids["sessao_sem_conclusao"], ids["aluno2"],
                "2026-10-07T12:00:00Z", "2026-10-07T12:10:00Z",
            ),
            (
                ids["sessao_aberta"], ids["aluno1"],
                "2026-10-13T12:00:00Z", None,
            ),
        ]
        with a.cursor() as cur:
            cur.executemany(
                "INSERT INTO public.telemetria_sessoes "
                "(id, aluno_id, classe_id, started_at, ended_at) VALUES (%s,%s,%s,%s,%s)",
                [(sid, aluno, ids["classe"], inicio, fim) for sid, aluno, inicio, fim in sessoes],
            )

        lotes = [
            (ids["lote1"], ids["sessao_concluida"], ids["aluno1"], ids["topico1"], "2026-10-06T12:01:00Z", 60, 30),
            (ids["lote2"], ids["sessao_sem_conclusao"], ids["aluno2"], ids["topico1"], "2026-10-07T12:01:00Z", 30, 20),
            (ids["lote3"], ids["sessao_aberta"], ids["aluno1"], ids["topico1"], "2026-10-13T12:01:00Z", 120, 10),
            (ids["lote_content"], ids["sessao_concluida"], ids["aluno1"], ids["topico1"], "2026-10-08T12:01:00Z", 999, 0),
        ]
        with a.cursor() as cur:
            cur.executemany(
                "INSERT INTO public.telemetria_lotes "
                "(id,sessao_id,aluno_id,classe_id,topico_id,screen_name,route_name,"
                "flush_reason,captured_at,study_elapsed_sec,screen_dwell_sec,active_sec,"
                "idle_sec,touch_count,scroll_distance_px,max_depth_px,frame_sent,payload) "
                "VALUES (%s,%s,%s,%s,%s,'study','/topic','interval',%s,60,60,%s,%s,0,0,0,false,'{}')",
                [
                    (lid, sid, aluno, ids["classe"], topico, capturado, ativo, idle)
                    for lid, sid, aluno, topico, capturado, ativo, idle in lotes
                ],
            )
            cur.executemany(
                "INSERT INTO public.telemetria_time_metric_entries "
                "(lote_id,sessao_id,aluno_id,classe_id,topico_id,scope,active_sec,"
                "dwell_sec,idle_sec,captured_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                [
                    (ids["lote1"], ids["sessao_concluida"], ids["aluno1"], ids["classe"], ids["topico1"], "topic", 60, 90, 30, "2026-10-06T12:01:00Z"),
                    (ids["lote2"], ids["sessao_sem_conclusao"], ids["aluno2"], ids["classe"], ids["topico1"], "topic", 30, 50, 20, "2026-10-07T12:01:00Z"),
                    (ids["lote3"], ids["sessao_aberta"], ids["aluno1"], ids["classe"], ids["topico1"], "topic", 120, 130, 10, "2026-10-13T12:01:00Z"),
                    (ids["lote_content"], ids["sessao_concluida"], ids["aluno1"], ids["classe"], ids["topico1"], "content", 999, 999, 0, "2026-10-08T12:01:00Z"),
                ],
            )
        a.execute(
            "INSERT INTO public.telemetria_eventos_app "
            "(client_event_id,sessao_id,aluno_id,classe_id,topico_id,event_group,"
            "event_name,event_source,occurred_at,payload) "
            "VALUES ('complete',%s,%s,%s,%s,'navigation','topic_complete','app',"
            "'2026-10-06T12:19:00Z','{}')",
            (
                ids["sessao_concluida"], ids["aluno1"],
                ids["classe"], ids["topico1"],
            ),
        )

        materiais = [
            (None, ids["topico1"], "seeker", {"markdown": {"markdown": "base"}}),
            (None, ids["topico2"], "seeker", {"markdown": {"markdown": "ruim", "metadata": {"status": "failed_quality"}}}),
            (ids["aluno1"], ids["topico2"], "seeker", {"markdown": {"markdown": "individual"}}),
            (None, ids["topico1"], "achiever", {"audio": {"url": "https://local/a.mp3"}}),
            (None, ids["topico2"], "achiever", {"audio": {"url": "https://local/b.mp3"}}),
            (None, ids["topico1"], "survivor", {"markdown": {"text": "ruim", "status": "failed_quality"}}),
            (None, ids["topico2"], "survivor", {"markdown": {"text": "válido"}}),
            (None, ids["topico1"], "mastermind", {"cards": {"cards": [{"id": 1}]}}),
            (None, ids["topico2"], "mastermind", {"cards": {"cards": [{"id": 2}]}}),
        ]
        with a.cursor() as cur:
            cur.executemany(
                "INSERT INTO public.conteudo_personalizado "
                "(aluno_id,classe_id,topico_id,brainhex_profile_key,status,materiais,ciclo_id) "
                "VALUES (%s,%s,%s,%s,'pronto',%s,%s)",
                [
                    (aluno, ids["classe"], topico, perfil, json.dumps(material), f"e2e-{uuid.uuid4()}")
                    for aluno, topico, perfil, material in materiais
                ],
            )
        with a.cursor() as cur:
            cur.executemany(
                "INSERT INTO public.topico_aluno (aluno_id,topico_id,status) "
                "VALUES (%s,%s,%s) ON CONFLICT (aluno_id,topico_id) DO UPDATE SET status=EXCLUDED.status",
                [
                    (ids["aluno1"], ids["topico1"], "concluido"),
                    (ids["aluno1"], ids["topico2"], "em andamento"),
                    (ids["aluno2"], ids["topico1"], "concluido"),
                ],
            )

    yield ids

    with _admin() as a:
        a.execute(
            "DELETE FROM public.classe WHERE id IN (%s,%s)",
            (ids["classe"], ids["outra_classe"]),
        )
        for nome in ("aluno1", "aluno2", "aluno3", "aluno_fora"):
            a.execute("DELETE FROM public.alunos WHERE id=%s", (ids[nome],))
        for nome in ("professor", "outro_professor"):
            a.execute("DELETE FROM public.professor WHERE id=%s", (ids[nome],))
        a.execute(
            "DELETE FROM auth.users WHERE id = ANY(%s)",
            ([value for value in ids.values() if isinstance(value, uuid.UUID)],),
        )


def test_tempo_ativo_nao_soma_escopo_content(mundo):
    with _como(mundo["professor"]) as p:
        r = _rpc(p, mundo["classe"], "2026-10-05", "2026-10-18")
    assert r["engajamento"]["tempo_ativo_seg"] == 210
    assert r["engajamento"]["alunos_ativos"] == 2


def test_retorno_compara_as_duas_semanas_completas(mundo):
    with _como(mundo["professor"]) as p:
        r = _rpc(p, mundo["classe"], "2026-10-05", "2026-10-18")
    assert r["retorno_semanal"]["elegiveis"] == 2
    assert r["retorno_semanal"]["retornaram"] == 1
    assert r["retorno_semanal"]["taxa_pct"] == 50


def test_semanas_parciais_nao_fabricam_retorno_zero(mundo):
    with _como(mundo["professor"]) as p:
        r = _rpc(p, mundo["classe"], "2026-10-06", "2026-10-15")
    assert r["retorno_semanal"]["taxa_pct"] is None
    assert [semana["completa"] for semana in r["retorno_semanal"]["semanas"]] == [False, False]


def test_sessao_aberta_e_encerrada_sem_conclusao_sao_separadas(mundo):
    with _como(mundo["professor"]) as p:
        r = _rpc(p, mundo["classe"], "2026-10-05", "2026-10-18")
    assert r["jornada_sessoes"] == {
        "total": 3,
        "concluidas": 1,
        "encerradas_sem_conclusao": 1,
        "em_aberto": 1,
    }


def test_cobertura_traz_sete_perfis_e_secundario_elegivel(mundo):
    with _como(mundo["professor"]) as p:
        r = _rpc(p, mundo["classe"], "2026-10-05", "2026-10-18")
    perfis = {
        perfil["perfil"]: perfil
        for perfil in r["estado_atual"]["personalizacao"]["perfis"]
    }
    assert len(perfis) == 7
    assert perfis["achiever"]["alunos_elegiveis"] == 1
    assert perfis["mastermind"]["alunos_elegiveis"] == 1


def test_material_individual_completa_base_e_failed_quality_nao_conta(mundo):
    with _como(mundo["professor"]) as p:
        r = _rpc(p, mundo["classe"], "2026-10-05", "2026-10-18")
    perfis = {
        perfil["perfil"]: perfil
        for perfil in r["estado_atual"]["personalizacao"]["perfis"]
    }
    assert perfis["seeker"]["alvos_cobertos"] == 2
    assert perfis["seeker"]["cobertos_individuais"] == 1
    assert perfis["survivor"]["alvos_cobertos"] == 1


def test_conclusao_e_identificada_como_estado_atual(mundo):
    with _como(mundo["professor"]) as p:
        r = _rpc(p, mundo["classe"], "2026-10-05", "2026-10-18")
    assert r["estado_atual"]["historico_disponivel"] is False
    assert r["estado_atual"]["conclusao"]["alvos"] == 6
    assert r["estado_atual"]["conclusao"]["concluidos"] == 2


def test_outro_professor_nao_le_a_turma(mundo):
    with _como(mundo["outro_professor"]) as outro:
        with pytest.raises(errors.InsufficientPrivilege):
            _rpc(outro, mundo["classe"], "2026-10-05", "2026-10-18")


@pytest.mark.parametrize(
    ("inicio", "fim"),
    [
        ("2026-10-18", "2026-10-05"),
        ("2025-01-01", "2026-10-18"),
    ],
)
def test_periodo_invalido_e_recusado(mundo, inicio, fim):
    with _como(mundo["professor"]) as p:
        with pytest.raises(errors.InvalidParameterValue):
            _rpc(p, mundo["classe"], inicio, fim)


def test_coortes_dominantes_sao_sete_e_disjuntas(mundo):
    with _como(mundo["professor"]) as p:
        r = _rpc_coortes(p, mundo["classe"], "2026-10-05", "2026-10-18")
    coortes = {item["perfil"]: item for item in r["coortes_dominantes"]}
    assert len(coortes) == 7
    assert sum(item["alunos"] for item in coortes.values()) == 3
    assert coortes["seeker"]["alunos"] == 1
    assert coortes["survivor"]["alunos"] == 1
    assert coortes["mastermind"]["alunos"] == 1


def test_secundario_exclui_afinidade_igual_a_vinte(mundo):
    with _como(mundo["professor"]) as p:
        r = _rpc_coortes(p, mundo["classe"], "2026-10-05", "2026-10-18")
    segmentos = {item["perfil"]: item for item in r["segmentos_secundarios"]}
    assert len(segmentos) == 7
    assert segmentos["achiever"]["alunos"] == 1
    assert sum(item["alunos"] for item in segmentos.values()) == 1
    assert segmentos["achiever"]["sobreposta"] is True


def test_metricas_da_coorte_usam_so_os_membros(mundo):
    with _como(mundo["professor"]) as p:
        r = _rpc_coortes(p, mundo["classe"], "2026-10-05", "2026-10-18")
    coortes = {item["perfil"]: item for item in r["coortes_dominantes"]}
    assert coortes["seeker"]["engajamento"]["tempo_ativo_seg"] == 180
    assert coortes["survivor"]["engajamento"]["tempo_ativo_seg"] == 30
    assert coortes["mastermind"]["engajamento"]["tempo_ativo_seg"] == 0
    assert coortes["seeker"]["retorno_semanal"]["taxa_pct"] == 100
    assert coortes["survivor"]["retorno_semanal"]["taxa_pct"] == 0


def test_coorte_vazia_preserva_nulos_e_sinal_de_amostra(mundo):
    with _como(mundo["professor"]) as p:
        r = _rpc_coortes(p, mundo["classe"], "2026-10-05", "2026-10-18")
    coortes = {item["perfil"]: item for item in r["coortes_dominantes"]}
    assert coortes["daredevil"]["alunos"] == 0
    assert coortes["daredevil"]["amostra_pequena"] is False
    assert coortes["daredevil"]["engajamento"]["taxa_atividade_pct"] is None
    assert coortes["seeker"]["amostra_pequena"] is True


def test_segmentacao_declara_limites_metodologicos(mundo):
    with _como(mundo["professor"]) as p:
        r = _rpc_coortes(p, mundo["classe"], "2026-10-05", "2026-10-18")
    assert r["segmentacao"]["comparacao_causal"] is False
    assert r["segmentacao"]["historico_perfil_disponivel"] is False
    assert r["geral"]["versao"] == 1


def test_coortes_rejeitam_professor_de_outra_turma(mundo):
    with _como(mundo["outro_professor"]) as outro:
        with pytest.raises(errors.InsufficientPrivilege):
            _rpc_coortes(outro, mundo["classe"], "2026-10-05", "2026-10-18")
