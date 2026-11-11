"""Fase 1 do roteiro de diversidade de perfis: a diversidade da turma visível no console.

`classe_diversidade_perfis(classe, margem)` mostra ao professor o que o rótulo "dominante"
esconde: em produção (11/11), 5 de 6 alunos têm menos de 5 pontos entre o 1º e o 2º perfil. A
função lê o vetor pela regra única do banco (`app_vetor_perfil`, #1107), renormaliza para 100 e
roda com a RLS de quem chama.
"""

from __future__ import annotations

import json
import math
import uuid

import pytest

from tests import _f5_banco as f5

MIGRATION = "20261111_03_diversidade_perfis_da_turma.py"
VETOR = "20261111_01_vetor_perfil_no_banco.py"
PERFIS = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"]
OUTRO_PROF = uuid.UUID(int=12)


# --------------------------------------------------------------------------- estrutura


def test_funcao_invoker_so_para_authenticated_e_sobre_o_vetor_unico() -> None:
    mod = f5.modulo(MIGRATION)
    assert mod.down_revision == "20261111_02"
    sql = "\n".join(f5.sql_de(mod))
    assert "CREATE OR REPLACE FUNCTION public.classe_diversidade_perfis(p_classe bigint, p_margem numeric DEFAULT 10)" in sql
    assert "SECURITY INVOKER" in sql and "SECURITY DEFINER" not in sql
    assert "public.app_vetor_perfil(" in sql
    assert "public.app_classes_do_professor()" in sql
    assert "REVOKE ALL ON FUNCTION public.classe_diversidade_perfis(bigint, numeric) FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.classe_diversidade_perfis(bigint, numeric) TO authenticated, service_role" in sql


def test_downgrade_remove_a_funcao() -> None:
    sql = "\n".join(f5.sql_de(f5.modulo(MIGRATION), "downgrade"))
    assert "DROP FUNCTION IF EXISTS public.classe_diversidade_perfis(bigint, numeric)" in sql


# --------------------------------------------------------------------------- contra Postgres real

# A RLS de produção das três tabelas lidas (pg_policies, 11/11/2026).
ANTES = """
CREATE OR REPLACE FUNCTION public.app_classes_do_professor()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id FROM classe c WHERE c.professor_id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.app_classes_do_aluno()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ca.classe_id FROM classe_aluno ca WHERE ca.aluno_id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.app_alunos_do_professor()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ca.aluno_id FROM classe_aluno ca JOIN classe c ON c.id = ca.classe_id
   WHERE c.professor_id = auth.uid()
$$;
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT SELECT ON public.classe, public.classe_aluno, public.aluno_perfil, public.perfil TO authenticated;
ALTER TABLE public.classe_aluno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aluno_perfil ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil ENABLE ROW LEVEL SECURITY;
CREATE POLICY classe_aluno_posse_sel ON public.classe_aluno FOR SELECT TO authenticated
  USING (aluno_id = auth.uid() OR classe_id IN (SELECT app_classes_do_professor())
         OR classe_id IN (SELECT app_classes_do_aluno()));
CREATE POLICY aluno_perfil_posse_sel ON public.aluno_perfil FOR SELECT TO authenticated
  USING (aluno_id = auth.uid() OR aluno_id IN (SELECT app_alunos_do_professor()));
CREATE POLICY perfil_posse_sel ON public.perfil FOR SELECT TO authenticated USING (true);
"""

# A: 50/46 (soma 96: renormalizado 52,08/47,92, margem 4,17) — misto.
# B: 60/20/20 — não misto; o empate 20/20 vai para seeker pelo nome.
# C: sem vetor.
VETORES = {
    f5.A: {"seeker": 50, "survivor": 46},
    f5.B: {"achiever": 60, "seeker": 20, "survivor": 20},
}


@pytest.fixture()
def c():
    if not f5.DSN:
        pytest.skip("TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)")
    with f5.banco(ANTES, *f5.sql_de(f5.modulo(VETOR)), *f5.sql_de(f5.modulo(MIGRATION))) as conn:
        f5.semear_turma(conn)
        for i, nome in enumerate(PERFIS, start=1):
            conn.execute("INSERT INTO public.perfil (id, nome) VALUES (%s, %s) ON CONFLICT DO NOTHING", (i, nome))
        for aluno, vetor in VETORES.items():
            for nome, afinidade in vetor.items():
                conn.execute(
                    "INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) VALUES (%s, %s, %s)",
                    (aluno, PERFIS.index(nome) + 1, afinidade),
                )
        conn.execute(
            f"INSERT INTO auth.users (id, email) VALUES ('{OUTRO_PROF}', 'p2@teste.invalid');"
            f"INSERT INTO public.professor (id, nome) VALUES ('{OUTRO_PROF}', 'P2');"
            f"INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE"
            f" VALUES (2, 1, '{OUTRO_PROF}', 'Outra');"
        )
        yield conn


def _diversidade(c, quem: uuid.UUID, classe: int = f5.TURMA, margem: float | None = None):
    f5.como(c, quem)
    c.execute("SET ROLE authenticated")
    try:
        if margem is None:
            linha = c.execute("SELECT public.classe_diversidade_perfis(%s)", (classe,)).fetchone()
        else:
            linha = c.execute("SELECT public.classe_diversidade_perfis(%s, %s)", (classe, margem)).fetchone()
        valor = linha[0]
        return json.loads(valor) if isinstance(valor, str) else valor
    finally:
        c.execute("RESET ROLE")
        f5.como(c, None)


@f5.e2e
def test_contagens_absolutas_da_turma(c) -> None:
    d = _diversidade(c, f5.PROF)
    assert (d["alunos"], d["alunos_com_vetor"], d["alunos_mistos"]) == (3, 2, 1)
    assert d["margem_misto"] == 10


@f5.e2e
def test_massa_renormalizada_e_contagens_por_perfil(c) -> None:
    d = _diversidade(c, f5.PROF)
    perfis = {p["perfil"]: p for p in d["perfis"]}
    assert set(perfis) == set(PERFIS)
    assert perfis["seeker"]["massa"] == pytest.approx((50 / 96 * 100 + 20) / 2, abs=0.05)
    assert perfis["survivor"]["massa"] == pytest.approx((46 / 96 * 100 + 20) / 2, abs=0.05)
    assert perfis["achiever"]["massa"] == pytest.approx(30, abs=0.05)
    assert sum(p["massa"] for p in d["perfis"]) == pytest.approx(100, abs=0.2)
    assert (perfis["seeker"]["dominante"], perfis["achiever"]["dominante"], perfis["survivor"]["dominante"]) == (1, 1, 0)
    assert (perfis["seeker"]["representativo"], perfis["survivor"]["representativo"], perfis["achiever"]["representativo"]) == (2, 2, 1)
    # Ordem: maior massa primeiro.
    assert [p["perfil"] for p in d["perfis"][:3]] == ["seeker", "survivor", "achiever"]


@f5.e2e
def test_entropia_e_perfis_efetivos(c) -> None:
    d = _diversidade(c, f5.PROF)
    massas = [p["massa"] / 100 for p in d["perfis"] if p["massa"] > 0]
    h = -sum(m * math.log(m) for m in massas)
    assert d["entropia_normalizada"] == pytest.approx(h / math.log(7), abs=0.005)
    assert d["perfis_efetivos"] == pytest.approx(math.exp(h), abs=0.02)


@f5.e2e
def test_pares_e_alunos(c) -> None:
    d = _diversidade(c, f5.PROF)
    assert d["pares"] == [
        {"primeiro": "achiever", "segundo": "seeker", "alunos": 1},
        {"primeiro": "seeker", "segundo": "survivor", "alunos": 1},
    ]
    por_aluno = {a["aluno_id"]: a for a in d["por_aluno"]}
    assert por_aluno[str(f5.A)] == {
        "aluno_id": str(f5.A), "primeiro": "seeker", "segundo": "survivor", "margem": 4.2, "misto": True,
    }
    assert por_aluno[str(f5.B)]["misto"] is False
    assert por_aluno[str(f5.B)]["margem"] == 40
    # Sem vetor: aparece, sem primeiro nem margem, e não conta como misto.
    assert por_aluno[str(f5.C)] == {"aluno_id": str(f5.C), "primeiro": None, "segundo": None, "margem": None, "misto": False}


@f5.e2e
def test_margem_e_parametro(c) -> None:
    assert _diversidade(c, f5.PROF, margem=3)["alunos_mistos"] == 0
    assert _diversidade(c, f5.PROF, margem=50)["alunos_mistos"] == 2


@f5.e2e
def test_so_o_professor_da_turma_le(c) -> None:
    assert _diversidade(c, OUTRO_PROF) is None
    assert _diversidade(c, f5.A) is None


@f5.e2e
def test_turma_vazia_do_professor(c) -> None:
    f5.como(c, None)
    c.execute(f"UPDATE public.classe SET professor_id = '{f5.PROF}' WHERE id = 2")
    d = _diversidade(c, f5.PROF, classe=2)
    assert (d["alunos"], d["alunos_com_vetor"], d["alunos_mistos"]) == (0, 0, 0)
    assert d["entropia_normalizada"] == 0 and d["perfis_efetivos"] == 0
    assert d["pares"] == [] and d["por_aluno"] == []
