"""Ponta a ponta da `20261029_07`: o banco fecha a sessão no lote terminal e o upsert não a reabre.

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. Cada teste cria um
banco descartável com o ESQUELETO do schema public da produção e, por cima, o que o caminho real tem
em `telemetria_sessoes` e `telemetria_lotes`, tudo recortado da fonte (nunca copiado à mão):

- o índice único `(sessao_id, captured_at, flush_reason)` da `20260406_03` (o `ON CONFLICT` dos dois
  caminhos depende dele, e o esqueleto só traz constraint, não índice);
- RLS e as policies de posse (`_select_own`, `_insert_own`, `_update_own`) da fonte Alembic atual,
  `20260831_01_telemetria_rls_no_alembic_e_cascade.py` (o SQL sai do `upgrade()` do módulo, não de cópia).
  Os helpers do professor (`app_alunos_do_professor()`, `app_classes_do_professor()`) que as policies
  `_professor_sel/_del` dessa migration citam entram como dublês vazios: o esqueleto não os traz e aqui
  só se exerce a posse do aluno (`aluno_id = auth.uid()`);
- as policies RESTRICTIVE de consentimento (`_consentimento_ins/_upd`) da `20261024_02`. A função que
  elas perguntam (`aluno_minha_finalidade_permitida`) é um dublê que diz "permitida": o consentimento
  é medido em `test_e2e_consentimento_responsavel.py`; aqui o que se mede é o fechamento;
- o gatilho de via da F0 (`20261029_01`), BEFORE INSERT no lote;
- os GRANTs que o Supabase dá por padrão (inclusive EXECUTE em função nova para `anon`/`authenticated`).

Os gatilhos de retenção (`trg_retencao_fila_lotes_del/_upd`, `20261024_03`) ficam de fora: disparam só
em DELETE/UPDATE de lote, e nada aqui apaga nem altera lote. As FKs do esqueleto ficam (o lote aponta
para a sessão de verdade).

Os dois escritores são reproduzidos como em produção: a API pelo `TelemetriaRepository` de verdade, como
`postgres` e sem claims; o app pelo SQL que o PostgREST gera para `supabase.from(...).upsert(...)`, como
`authenticated` com as claims do aluno (`request.jwt.claims` para o gatilho de via e
`request.jwt.claim.sub` para o `auth.uid()` do esqueleto).

Dados sintéticos. Recusa banco hospedado.
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

import pytest

DSN = os.environ.get("TRAILUP_E2E_RETENCAO_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

if DSN:
    import psycopg

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e da sessao fechada pelo banco recusa banco hospedado: use um Postgres local")

from tests import test_e2e_guilda_mantem_quem_saiu_da_turma as base  # noqa: E402
from tests import test_e2e_invariantes_das_metricas as inv  # noqa: E402

M_TABELAS = base._modulo("20260406_03_telemetria_tables.py")
M_CONSENTIMENTO = base._modulo("20261024_02_consentimento_do_responsavel.py")
M_VIA = base._modulo("20261029_01_lote_diz_por_onde_chegou.py")
M_INV = base._modulo("20261029_03_invariantes_das_metricas.py")
I17 = M_INV.INVARIANTES["17"]

M_POSSE = base._modulo("20260831_01_telemetria_rls_no_alembic_e_cascade.py")


def _m_sessao():
    """Carregado tarde: antes da migration existir, só os testes que a usam falham."""
    return base._modulo("20261029_07_sessao_fecha_pelo_banco.py")


class _OpDoIndice:
    """`op` da `20260406_03` que só transforma `create_index` em SQL (as tabelas já vêm do esqueleto)."""

    def __init__(self) -> None:
        self.sql: list[str] = []

    def create_table(self, *args, **kwargs) -> None:
        pass

    def create_index(self, nome: str, tabela: str, colunas: list[str], unique: bool = False) -> None:
        unico = "UNIQUE " if unique else ""
        self.sql.append(f"CREATE {unico}INDEX {nome} ON public.{tabela} ({', '.join(colunas)})")


def _indice_do_lote() -> str:
    op = _OpDoIndice()
    original = M_TABELAS.op
    M_TABELAS.op = op
    try:
        M_TABELAS.upgrade()
    finally:
        M_TABELAS.op = original
    assert op.sql == [
        "CREATE UNIQUE INDEX uq_telemetria_lotes_sessao_captured_at_flush_reason "
        "ON public.telemetria_lotes (sessao_id, captured_at, flush_reason)"
    ], op.sql
    return op.sql[0]


# Os helpers que `_professor_sel/_del` da `20260831_01` citam; o esqueleto não os traz. Vazios: o professor
# não entra nestes testes (a posse dele é medida onde a `20260826_09` é testada).
DUBLE_HELPERS_DO_PROFESSOR = """
CREATE OR REPLACE FUNCTION public.app_alunos_do_professor()
RETURNS SETOF uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid WHERE false $$;
CREATE OR REPLACE FUNCTION public.app_classes_do_professor()
RETURNS SETOF bigint LANGUAGE sql STABLE AS $$ SELECT NULL::bigint WHERE false $$;
"""

DUBLE_CONSENTIMENTO = """
CREATE OR REPLACE FUNCTION public.aluno_minha_finalidade_permitida(p_finalidade text)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
"""

PROF, A, B = (uuid.UUID(int=i) for i in (11, 21, 22))
T = datetime(2026, 10, 29, 12, 0, tzinfo=UTC)
TERMINAIS = ("session_end", "app_background", "screen_blur")

SEED = f"""
INSERT INTO auth.users (id, email) VALUES
  ('{PROF}', 'prof@teste.invalid'), ('{A}', 'a@teste.invalid'), ('{B}', 'b@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{PROF}', 'Prof');
INSERT INTO public.alunos (id, nome, email) VALUES ('{A}', 'A', 'a@teste.invalid'), ('{B}', 'B', 'b@teste.invalid');
INSERT INTO public.materia (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Mat');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, '{PROF}', 'A');
"""


@contextmanager
def _banco(*, migrar: bool = True):
    nome = f"tu_ses_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(base.DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(base._dsn_para(nome), autocommit=True) as c:
            c.execute(base.PAPEIS)
            c.execute(inv.GRANTS_SUPABASE)
            c.execute(base.ESQUELETO.read_text(encoding="utf-8"))
            c.execute("GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role")
            for tabela in ("professor", "classe", "materia"):
                base._afrouxa(c, tabela)
            c.execute(_indice_do_lote())
            c.execute(DUBLE_HELPERS_DO_PROFESSOR)
            for sql in base._sql_de(M_POSSE, "upgrade"):
                c.execute(sql)
            c.execute(DUBLE_CONSENTIMENTO)
            for sql in M_CONSENTIMENTO._policies_de_telemetria():
                c.execute(sql)
            for sql in base._sql_de(M_VIA, "upgrade"):
                c.execute(sql)
            c.execute(SEED)
            if migrar:
                _upgrade(c)
            yield c
    finally:
        with psycopg.connect(base.DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _upgrade(c) -> None:
    for sql in base._sql_de(_m_sessao(), "upgrade"):
        c.execute(sql)


def _downgrade(c) -> None:
    for sql in base._sql_de(_m_sessao(), "downgrade"):
        c.execute(sql)


def _como_aluno(c, aluno: uuid.UUID) -> None:
    """O que o PostgREST faz para o JWT do aluno (dentro da transação corrente)."""
    c.execute("SET LOCAL ROLE authenticated")
    claims = json.dumps({"sub": str(aluno), "role": "authenticated"})
    c.execute("SELECT set_config('request.jwt.claims', %s, true)", (claims,))
    c.execute("SELECT set_config('request.jwt.claim.sub', %s, true)", (str(aluno),))


# O que o PostgREST gera para `supabase.from("telemetria_sessoes").upsert({...}, {onConflict: "id"})`
# em `mobile/src/services/telemetriaApi.ts` (persistTelemetryBatchDirect): todas as colunas enviadas no
# INSERT e cada uma delas no `DO UPDATE SET ... = EXCLUDED.<coluna>` (merge-duplicates).
UPSERT_DIRETO = """
INSERT INTO public.telemetria_sessoes
  (id, aluno_id, classe_id, topico_inicial_id, camera_opt_in, started_at, ended_at, updated_at)
VALUES (%s, %s, 1, %s, %s, %s, %s, now())
ON CONFLICT (id) DO UPDATE SET
  id = EXCLUDED.id,
  aluno_id = EXCLUDED.aluno_id,
  classe_id = EXCLUDED.classe_id,
  topico_inicial_id = EXCLUDED.topico_inicial_id,
  camera_opt_in = EXCLUDED.camera_opt_in,
  started_at = EXCLUDED.started_at,
  ended_at = EXCLUDED.ended_at,
  updated_at = EXCLUDED.updated_at
"""

# `supabase.from("telemetria_lotes").upsert(linha, {onConflict: "sessao_id,captured_at,flush_reason",
# ignoreDuplicates: true}).select("id")`.
LOTE_DIRETO = """
INSERT INTO public.telemetria_lotes
  (id, sessao_id, aluno_id, classe_id, screen_name, route_name, flush_reason, captured_at,
   study_elapsed_sec, screen_dwell_sec, active_sec, idle_sec, touch_count, scroll_distance_px,
   max_depth_px, frame_sent, payload, fallback_motivo, analysis_ciclo_id)
VALUES (%s, %s, %s, 1, 'tela', '/rota', %s, %s, 1, 1, 1, 0, 0, 0, 0, false, '{}'::jsonb, 'rede', NULL)
ON CONFLICT (sessao_id, captured_at, flush_reason) DO NOTHING
RETURNING id
"""


def _upsert_direto(
    c,
    sessao: uuid.UUID,
    *,
    aluno: uuid.UUID = A,
    started_at: datetime,
    ended_at: datetime | None,
    topico: int | None = 1,
    camera: bool = False,
) -> None:
    with c.transaction():
        _como_aluno(c, aluno)
        c.execute(UPSERT_DIRETO, (sessao, aluno, topico, camera, started_at, ended_at))


def _lote_direto(c, sessao: uuid.UUID, motivo: str, captured_at: datetime, *, aluno: uuid.UUID = A):
    with c.transaction():
        _como_aluno(c, aluno)
        return c.execute(LOTE_DIRETO, (uuid.uuid4(), sessao, aluno, motivo, captured_at)).fetchone()


def _sessao(c, sessao: uuid.UUID) -> dict:
    linha = c.execute(
        "SELECT started_at, ended_at, topico_inicial_id, camera_opt_in FROM public.telemetria_sessoes WHERE id = %s",
        (sessao,),
    ).fetchone()
    assert linha is not None
    return dict(zip(("started_at", "ended_at", "topico_inicial_id", "camera_opt_in"), linha, strict=True))


def _abre(c, sessao: uuid.UUID, *, aluno: uuid.UUID = A, inicio: datetime = T - timedelta(seconds=60)) -> None:
    """Abre como o app abre: upsert com `ended_at` nulo e um lote `interval`."""
    _upsert_direto(c, sessao, aluno=aluno, started_at=inicio, ended_at=None)
    _lote_direto(c, sessao, "interval", inicio + timedelta(seconds=30), aluno=aluno)


@pytest.mark.parametrize("motivo", TERMINAIS)
def test_lote_terminal_fecha_a_sessao(motivo):
    with _banco() as c:
        s = uuid.uuid4()
        _abre(c, s)
        _upsert_direto(c, s, started_at=T - timedelta(seconds=60), ended_at=None)
        assert _lote_direto(c, s, motivo, T) is not None
        assert _sessao(c, s)["ended_at"] == T


def test_relogio_adiantado_nao_empurra_o_fim_para_o_futuro():
    """`captured_at` vem do relógio do aparelho; um lote com data futura não pode travar o `ended_at`.

    A mescla é uma catraca de mão única (`GREATEST`): um fim no futuro nunca mais recuaria.
    """
    with _banco() as c:
        s = uuid.uuid4()
        _abre(c, s)
        adiantado = datetime.now(UTC) + timedelta(days=1)
        assert _lote_direto(c, s, "session_end", adiantado) is not None
        fim = _sessao(c, s)["ended_at"]
        assert fim is not None
        assert fim <= datetime.now(UTC) + timedelta(minutes=5)


def test_lote_interval_nao_fecha():
    with _banco() as c:
        s = uuid.uuid4()
        _abre(c, s)
        _lote_direto(c, s, "interval", T)
        assert _sessao(c, s)["ended_at"] is None


def test_upsert_com_ended_at_nulo_nao_reabre():
    """Build antigo (e o de hoje, em `screen_blur`) manda `ended_at: null` em todo upsert."""
    with _banco() as c:
        s = uuid.uuid4()
        _abre(c, s)
        _lote_direto(c, s, "screen_blur", T)
        antes = _sessao(c, s)
        assert antes["ended_at"] == T

        _upsert_direto(c, s, started_at=T + timedelta(seconds=10), ended_at=None, topico=2)

        depois = _sessao(c, s)
        assert depois["ended_at"] == T
        assert depois["started_at"] == T - timedelta(seconds=60)
        assert depois["topico_inicial_id"] == 1


def test_interval_atrasado_nao_mexe_no_fim():
    with _banco() as c:
        s = uuid.uuid4()
        _abre(c, s)
        _lote_direto(c, s, "screen_blur", T)
        # O lote `interval` que chega depois vem com o upsert de sessão do app (ended_at nulo).
        _upsert_direto(c, s, started_at=T - timedelta(seconds=60), ended_at=None)
        _lote_direto(c, s, "interval", T + timedelta(seconds=5))
        assert _sessao(c, s)["ended_at"] == T


@pytest.mark.parametrize("ordem", [(0, 5), (5, 0)], ids=["em_ordem", "invertida"])
def test_terminal_mais_novo_avanca_o_fim(ordem):
    with _banco() as c:
        s = uuid.uuid4()
        _abre(c, s)
        for segundos in ordem:
            _lote_direto(c, s, "app_background", T + timedelta(seconds=segundos))
        assert _sessao(c, s)["ended_at"] == T + timedelta(seconds=5)


def test_lote_com_sessao_de_outro_aluno_nao_fecha():
    """B grava um lote terminal com o próprio `aluno_id` apontando para a sessão de A.

    A policy de INSERT do lote (`telemetria_lotes_insert_own`, `aluno_id = auth.uid()`) NÃO recusa: B
    grava como B, e a FK para `telemetria_sessoes` é conferida pelo dono, não pela RLS. Então o lote
    entra (`RETURNING` devolve linha) e quem impede o fechamento é o `AND aluno_id = NEW.aluno_id` do
    gatilho, que é `SECURITY DEFINER` e por isso não tem a RLS de `telemetria_sessoes` para segurá-lo.

    Isto mede a `20261029_07` sozinha. A `20261029_08` passa a recusar o próprio lote de B
    (`test_e2e_telemetria_so_na_propria_sessao.py`); o filtro do gatilho continua valendo para quem
    grava sem RLS.
    """
    with _banco() as c:
        s = uuid.uuid4()
        _abre(c, s, aluno=A)
        assert _lote_direto(c, s, "session_end", T, aluno=B) is not None
        assert _sessao(c, s)["ended_at"] is None
        # controle: o mesmo lote vindo de A fecha (a asserção acima não é vacuosa)
        _lote_direto(c, s, "session_end", T + timedelta(seconds=1), aluno=A)
        assert _sessao(c, s)["ended_at"] == T + timedelta(seconds=1)


def _pelo_repositorio(dsn: str, sessao: uuid.UUID, sequencia: list[tuple[str, datetime]], monkeypatch) -> None:
    """Caminho da API: o `TelemetriaRepository` de verdade, na ordem de `registrar_lote` (sessão, depois lote)."""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.v1.telemetria import TERMINAL_FLUSH_REASONS
    from app.repositories import telemetria as repo_mod

    # Sem R2 o repositório grava o payload inteiro, como antes: nada sai da máquina.
    monkeypatch.setattr(repo_mod, "ler_config_r2", lambda _settings: None)
    url = "postgresql+asyncpg://" + dsn.split("://", 1)[1]

    async def _rodar() -> None:
        engine = create_async_engine(url)
        try:
            fabrica = async_sessionmaker(engine, expire_on_commit=False)
            for motivo, captured_at in sequencia:
                async with fabrica() as session:
                    repo = repo_mod.TelemetriaRepository(session)
                    await repo.upsert_sessao(
                        sessao_id=str(sessao),
                        aluno_id=str(A),
                        classe_id=1,
                        topico_inicial_id=1,
                        camera_opt_in=False,
                        started_at=T - timedelta(seconds=60),
                        ended_at=captured_at if motivo in TERMINAL_FLUSH_REASONS else None,
                    )
                    await repo.insert_or_get_lote(
                        sessao_id=str(sessao),
                        aluno_id=str(A),
                        classe_id=1,
                        topico_id=1,
                        atividade_id=None,
                        conteudo_id=None,
                        screen_name="tela",
                        route_name="/rota",
                        flush_reason=motivo,
                        captured_at=captured_at,
                        study_elapsed_sec=1,
                        screen_dwell_sec=1,
                        active_sec=1,
                        idle_sec=0,
                        touch_count=0,
                        scroll_distance_px=0,
                        max_depth_px=0,
                        frame_sent=False,
                        payload={},
                    )
                    await session.commit()
        finally:
            await engine.dispose()

    asyncio.run(_rodar())


SEQUENCIAS = {
    "interval_screen_blur": [("interval", T - timedelta(seconds=30)), ("screen_blur", T)],
    # volta do segundo plano com a mesma sessão: o `interval` seguinte não pode reabrir
    "background_e_volta": [
        ("interval", T - timedelta(seconds=30)),
        ("app_background", T),
        ("interval", T + timedelta(seconds=30)),
    ],
}


@pytest.mark.parametrize("sequencia", SEQUENCIAS, ids=list(SEQUENCIAS))
@pytest.mark.parametrize(
    "app_manda_fim",
    [False, True],
    ids=["build_em_campo", "fim_so_no_terminal"],
)
def test_os_dois_caminhos_produzem_a_mesma_linha(sequencia, app_manda_fim, monkeypatch):
    """A mesma sequência pela API e pelo app dá a mesma linha de `telemetria_sessoes`.

    `build_em_campo`: o app de hoje (`telemetriaApi.ts`, `shouldCloseSession`) só manda `ended_at` em
    `session_end` e `app_background`; em `screen_blur` manda nulo, e todo `interval` manda nulo.
    `fim_so_no_terminal`: o app manda `ended_at = captured_at` nos três motivos terminais e nulo no resto.
    """
    passos = SEQUENCIAS[sequencia]
    with _banco() as c:
        api, direto = uuid.uuid4(), uuid.uuid4()
        # `c.info.dsn` não traz a senha; o DSN do banco descartável sai do base.
        dsn = base._dsn_para(c.info.dbname)
        _pelo_repositorio(dsn, api, passos, monkeypatch)

        envia_fim = TERMINAIS if app_manda_fim else ("session_end", "app_background")
        for motivo, captured_at in passos:
            _upsert_direto(
                c,
                direto,
                started_at=T - timedelta(seconds=60),
                ended_at=captured_at if motivo in envia_fim else None,
            )
            _lote_direto(c, direto, motivo, captured_at)

        assert c.execute(
            "SELECT array_agg(DISTINCT via ORDER BY via) FROM public.telemetria_lotes WHERE sessao_id IN (%s, %s)",
            (api, direto),
        ).fetchone()[0] == ["api", "direta"]
        linha_api, linha_direta = _sessao(c, api), _sessao(c, direto)
        assert linha_api == linha_direta
        ultimo_terminal = max(t for m, t in passos if m in TERMINAIS)
        assert linha_api["ended_at"] == ultimo_terminal


def _semeia_antes_da_migration(c, *, com_lote_alheio: bool = False) -> dict[str, uuid.UUID]:
    """O estado que a produção tem hoje: sessão com `screen_blur` e `ended_at` nulo (o app não fecha)."""
    s = {nome: uuid.uuid4() for nome in ("blur", "so_interval", "ja_fechada", "alheia")}
    _abre(c, s["blur"])
    _lote_direto(c, s["blur"], "screen_blur", T)
    _abre(c, s["so_interval"])
    # já fechada, com fim ANTERIOR ao do lote terminal: só o `ended_at IS NULL` do backfill a protege (um
    # `GREATEST` sem o filtro a moveria para T)
    _abre(c, s["ja_fechada"])
    _lote_direto(c, s["ja_fechada"], "screen_blur", T)
    c.execute(
        "UPDATE public.telemetria_sessoes SET ended_at = %s WHERE id = %s", (T - timedelta(minutes=5), s["ja_fechada"])
    )
    if com_lote_alheio:
        _abre(c, s["alheia"], aluno=A)
        _lote_direto(c, s["alheia"], "session_end", T, aluno=B)
    return s


def test_backfill_fecha_as_sessoes_abertas_com_terminal():
    with _banco(migrar=False) as c:
        s = _semeia_antes_da_migration(c, com_lote_alheio=True)
        assert _sessao(c, s["blur"])["ended_at"] is None  # pré-condição: hoje o app não fecha no blur
        _upgrade(c)
        assert _sessao(c, s["blur"])["ended_at"] == T
        assert _sessao(c, s["so_interval"])["ended_at"] is None
        assert _sessao(c, s["ja_fechada"])["ended_at"] == T - timedelta(minutes=5)
        assert _sessao(c, s["alheia"])["ended_at"] is None


def _i17(c) -> list[str]:
    return [r[0] for r in c.execute(I17).fetchall()]


def test_i17_passa_depois_da_migration():
    with _banco(migrar=False) as c:
        s = _semeia_antes_da_migration(c)
        assert _i17(c) == [str(s["blur"])]
        _upgrade(c)
        assert _i17(c) == []
        # e continua passando com o tráfego que o app gera depois da migration
        novo = uuid.uuid4()
        _abre(c, novo)
        _upsert_direto(c, novo, started_at=T - timedelta(seconds=60), ended_at=None)
        _lote_direto(c, novo, "screen_blur", T)
        _upsert_direto(c, novo, started_at=T - timedelta(seconds=60), ended_at=None)
        assert _i17(c) == []


def test_downgrade_tira_gatilhos_e_mantem_o_backfill():
    with _banco(migrar=False) as c:
        s = _semeia_antes_da_migration(c)
        _upgrade(c)
        assert _sessao(c, s["blur"])["ended_at"] == T
        _downgrade(c)

        gatilhos = c.execute(
            "SELECT tgname FROM pg_trigger WHERE tgname IN "
            "('trg_telemetria_sessoes_mescla', 'trg_telemetria_lotes_fecha_sessao')"
        ).fetchall()
        assert gatilhos == []
        funcoes = c.execute(
            "SELECT proname FROM pg_proc WHERE proname IN "
            "('fn_telemetria_sessoes_mescla', 'fn_telemetria_lote_fecha_sessao')"
        ).fetchall()
        assert funcoes == []
        assert _sessao(c, s["blur"])["ended_at"] == T  # o dado corrigido fica
        # sem os gatilhos, o upsert do app volta a reabrir: o downgrade tirou mesmo o comportamento
        _upsert_direto(c, s["blur"], started_at=T - timedelta(seconds=60), ended_at=None)
        assert _sessao(c, s["blur"])["ended_at"] is None


def test_aluno_nao_chama_as_funcoes_dos_gatilhos():
    """O Supabase dá EXECUTE em função nova para `authenticated` por padrão; a migration tira."""
    with _banco() as c:
        for fn in ("fn_telemetria_sessoes_mescla", "fn_telemetria_lote_fecha_sessao"):
            assert (
                c.execute(
                    "SELECT has_function_privilege('authenticated', %s, 'EXECUTE')", (f"public.{fn}()",)
                ).fetchone()[0]
                is False
            )
