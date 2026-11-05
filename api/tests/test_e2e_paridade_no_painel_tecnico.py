"""`20261105_21` (#154, fase 5): gatilho de paridade guilda × individual no `painel_tecnico`.

Postgres local, esqueleto de produção. O que a função lê e não está em teste entra como dublê mínimo:
`app_e_dono` (sempre o dono), `fn_eventos_aluno_resolve_classe_id` (nulo) e as duas tabelas que o
esqueleto de 24/10 não tem (`metricas_invariante_resultado`, `telemetria_analise_fila`), vazias.

Turma 1, mínimo de 2 alunos por grupo nos testes. Cada atividade concluída vale 10 de XP; a recompensa
de missão (o que fazia a guilda render mais) entra como evento à parte.
"""

from __future__ import annotations

import uuid

import pytest

from tests import _f5_banco as f5

pytestmark = [f5.e2e]

M = f5.modulo("20261105_21_paridade_no_painel_tecnico.py")
M_CUSTO = f5.modulo("20261103_14_custo_por_geracao.py")
M_CONFIG = f5.modulo("20261021_05_missao_diaria_deterministica.py")
D, E = uuid.UUID(int=24), uuid.UUID(int=25)
G = uuid.UUID(int=600)

BASE = """
ALTER TABLE public.eventos_aluno ADD COLUMN IF NOT EXISTS fora_do_xp boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.app_e_dono() RETURNS boolean LANGUAGE sql AS $f$ SELECT true $f$;
CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_resolve_classe_id(p_tipo text, p_ref text)
RETURNS bigint LANGUAGE sql AS $f$ SELECT NULL::bigint $f$;
CREATE TABLE IF NOT EXISTS public.metricas_invariante_resultado (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, invariante text NOT NULL, rodado_em timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL, linhas bigint, erro text);
CREATE TABLE IF NOT EXISTS public.telemetria_analise_fila (id bigint, ultimo_erro text);
-- Colunas posteriores ao esqueleto que o resto do painel lê (`20261102_12`, `20261103_14`).
ALTER TABLE public.personalizacao_job_targets
  ADD COLUMN IF NOT EXISTS processing_runs integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_finished_at timestamptz;
"""


def _banco(*depois: str):
    return f5.banco(BASE, M_CONFIG.CONFIG, M_CUSTO.SOMAR, *depois)


def _semear(c) -> None:
    f5.semear_turma(c)
    for tabela in ("guildas", "eventos_aluno"):
        f5.afrouxa(c, tabela)
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES ('{D}', 'd@t.invalid'), ('{E}', 'e@t.invalid');
INSERT INTO public.alunos (id, nome, email) VALUES ('{D}', 'D', 'd@t.invalid'), ('{E}', 'E', 'e@t.invalid');
INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (1, '{D}'), (1, '{E}');
INSERT INTO public.guildas (id, classe_id, nome, criado_por) VALUES ('{G}', 1, 'G', '{f5.A}');
INSERT INTO public.guilda_membros (guilda_id, classe_id, aluno_id, joined_at)
VALUES ('{G}', 1, '{f5.A}', now() - interval '30 days'), ('{G}', 1, '{f5.B}', now() - interval '30 days');
UPDATE public.app_config SET valor = '2' WHERE chave = 'paridade_guilda_minimo';
"""
    )


def _atividades(c, aluno, n: int, xp: int = 10) -> None:
    for _ in range(n):
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, valor, criado_em)"
            " VALUES (%s, 1, 'atividade_concluida', %s, (now() - interval '1 day') AT TIME ZONE 'UTC')",
            (aluno, xp),
        )


def _extra(c, aluno, tipo: str, valor: int, fora_do_xp: bool = False) -> None:
    c.execute(
        "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, valor, criado_em, fora_do_xp)"
        " VALUES (%s, 1, %s, %s, (now() - interval '1 day') AT TIME ZONE 'UTC', %s)",
        (aluno, tipo, valor, fora_do_xp),
    )


def _gatilho(c) -> dict:
    with c.transaction():
        f5.como(c, f5.PROF)
        c.execute("SET LOCAL ROLE authenticated")
        painel = c.execute("SELECT public.painel_tecnico(168)").fetchone()[0]
    f5.como(c, None)
    achados = [g for g in painel["gatilhos"] if g["id"] == "paridade_guilda"]
    assert len(achados) == 1
    return achados[0]


@pytest.fixture
def banco():
    with _banco(*f5.sql_de(M)) as c:
        _semear(c)
        yield c


def test_ok_quando_as_duas_vias_rendem_igual(banco) -> None:
    for aluno in (f5.A, f5.B, D, E):  # A e B em guilda; D e E fora
        _atividades(banco, aluno, 3)
    g = _gatilho(banco)
    assert g["estado"] == "ok"
    assert "10.0 em guilda e 10.0 fora (2 e 2 alunos)" in g["detalhe"]


def test_alerta_quando_a_guilda_rende_mais_por_atividade(banco) -> None:
    for aluno in (f5.A, f5.B, D, E):
        _atividades(banco, aluno, 3)
    for aluno in (f5.A, f5.B):  # o prêmio inteiro da missão de guilda, com a mesma atividade
        _extra(banco, aluno, "missao_cumprida", 30)
    g = _gatilho(banco)
    assert g["estado"] == "alerta"
    assert "20.0 em guilda contra 10.0 fora" in g["detalhe"]


def test_duelo_fora_do_xp_nao_conta(banco) -> None:
    for aluno in (f5.A, f5.B, D, E):
        _atividades(banco, aluno, 3)
    for aluno in (f5.A, f5.B):
        _extra(banco, aluno, "desafio_vencido", 300, fora_do_xp=True)
    assert _gatilho(banco)["estado"] == "ok"


def test_sem_dado_com_poucos_alunos(banco) -> None:
    for aluno in (f5.A, f5.B, D):  # só 1 fora de guilda
        _atividades(banco, aluno, 3)
    g = _gatilho(banco)
    assert g["estado"] == "sem_dado"
    assert "2 em guilda e 1 fora" in g["detalhe"]


def test_quem_saiu_antes_da_janela_conta_como_fora(banco) -> None:
    banco.execute(
        "UPDATE public.guilda_membros SET left_at = now() - interval '20 days' WHERE aluno_id = %s", (f5.B,)
    )
    for aluno in (f5.A, f5.B, D, E):
        _atividades(banco, aluno, 3)
    assert "1 em guilda e 3 fora" in _gatilho(banco)["detalhe"]


def test_os_quatro_gatilhos_de_antes_continuam() -> None:
    with _banco(*f5.sql_de(M)) as c:
        _semear(c)
        with c.transaction():
            f5.como(c, f5.PROF)
            ids = [g["id"] for g in c.execute("SELECT public.painel_tecnico(168)").fetchone()[0]["gatilhos"]]
        assert ids == ["fila_persistente", "divergencia_progresso", "custo_por_artefato", "latencia_slo", "paridade_guilda"]


def test_downgrade_volta_aos_quatro() -> None:
    with _banco(*f5.sql_de(M), *f5.sql_de(M, "downgrade")) as c:
        with c.transaction():
            f5.como(c, f5.PROF)
            ids = [g["id"] for g in c.execute("SELECT public.painel_tecnico(168)").fetchone()[0]["gatilhos"]]
        assert "paridade_guilda" not in ids and len(ids) == 4
        assert c.execute("SELECT count(*) FROM public.app_config WHERE chave LIKE 'paridade_guilda%'").fetchone()[0] == 0
