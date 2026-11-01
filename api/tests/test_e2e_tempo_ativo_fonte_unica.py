"""Ponta a ponta da `20261030_01`: tempo de estudo é o tempo ativo, com um dono só, e a matrícula acompanha.

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. O banco descartável é
o da `test_e2e_analise_de_lote_pela_fila.py` (esqueleto da produção, RLS e policies de posse, consentimento,
gatilho de via, F2, #708, retenção e a `20261029_09`), com a camada de progresso por cima, recortada dos
módulos que a criaram:

- `trailup_tempo_telemetria_min` (conta ativa canônica) da `20260913_09`;
- `trailup_recalcular_topico_aluno` e `trailup_recalcular_classe_aluno` da `20260913_15`;
- o gatilho por linha `trailup_progresso_after_item` em `conteudo_aluno` e `atividade_aluno`, da `20260826_02`
  (em produção não há gatilho de progresso em `topico_aluno`);
- o `telemetria_resolver_entidade` da `20260826_17`/`20260830_01` e a chave única `(lote_id, scope, entry_key)`;
- `trailup_tempo_sessao_min` e as duas RPCs do cronômetro como estão hoje, da `20260921_01`;
- o gatilho da telemetria como está em produção (`trailup_sync_tempo_da_telemetria` e
  `trg_tme_sync_tempo_{ins,upd,del}`), da constante de produção da própria `20261030_01`.

O esqueleto troca enums por `text` nas colunas; `status_atividade` é criado como o enum de produção (com os
rótulos acentuados), para que um rótulo errado nos recálculos que o gatilho dispara falhe aqui e não só em
produção. Tudo sai da fonte, nada é copiado à mão.

O que se mede: o lote grava o tempo ativo e a matrícula acompanha (I07); o cronômetro, novo e antigo, não
sobrescreve o tempo ativo e, quando cria a linha, já grava a conta ativa; a ordem cronômetro/telemetria não
importa; um lote de duas turmas recalcula as duas matrículas; lote duplicado não soma em dobro; apagar
métrica (linha ou lotes, em uma ou duas turmas) recalcula para baixo; um UPDATE que troca a chave recalcula
a antiga; a cascata de uma exclusão não recria linha do que está sumindo; lote que não muda o tempo não
regrava; a presença soma `dwell_sec`; a I06 nova passa onde a
velha acusaria; o retroativo alinha tudo; as RPCs mantêm a segurança; o downgrade restaura RPCs e I06.

Dados sintéticos. Recusa banco hospedado.
"""

from __future__ import annotations

import json
import os
import uuid
from contextlib import contextmanager
from datetime import timedelta
from decimal import Decimal

import pytest

DSN = os.environ.get("TRAILUP_E2E_RETENCAO_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

if DSN:
    import psycopg

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e do tempo ativo recusa banco hospedado: use um Postgres local")

from tests import test_e2e_analise_de_lote_pela_fila as f3  # noqa: E402
from tests import test_e2e_guilda_mantem_quem_saiu_da_turma as base  # noqa: E402
from tests import test_e2e_sessao_fecha_pelo_banco as f2  # noqa: E402

A, B, T, PROF = f2.A, f2.B, f2.T, f2.PROF
I06_F0 = f2.M_INV.INVARIANTES["06"]
I07 = f2.M_INV.INVARIANTES["07"]

M_TEMPO = base._modulo("20260913_09_progresso_tempo_canonico.py")
M_PROGRESSO = base._modulo("20260913_15_progresso_perfil_ativo.py")
M_ITEM = base._modulo("20260826_02_progresso_no_banco.py")
M_RESOLVE = base._modulo("20260826_17_telemetria_resolve_entidade.py")
M_DEDUP = base._modulo("20260830_01_tempo_por_lote_e_dedup.py")
M_SESSOES = base._modulo("20260921_01_sessoes_estudo_abertura_fechamento.py")

# Topicos 10 e 11 na turma 1, 20 na turma 2. A está matriculado nas duas; B em nenhuma.
SEED = f"""
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES
  (2, 1, '{PROF}', 'B');
INSERT INTO public.topicos (id, classe_id, nome) VALUES (10, 1, 'T10'), (11, 1, 'T11'), (20, 2, 'T20');
INSERT INTO public.conteudos (id, topico_id, titulo, tipo) VALUES (100, 10, 'C100', 'texto');
INSERT INTO public.atividades (id, topico_id, titulo) VALUES (200, 10, 'A200');
INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (1, '{A}'), (2, '{A}');
INSERT INTO public.topico_aluno (aluno_id, topico_id) VALUES ('{A}', 10), ('{A}', 20);
INSERT INTO public.conteudo_aluno (aluno_id, conteudo_id) VALUES ('{A}', 100);
INSERT INTO public.atividade_aluno (aluno_id, atividade_id) VALUES ('{A}', 200);
"""

TURMA = {10: 1, 11: 1, 20: 2}


def _m():
    """Carregado tarde: antes da migration existir, só os testes que a usam falham."""
    return base._modulo("20261030_01_tempo_ativo_fonte_unica.py")


def _upgrade(c) -> None:
    for sql in base._sql_de(_m(), "upgrade"):
        c.execute(str(sql))


def _downgrade(c) -> None:
    for sql in base._sql_de(_m(), "downgrade"):
        c.execute(str(sql))


def _camada_de_progresso(c) -> None:
    c.execute("CREATE TYPE public.status_atividade AS ENUM ('não iniciado', 'em andamento', 'concluido')")
    c.execute(M_TEMPO.TEMPO_ATIVO)
    c.execute(M_PROGRESSO.FUNCAO_TOPICO)
    c.execute(M_PROGRESSO.FUNCAO_CLASSE)
    c.execute(M_ITEM.GATILHO)
    for sql in map(str, base._sql_de(M_ITEM, "upgrade")):
        if "TRIGGER" in sql and ("ON conteudo_aluno" in sql or "ON atividade_aluno" in sql):
            c.execute(sql)
    for sql in base._sql_de(M_RESOLVE, "upgrade"):
        c.execute(str(sql))
    c.execute(M_DEDUP.TRIGGER_RESOLVER)
    for sql in map(str, base._sql_de(M_DEDUP, "upgrade")):
        if "CREATE UNIQUE INDEX" in sql:
            c.execute(sql)


def _como_esta_em_producao(c) -> None:
    """RPCs da `20260921_01` e o gatilho da telemetria fora do Alembic, como produção tem hoje."""
    for sql in map(str, base._sql_de(M_SESSOES, "upgrade")):
        if (
            "CREATE FUNCTION public.trailup_tempo_sessao_min(" in sql
            or "public.trailup_registrar_sessao_estudo(" in sql
            or "CREATE OR REPLACE FUNCTION public.trailup_registrar_intervalo_estudo(" in sql
        ):
            c.execute(sql)
    c.execute(_m().SYNC_PRODUCAO)
    for sql in _m().GATILHOS:
        c.execute(sql)


@contextmanager
def _banco(*, migrar: bool = True):
    with f3._banco() as (c, sessao):
        _camada_de_progresso(c)
        c.execute(SEED)
        _como_esta_em_producao(c)
        if migrar:
            _upgrade(c)
        yield c, sessao


@pytest.fixture
def banco():
    with _banco() as par:
        yield par


# A API grava como `postgres` (`api/app/repositories/telemetria.py`), com a mesma chave de dedup.
METRICAS = """
INSERT INTO public.telemetria_time_metric_entries
  (lote_id, sessao_id, aluno_id, classe_id, topico_id, conteudo_id, atividade_id, scope,
   dwell_sec, active_sec, captured_at)
SELECT %s, %s, %s, x.classe, x.topico, x.conteudo, x.atividade, x.scope, x.dwell, x.ativo, %s
  FROM jsonb_to_recordset(%s::jsonb)
       AS x(classe bigint, topico bigint, conteudo bigint, atividade bigint, scope text,
            dwell numeric, ativo numeric)
ON CONFLICT (lote_id, scope, entry_key) DO NOTHING
"""


def _metricas(c, sessao, *linhas: dict, lote: uuid.UUID | None = None) -> uuid.UUID:
    """Um lote (novo, salvo se `lote` vier) com as linhas dadas, num INSERT só, como a API faz."""
    lote = lote or f3._lote(c, sessao)
    corpo = [
        {
            "classe": TURMA[ln["topico"]],
            "topico": ln["topico"],
            "conteudo": ln.get("conteudo"),
            "atividade": ln.get("atividade"),
            "scope": ln.get("scope", "topic"),
            "dwell": ln.get("dwell", 0),
            "ativo": ln["ativo"],
        }
        for ln in linhas
    ]
    c.execute(METRICAS, (lote, sessao, A, T, json.dumps(corpo)))
    return lote


def _tempo(c, topico: int, *, aluno: uuid.UUID = A):
    linha = c.execute(
        "SELECT tempo_gasto_min::numeric, tempo_direto_min FROM public.topico_aluno"
        " WHERE aluno_id = %s AND topico_id = %s",
        (aluno, topico),
    ).fetchone()
    return None if linha is None else (round(linha[0], 2), linha[1])


def _tempo_conteudo(c, conteudo: int) -> Decimal:
    return c.execute(
        "SELECT round(tempo_gasto_min::numeric, 2) FROM public.conteudo_aluno WHERE aluno_id = %s AND conteudo_id = %s",
        (A, conteudo),
    ).fetchone()[0]


def _ativo(c, topico: int) -> Decimal:
    return c.execute("SELECT public.trailup_tempo_telemetria_min(%s, 'topic', %s, NULL, NULL)", (A, topico)).fetchone()[
        0
    ]


def _matricula(c, classe: int) -> Decimal:
    return c.execute(
        'SELECT "tempoGastoMin" FROM public.classe_aluno WHERE aluno_id = %s AND classe_id = %s',
        (A, classe),
    ).fetchone()[0]


def _soma_dos_topicos(c, classe: int) -> Decimal:
    return c.execute(
        "SELECT coalesce(round(sum(greatest(0, ta.tempo_gasto_min))::numeric, 2), 0)"
        " FROM public.topico_aluno ta JOIN public.topicos t ON t.id = ta.topico_id"
        " WHERE ta.aluno_id = %s AND t.classe_id = %s",
        (A, classe),
    ).fetchone()[0]


def _conta(c, corpo: str) -> int:
    return c.execute(f"SELECT count(*) FROM ({corpo}) x").fetchone()[0]


def _i06(c) -> int:
    return c.execute("SELECT count(*) FROM public.fn_inv_i06()").fetchone()[0]


def _sessao_rpc(c, topico: int, minutos: float, *, aluno: uuid.UUID = A, p_aluno: uuid.UUID | None = None):
    with c.transaction():
        f2._como_aluno(c, aluno)
        c.execute(
            "SELECT public.trailup_registrar_sessao_estudo(%s, %s, 'topic', %s::bigint, NULL, NULL, %s, %s)",
            (uuid.uuid4(), p_aluno or aluno, topico, T, T + timedelta(minutes=minutos)),
        )


def _intervalo_rpc(c, topico: int, minutos: float, *, aluno: uuid.UUID = A, p_aluno: uuid.UUID | None = None):
    with c.transaction():
        f2._como_aluno(c, aluno)
        c.execute(
            "SELECT public.trailup_registrar_intervalo_estudo(%s, %s, %s::bigint, NULL, NULL, %s::numeric)",
            (uuid.uuid4(), p_aluno or aluno, topico, minutos),
        )


RPCS = {"sessao": _sessao_rpc, "intervalo": _intervalo_rpc}


def _ativo_de_1_5(c, sessao) -> None:
    """Duas entradas `topic` do tópico 10 em lotes distintos: 60 + 30 s ativos, 120 + 90 s abertos."""
    _metricas(c, sessao, {"topico": 10, "ativo": 60, "dwell": 120})
    _metricas(c, sessao, {"topico": 10, "ativo": 30, "dwell": 90})


def test_lote_de_telemetria_grava_tempo_ativo(banco):
    c, sessao = banco
    _ativo_de_1_5(c, sessao)
    assert _tempo(c, 10)[0] == Decimal("1.5")


def test_matricula_acompanha_o_gatilho_da_telemetria(banco):
    """O defeito da matrícula 98: o gatilho atualizava o tópico e deixava a matrícula para trás."""
    c, sessao = banco
    _ativo_de_1_5(c, sessao)
    assert _matricula(c, 1) == _soma_dos_topicos(c, 1) == Decimal("1.5")
    assert _conta(c, I07) == 0


def test_sessao_do_cronometro_nao_sobrescreve_o_tempo_ativo(banco):
    c, sessao = banco
    _ativo_de_1_5(c, sessao)
    _sessao_rpc(c, 10, 10)
    assert _tempo(c, 10)[0] == Decimal("1.5")
    assert c.execute(
        "SELECT count(*), sum(duracao_sec) FROM public.estudo_sessoes WHERE aluno_id = %s", (A,)
    ).fetchone() == (1, 600)
    assert _matricula(c, 1) == Decimal("1.5")


def test_intervalo_antigo_nao_sobrescreve_o_tempo_ativo(banco):
    c, sessao = banco
    _ativo_de_1_5(c, sessao)
    direto_antes = _tempo(c, 10)[1]
    _intervalo_rpc(c, 10, 10)
    tempo, direto = _tempo(c, 10)
    assert direto == direto_antes + 10
    assert tempo == Decimal("1.5")
    assert _matricula(c, 1) == Decimal("1.5")
    assert c.execute("SELECT count(*) FROM public.estudo_intervalos WHERE aluno_id = %s", (A,)).fetchone()[0] == 1


@pytest.mark.parametrize("rpc", sorted(RPCS))
def test_rpc_cria_a_linha_ja_com_o_tempo_ativo(banco, rpc):
    """Review Focus 1: o lote chega antes da linha; o gatilho não inventa a linha, a RPC a cria certa."""
    c, sessao = banco
    _metricas(c, sessao, {"topico": 11, "ativo": 45, "dwell": 50})
    assert _tempo(c, 11) is None
    RPCS[rpc](c, 11, 10)
    assert _tempo(c, 11)[0] == _ativo(c, 11) == Decimal("0.75")
    assert _i06(c) == 0
    assert _matricula(c, 1) == _soma_dos_topicos(c, 1)


@pytest.mark.parametrize("ordem", ["cronometro_primeiro", "telemetria_primeiro"])
def test_ordem_cronometro_telemetria_nao_importa(banco, ordem):
    c, sessao = banco
    passos = [lambda: _sessao_rpc(c, 11, 10), lambda: _metricas(c, sessao, {"topico": 11, "ativo": 45})]
    if ordem == "telemetria_primeiro":
        passos.reverse()
    for passo in passos:
        passo()
    assert _tempo(c, 11)[0] == _ativo(c, 11) == Decimal("0.75")
    assert _matricula(c, 1) == _soma_dos_topicos(c, 1) == Decimal("0.75")
    assert _i06(c) == 0
    assert _conta(c, I07) == 0


def test_lote_com_topicos_de_duas_turmas_recalcula_as_duas_matriculas(banco):
    c, sessao = banco
    _metricas(c, sessao, {"topico": 10, "ativo": 60}, {"topico": 20, "ativo": 120})
    assert _matricula(c, 1) == Decimal("1")
    assert _matricula(c, 2) == Decimal("2")
    assert _conta(c, I07) == 0


def test_lote_duplicado_nao_soma_em_dobro(banco):
    """Review Focus 4: reenvio do mesmo lote e linha repetida no mesmo INSERT param na chave única."""
    c, sessao = banco
    linha = {"topico": 10, "ativo": 60, "dwell": 120}
    lote = _metricas(c, sessao, linha, linha)
    _metricas(c, sessao, linha, lote=lote)
    assert c.execute("SELECT count(*) FROM public.telemetria_time_metric_entries").fetchone()[0] == 1
    assert _tempo(c, 10)[0] == Decimal("1")
    assert _matricula(c, 1) == Decimal("1")


def test_apagar_metrica_recalcula_para_baixo(banco):
    """Review Focus 5: DELETE de linha, depois do lote (cascata da retenção)."""
    c, sessao = banco
    lote_60 = _metricas(c, sessao, {"topico": 10, "ativo": 60})
    lote_30 = _metricas(c, sessao, {"topico": 10, "ativo": 30})
    c.execute("DELETE FROM public.telemetria_time_metric_entries WHERE lote_id = %s", (lote_60,))
    assert _tempo(c, 10)[0] == Decimal("0.5")
    assert _matricula(c, 1) == Decimal("0.5")
    c.execute("DELETE FROM public.telemetria_lotes WHERE id = %s", (lote_30,))
    assert _tempo(c, 10)[0] == Decimal("0")
    assert _matricula(c, 1) == Decimal("0")
    assert _conta(c, I07) == 0


def test_apagar_os_lotes_do_aluno_recalcula_as_duas_turmas(banco):
    """Retenção ou exclusão do aluno apagam os lotes; a cascata até as métricas recalcula as duas turmas."""
    c, sessao = banco
    _metricas(c, sessao, {"topico": 10, "ativo": 60}, {"topico": 20, "ativo": 60})
    c.execute("DELETE FROM public.telemetria_lotes WHERE aluno_id = %s", (A,))
    assert c.execute("SELECT count(*) FROM public.telemetria_time_metric_entries").fetchone()[0] == 0
    assert _tempo(c, 10)[0] == _tempo(c, 20)[0] == Decimal("0")
    assert _matricula(c, 1) == _matricula(c, 2) == Decimal("0")
    assert _conta(c, I07) == 0


def test_update_que_troca_o_conteudo_recalcula_o_antigo(banco):
    """`trg_tme_sync_tempo_upd_old`: a métrica muda de conteúdo e o antigo perde o tempo que não tem mais."""
    c, sessao = banco
    c.execute("INSERT INTO public.conteudos (id, topico_id, titulo, tipo) VALUES (101, 10, 'C101', 'texto')")
    c.execute("INSERT INTO public.conteudo_aluno (aluno_id, conteudo_id) VALUES (%s, 101)", (A,))
    lote = _metricas(c, sessao, {"topico": 10, "conteudo": 100, "scope": "content", "ativo": 60})
    assert _tempo_conteudo(c, 100) == Decimal("1")
    c.execute(
        "UPDATE public.telemetria_time_metric_entries SET conteudo_id = 101 WHERE lote_id = %s AND scope = 'content'",
        (lote,),
    )
    assert _tempo_conteudo(c, 101) == Decimal("1")
    assert _tempo_conteudo(c, 100) == Decimal("0")


def test_cascata_de_exclusao_nao_recria_linha_do_que_some(banco):
    """Na cascata da exclusão da turma o tópico pode sumir antes das métricas. O gatilho de DELETE não pode
    atualizar `conteudo_aluno` desse tópico: o gatilho por linha faria upsert em `topico_aluno` e a FK
    abortaria a exclusão inteira. A ordem da cascata é simulada desligando as FKs só para apagar o tópico."""
    c, sessao = banco
    _metricas(c, sessao, {"topico": 10, "conteudo": 100, "scope": "content", "ativo": 60})
    c.execute("SET session_replication_role = replica")
    c.execute("DELETE FROM public.topico_aluno WHERE topico_id = 10")
    c.execute("DELETE FROM public.topicos WHERE id = 10")
    c.execute("SET session_replication_role = origin")
    c.execute("DELETE FROM public.telemetria_time_metric_entries WHERE topico_id = 10")
    assert c.execute("SELECT count(*) FROM public.topico_aluno WHERE topico_id = 10").fetchone()[0] == 0


def test_lote_que_nao_muda_o_tempo_nao_regrava(banco):
    """Só grava onde o valor muda: um lote com 0 s ativos não toca `conteudo_aluno` (nem dispara o progresso)."""
    c, sessao = banco
    _metricas(c, sessao, {"topico": 10, "conteudo": 100, "scope": "content", "ativo": 60})
    antes = c.execute(
        "SELECT ctid::text FROM public.conteudo_aluno WHERE aluno_id = %s AND conteudo_id = 100", (A,)
    ).fetchone()[0]
    _metricas(c, sessao, {"topico": 10, "conteudo": 100, "scope": "content", "ativo": 0})
    depois = c.execute(
        "SELECT ctid::text FROM public.conteudo_aluno WHERE aluno_id = %s AND conteudo_id = 100", (A,)
    ).fetchone()[0]
    assert antes == depois


def test_presenca_soma_dwell(banco):
    c, sessao = banco
    _ativo_de_1_5(c, sessao)
    assert c.execute("SELECT public.trailup_tempo_presenca_min(%s, 'topic', 10, NULL, NULL)", (A,)).fetchone()[
        0
    ] == round(Decimal(210) / 60, 2)


def test_i06_nova_passa_e_a_velha_acusaria(banco):
    c, sessao = banco
    _ativo_de_1_5(c, sessao)
    _intervalo_rpc(c, 10, 5)
    _sessao_rpc(c, 10, 10)
    assert _i06(c) == 0
    assert _conta(c, I06_F0) >= 1


def test_retroativo_alinha_tudo():
    with _banco(migrar=False) as (c, sessao):
        _metricas(c, sessao, {"topico": 10, "ativo": 460.8})
        # O que a RPC de hoje deixa: a conta das sessões por cima do tempo ativo, e a matrícula fora da soma.
        c.execute(
            "UPDATE public.topico_aluno SET tempo_gasto_min = 45, tempo_direto_min = 17.9"
            " WHERE aluno_id = %s AND topico_id = 10",
            (A,),
        )
        c.execute(
            "UPDATE public.conteudo_aluno SET tempo_gasto_min = 9 WHERE aluno_id = %s AND conteudo_id = 100", (A,)
        )
        c.execute('UPDATE public.classe_aluno SET "tempoGastoMin" = 12.25 WHERE aluno_id = %s', (A,))
        assert _conta(c, I07) >= 1
        _upgrade(c)
        assert _tempo(c, 10) == (Decimal("7.68"), Decimal("17.9"))
        assert (
            c.execute(
                "SELECT tempo_gasto_min FROM public.conteudo_aluno WHERE aluno_id = %s AND conteudo_id = 100", (A,)
            ).fetchone()[0]
            == 0
        )
        assert _matricula(c, 1) == Decimal("7.68")
        assert _matricula(c, 2) == Decimal("0")
        assert _i06(c) == 0
        assert _conta(c, I07) == 0


@pytest.mark.parametrize("rpc", sorted(RPCS))
def test_rpcs_mantem_a_seguranca(banco, rpc):
    c, _ = banco
    with pytest.raises(psycopg.errors.InsufficientPrivilege, match="aluno_invalido"):
        RPCS[rpc](c, 10, 5, aluno=B, p_aluno=A)
    with pytest.raises(psycopg.errors.InsufficientPrivilege, match="matricula_invalida"):
        RPCS[rpc](c, 10, 5, aluno=B)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with c.transaction():
            c.execute("SET LOCAL ROLE anon")
            c.execute("SELECT public.trailup_tempo_presenca_min(%s, 'topic', 10, NULL, NULL)", (A,))


def _config(c, funcao: str) -> list[str]:
    return c.execute(
        "SELECT coalesce(proconfig, '{}') FROM pg_proc WHERE oid = %s::regprocedure", (funcao,)
    ).fetchone()[0]


def _corpo(c, funcao: str) -> str:
    return c.execute("SELECT prosrc FROM pg_proc WHERE oid = %s::regprocedure", (funcao,)).fetchone()[0]


SESSAO = "public.trailup_registrar_sessao_estudo(uuid,uuid,text,bigint,bigint,bigint,timestamptz,timestamptz)"
INTERVALO = "public.trailup_registrar_intervalo_estudo(uuid,uuid,bigint,bigint,bigint,numeric)"
SYNC = "public.trailup_sync_tempo_da_telemetria()"
PRESENCA = "public.trailup_tempo_presenca_min(uuid,text,bigint,bigint,bigint)"


def test_upgrade_fecha_search_path(banco):
    c, _ = banco
    for funcao in (SESSAO, INTERVALO, SYNC, PRESENCA):
        assert _config(c, funcao) == ['search_path=""']
    assert "trailup_tempo_sessao_min" not in _corpo(c, SESSAO)
    assert "trailup_tempo_sessao_min" not in _corpo(c, INTERVALO)


def test_downgrade_restaura_rpcs_e_i06(banco):
    c, sessao = banco
    _downgrade(c)
    assert "trailup_tempo_sessao_min" in _corpo(c, SESSAO)
    assert "trailup_tempo_sessao_min" in _corpo(c, INTERVALO)
    assert "trailup_recalcular" not in _corpo(c, SYNC)
    assert _config(c, SYNC) == ["search_path=public, pg_temp"]
    assert "trailup_tempo_sessao_min" in _corpo(c, "public.fn_inv_i06()")
    assert (
        c.execute(
            "SELECT to_regprocedure('public.trailup_tempo_presenca_min(uuid,text,bigint,bigint,bigint)')"
        ).fetchone()[0]
        is None
    )
    gatilhos = c.execute("SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'trg_tme_sync_tempo_%'").fetchone()[0]
    assert gatilhos == 3
    # O comportamento antigo volta: a sessão do cronômetro grava por cima do tempo ativo.
    _ativo_de_1_5(c, sessao)
    _sessao_rpc(c, 10, 10)
    assert _tempo(c, 10)[0] == Decimal("10")
    # E a I06 da F0 aceita isso, enquanto a matrícula não acompanha o gatilho antigo.
    assert _i06(c) == 0
    # O upgrade de novo alinha (a migration é reaplicável).
    _upgrade(c)
    assert _tempo(c, 10)[0] == Decimal("1.5")
    assert _conta(c, I07) == 0
