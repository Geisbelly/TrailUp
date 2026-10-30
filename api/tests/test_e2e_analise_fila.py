"""Ponta a ponta do worker da fila de análise (F3, Task 2): o laço da API contra o Postgres local.

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. O banco descartável é o
de `test_e2e_analise_de_lote_pela_fila.py` (esqueleto da produção, gatilhos da F0, F2 e #709, os de
retenção de `telemetria_lotes` e a `20261029_09`), tudo recortado da fonte. O app é falso só no que o
worker lê dele (`state.settings` e `state.session_factory`, um engine async no banco descartável);
`run_analysis` é substituído (sem LLM) e o modo restrito é liberado pelo `conftest`.

O que se mede: uma passada esvazia a fila e a I15 (lote sem análise com mais de 1 h) zera; o lote que sempre derruba a análise sai da fila
na quinta tentativa com `analysis_error = 'fila: ...'`.
"""

from __future__ import annotations

import json
import uuid
from datetime import timedelta
from types import SimpleNamespace

import pytest

from tests import test_e2e_analise_de_lote_pela_fila as t1

DSN = t1.DSN
I20 = t1.f2.M_INV.INVARIANTES["20"] if DSN else ""  # cortada da 20261029_03

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)


def _payload_valido(sessao: uuid.UUID) -> str:
    return json.dumps(
        {
            "sessao_id": str(sessao),
            "classe_id": 1,
            "topico_id": 1,
            "screen_name": "tela",
            "route_name": "/rota",
            "flush_reason": "interval",
            "captured_at": "2026-10-29T12:00:00Z",
            "session_started_at": "2026-10-29T11:50:00Z",
            "study_elapsed_sec": 1,
            "screen_dwell_sec": 1,
            "active_sec": 1,
            "idle_sec": 0,
            "touch_count": 0,
            "scroll_distance_px": 0,
            "max_depth_px": 0,
            "signals": [{"type": "topic_open", "timestamp": 1, "topico_id": 1}],
        }
    )


@pytest.fixture
def banco():
    with t1._banco() as par:
        yield par


@pytest.fixture
async def app_falso(banco):
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    c, _ = banco
    url = "postgresql+asyncpg://" + t1.base._dsn_para(c.info.dbname).split("://", 1)[1]
    engine = create_async_engine(url)
    settings = SimpleNamespace(
        telemetria_analise_fila_enabled=True,
        telemetria_analise_fila_interval_seconds=30,
        telemetria_analise_fila_lote=5,
        telemetria_analise_fila_trava_seconds=600,
        telemetria_analise_fila_concorrencia=2,
    )
    try:
        yield SimpleNamespace(
            state=SimpleNamespace(settings=settings, session_factory=async_sessionmaker(engine, expire_on_commit=False))
        )
    finally:
        await engine.dispose()


async def test_processar_uma_vez_esvazia_a_fila_e_a_i15_zera(banco, app_falso, monkeypatch):
    from app.schemas.api import AnalisarResponse
    from app.services import analise_fila as af

    c, sessao = banco
    # a I15 só acusa lote sem análise com mais de 1 h
    lotes = [t1._lote(c, sessao, idade=timedelta(hours=2), payload=_payload_valido(sessao)) for _ in range(2)]
    for lote in lotes:
        t1._vence(c, lote)
    assert sorted(t1._i15(c)) == sorted(str(lote) for lote in lotes)  # pré-condição

    analisados: list[str] = []

    async def falso(**kwargs):
        analisados.append(kwargs["batch_id"])
        assert kwargs["request"].app is app_falso
        return AnalisarResponse(ciclo_id=f"ciclo-{kwargs['batch_id'][:8]}")

    monkeypatch.setattr(af, "run_analysis", falso)

    contagem = await af.processar_fila_analise_uma_vez(app_falso)

    assert contagem["analisado"] == 2
    assert sum(contagem.values()) == 2
    assert sorted(analisados) == sorted(str(lote) for lote in lotes)
    for lote in lotes:
        assert t1._analise(c, lote) == (f"ciclo-{str(lote)[:8]}", None)
    assert t1._fila(c) == 0
    assert t1._i15(c) == []

    # fila vazia: a passada seguinte não faz nada
    assert sum((await af.processar_fila_analise_uma_vez(app_falso)).values()) == 0


async def test_lote_envenenado_sai_da_fila_na_quinta(banco, app_falso, monkeypatch):
    from app.services import analise_fila as af

    c, sessao = banco
    lote = t1._lote(c, sessao, idade=timedelta(hours=2), payload=_payload_valido(sessao))

    async def sempre_quebra(**_kwargs):
        raise RuntimeError("lote envenenado")

    monkeypatch.setattr(af, "run_analysis", sempre_quebra)

    for tentativa in range(1, 6):
        t1._vence(c, lote)
        contagem = await af.processar_fila_analise_uma_vez(app_falso)
        assert contagem["falhou"] == 1, tentativa
        if tentativa < 5:
            item = t1._item(c, lote)
            assert item["tentativas"] == tentativa
            assert item["ultimo_erro"] == "RuntimeError: lote envenenado"
            assert t1._analise(c, lote) == (None, None)

    ciclo, erro = t1._analise(c, lote)
    assert ciclo is None
    assert erro.startswith("fila: ")
    assert erro == "fila: RuntimeError: lote envenenado"
    assert t1._item(c, lote) is None
    assert t1._i15(c) == []


def _com_camera(sessao: uuid.UUID) -> dict:
    payload = json.loads(_payload_valido(sessao))
    payload["camera"] = {
        "enabled": True,
        "frame_mime": "image/jpeg",
        "frame_b64": "AAAA",
        "frames": [{"captured_at": "2026-10-29T11:59:00Z", "frame_mime": "image/jpeg", "frame_b64": "BBBB"}],
    }
    return payload


def _gravado_pelo_app(sessao: uuid.UUID) -> str:
    """O formato de `sanitizarCameraParaBanco` (mobile/src/services/telemetriaPayload.ts), que é o que o
    caminho direto grava: câmera e frames sem `frame_b64`, mais `frames_count`."""
    payload = _com_camera(sessao)
    camera = {k: v for k, v in payload["camera"].items() if k not in ("frame_b64", "frames")}
    frames = [{k: v for k, v in f.items() if k != "frame_b64"} for f in payload["camera"]["frames"]]
    payload["camera"] = {**camera, "frames": frames, "frames_count": len(frames)}
    return json.dumps(payload)


def _gravado_pela_api(sessao: uuid.UUID) -> str:
    from app.api.v1.telemetria import _sanitize_lote_payload
    from app.schemas.telemetria import TelemetriaLotePayload

    return json.dumps(_sanitize_lote_payload(TelemetriaLotePayload.model_validate(_com_camera(sessao))))


# O INSERT do caminho direto da F2 (como `authenticated`), com o payload como parâmetro em vez de '{}'.
LOTE_DIRETO_COM_PAYLOAD = t1.f2.LOTE_DIRETO.replace("'{}'::jsonb", "%s::jsonb")


async def test_lote_do_caminho_direto_e_analisado(banco, app_falso, monkeypatch):
    """O caso que motivou a F3: o lote que o app gravou direto no Supabase, como `authenticated`, com a
    câmera ligada (frames sem bytes)."""
    from app.schemas.api import AnalisarResponse
    from app.services import analise_fila as af

    assert LOTE_DIRETO_COM_PAYLOAD != t1.f2.LOTE_DIRETO
    c, sessao = banco
    gravado = _gravado_pelo_app(sessao)
    with c.transaction():
        t1.f2._como_aluno(c, t1.A)
        lote = c.execute(
            LOTE_DIRETO_COM_PAYLOAD, (uuid.uuid4(), sessao, t1.A, "interval", t1.T, gravado)
        ).fetchone()[0]
    t1._vence(c, lote)
    assert c.execute(I20).fetchall() == [("cobertura",)]  # pré-condição: o lote direto sem análise

    async def falso(**kwargs):
        assert kwargs["aluno_id"] == str(t1.A)
        assert kwargs["sessao_id"] == str(sessao)
        assert kwargs["frames_b64"] == []
        assert kwargs["telemetry_payload"] == json.loads(gravado)
        return AnalisarResponse(ciclo_id="ciclo-direto")

    monkeypatch.setattr(af, "run_analysis", falso)
    assert (await af.processar_fila_analise_uma_vez(app_falso))["analisado"] == 1
    assert t1._analise(c, lote) == ("ciclo-direto", None)
    assert t1._fila(c) == 0
    assert c.execute(I20).fetchall() == []  # a cobertura de análise dos últimos 7 dias volta a 100%


async def test_lote_com_camera_gravado_pela_api_e_analisado(banco, app_falso, monkeypatch):
    from app.schemas.api import AnalisarResponse
    from app.services import analise_fila as af

    c, sessao = banco
    lote = t1._lote(c, sessao, payload=_gravado_pela_api(sessao))
    t1._vence(c, lote)
    monkeypatch.setattr(af, "run_analysis", lambda **_k: _ciclo(AnalisarResponse(ciclo_id="ciclo-cam")))
    assert (await af.processar_fila_analise_uma_vez(app_falso))["analisado"] == 1
    assert t1._analise(c, lote) == ("ciclo-cam", None)


async def _ciclo(resposta):
    return resposta


async def test_ponteiro_do_r2_sai_rotulado_com_o_ultimo_erro(banco, app_falso, monkeypatch):
    from app.services import analise_fila as af

    c, sessao = banco
    lote = t1._lote(c, sessao, payload='{"_r2": "telemetria/lotes/x.json", "_bucket": "b"}')
    t1._falhou(c, lote, "RuntimeError: llm fora")  # o pedido falhou e deixou o lote na fila
    t1._vence(c, lote)

    async def nao_roda(**_kwargs):
        raise AssertionError("run_analysis não devia ser chamado")

    monkeypatch.setattr(af, "run_analysis", nao_roda)
    assert (await af.processar_fila_analise_uma_vez(app_falso))["payload_no_r2"] == 1
    assert t1._analise(c, lote) == (None, "payload_no_r2: RuntimeError: llm fora")
    assert t1._fila(c) == 0


# ------------------------------------------------------------------------------------------ turmas


def _segunda_turma(c) -> int:
    c.execute(
        "INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE "
        "VALUES (2, 1, %s, 'B')",
        (t1.f2.PROF,),
    )
    return 2


def test_reivindicar_so_das_turmas_pedidas(banco):
    """A guarda do #652: uma API local restrita a uma turma não consome a fila das outras."""
    c, sessao = banco
    turma_b = _segunda_turma(c)
    da_a, da_b = t1._lote(c, sessao), t1._lote(c, sessao)
    c.execute("UPDATE public.telemetria_lotes SET classe_id = %s WHERE id = %s", (turma_b, da_b))
    for lote in (da_a, da_b):
        t1._vence(c, lote)

    pegos = [r[0] for r in c.execute("SELECT * FROM public.fn_telemetria_analise_reivindicar(10, 600, ARRAY[1]::bigint[])")]
    assert pegos == [da_a]
    assert t1._item(c, da_b)["tentativas"] == 0
    # NULL: todas
    assert t1._reivindicar(c) == [da_b]


def test_desistencia_por_trava_vencida_respeita_as_turmas(banco):
    c, sessao = banco
    turma_b = _segunda_turma(c)
    morto_b = t1._lote(c, sessao)
    c.execute("UPDATE public.telemetria_lotes SET classe_id = %s WHERE id = %s", (turma_b, morto_b))
    c.execute(
        "UPDATE public.telemetria_analise_fila SET proxima_tentativa_em = now() - interval '1 minute', "
        "tentativas = 5, travado_em = now() - interval '20 minutes' WHERE lote_id = %s",
        (morto_b,),
    )
    assert [r[0] for r in c.execute("SELECT * FROM public.fn_telemetria_analise_reivindicar(10, 600, ARRAY[1]::bigint[])")] == []
    assert t1._analise(c, morto_b) == (None, None)  # o lote da outra turma não é tocado
    assert t1._reivindicar(c) == []
    assert t1._analise(c, morto_b) == (None, "fila: trava vencida")


async def test_worker_restrito_a_uma_turma(banco, app_falso, monkeypatch):
    from app.schemas.api import AnalisarResponse
    from app.services import analise_fila as af

    c, sessao = banco
    turma_b = _segunda_turma(c)
    da_a = t1._lote(c, sessao, payload=_payload_valido(sessao))
    da_b = t1._lote(c, sessao, payload=_payload_valido(sessao))
    c.execute("UPDATE public.telemetria_lotes SET classe_id = %s WHERE id = %s", (turma_b, da_b))
    for lote in (da_a, da_b):
        t1._vence(c, lote)
    app_falso.state.settings.personalizacao_jobs_classe_ids = [1]
    monkeypatch.setattr(af, "run_analysis", lambda **_k: _ciclo(AnalisarResponse(ciclo_id="c-a")))

    assert (await af.processar_fila_analise_uma_vez(app_falso))["analisado"] == 1
    assert t1._analise(c, da_a) == ("c-a", None)
    assert t1._analise(c, da_b) == (None, None)
    assert t1._item(c, da_b)["tentativas"] == 0


# ------------------------------------------------------------------------- falha do pedido x trava


async def _falha_pelo_repositorio(app_falso, lote, erro, **kwargs) -> None:
    from app.repositories.telemetria import TelemetriaRepository

    async with app_falso.state.session_factory() as session:
        await TelemetriaRepository(session).registrar_falha_analise(batch_id=str(lote), erro=erro, **kwargs)
        await session.commit()


async def test_falha_do_pedido_nao_solta_a_trava_viva_do_worker(banco, app_falso):
    """O pedido demorou mais que a folga, o worker já reivindicou e está analisando: a falha do pedido
    não pode zerar `travado_em` (outro worker pegaria o mesmo lote no meio da análise)."""
    c, sessao = banco
    lote = t1._lote(c, sessao)
    t1._vence(c, lote)
    assert t1._reivindicar(c) == [lote]
    antes = t1._item(c, lote)

    await _falha_pelo_repositorio(app_falso, lote, "RuntimeError: pedido", respeitar_trava=True, trava_seg=600)
    depois = t1._item(c, lote)
    assert depois["travado_em"] == antes["travado_em"]
    assert depois["ultimo_erro"] is None
    assert depois["proxima_tentativa_em"] == antes["proxima_tentativa_em"]

    # o worker (dono da trava) registra normalmente
    await _falha_pelo_repositorio(app_falso, lote, "RuntimeError: worker")
    item = t1._item(c, lote)
    assert item["travado_em"] is None
    assert item["ultimo_erro"] == "RuntimeError: worker"


async def test_falha_do_pedido_sem_trava_ou_com_trava_vencida_registra(banco, app_falso):
    c, sessao = banco
    livre, vencida = t1._lote(c, sessao), t1._lote(c, sessao)
    c.execute(
        "UPDATE public.telemetria_analise_fila SET travado_em = now() - interval '20 minutes', tentativas = 1 "
        "WHERE lote_id = %s",
        (vencida,),
    )
    for lote in (livre, vencida):
        await _falha_pelo_repositorio(app_falso, lote, "RuntimeError: pedido", respeitar_trava=True, trava_seg=600)
        item = t1._item(c, lote)
        assert item["ultimo_erro"] == "RuntimeError: pedido", lote
        assert item["travado_em"] is None


async def test_banco_sem_a_fila_da_erro_42883():
    """O erro de verdade que o fallback do pedido reconhece: banco sem a 20261029_09."""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.v1.telemetria import _fila_ausente
    from app.repositories.telemetria import TelemetriaRepository

    with t1._banco(migrar=False) as (c, sessao):
        lote = t1._lote(c, sessao)
        url = "postgresql+asyncpg://" + t1.base._dsn_para(c.info.dbname).split("://", 1)[1]
        engine = create_async_engine(url)
        try:
            async with async_sessionmaker(engine)() as session:
                with pytest.raises(Exception) as erro:
                    await TelemetriaRepository(session).registrar_falha_analise(
                        batch_id=str(lote), erro="x", respeitar_trava=True, trava_seg=600
                    )
        finally:
            await engine.dispose()
    assert _fila_ausente(erro.value) is True


async def test_lote_sem_payload_valido_sai_rotulado(banco, app_falso, monkeypatch):
    """Só o que nem objeto JSON é: `payload_invalido`."""
    from app.services import analise_fila as af

    c, sessao = banco
    lote = t1._lote(c, sessao, payload="[1, 2]")
    t1._vence(c, lote)

    async def nao_roda(**_kwargs):
        raise AssertionError("run_analysis não devia ser chamado")

    monkeypatch.setattr(af, "run_analysis", nao_roda)
    assert (await af.processar_fila_analise_uma_vez(app_falso))["payload_invalido"] == 1
    assert t1._analise(c, lote) == (None, "payload_invalido")
    assert t1._fila(c) == 0


async def test_lote_fora_do_schema_e_analisado_sem_eventos(banco, app_falso, monkeypatch):
    from app.schemas.api import AnalisarResponse
    from app.services import analise_fila as af

    c, sessao = banco
    lote = t1._lote(c, sessao)  # payload '{}': objeto, mas fora do TelemetriaLotePayload
    t1._vence(c, lote)

    async def falso(**kwargs):
        assert kwargs["eventos_novos"] == []
        assert kwargs["telemetry_payload"] == {}
        return AnalisarResponse(ciclo_id="c-fora")

    monkeypatch.setattr(af, "run_analysis", falso)
    assert (await af.processar_fila_analise_uma_vez(app_falso))["analisado"] == 1
    assert t1._analise(c, lote) == ("c-fora", None)


# ----------------------------------------------------------------------------- vazão e ordem


async def test_dois_consumidores_pegam_lotes_disjuntos(banco, app_falso, monkeypatch):
    """Dois consumidores ao mesmo tempo (o laço de verdade), cada um reivindicando um item por vez com as
    suas sessões: o `SKIP LOCKED` os mantém disjuntos, e a fila drena sem esperar o intervalo."""
    import asyncio

    from app.schemas.api import AnalisarResponse
    from app.services import analise_fila as af

    c, sessao = banco
    lotes = [t1._lote(c, sessao, payload=_payload_valido(sessao)) for _ in range(12)]
    for lote in lotes:
        t1._vence(c, lote)
    analisados: list[str] = []
    em_voo = 0
    maximo = 0

    async def falso(**kwargs):
        nonlocal em_voo, maximo
        em_voo += 1
        maximo = max(maximo, em_voo)
        try:
            await asyncio.sleep(0.05)
        finally:
            em_voo -= 1
        analisados.append(kwargs["batch_id"])
        return AnalisarResponse(ciclo_id="c-" + kwargs["batch_id"][:8])

    monkeypatch.setattr(af, "run_analysis", falso)
    app_falso.state.settings.telemetria_analise_fila_lote = 5  # 12 lotes: mais de uma passada cheia
    laco = asyncio.create_task(af.analise_fila_loop(app_falso))
    try:
        for _ in range(200):
            if t1._fila(c) == 0:
                break
            await asyncio.sleep(0.05)
    finally:
        laco.cancel()
        with pytest.raises(asyncio.CancelledError):
            await laco

    assert t1._fila(c) == 0, "a fila não drenou: o laço dormiu o intervalo entre passadas cheias"
    assert sorted(analisados) == sorted(str(lote) for lote in lotes)  # cada um exatamente uma vez
    assert maximo == 2
    assert all(t1._analise(c, lote)[0] == "c-" + str(lote)[:8] for lote in lotes)


def test_retroativo_sai_do_mais_antigo():
    """O retroativo enfileira todos com o mesmo `now()`: o desempate é o `created_at`, porque a janela de
    recorrência de `aluno_mental_state_history` depende da ordem em que os ciclos acontecem."""
    with t1._banco(migrar=False) as (c, sessao):
        # inseridos fora de ordem, para a ordem de inserção não coincidir com a de criação
        um_dia = t1._lote(c, sessao, idade=timedelta(days=1))
        tres_dias = t1._lote(c, sessao, idade=timedelta(days=3))
        dois_dias = t1._lote(c, sessao, idade=timedelta(days=2))
        t1._upgrade(c)
        assert t1._reivindicar(c, 1) == [tres_dias]
        assert t1._reivindicar(c, 10) == [dois_dias, um_dia]
