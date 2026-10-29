"""Regressão: o consentimento de telemetria é prova do aluno e só ele a lê (D13 da F1).

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. Cada teste cria um
banco descartável com o ESQUELETO do schema public da produção (que traz a tabela, mas não a RLS nem as
policies) e os privilégios que o Supabase dá por padrão (toda tabela nova de `public` nasce com tudo
para `anon`/`authenticated`). Em cima, aplica a `upgrade()` da `20261003_10` recortada do módulo (nunca
copiada à mão): RLS ligada, policies `consentimento_telemetria_aluno_sel`/`_ins` e o GRANT.

Este é teste de REGRESSÃO de comportamento já correto: em 29/10 a produção foi medida com
`SET LOCAL ROLE anon` e devolveu 0 linhas. Os testes ficam para que uma policy permissiva ou um
`DISABLE ROW LEVEL SECURITY` futuros não passem em silêncio. Cada um traz um CONTROLE (dentro de uma
transação que é desfeita): com a RLS desligada o mesmo SELECT enxerga as linhas dos outros, o que
prova que a asserção não é vacuosa.

O papel de cliente é de verdade: `SET LOCAL ROLE` + claims (e `request.jwt.claim.sub`, que é o que o
`auth.uid()` do esqueleto lê). Dados sintéticos. Recusa banco hospedado.
"""

from __future__ import annotations

import json
import os
import uuid
from contextlib import contextmanager

import pytest

DSN = os.environ.get("TRAILUP_E2E_RETENCAO_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

if DSN:
    import psycopg

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e do consentimento recusa banco hospedado: use um Postgres local")

from tests import test_e2e_guilda_mantem_quem_saiu_da_turma as base  # noqa: E402
from tests import test_e2e_invariantes_das_metricas as inv  # noqa: E402

M_CONSENTIMENTO = base._modulo("20261003_10_consentimento_provavel.py")
M_RETENCAO = base._modulo("20261024_03_retencao_e_expurgo.py")

# A `20261024_03` (l. ~120) deixa a prova de consentimento sobreviver à conta: `aluno_id` vira nullable
# com ON DELETE SET NULL. Em produção há, portanto, linhas com `aluno_id IS NULL`. O trecho é recortado do
# módulo (nunca copiado à mão).
ANONIMIZA_PROVA = M_RETENCAO._sql_fk("consentimento_telemetria", "aluno_id", "alunos", "SET NULL")

A, B = (uuid.UUID(int=i) for i in (21, 22))

SEED = f"""
INSERT INTO auth.users (id, email) VALUES ('{A}', 'a@teste.invalid'), ('{B}', 'b@teste.invalid');
INSERT INTO public.alunos (id, nome, email) VALUES
  ('{A}', 'A', 'a@teste.invalid'), ('{B}', 'B', 'b@teste.invalid');
INSERT INTO public.consentimento_telemetria (aluno_id, versao, status, decidido_em) VALUES
  ('{A}', 'v1', 'accepted', now() - interval '2 day'),
  ('{A}', 'v2', 'rejected', now() - interval '1 day'),
  ('{B}', 'v1', 'accepted', now() - interval '2 day');
-- prova anonimizada: o aluno foi apagado e a FK pôs `aluno_id` em NULL (20261024_03)
INSERT INTO public.consentimento_telemetria (aluno_id, versao, status, decidido_em) VALUES
  (NULL, 'v1', 'accepted', now() - interval '3 day');
"""


@contextmanager
def _banco():
    nome = f"tu_cns_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(base.DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(base._dsn_para(nome), autocommit=True) as c:
            c.execute(base.PAPEIS)
            c.execute(inv.GRANTS_SUPABASE)
            c.execute(base.ESQUELETO.read_text(encoding="utf-8"))
            for sql in base._sql_de(M_CONSENTIMENTO, "upgrade"):
                c.execute(sql)
            c.execute(ANONIMIZA_PROVA)
            c.execute(SEED)
            yield c
    finally:
        with psycopg.connect(base.DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _como_cliente(c, uid: uuid.UUID | None, papel: str) -> None:
    c.execute(f"SET LOCAL ROLE {papel}")
    claims = {"role": papel} if uid is None else {"sub": str(uid), "role": papel}
    c.execute("SELECT set_config('request.jwt.claims', %s, true)", (json.dumps(claims),))
    c.execute("SELECT set_config('request.jwt.claim.sub', %s, true)", (str(uid) if uid else "",))


def _alunos_que_leio(c) -> list[uuid.UUID]:
    rows = c.execute("SELECT aluno_id FROM public.consentimento_telemetria ORDER BY id").fetchall()
    return [r[0] for r in rows]


def test_a_tabela_esta_sob_rls_com_so_duas_policies_do_proprio_aluno():
    """Pré-condição: sem isto os testes abaixo medem outra coisa."""
    with _banco() as c:
        assert c.execute(
            "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.consentimento_telemetria'::regclass"
        ).fetchone()[0]
        pols = c.execute(
            "SELECT policyname, cmd, roles::text FROM pg_policies "
            "WHERE tablename = 'consentimento_telemetria' ORDER BY policyname"
        ).fetchall()
        assert [(p[0], p[1]) for p in pols] == [
            ("consentimento_telemetria_aluno_ins", "INSERT"),
            ("consentimento_telemetria_aluno_sel", "SELECT"),
        ]
        assert all("anon" not in p[2] for p in pols)


def test_o_esqueleto_ficou_como_a_producao_aluno_id_aceita_null():
    """Pré-condição: sem a linha anonimizada os testes abaixo deixariam de cobrir o caso real."""
    with _banco() as c:
        assert c.execute(
            "SELECT is_nullable FROM information_schema.columns "
            "WHERE table_name = 'consentimento_telemetria' AND column_name = 'aluno_id'"
        ).fetchone()[0] == "YES"
        assert c.execute("SELECT count(*) FROM public.consentimento_telemetria WHERE aluno_id IS NULL").fetchone()[0] == 1


def test_anon_nao_le_consentimento_telemetria():
    """Com linhas de consentimento na tabela, `anon` não lê nenhuma.

    No Supabase `anon` tem o GRANT de SELECT por default privileges (aqui, `GRANTS_SUPABASE`), então hoje
    o comportamento é RLS devolvendo vazio, que é o que a medição em produção de 29/10 viu. Perder o GRANT
    seria endurecimento, não regressão: `42501` também vale como "não lê". O que não vale é ver linha.
    """
    with _banco() as c:
        assert c.execute("SELECT count(*) FROM public.consentimento_telemetria").fetchone()[0] == 4
        try:
            with c.transaction():
                _como_cliente(c, None, "anon")
                assert _alunos_que_leio(c) == []
        except psycopg.errors.InsufficientPrivilege:
            pass

        # CONTROLE: sem RLS o mesmo SELECT de `anon` enxerga as quatro linhas (a anonimizada inclusive).
        with c.transaction(force_rollback=True):
            c.execute("ALTER TABLE public.consentimento_telemetria DISABLE ROW LEVEL SECURITY")
            _como_cliente(c, None, "anon")
            assert len(_alunos_que_leio(c)) == 4


def test_aluno_so_le_o_proprio_consentimento():
    """A lê as duas linhas dela e nenhuma de B; B lê só a dele. Ninguém lê a prova anonimizada."""
    with _banco() as c:
        with c.transaction():
            _como_cliente(c, A, "authenticated")
            assert _alunos_que_leio(c) == [A, A]
        with c.transaction():
            _como_cliente(c, B, "authenticated")
            assert _alunos_que_leio(c) == [B]

        # CONTROLE: sem RLS, A passa a ver as quatro (a de B e a anonimizada).
        with c.transaction(force_rollback=True):
            c.execute("ALTER TABLE public.consentimento_telemetria DISABLE ROW LEVEL SECURITY")
            _como_cliente(c, A, "authenticated")
            vistos = _alunos_que_leio(c)
            assert B in vistos and None in vistos

        # CONTROLE 2: uma policy permissiva (a regressão que o teste existe para pegar) também aparece.
        with c.transaction(force_rollback=True):
            c.execute("CREATE POLICY vaza ON public.consentimento_telemetria FOR SELECT TO authenticated USING (true)")
            _como_cliente(c, A, "authenticated")
            assert B in _alunos_que_leio(c)


def _estado(c) -> list[tuple]:
    return c.execute(
        "SELECT id, aluno_id, versao, status, decidido_em FROM public.consentimento_telemetria ORDER BY id"
    ).fetchall()


@pytest.mark.parametrize("alvo", ["de_b", "propria", "anonimizada"])
@pytest.mark.parametrize("comando", ["UPDATE", "DELETE"])
def test_consentimento_e_imutavel_para_o_cliente(alvo, comando):
    """O aluno A não reescreve nem apaga a linha de B, a própria nem a anonimizada. Prova não se reescreve nem se apaga (docstring da `20261003_10`): sem policy de UPDATE/DELETE, o
    comando afeta 0 linhas (ou toma `42501`, se o GRANT for retirado) e a linha continua igual."""
    with _banco() as c:
        antes = _estado(c)
        onde = {
            "de_b": f"aluno_id = '{B}'",
            "propria": f"aluno_id = '{A}'",
            "anonimizada": "aluno_id IS NULL",
        }[alvo]
        sql = (
            f"UPDATE public.consentimento_telemetria SET status = 'rejected' WHERE {onde}"
            if comando == "UPDATE"
            else f"DELETE FROM public.consentimento_telemetria WHERE {onde}"
        )
        try:
            with c.transaction():
                _como_cliente(c, A, "authenticated")
                assert c.execute(sql).rowcount == 0
        except psycopg.errors.InsufficientPrivilege:
            pass
        assert _estado(c) == antes

        # CONTROLE: como dono (sem RLS) o mesmo comando afeta linhas, então o 0 de cima é a RLS.
        with c.transaction(force_rollback=True):
            assert c.execute(sql).rowcount >= 1
