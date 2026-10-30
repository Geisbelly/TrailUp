"""Ponta a ponta da `20261029_09`: o banco enfileira a análise de todo lote novo.

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. O banco descartável é
o da `test_e2e_sessao_fecha_pelo_banco.py` (esqueleto da produção, RLS e policies de posse da
`20260831_01`, consentimento RESTRICTIVE da `20261024_02`, gatilho de via da `20261029_01` e a
`20261029_07`), com a `20261029_08` por cima e, porque aqui se altera e se apaga lote, os gatilhos de
retenção de `telemetria_lotes` (`trg_retencao_fila_lotes_del/_upd`, por comando) com a tabela e a função
que eles usam, recortados da `20261024_03`. Tudo sai da fonte, nada é copiado à mão.

O que se mede:

- lote novo (pelo caminho direto do app, como `authenticated`) entra na fila com 5 min de folga (P2);
  lote que já nasce analisado ou com erro, não;
- análise ou erro gravados no lote tiram o item da fila; apagar o lote também;
- a reivindicação respeita vencimento, limite, ordem e trava vencida, e duas reivindicações abertas ao
  mesmo tempo não pegam o mesmo item (`FOR UPDATE SKIP LOCKED`);
- a falha espaça a próxima tentativa em 2, 4, 8 e 16 min, e a quinta vira `analysis_error` (P4);
- o cliente não lê a fila nem chama as funções do worker;
- o retroativo enfileira os pendentes dos últimos 7 dias e rotula o resto (P3), e a I15 passa a acusar só
  o que a fila ainda vai analisar;
- o downgrade tira tudo e mantém o rótulo.

Dados sintéticos. Recusa banco hospedado.
"""

from __future__ import annotations

import os
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import timedelta

import pytest

DSN = os.environ.get("TRAILUP_E2E_RETENCAO_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

if DSN:
    import psycopg

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e da fila de analise recusa banco hospedado: use um Postgres local")

from tests import test_e2e_guilda_mantem_quem_saiu_da_turma as base  # noqa: E402
from tests import test_e2e_sessao_fecha_pelo_banco as f2  # noqa: E402
from tests import test_e2e_telemetria_so_na_propria_sessao as p708  # noqa: E402

A, B, T = f2.A, f2.B, f2.T
I15 = f2.M_INV.INVARIANTES["15"]

RETENCAO = "20261024_03_retencao_e_expurgo.py"
RETENCAO_TABELA = base._trecho(RETENCAO, "CREATE TABLE IF NOT EXISTS public.retencao_fila_externa (", ");")
RETENCAO_FUNCAO = base._trecho(
    RETENCAO, "CREATE OR REPLACE FUNCTION public.trg_retencao_fila_telemetria()", "$function$;"
)
_FIM_GATILHO = "FOR EACH STATEMENT EXECUTE FUNCTION public.trg_retencao_fila_telemetria();"
RETENCAO_GATILHOS = (
    base._trecho(RETENCAO, "DROP TRIGGER IF EXISTS trg_retencao_fila_lotes_del", _FIM_GATILHO),
    base._trecho(RETENCAO, "DROP TRIGGER IF EXISTS trg_retencao_fila_lotes_upd", _FIM_GATILHO),
)

FUNCOES_DO_WORKER = (
    "public.fn_telemetria_analise_reivindicar(integer, integer, bigint[])",
    "public.fn_telemetria_analise_falhou(uuid, text, boolean, integer)",
)


def _m():
    """Carregado tarde: antes da migration existir, só os testes que a usam falham."""
    return base._modulo("20261029_09_analise_de_lote_pela_fila.py")


def _upgrade(c) -> None:
    for sql in base._sql_de(_m(), "upgrade"):
        c.execute(sql)


def _downgrade(c) -> None:
    for sql in base._sql_de(_m(), "downgrade"):
        c.execute(sql)


@contextmanager
def _banco(*, migrar: bool = True):
    """Uma sessão aberta de A (só o upsert: o lote `interval` de `_abre` poluiria o retroativo)."""
    with f2._banco() as c:
        p708._upgrade(c)
        c.execute(RETENCAO_TABELA)
        c.execute(RETENCAO_FUNCAO)
        for sql in RETENCAO_GATILHOS:
            c.execute(sql)
        sessao = uuid.uuid4()
        f2._upsert_direto(c, sessao, started_at=T - timedelta(minutes=10), ended_at=None)
        if migrar:
            _upgrade(c)
        yield c, sessao


@pytest.fixture
def banco():
    with _banco() as par:
        yield par


# A API grava como `postgres` (dono); aqui também é o jeito de semear `created_at` e análise já feitos.
LOTE_COMO_DONO = """
INSERT INTO public.telemetria_lotes
  (id, sessao_id, aluno_id, classe_id, screen_name, route_name, flush_reason, captured_at,
   study_elapsed_sec, screen_dwell_sec, active_sec, idle_sec, touch_count, scroll_distance_px,
   max_depth_px, frame_sent, payload, created_at, analysis_ciclo_id, analysis_error)
VALUES (%s, %s, %s, 1, 'tela', '/rota', 'interval', %s, 1, 1, 1, 0, 0, 0, 0, false, %s::jsonb,
        COALESCE(%s, now()), %s, %s)
RETURNING id
"""

_n = iter(range(1, 1_000_000))


def _lote(
    c,
    sessao: uuid.UUID,
    *,
    idade: timedelta | None = None,
    ciclo: str | None = None,
    erro: str | None = None,
    payload: str = "{}",
) -> uuid.UUID:
    """Lote gravado como `postgres`; `captured_at` distinto a cada chamada (índice único do lote)."""
    captured_at = T + timedelta(seconds=next(_n))
    criado = None
    if idade is not None:
        criado = c.execute("SELECT now() - %s::interval", (idade,)).fetchone()[0]
    return c.execute(
        LOTE_COMO_DONO, (uuid.uuid4(), sessao, A, captured_at, payload, criado, ciclo, erro)
    ).fetchone()[0]


def _item(c, lote: uuid.UUID) -> dict | None:
    linha = c.execute(
        """
        SELECT enfileirado_em, proxima_tentativa_em, tentativas, travado_em, ultimo_erro,
               extract(epoch FROM proxima_tentativa_em - now()) / 60 AS espera_min
          FROM public.telemetria_analise_fila WHERE lote_id = %s
        """,
        (lote,),
    ).fetchone()
    if linha is None:
        return None
    chaves = ("enfileirado_em", "proxima_tentativa_em", "tentativas", "travado_em", "ultimo_erro", "espera_min")
    return dict(zip(chaves, linha, strict=True))


def _fila(c) -> int:
    return c.execute("SELECT count(*) FROM public.telemetria_analise_fila").fetchone()[0]


def _vence(c, lote: uuid.UUID, ha: timedelta = timedelta(0)) -> None:
    c.execute(
        "UPDATE public.telemetria_analise_fila SET proxima_tentativa_em = now() - %s::interval WHERE lote_id = %s",
        (ha, lote),
    )


def _reivindicar(c, limite: int = 10, trava_seg: int = 600) -> list[uuid.UUID]:
    return [r[0] for r in c.execute("SELECT * FROM public.fn_telemetria_analise_reivindicar(%s, %s)", (limite, trava_seg))]


def _falhou(c, lote: uuid.UUID, erro: str) -> None:
    c.execute("SELECT public.fn_telemetria_analise_falhou(%s, %s)", (lote, erro))


def _analise(c, lote: uuid.UUID) -> tuple[str | None, str | None]:
    return c.execute(
        "SELECT analysis_ciclo_id, analysis_error FROM public.telemetria_lotes WHERE id = %s", (lote,)
    ).fetchone()


def _i15(c) -> list[str]:
    return [r[0] for r in c.execute(I15).fetchall()]


# --------------------------------------------------------------------------------------------- entrada


def test_lote_novo_entra_na_fila_com_espera(banco):
    """Pelo caminho direto do app, que é por onde chegam os 156 lotes nunca analisados."""
    c, sessao = banco
    lote = f2._lote_direto(c, sessao, "interval", T, aluno=A)[0]
    item = _item(c, lote)
    assert item is not None
    assert 4 < item["espera_min"] < 6
    assert item["tentativas"] == 0
    assert item["travado_em"] is None
    assert item["ultimo_erro"] is None


def test_lote_pela_api_tambem_entra(banco):
    c, sessao = banco
    assert _item(c, _lote(c, sessao)) is not None


@pytest.mark.parametrize("coluna", ["ciclo", "erro"])
def test_lote_ja_analisado_no_insert_nao_entra(banco, coluna):
    c, sessao = banco
    lote = _lote(c, sessao, **{coluna: "c0" if coluna == "ciclo" else "modo_restrito"})
    assert _item(c, lote) is None
    assert _fila(c) == 0


def test_lote_repetido_pelo_on_conflict_nao_duplica(banco):
    """O reenvio do mesmo lote pelo app cai no `ON CONFLICT DO NOTHING` e não dispara o gatilho."""
    c, sessao = banco
    assert f2._lote_direto(c, sessao, "interval", T, aluno=A) is not None
    assert f2._lote_direto(c, sessao, "interval", T, aluno=A) is None
    assert _fila(c) == 1


# ---------------------------------------------------------------------------------------------- saída


@pytest.mark.parametrize("coluna", ["analysis_ciclo_id", "analysis_error"])
def test_analise_do_pedido_tira_da_fila(banco, coluna):
    c, sessao = banco
    lote = _lote(c, sessao)
    assert _item(c, lote) is not None
    c.execute(f"UPDATE public.telemetria_lotes SET {coluna} = 'c1' WHERE id = %s", (lote,))
    assert _item(c, lote) is None


def test_update_sem_analise_mantem_o_item(banco):
    """A API grava `analysis_ciclo_id` e `analysis_error` juntos; a análise que não deu ciclo nem erro
    (os dois nulos) e qualquer outro UPDATE no lote não tiram o item."""
    c, sessao = banco
    lote = _lote(c, sessao)
    c.execute(
        "UPDATE public.telemetria_lotes SET analysis_ciclo_id = NULL, analysis_error = NULL WHERE id = %s", (lote,)
    )
    c.execute("UPDATE public.telemetria_lotes SET touch_count = 3 WHERE id = %s", (lote,))
    assert _item(c, lote) is not None


def test_lote_apagado_leva_o_item(banco):
    c, sessao = banco
    lote = _lote(c, sessao)
    c.execute("DELETE FROM public.telemetria_lotes WHERE id = %s", (lote,))
    assert _item(c, lote) is None
    assert _fila(c) == 0


def test_gatilhos_de_retencao_convivem_com_a_saida_da_fila(banco):
    """O UPDATE que grava a análise também troca o objeto do R2: os dois gatilhos agem no mesmo comando."""
    c, sessao = banco
    lote = _lote(c, sessao, payload='{"_r2": "telemetria/x.json", "_bucket": "b"}')
    c.execute(
        "UPDATE public.telemetria_lotes SET analysis_ciclo_id = 'c1', payload = '{}'::jsonb WHERE id = %s", (lote,)
    )
    assert _item(c, lote) is None
    assert c.execute(
        "SELECT destino, bucket, caminho FROM public.retencao_fila_externa"
    ).fetchall() == [("r2", "b", "telemetria/x.json")]


# --------------------------------------------------------------------------------------- reivindicação


def test_reivindicar_respeita_vencimento_e_limite(banco):
    c, sessao = banco
    l1, l2, l3, futuro = (_lote(c, sessao) for _ in range(4))
    _vence(c, l1, timedelta(minutes=3))
    _vence(c, l2, timedelta(minutes=2))
    _vence(c, l3, timedelta(minutes=1))

    assert _reivindicar(c, 2) == [l1, l2]
    for lote in (l1, l2):
        item = _item(c, lote)
        assert item["tentativas"] == 1
        assert item["travado_em"] is not None
    assert _reivindicar(c, 2) == [l3]
    assert _reivindicar(c, 2) == []
    assert _item(c, futuro)["tentativas"] == 0


def test_reivindicar_limpa_item_de_lote_ja_analisado(banco):
    """Item cujo lote já tem análise (o gatilho não viu: aqui ele é desligado para simular) sai na
    reivindicação, sem ser devolvido."""
    c, sessao = banco
    lote = _lote(c, sessao)
    _vence(c, lote)
    c.execute("ALTER TABLE public.telemetria_lotes DISABLE TRIGGER trg_telemetria_lotes_sai_da_fila")
    c.execute("UPDATE public.telemetria_lotes SET analysis_ciclo_id = 'c1' WHERE id = %s", (lote,))
    c.execute("ALTER TABLE public.telemetria_lotes ENABLE TRIGGER trg_telemetria_lotes_sai_da_fila")
    assert _item(c, lote) is not None
    assert _reivindicar(c) == []
    assert _item(c, lote) is None


def test_reivindicacoes_concorrentes_sao_disjuntas(banco):
    c, sessao = banco
    lotes = [_lote(c, sessao) for _ in range(3)]
    for i, lote in enumerate(lotes):
        _vence(c, lote, timedelta(minutes=3 - i))

    dsn = base._dsn_para(c.info.dbname)
    with psycopg.connect(dsn) as ca, psycopg.connect(dsn) as cb:
        # sem SKIP LOCKED, B esperaria A: o lock_timeout faz isso falhar em vez de travar o teste
        cb.execute("SET lock_timeout = '2s'")
        pegos_a = _reivindicar(ca, 2)
        pegos_b = _reivindicar(cb, 10)  # A ainda não fez commit
        ca.commit()
        cb.commit()

    assert len(pegos_a) == 2
    assert set(pegos_a).isdisjoint(pegos_b)
    assert set(pegos_a) | set(pegos_b) == set(lotes)
    assert all(_item(c, lote)["tentativas"] == 1 for lote in lotes)


def test_trava_vencida_volta_a_ser_reivindicavel(banco):
    c, sessao = banco
    vencida, recente = _lote(c, sessao), _lote(c, sessao)
    for lote, ha in ((vencida, "20 minutes"), (recente, "5 minutes")):
        c.execute(
            "UPDATE public.telemetria_analise_fila SET proxima_tentativa_em = now() - interval '1 minute', "
            "travado_em = now() - %s::interval, tentativas = 1 WHERE lote_id = %s",
            (ha, lote),
        )
    assert _reivindicar(c, 10, 600) == [vencida]
    assert _item(c, vencida)["tentativas"] == 2


def test_service_role_executa_as_funcoes_do_worker(banco):
    c, sessao = banco
    lote = _lote(c, sessao)
    _vence(c, lote)
    with c.transaction():
        c.execute("SET LOCAL ROLE service_role")
        assert _reivindicar(c) == [lote]
        _falhou(c, lote, "timeout")
    assert _item(c, lote)["ultimo_erro"] == "timeout"


# --------------------------------------------------------------------------------------------- falha


def test_falha_espaca_e_na_quinta_vira_erro(banco):
    c, sessao = banco
    lote = _lote(c, sessao)
    esperas = []
    for n in range(1, 5):
        _vence(c, lote)
        assert _reivindicar(c) == [lote]
        _falhou(c, lote, f"falha {n}")
        item = _item(c, lote)
        assert item["tentativas"] == n
        assert item["travado_em"] is None
        assert item["ultimo_erro"] == f"falha {n}"
        assert _reivindicar(c) == []  # não vence antes da espera
        esperas.append(round(item["espera_min"]))
    assert esperas == [2, 4, 8, 16]
    assert _analise(c, lote) == (None, None)

    _vence(c, lote)
    assert _reivindicar(c) == [lote]
    _falhou(c, lote, "x" * 1000)
    ciclo, erro = _analise(c, lote)
    assert ciclo is None
    assert erro.startswith("fila: x")
    assert len(erro) == 500
    assert _item(c, lote) is None


def _espera_alguem_esperar_trava(c, segundos: float = 5.0) -> None:
    fim = time.monotonic() + segundos
    while time.monotonic() < fim:
        if c.execute(
            "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
        ).fetchone()[0]:
            return
        time.sleep(0.05)
    raise AssertionError("ninguém ficou esperando trava")


def test_falha_e_pedido_cruzados_nao_dao_deadlock(banco):
    """O pedido (`update_lote_analysis`) trava o lote e o gatilho de saída trava o item. A desistência da
    quinta falha, se travasse o item antes do lote, cruzaria com ele: deadlock.

    Determinístico: o pedido segura o lote numa transação aberta, a falha roda noutra conexão até ficar
    esperando trava (`pg_stat_activity`), e só então o pedido grava a análise, o que dispara o DELETE do
    item. Com a ordem lote -> item a falha espera o lote, o pedido termina e a falha encontra o item já
    fora da fila. Com a ordem invertida, o Postgres acusa deadlock numa das duas.
    """
    c, sessao = banco
    lote = _lote(c, sessao)
    c.execute(
        "UPDATE public.telemetria_analise_fila SET tentativas = 5, travado_em = now() WHERE lote_id = %s", (lote,)
    )
    dsn = base._dsn_para(c.info.dbname)
    erros: list[BaseException] = []

    def _falha() -> None:
        try:
            with psycopg.connect(dsn, autocommit=True) as cw:
                cw.execute("SET lock_timeout = '10s'")
                _falhou(cw, lote, "worker")
        except BaseException as exc:  # devolvido ao teste
            erros.append(exc)

    with psycopg.connect(dsn) as pedido:
        pedido.execute("UPDATE public.telemetria_lotes SET touch_count = 2 WHERE id = %s", (lote,))
        worker = threading.Thread(target=_falha)
        worker.start()
        try:
            _espera_alguem_esperar_trava(c)
            pedido.execute("UPDATE public.telemetria_lotes SET analysis_ciclo_id = 'c1' WHERE id = %s", (lote,))
            pedido.commit()
        finally:
            worker.join(15)
    assert erros == []
    assert _analise(c, lote) == ("c1", None)
    assert _fila(c) == 0


def test_lote_que_derruba_o_worker_vira_erro_na_trava_vencida(banco):
    """A quinta reivindicação conta a tentativa; o worker morre (OOM, cancelamento) e nunca chama
    `falhou()`. Quando a trava vence, a reivindicação desiste do lote em vez de devolvê-lo de novo."""
    c, sessao = banco
    morto, vivo, quarta = _lote(c, sessao), _lote(c, sessao), _lote(c, sessao)
    for lote, tentativas, ha in ((morto, 5, "20 minutes"), (vivo, 5, "5 minutes"), (quarta, 4, "20 minutes")):
        c.execute(
            "UPDATE public.telemetria_analise_fila SET proxima_tentativa_em = now() - interval '1 minute', "
            "tentativas = %s, travado_em = now() - %s::interval WHERE lote_id = %s",
            (tentativas, ha, lote),
        )
    assert _reivindicar(c, 10, 600) == [quarta]
    assert _analise(c, morto) == (None, "fila: trava vencida")
    assert _item(c, morto) is None
    # a quinta tentativa ainda com trava viva não é tocada: o worker pode estar terminando
    assert _analise(c, vivo) == (None, None)
    assert _item(c, vivo)["tentativas"] == 5
    assert _item(c, quarta)["tentativas"] == 5


def test_falha_de_lote_fora_da_fila_nao_faz_nada(banco):
    """O pedido analisou entre a reivindicação e a falha: o item já saiu, e o erro não sobrescreve nada."""
    c, sessao = banco
    lote = _lote(c, sessao)
    _vence(c, lote)
    assert _reivindicar(c) == [lote]
    c.execute("UPDATE public.telemetria_lotes SET analysis_ciclo_id = 'c1' WHERE id = %s", (lote,))
    _falhou(c, lote, "tarde demais")
    assert _analise(c, lote) == ("c1", None)
    assert _fila(c) == 0


# ------------------------------------------------------------------------------------------- cliente


@pytest.mark.parametrize("papel", ["authenticated", "anon"])
def test_cliente_nao_le_nem_executa_a_fila(banco, papel):
    c, sessao = banco
    lote = _lote(c, sessao)
    try:
        with c.transaction():
            f2._como_aluno(c, A)
            c.execute(f"SET LOCAL ROLE {papel}")
            linhas = c.execute("SELECT count(*) FROM public.telemetria_analise_fila").fetchone()[0]
        assert linhas == 0
    except psycopg.errors.InsufficientPrivilege:
        pass
    for sql, args in (
        ("SELECT * FROM public.fn_telemetria_analise_reivindicar(10, 600)", ()),
        ("SELECT public.fn_telemetria_analise_falhou(%s, 'x')", (lote,)),
        ("DELETE FROM public.telemetria_analise_fila", ()),
    ):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with c.transaction():
                f2._como_aluno(c, A)
                c.execute(f"SET LOCAL ROLE {papel}")
                c.execute(sql, args)
    assert _item(c, lote)["tentativas"] == 0


def test_funcoes_so_para_service_role(banco):
    c, _ = banco
    for fn in FUNCOES_DO_WORKER:
        pode = dict(
            c.execute(
                "SELECT r, has_function_privilege(r, %s, 'EXECUTE') "
                "FROM unnest(ARRAY['anon','authenticated','service_role']) r",
                (fn,),
            ).fetchall()
        )
        assert pode == {"anon": False, "authenticated": False, "service_role": True}, fn
    for fn in ("fn_telemetria_lote_enfileira_analise", "fn_telemetria_lote_sai_da_fila"):
        for papel in ("anon", "authenticated"):
            assert c.execute(
                "SELECT has_function_privilege(%s, %s, 'EXECUTE')", (papel, f"public.{fn}()")
            ).fetchone()[0] is False, (papel, fn)


def test_tabela_nasce_com_rls_e_sem_policy(banco):
    c, _ = banco
    assert c.execute(
        "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.telemetria_analise_fila'::regclass"
    ).fetchone()[0] is True
    assert c.execute(
        "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telemetria_analise_fila'"
    ).fetchone()[0] == 0


# ---------------------------------------------------------------------------------- retroativo e I15


def _semeia_antes_da_migration(c, sessao: uuid.UUID) -> dict[str, uuid.UUID]:
    return {
        "dois_dias": _lote(c, sessao, idade=timedelta(days=2)),
        "dez_dias": _lote(c, sessao, idade=timedelta(days=10)),
        "analisado": _lote(c, sessao, idade=timedelta(days=10), ciclo="c-velho"),
        "com_erro": _lote(c, sessao, idade=timedelta(days=2), erro="modo_restrito"),
    }


def test_retroativo_enfileira_7_dias_e_expira_o_resto():
    with _banco(migrar=False) as (c, sessao):
        lotes = _semeia_antes_da_migration(c, sessao)
        _upgrade(c)

        item = _item(c, lotes["dois_dias"])
        assert item is not None
        assert item["espera_min"] <= 0  # vence agora
        assert _analise(c, lotes["dois_dias"]) == (None, None)

        assert _analise(c, lotes["dez_dias"]) == (None, "expirado_sem_analise")
        assert _analise(c, lotes["analisado"]) == ("c-velho", None)
        assert _analise(c, lotes["com_erro"]) == (None, "modo_restrito")
        assert _fila(c) == 1
        assert _reivindicar(c) == [lotes["dois_dias"]]


def test_i15_so_acusa_o_que_a_fila_ainda_vai_analisar():
    with _banco(migrar=False) as (c, sessao):
        lotes = _semeia_antes_da_migration(c, sessao)
        assert sorted(_i15(c)) == sorted([str(lotes["dois_dias"]), str(lotes["dez_dias"])])  # pré-condição
        _upgrade(c)
        assert _i15(c) == [str(lotes["dois_dias"])]

        c.execute("UPDATE public.telemetria_lotes SET analysis_ciclo_id = 'c1' WHERE id = %s", (lotes["dois_dias"],))
        assert _i15(c) == []
        assert _fila(c) == 0


def test_downgrade_tira_tudo_e_mantem_o_rotulo():
    with _banco(migrar=False) as (c, sessao):
        lotes = _semeia_antes_da_migration(c, sessao)
        _upgrade(c)
        _downgrade(c)

        assert c.execute("SELECT to_regclass('public.telemetria_analise_fila')").fetchone()[0] is None
        assert c.execute(
            "SELECT proname FROM pg_proc WHERE proname IN ('fn_telemetria_lote_enfileira_analise', "
            "'fn_telemetria_lote_sai_da_fila', 'fn_telemetria_analise_reivindicar', 'fn_telemetria_analise_falhou')"
        ).fetchall() == []
        assert c.execute(
            "SELECT tgname FROM pg_trigger WHERE tgname IN "
            "('trg_telemetria_lotes_enfileira_analise', 'trg_telemetria_lotes_sai_da_fila')"
        ).fetchall() == []
        assert _analise(c, lotes["dez_dias"]) == (None, "expirado_sem_analise")
        # os gatilhos anteriores ficam, e lote novo continua entrando
        restantes = {
            r[0]
            for r in c.execute(
                "SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.telemetria_lotes'::regclass AND NOT tgisinternal"
            ).fetchall()
        }
        assert {
            "trg_telemetria_lote_via",
            "trg_telemetria_lotes_fecha_sessao",
            "trg_retencao_fila_lotes_del",
            "trg_retencao_fila_lotes_upd",
        } <= restantes
        assert f2._lote_direto(c, sessao, "interval", T, aluno=A) is not None


def test_upgrade_e_idempotente(banco):
    c, sessao = banco
    lote = _lote(c, sessao)
    _upgrade(c)
    assert _item(c, lote) is not None
    assert c.execute(
        "SELECT count(*) FROM pg_trigger WHERE tgname IN "
        "('trg_telemetria_lotes_enfileira_analise', 'trg_telemetria_lotes_sai_da_fila')"
    ).fetchone()[0] == 2
