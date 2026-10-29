"""Ponta a ponta da `20261029_05`: `vw_ranks_info_por_classe` passa a respeitar a RLS de `ranks`.

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. Cada teste cria um
banco descartável com o ESQUELETO do schema public da produção, reproduz os privilégios que o Supabase
dá por padrão e monta as duas tabelas que a view lê como a produção as tem, vindas da `20260826_09`:
`ranks` com SELECT por `classe_id IN app_minhas_classes()` e `rank_tipo` (referência) com
`USING (true)`. A view nasce com a definição da `20261021_16` (recortada do módulo, sem
`security_invoker`, que é o estado medido em produção) e o GRANT de `authenticated`. Depois aplica a
`20261029_05`.

O papel de cliente é de verdade: `SET LOCAL ROLE authenticated` + claims (e `request.jwt.claim.sub`,
que é o que o `auth.uid()` do esqueleto lê). Dados sintéticos. Recusa banco hospedado.
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
        raise RuntimeError("e2e dos ranks recusa banco hospedado: use um Postgres local")

from tests import test_e2e_guilda_mantem_quem_saiu_da_turma as base  # noqa: E402
from tests import test_e2e_invariantes_das_metricas as inv  # noqa: E402
from tests import test_e2e_periodo_e_progresso_do_rank as rk  # noqa: E402

M_HELPERS = base._modulo("20260826_09_rls_posse_por_tabela.py")
M_PERIODO = base._modulo("20261021_16_rank_periodo_manual.py")
M_NOVA = base._modulo("20261029_05_ranks_info_com_invoker.py")

PROF = rk.PROF
PEQUENA = rk.PEQUENA  # turma 1
GRANDE = rk.GRANDE  # turma 2
ALUNO = PEQUENA[0]
FORASTEIRO = GRANDE[0]  # matriculado só na turma 2
SEM_TURMA = uuid.UUID(int=900)  # aluno de verdade, mas sem nenhuma matrícula
OUTRO_PROF = uuid.UUID(int=901)  # professor sem turma

VIEW = "public.vw_ranks_info_por_classe"
# Os ranks do seed: 11 e 14 não importam aqui; o que vale é a turma de cada um.
RANKS_DA_TURMA = {1: {11}, 2: {12, 13}, 3: {14}}

# Como a `20260826_09` deixa as duas tabelas (a RLS vem do event trigger `ensure_rls` em produção).
RLS_DAS_TABELAS = """
ALTER TABLE public.ranks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rank_tipo ENABLE ROW LEVEL SECURITY;
CREATE POLICY ranks_posse_sel ON public.ranks
  FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_minhas_classes()));
CREATE POLICY rank_tipo_posse_sel ON public.rank_tipo
  FOR SELECT TO authenticated USING (true);
"""

# O estado de produção: a view da `20261021_16` sem a opção, aberta só para `authenticated`.
VIEW_COMO_EM_PRODUCAO = (
    M_PERIODO.INFO
    + """
REVOKE ALL ON public.vw_ranks_info_por_classe FROM PUBLIC, anon;
GRANT ALL ON public.vw_ranks_info_por_classe TO authenticated, service_role;
"""
)


def _usuarios_extras() -> str:
    return f"""
INSERT INTO auth.users (id, email) VALUES
  ('{SEM_TURMA}', 'u900@teste.invalid'), ('{OUTRO_PROF}', 'u901@teste.invalid');
INSERT INTO public.alunos (id, nome, email) VALUES ('{SEM_TURMA}', 'a900', 'u900@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{OUTRO_PROF}', 'Outro');
"""


@contextmanager
def _banco(aplica_nova: bool = True):
    nome = f"tu_rki_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(rk._dsn_para(nome), autocommit=True) as c:
            c.execute(rk.PAPEIS)
            c.execute(inv.GRANTS_SUPABASE)
            c.execute(base.ESQUELETO.read_text(encoding="utf-8"))
            for tabela in ("professor", "classe", "materia"):
                rk._afrouxa(c, tabela)
            c.execute(M_HELPERS.HELPERS)
            c.execute(rk._seed())
            c.execute(_usuarios_extras())
            c.execute(rk.RANKS)
            c.execute(RLS_DAS_TABELAS)
            c.execute(VIEW_COMO_EM_PRODUCAO)
            for modulo in (inv.M_VIA, inv.M_CATALOGO, inv.M_INV):
                for sql in base._sql_de(modulo, "upgrade"):
                    c.execute(sql)
            if aplica_nova:
                for sql in base._sql_de(M_NOVA, "upgrade"):
                    c.execute(sql)
            yield c
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _como_cliente(c, uid: uuid.UUID, papel: str = "authenticated") -> None:
    c.execute(f"SET LOCAL ROLE {papel}")
    c.execute("SELECT set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": str(uid), "role": papel}),))
    c.execute("SELECT set_config('request.jwt.claim.sub', %s, true)", (str(uid),))


def _le_view(c, uid: uuid.UUID) -> list[tuple]:
    with c.transaction():
        _como_cliente(c, uid)
        return c.execute(f"SELECT rank_id, classe_id FROM {VIEW} ORDER BY rank_id").fetchall()


def _le_tabela(c, uid: uuid.UUID) -> list[int]:
    with c.transaction():
        _como_cliente(c, uid)
        return [r[0] for r in c.execute("SELECT id FROM public.ranks WHERE fim IS NULL ORDER BY id").fetchall()]


def test_controle_do_cenario_antes_da_migration_a_view_vaza():
    """Sem isto os testes abaixo poderiam passar por acidente do cenário (RLS desligada, view vazia)."""
    with _banco(aplica_nova=False) as c:
        assert c.execute(
            "SELECT reloptions FROM pg_class WHERE oid = 'public.vw_ranks_info_por_classe'::regclass"
        ).fetchone()[0] is None
        # a tabela, lida pelo aluno sem turma, devolve zero: é a RLS agindo
        assert _le_tabela(c, SEM_TURMA) == []
        # a view devolve todos os ranks abertos: é o bug (D8)
        assert {rank for rank, _ in _le_view(c, SEM_TURMA)} == {11, 12, 13, 14}


def test_aluno_sem_turma_ve_zero():
    """Review Focus 2: aluno sem turma, nem uma linha."""
    with _banco() as c:
        assert _le_tabela(c, SEM_TURMA) == []
        assert _le_view(c, SEM_TURMA) == []
        # professor que não tem turma também não vê nada
        assert _le_view(c, OUTRO_PROF) == []


def test_aluno_ve_os_ranks_da_sua_turma():
    with _banco() as c:
        assert {(r, k) for r, k in _le_view(c, ALUNO)} == {(11, 1)}
        assert {(r, k) for r, k in _le_view(c, FORASTEIRO)} == {(12, 2), (13, 2)}
        # a view devolve exatamente o que a tabela devolve para o mesmo aluno
        for aluno in (ALUNO, FORASTEIRO, SEM_TURMA):
            assert [r for r, _ in _le_view(c, aluno)] == _le_tabela(c, aluno)


def test_professor_ve_os_ranks_das_suas_turmas():
    with _banco() as c:
        linhas = _le_view(c, PROF)

        assert {rank for rank, _ in linhas} == {11, 12, 13, 14}
        por_turma: dict[int, set[int]] = {}
        for rank, classe in linhas:
            por_turma.setdefault(classe, set()).add(rank)
        assert por_turma == RANKS_DA_TURMA


def test_as_colunas_e_o_que_so_o_rank_aberto_mostra_nao_mudam():
    with _banco() as c:
        colunas = [
            r[0]
            for r in c.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'vw_ranks_info_por_classe' ORDER BY ordinal_position"
            ).fetchall()
        ]
        assert colunas == ["rank_id", "classe_id", "nome_rank", "descricao", "criterio", "icone", "periodo", "inicio"]
        # rank encerrado continua fora (a view lista só o período aberto)
        c.execute("UPDATE public.ranks SET fim = now() WHERE id = 11")
        assert _le_view(c, ALUNO) == []
        # e a junção com `rank_tipo` entrega o nome: a policy de referência deixa o aluno ler
        with c.transaction():
            _como_cliente(c, FORASTEIRO)
            nomes = c.execute(f"SELECT nome_rank FROM {VIEW} ORDER BY rank_id").fetchall()
        assert nomes == [("Pontuação",), ("Elo",)]


def test_anon_continua_sem_acesso():
    with _banco() as c:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with c.transaction():
                _como_cliente(c, SEM_TURMA, "anon")
                c.execute(f"SELECT * FROM {VIEW}")


def test_i11_passa_depois_da_migration():
    with _banco(aplica_nova=False) as c:
        # antes: a view sem invoker e com GRANT de cliente é exatamente o que a I11 caça
        assert [r[0] for r in c.execute("SELECT id FROM public.fn_inv_i11()").fetchall()] == [
            "vw_ranks_info_por_classe"
        ]
        for sql in base._sql_de(M_NOVA, "upgrade"):
            c.execute(sql)
        assert c.execute("SELECT count(*) FROM public.fn_inv_i11()").fetchone()[0] == 0
        c.execute("SELECT public.fn_auditoria_metricas_rodar()")
        ok, linhas, erro = c.execute(
            "SELECT ok, linhas, erro FROM public.metricas_invariante_resultado WHERE invariante = 'I11'"
        ).fetchone()
        assert (ok, linhas, erro) == (True, 0, None)


def test_downgrade_devolve_o_estado_anterior():
    with _banco() as c:
        assert c.execute(
            "SELECT reloptions FROM pg_class WHERE oid = 'public.vw_ranks_info_por_classe'::regclass"
        ).fetchone()[0] == ["security_invoker=on"]
        for sql in base._sql_de(M_NOVA, "downgrade"):
            c.execute(sql)
        assert c.execute(
            "SELECT reloptions FROM pg_class WHERE oid = 'public.vw_ranks_info_por_classe'::regclass"
        ).fetchone()[0] is None
        # e o GRANT de authenticated ficou intacto nas duas direções
        assert c.execute(
            "SELECT has_table_privilege('authenticated', 'public.vw_ranks_info_por_classe', 'SELECT')"
        ).fetchone()[0]
        assert not c.execute(
            "SELECT has_table_privilege('anon', 'public.vw_ranks_info_por_classe', 'SELECT')"
        ).fetchone()[0]
