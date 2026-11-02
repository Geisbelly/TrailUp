"""`20261102_12`: KPIs operacionais da fila de personalização (#14).

A primeira parte lê a migration sem banco (vale no CI sem Postgres). A segunda (`@f5.e2e`) roda num
Postgres local com o esqueleto de produção, as policies reais de leitura do professor nas duas tabelas da
fila e em `app_config`, e chama a RPC como `authenticated` (é `SECURITY INVOKER`: sem o papel, a RLS não
age e o teste passaria por acidente).

Dado do e2e, calculado à mão (D = hoje no fuso de Brasília, horários locais):

    turma 1 (PROF):
      J1 class_delta_sync completed  D-2 12:00  latência 600, espera 60
      J2 class_delta_sync failed     D-1 12:00  latência 3000, espera 30
      J3 class_delta_sync pending    D-1 12:00  com finished_at velho (retomada): fora da média
      J4 manual_retry     partial    D-1 12:00  latência 1200
      J6 class_delta_sync completed  D-40       fora da janela de 30 dias
    turma 2 (outro professor):
      J5 class_delta_sync failed     D-1 12:00  nunca aparece

    jobs: 4; latências 600, 1200, 3000 → média 1600, p95 = 1200 + 0,9 × 1800 = 2820
    class_delta_sync: 600 e 3000 → média 1800, p95 = 600 + 0,95 × 2400 = 2880 > SLO 1800
    manual_retry: 1200 → p95 1200, dentro do SLO

    targets (relógio escrito à mão, com o gatilho desligado):
      capítulo  J1 completed 100 s, 1 execução; J1 completed 300 s, 2 execuções
      áudio     J4 completed 900 s, attempts 0 e 2 execuções (retomada zerou attempts); J2 failed, 3 tentativas
      perfil    J2 failed, attempts 3, 0 execuções (target legado)
      apresentação J3 pending
      enriquecimento J1 skipped

    capítulo: média 200, p95 = 100 + 0,95 × 200 = 290 ≤ 300; reprocessamento 1/2 = 50 %
    áudio: p95 900 > 600; reprocessamento 2/2 = 100 %
    perfil inteiro: 1/1 = 100 %; apresentação e enriquecimento: base 0 → taxa nula
"""

from __future__ import annotations

import json
import re
import uuid

import pytest

from tests import _f5_banco as f5

M = f5.modulo("20261102_12_kpis_operacionais_personalizacao.py")


def _sql(fn: str = "upgrade") -> str:
    return "\n".join(f5.sql_de(M, fn))


# --------------------------------------------------------------------------- estrutura, sem banco


def test_encadeia_na_09() -> None:
    assert (M.revision, M.down_revision) == ("20261102_12", "20261102_11")


def test_cabeca_unica() -> None:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    raiz = f5.VERSOES.parent.parent
    config = Config(str(raiz / "alembic.ini"))
    config.set_main_option("script_location", str(raiz / "alembic"))
    assert len(ScriptDirectory.from_config(config).get_heads()) == 1


def test_rpc_e_invoker_e_confere_a_posse_antes() -> None:
    sql = M.FUNCAO
    assert "SECURITY INVOKER" in sql and "SECURITY DEFINER" not in sql
    posse = sql.index("app_classes_do_professor()")
    assert posse < sql.index("FROM public.personalizacao_jobs j")
    assert "ERRCODE = '42501'" in sql
    assert "REVOKE ALL ON FUNCTION public.personalizacao_kpis_operacionais(bigint, timestamptz, timestamptz, text)\n  FROM PUBLIC, anon" in sql
    assert "TO authenticated" in sql


def test_rpc_cabe_numa_transacao_somente_leitura() -> None:
    """O PostgREST chama função STABLE em transação READ ONLY: tabela temporária ou escrita quebraria."""
    sql = M.FUNCAO.upper()
    assert "STABLE" in sql
    for proibido in ("CREATE TEMP", "INSERT INTO", "UPDATE PUBLIC", "DELETE FROM", "TRUNCATE"):
        assert proibido not in sql


def test_rpc_nao_devolve_dado_de_aluno_nem_erro() -> None:
    assert "aluno_id" not in M.FUNCAO
    assert "last_error" not in M.FUNCAO


def test_relogio_usa_clock_timestamp() -> None:
    """`now()` é o início da transação: marcar início e fim na mesma transação daria duração zero."""
    corpo = M.RELOGIO[M.RELOGIO.index("AS $fn$") : M.RELOGIO.index("$fn$;")]
    assert "clock_timestamp()" in corpo and "now()" not in corpo
    assert "BEFORE INSERT OR UPDATE ON public.personalizacao_job_targets" in M.RELOGIO


def test_slo_publico_e_cobre_todo_formato() -> None:
    assert "'personalizacao_kpi_slo'" in M.CONFIG and ", true)" in M.CONFIG
    slo = json.loads(M.SLO)
    assert set(slo["geracao_p95_seg"]) == set(M.FORMATOS)
    assert slo["latencia_job_p95_seg"]["padrao"] > 0
    assert 0 < slo["falha_pct_max"] < 100 and slo["dias_persistencia"] >= 1


def test_texto_seguro_para_text_do_sqlalchemy() -> None:
    """`op.execute` passa por `text()`: `:nome` vira parâmetro e `%` dobra no SQL offline."""
    for sql in (_sql(), _sql("downgrade")):
        assert "%" not in sql
        assert re.search(r"(?<![:\w]):[A-Za-z_]", sql) is None


def test_downgrade_desfaz_tudo() -> None:
    sql = _sql("downgrade")
    for item in (
        "DROP FUNCTION IF EXISTS public.personalizacao_kpis_operacionais",
        "chave = 'personalizacao_kpi_slo'",
        "DROP TRIGGER IF EXISTS trg_job_target_relogio",
        "DROP FUNCTION IF EXISTS public.fn_job_target_relogio()",
        "DROP COLUMN IF EXISTS processing_runs",
        "DROP COLUMN IF EXISTS processing_started_at",
        "DROP COLUMN IF EXISTS processing_finished_at",
    ):
        assert item in sql, item


# --------------------------------------------------------------------------- e2e, banco local

OUTRO_PROF = uuid.UUID(int=12)
TURMA2 = 2

POSSE = """
CREATE OR REPLACE FUNCTION public.app_classes_do_professor()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT c.id FROM classe c WHERE c.professor_id = auth.uid()
$$;
"""

# O que produção tem hoje (pg_policies medido em 02/11) nas três tabelas que a RPC lê.
RLS = """
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;  -- o Supabase dá; auth.uid() precisa
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER TABLE public.personalizacao_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personalizacao_job_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY personalizacao_jobs_professor_sel ON public.personalizacao_jobs
  FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()));
CREATE POLICY personalizacao_job_targets_professor_sel ON public.personalizacao_job_targets
  FOR SELECT TO authenticated
  USING (job_id IN (SELECT j.id FROM public.personalizacao_jobs j
                     WHERE j.classe_id IN (SELECT public.app_classes_do_professor())));
CREATE POLICY app_config_sel ON public.app_config FOR SELECT TO anon, authenticated USING (publico);
"""

# Meio-dia local de D-n, em timestamptz.
DIA = "(((now() AT TIME ZONE 'America/Sao_Paulo')::date - {n}) + time '12:00') AT TIME ZONE 'America/Sao_Paulo'"

J = {nome: uuid.UUID(int=100 + i) for i, nome in enumerate(("J1", "J2", "J3", "J4", "J5", "J6"))}


def _banco():
    return f5.banco(POSSE, RLS, *f5.sql_de(M))


def _job(c, nome: str, kind: str, status: str, dias: int, espera: int | None, latencia: int | None,
         turma: int = f5.TURMA) -> None:
    criado = DIA.format(n=dias)
    c.execute(
        f"""
        INSERT INTO public.personalizacao_jobs (id, kind, status, classe_id, trigger_source, created_at, started_at, finished_at)
        VALUES (%s, %s, %s, %s, 'teste', {criado},
                {criado} + make_interval(secs => %s), {criado} + make_interval(secs => %s))
        """,
        (J[nome], kind, status, turma, espera, latencia),
    )


def _alvo(c, job: str, media_kind: str | None, status: str, attempts: int, runs: int, duracao: int | None) -> None:
    parte = 1 if media_kind in ("audio", "apresentacao") else None
    bloco = "b" if media_kind in ("enriquecimento", "capitulo") else None
    c.execute(
        """
        INSERT INTO public.personalizacao_job_targets
          (job_id, topico_id, status, attempts, media_kind, block_id, part_ordem,
           processing_runs, processing_started_at, processing_finished_at)
        VALUES (%s, 10, %s, %s, %s, %s, %s, %s, now() - interval '1 day',
                now() - interval '1 day' + make_interval(secs => %s))
        """,
        (J[job], status, attempts, media_kind, bloco, parte, runs, duracao),
    )


def _semear(c) -> None:
    f5.semear_turma(c)
    f5.afrouxa(c, "professor")
    c.execute(
        f"""
        INSERT INTO auth.users (id, email) VALUES ('{OUTRO_PROF}', 'p2@teste.invalid');
        INSERT INTO public.professor (id, nome) VALUES ('{OUTRO_PROF}', 'Prof 2');
        INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE
          VALUES ({TURMA2}, 1, '{OUTRO_PROF}', 'T2');
        """
    )
    _job(c, "J1", "class_delta_sync", "completed", 2, 60, 600)
    _job(c, "J2", "class_delta_sync", "failed", 1, 30, 3000)
    _job(c, "J3", "class_delta_sync", "pending", 1, None, 5)
    _job(c, "J4", "manual_retry", "partial", 1, 10, 1200)
    _job(c, "J5", "class_delta_sync", "failed", 1, 10, 100, turma=TURMA2)
    _job(c, "J6", "class_delta_sync", "completed", 40, 10, 100)

    # O relógio é do gatilho; aqui ele é escrito à mão para a conta sair exata.
    c.execute("ALTER TABLE public.personalizacao_job_targets DISABLE TRIGGER trg_job_target_relogio")
    _alvo(c, "J1", "capitulo", "completed", 1, 1, 100)
    _alvo(c, "J1", "capitulo", "completed", 1, 2, 300)
    _alvo(c, "J4", "audio", "completed", 0, 2, 900)
    _alvo(c, "J2", "audio", "failed", 3, 3, 50)
    _alvo(c, "J2", None, "failed", 3, 0, None)
    _alvo(c, "J3", "apresentacao", "pending", 0, 0, None)
    _alvo(c, "J1", "enriquecimento", "skipped", 0, 0, None)
    _alvo(c, "J5", "audio", "failed", 3, 3, 10)
    c.execute("ALTER TABLE public.personalizacao_job_targets ENABLE TRIGGER trg_job_target_relogio")


def _rpc(c, quem: uuid.UUID = f5.PROF, args: str = "1"):
    f5.como(c, quem)
    c.execute("SET ROLE authenticated")
    try:
        bruto = c.execute(f"SELECT public.personalizacao_kpis_operacionais({args})").fetchone()[0]
    finally:
        c.execute("RESET ROLE")
        f5.como(c, None)
    return bruto if isinstance(bruto, dict) else json.loads(bruto)


def _por(lista: list[dict], chave: str) -> dict[str, dict]:
    return {x[chave]: x for x in lista}


@f5.e2e
def test_latencia_so_de_job_terminado() -> None:
    with _banco() as c:
        _semear(c)
        r = _rpc(c)
        jobs = r["jobs"]
        assert jobs["total"] == 4  # J5 é de outra turma, J6 está fora da janela
        assert jobs["por_status"] == {"pending": 1, "processing": 0, "completed": 1, "partial": 1, "failed": 1}
        assert (jobs["terminados"], jobs["em_aberto"]) == (3, 1)
        assert (jobs["latencia_media_seg"], jobs["latencia_p95_seg"]) == (1600, 2820)
        assert jobs["pedidos_de_reprocessamento"] == 1


@f5.e2e
def test_por_tipo_marca_o_slo_violado() -> None:
    with _banco() as c:
        _semear(c)
        tipos = _por(_rpc(c)["por_tipo"], "kind")
        delta = tipos["class_delta_sync"]
        assert (delta["total"], delta["terminados"], delta["latencia_media_seg"], delta["latencia_p95_seg"]) == (
            3, 2, 1800, 2880)
        assert (delta["slo_latencia_p95_seg"], delta["slo_violado"]) == (1800, True)
        assert (tipos["manual_retry"]["latencia_p95_seg"], tipos["manual_retry"]["slo_violado"]) == (1200, False)


@f5.e2e
def test_por_formato_tempo_e_reprocessamento() -> None:
    with _banco() as c:
        _semear(c)
        r = _rpc(c)
        f = _por(r["por_formato"], "formato")
        assert [x["formato"] for x in r["por_formato"]] == list(M.FORMATOS)
        cap, audio = f["capitulo"], f["audio"]
        assert (cap["total"], cap["tempo_geracao_medio_seg"], cap["tempo_geracao_p95_seg"]) == (2, 200, 290)
        assert (cap["reprocessados"], cap["base_reprocessamento"], cap["taxa_reprocessamento_pct"]) == (1, 2, 50.0)
        assert cap["slo_violado"] is False
        assert audio["por_status"]["failed"] == 1 and audio["por_status"]["completed"] == 1
        assert (audio["geracoes_medidas"], audio["tempo_geracao_p95_seg"], audio["slo_violado"]) == (1, 900, True)
        assert audio["taxa_reprocessamento_pct"] == 100.0  # attempts zerado pela retomada, execuções não
        assert f["perfil_inteiro"]["taxa_reprocessamento_pct"] == 100.0  # legado: vale o attempts
        for nome in ("apresentacao", "enriquecimento"):
            assert f[nome]["taxa_reprocessamento_pct"] is None and f[nome]["tempo_geracao_medio_seg"] is None
        assert f["enriquecimento"]["por_status"]["skipped"] == 1


@f5.e2e
def test_serie_localiza_quando_a_falha_comecou() -> None:
    with _banco() as c:
        _semear(c)
        serie = _rpc(c)["serie"]
        assert sum(b["total"] for b in serie) == 4
        assert all(b["total"] == 0 for b in serie[:-3])  # zeros onde não houve job, não buracos
        primeira_falha = next(i for i, b in enumerate(serie) if b["failed"] or b["partial"])
        assert serie[primeira_falha - 1]["completed"] == 1 and serie[primeira_falha - 1]["failed"] == 0
        assert (serie[primeira_falha]["failed"], serie[primeira_falha]["partial"]) == (1, 1)


@f5.e2e
def test_gatilhos_do_paragrafo_11() -> None:
    with _banco() as c:
        _semear(c)
        g = _por(_rpc(c)["gatilhos"], "chave")
        assert g["latencia_acima_slo"]["ativo"] and g["latencia_acima_slo"]["tipos"] == ["class_delta_sync"]
        assert g["geracao_acima_slo"]["ativo"] and g["geracao_acima_slo"]["formatos"] == ["audio"]
        # J3 está em aberto há mais de 12 h, acima dos 30 min do SLO.
        assert g["fila_parada"]["ativo"] and g["fila_parada"]["jobs_em_aberto_acima_do_slo"] == 1
        # Só dois dias com job (D-2: 0 %, D-1: 100 %); o padrão pede três.
        assert g["falha_persistente"]["ativo"] is False
        assert [d["problema_pct"] for d in g["falha_persistente"]["ultimos_dias_com_job"]] == [0, 100]

        c.execute(
            "UPDATE public.app_config SET valor = jsonb_set(valor::jsonb, '{dias_persistencia}', '1')::text "
            "WHERE chave = 'personalizacao_kpi_slo'"
        )
        assert _por(_rpc(c)["gatilhos"], "chave")["falha_persistente"]["ativo"] is True


@f5.e2e
def test_periodo_sem_job_vem_com_zeros_e_nulos() -> None:
    with _banco() as c:
        _semear(c)
        r = _rpc(c, args="1, now() - interval '1 hour', now(), 'hora'")
        assert r["jobs"]["total"] == 0 and r["jobs"]["latencia_media_seg"] is None
        assert [x["formato"] for x in r["por_formato"]] == list(M.FORMATOS)
        assert all(x["total"] == 0 and x["taxa_reprocessamento_pct"] is None for x in r["por_formato"])
        assert r["por_tipo"] == [] and all(b["total"] == 0 for b in r["serie"])
        assert not any(g["ativo"] for g in r["gatilhos"])


@f5.e2e
def test_sem_slo_configurado_nao_inventa_violacao() -> None:
    with _banco() as c:
        _semear(c)
        c.execute("DELETE FROM public.app_config WHERE chave = 'personalizacao_kpi_slo'")
        r = _rpc(c)
        assert all(t["slo_violado"] is None for t in r["por_tipo"])
        assert all(f["slo_violado"] is None for f in r["por_formato"])
        assert not any(g["ativo"] for g in r["gatilhos"])


@f5.e2e
def test_so_o_professor_dono_le() -> None:
    import psycopg

    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _rpc(c, quem=OUTRO_PROF)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _rpc(c, quem=f5.A)  # aluno da turma
        c.execute("SET ROLE anon")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("SELECT public.personalizacao_kpis_operacionais(1)")
        c.execute("RESET ROLE")
        # O outro professor lê a turma dele, e só ela.
        r = _rpc(c, quem=OUTRO_PROF, args=str(TURMA2))
        assert r["jobs"]["total"] == 1 and _por(r["por_formato"], "formato")["audio"]["total"] == 1


@f5.e2e
def test_parametros_invalidos() -> None:
    import psycopg

    with _banco() as c:
        _semear(c)
        for args in ("1, now(), now() - interval '1 day'", "1, NULL, NULL, 'mes'", "1, now() - interval '90 days', now(), 'hora'"):
            with pytest.raises(psycopg.errors.InvalidParameterValue):
                _rpc(c, args=args)


@f5.e2e
def test_relogio_do_target_pelo_gatilho() -> None:
    with _banco() as c:
        _semear(c)

        def linha():
            return c.execute(
                "SELECT status, attempts, processing_runs, processing_started_at, processing_finished_at "
                "FROM public.personalizacao_job_targets WHERE id = %s",
                (tid,),
            ).fetchone()

        tid = c.execute(
            "INSERT INTO public.personalizacao_job_targets (job_id, topico_id, status, processing_runs) "
            "VALUES (%s, 10, 'pending', 7) RETURNING id",
            (J["J1"],),
        ).fetchone()[0]
        assert linha()[2:] == (0, None, None)  # quem escreve não escolhe o relógio

        # Início e fim na mesma transação: com now() a duração seria zero.
        with c.transaction():
            c.execute("UPDATE public.personalizacao_job_targets SET status = 'processing', attempts = 1 WHERE id = %s", (tid,))
            c.execute("SELECT pg_sleep(0.05)")
            c.execute("UPDATE public.personalizacao_job_targets SET status = 'failed' WHERE id = %s", (tid,))
        _, _, runs, inicio, fim = linha()
        assert runs == 1 and fim > inicio

        c.execute(
            "UPDATE public.personalizacao_job_targets SET processing_runs = 0, processing_finished_at = NULL WHERE id = %s",
            (tid,),
        )
        assert linha()[2] == 1 and linha()[4] == fim

        # Retomada manual: zera attempts e volta a pending. As execuções ficam.
        c.execute("UPDATE public.personalizacao_job_targets SET status = 'pending', attempts = 0 WHERE id = %s", (tid,))
        assert linha()[1:] == (0, 1, None, None)
        c.execute("UPDATE public.personalizacao_job_targets SET status = 'processing' WHERE id = %s", (tid,))
        c.execute("UPDATE public.personalizacao_job_targets SET status = 'completed' WHERE id = %s", (tid,))
        assert linha()[2] == 2 and linha()[4] is not None

        # Sem passar por processing não há execução medida: NULL, nunca zero.
        c.execute("UPDATE public.personalizacao_job_targets SET status = 'pending' WHERE id = %s", (tid,))
        c.execute("UPDATE public.personalizacao_job_targets SET status = 'completed' WHERE id = %s", (tid,))
        assert linha()[3:] == (None, None)


@f5.e2e
def test_downgrade_volta_ao_schema_anterior() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        colunas = {
            r[0]
            for r in c.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'personalizacao_job_targets'"
            ).fetchall()
        }
        assert not {"processing_runs", "processing_started_at", "processing_finished_at"} & colunas
        assert c.execute("SELECT to_regprocedure('public.fn_job_target_relogio()')").fetchone()[0] is None


@f5.e2e
def test_roda_em_transacao_somente_leitura() -> None:
    """Como o PostgREST chama função STABLE: dentro de `BEGIN READ ONLY`."""
    with _banco() as c:
        _semear(c)
        c.execute("BEGIN READ ONLY")
        try:
            assert _rpc(c)["jobs"]["total"] == 4
        finally:
            c.execute("ROLLBACK")
