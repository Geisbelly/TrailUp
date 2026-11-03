"""`20261103_14`: o painel técnico mede o custo por artefato em tokens (#21).

Os e2e rodam num Postgres de verdade (`TRAILUP_E2E_RETENCAO_DATABASE_URL`): o painel da `20261102_22`
e esta migração por cima do esqueleto de produção, com stubs só do que o painel lê e o esqueleto
(de 24/10) ainda não tem.
"""

import json
import uuid

import pytest

from tests._f5_banco import DSN, afrouxa, banco, modulo, semear_turma, sql_de

mod = modulo("20261103_14_custo_por_geracao.py")
painel = modulo("20261102_22_painel_tecnico.py")

e2e = pytest.mark.skipif(not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL não definida")


def test_encadeia_depois_da_foto_do_professor() -> None:
    assert mod.revision == "20261103_14"
    assert mod.down_revision == "20261103_13"


def test_a_soma_nao_e_do_cliente() -> None:
    sql = sql_de(mod)[0]
    assert "REVOKE ALL ON FUNCTION public.fn_personalizacao_uso_somar(jsonb, jsonb) FROM PUBLIC, anon, authenticated;" in sql
    assert "GRANT" not in sql


def test_o_painel_so_muda_o_gatilho_de_custo_e_ganha_o_bloco_custo() -> None:
    novo = sql_de(mod)[1]
    assert "Tokens por alvo subiram" in novo
    assert "'custo', v_custo" in novo
    # O resto do painel é o mesmo: a posse do dono vem antes e os quatro gatilhos continuam.
    assert novo.index("app_e_dono()") < novo.index("personalizacao_job_targets")
    for gatilho in ("fila_persistente", "divergencia_progresso", "custo_por_artefato", "latencia_slo"):
        assert f"'id', '{gatilho}'" in novo
    # O proxy continua valendo enquanto há poucos alvos medidos.
    assert "GREATEST(t.attempts, t.processing_runs)" in novo
    assert "Execuções por alvo subiram" in novo


def test_o_downgrade_volta_o_painel_da_22_e_tira_a_coluna() -> None:
    sql = sql_de(mod, "downgrade")
    assert sql[0] == painel.FUNCAO
    assert any("DROP COLUMN IF EXISTS uso_modelo" in s for s in sql)


# --------------------------------------------------------------------------- e2e

PRE = """
CREATE OR REPLACE FUNCTION public.app_e_dono() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
ALTER TABLE public.personalizacao_job_targets ADD COLUMN IF NOT EXISTS processing_runs integer NOT NULL DEFAULT 0;
ALTER TABLE public.personalizacao_job_targets ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;
ALTER TABLE public.personalizacao_job_targets ADD COLUMN IF NOT EXISTS processing_finished_at timestamptz;
CREATE TABLE IF NOT EXISTS public.metricas_invariante_resultado (
  id bigserial PRIMARY KEY, invariante text, ok boolean, linhas integer, rodado_em timestamptz, erro text);
CREATE TABLE IF NOT EXISTS public.telemetria_analise_fila (id bigserial PRIMARY KEY, ultimo_erro text);
ALTER TABLE public.telemetria_lotes ADD COLUMN IF NOT EXISTS analysis_ciclo_id text;
"""

JOB = uuid.UUID(int=51)


@pytest.fixture
def c():
    with banco(PRE, painel.FUNCAO, *sql_de(mod)) as conn:
        semear_turma(conn)
        afrouxa(conn, "personalizacao_jobs")
        conn.execute("INSERT INTO public.personalizacao_jobs (id, classe_id) VALUES (%s, 1)", (JOB,))
        yield conn


def _soma(c, a, b):
    return c.execute(
        "SELECT public.fn_personalizacao_uso_somar(%s::jsonb, %s::jsonb)",
        (None if a is None else json.dumps(a), json.dumps(b)),
    ).fetchone()[0]


def _uso(entrada: int, saida: int, modelo: str = "gemini-flash") -> dict:
    gasto = {"chamadas": 1, "tokens_entrada": entrada, "tokens_saida": saida, "caracteres": 0}
    return {**gasto, "por_modelo": {modelo: gasto}}


@e2e
def test_a_soma_acumula_entre_tentativas_e_por_modelo(c):
    primeira = _soma(c, None, _uso(100, 40))
    assert primeira["tentativas"] == 1
    assert primeira["tokens_entrada"] == 100
    segunda = _soma(c, primeira, _uso(10, 5, "gpt-4o-mini") | {"caracteres": 300})
    assert segunda["tentativas"] == 2
    assert (segunda["chamadas"], segunda["tokens_entrada"], segunda["tokens_saida"], segunda["caracteres"]) == (2, 110, 45, 300)
    assert segunda["por_modelo"]["gemini-flash"]["tokens_entrada"] == 100
    assert segunda["por_modelo"]["gpt-4o-mini"]["tokens_saida"] == 5


@e2e
def test_a_soma_ignora_valor_que_nao_e_numero(c):
    r = _soma(c, None, {"chamadas": "x", "tokens_entrada": -5, "tokens_saida": 7, "por_modelo": {"m": "ruim", "n": {"chamadas": 2}}})
    assert (r["chamadas"], r["tokens_entrada"], r["tokens_saida"]) == (0, 0, 7)
    assert list(r["por_modelo"]) == ["n"]


def _alvos(c, n: int, horas_atras: int, tokens: int | None, status: str = "completed") -> None:
    afrouxa(c, "personalizacao_job_targets")
    for _ in range(n):
        c.execute(
            """
            INSERT INTO public.personalizacao_job_targets (job_id, topico_id, status, created_at, uso_modelo)
            VALUES (%s, 10, %s, now() - make_interval(hours => %s),
                    CASE WHEN %s::integer IS NULL THEN NULL
                         ELSE public.fn_personalizacao_uso_somar(NULL, %s::jsonb) END)
            """,
            (JOB, status, horas_atras, tokens, json.dumps(_uso(tokens or 0, 0))),
        )


def _custo(c) -> tuple[dict, dict]:
    r = c.execute("SELECT public.painel_tecnico(24)").fetchone()[0]
    gatilho = next(g for g in r["gatilhos"] if g["id"] == "custo_por_artefato")
    return gatilho, r["custo"]


@e2e
def test_com_alvos_medidos_o_gatilho_e_em_tokens(c):
    _alvos(c, 5, 30, 1000)  # janela anterior
    _alvos(c, 5, 2, 1100)  # janela atual: +10 %
    gatilho, custo = _custo(c)
    assert gatilho["estado"] == "ok"
    assert "Tokens por alvo: 1100" in gatilho["detalhe"]
    assert custo["tokens_por_alvo"] == 1100 and custo["tokens_por_alvo_anterior"] == 1000
    assert custo["alvos_medidos"] == 5
    assert custo["por_modelo"]["gemini-flash"]["tokens_entrada"] == 5500


@e2e
def test_tokens_subindo_sem_conclusao_subir_e_alerta(c):
    _alvos(c, 5, 30, 1000)
    _alvos(c, 5, 2, 1500)
    gatilho, _ = _custo(c)
    assert gatilho["estado"] == "alerta"
    assert "Tokens por alvo subiram de 1000 para 1500" in gatilho["detalhe"]


@e2e
def test_sem_alvos_medidos_vale_o_proxy_e_diz_isso(c):
    _alvos(c, 5, 30, None)
    _alvos(c, 5, 2, None)
    gatilho, custo = _custo(c)
    assert gatilho["estado"] == "ok"
    assert "Proxy" in gatilho["detalhe"]
    assert custo["alvos_medidos"] == 0
