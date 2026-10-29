"""Ponta a ponta da `20261029_04`: o aluno lê o ranking sem que `fn_app_config_int` seja aberta.

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. Cada teste cria um
banco descartável com o ESQUELETO do schema public da produção, reproduz os privilégios que o Supabase
dá por padrão (toda função nova de `public` nasce com EXECUTE para `anon`/`authenticated`) e monta o
ranking como a produção o tem: `fn_app_config_int` fechada para o cliente (`20261021_05`), os helpers
de posse (`20260826_09`), `app_rank_limite_visivel` e a view filtrada (`20260909_02`), a base sem GRANT
(`20260826_10`) e a view do ranking da `20261025_02`. Depois aplica a `20261029_04`.

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
        raise RuntimeError("e2e do ranking recusa banco hospedado: use um Postgres local")

from tests import test_e2e_guilda_mantem_quem_saiu_da_turma as base  # noqa: E402
from tests import test_e2e_invariantes_das_metricas as inv  # noqa: E402
from tests import test_e2e_periodo_e_progresso_do_rank as rk  # noqa: E402

M_HELPERS = base._modulo("20260826_09_rls_posse_por_tabela.py")
M_LIMITE = base._modulo("20260909_02_rank_limite_visivel.py")
M_VIA = inv.M_VIA
M_CATALOGO = inv.M_CATALOGO
M_INV = inv.M_INV
M_NOVA = base._modulo("20261029_04_ranking_le_config_por_wrapper.py")

PROF = rk.PROF
PEQUENA = rk.PEQUENA  # turma 1: 3 alunos
GRANDE = rk.GRANDE  # turma 2: 9 alunos
ALUNO = PEQUENA[0]
FORASTEIRO = GRANDE[0]  # matriculado só na turma 2

# O REVOKE que a `20261021_05` dá logo depois de criar a função (o recorte do e2e do rank pára antes).
FECHA_CONFIG_INT = "REVOKE ALL ON FUNCTION public.fn_app_config_int(text, integer) FROM PUBLIC, anon, authenticated;"
assert FECHA_CONFIG_INT in (
    base.VERSOES / "20261021_05_missao_diaria_deterministica.py"
).read_text(encoding="utf-8")

# `20260826_10`: a base do ranking não é lida pelo cliente; só a view filtrada.
BASE_FECHADA = """
REVOKE ALL ON public.vw_rank_posicoes_por_classe_todas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vw_rank_posicoes_por_classe TO authenticated;
"""


def _helpers() -> str:
    return M_HELPERS.HELPERS


def _view_filtrada() -> str:
    """A view que o cliente lê, como a `20260909_02` a deixa. Em produção a coluna da base ainda se chama
    `progresso` (a `20260912_13` preserva o nome); o esqueleto monta a base do zero, com
    `percentual_do_lider`, então a view filtrada a expõe com o nome antigo."""
    sql = M_LIMITE.VIEW_FILTRADA
    assert sql.count("    progresso,\n") == 1
    return sql.replace("    progresso,\n", "    percentual_do_lider AS progresso,\n", 1)


@contextmanager
def _banco(aplica_nova: bool = True):
    nome = f"tu_rkw_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(rk._dsn_para(nome), autocommit=True) as c:
            c.execute(rk.PAPEIS)
            c.execute(inv.GRANTS_SUPABASE)
            c.execute(base.ESQUELETO.read_text(encoding="utf-8"))
            for tabela in ("professor", "classe", "materia"):
                rk._afrouxa(c, tabela)
            c.execute(M_LIMITE.TABELA_CONFIG)  # RLS e policy: o cliente só lê o que é `publico`
            c.execute(rk.APP_CONFIG_INT)
            c.execute(FECHA_CONFIG_INT)
            c.execute(_helpers())
            c.execute(rk._seed())
            for sql in base._sql_de(rk.M155, "upgrade"):
                c.execute(sql)
            c.execute(M_LIMITE.FUNCAO_LIMITE)
            c.execute(_view_filtrada())
            c.execute(BASE_FECHADA)
            c.execute(rk.RANKS)
            for modulo in (M_VIA, M_CATALOGO, M_INV):
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


def _le_ranking(c, uid: uuid.UUID) -> list[tuple]:
    with c.transaction():
        _como_cliente(c, uid)
        return c.execute(
            "SELECT rank_id, classe_id, posicao, id_aluno FROM public.vw_rank_posicoes_por_classe "
            "ORDER BY rank_id, posicao, id_aluno"
        ).fetchall()


def test_controle_do_cenario_fn_app_config_int_esta_fechada():
    """Sem isto o `42501` dos testes abaixo poderia vir da falta de GRANT por acidente do esqueleto."""
    with _banco(aplica_nova=False) as c:
        c.execute("CREATE FUNCTION public.controle_exec() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$")
        assert c.execute("SELECT has_function_privilege('authenticated','public.controle_exec()','EXECUTE')").fetchone()[0]
        assert not c.execute(
            "SELECT has_function_privilege('authenticated','public.fn_app_config_int(text,integer)','EXECUTE')"
        ).fetchone()[0]
        assert not c.execute(
            "SELECT has_function_privilege('anon','public.fn_app_config_int(text,integer)','EXECUTE')"
        ).fetchone()[0]


def test_antes_da_migration_a_view_cita_a_funcao_fechada():
    with _banco(aplica_nova=False) as c:
        definicao = c.execute(
            "SELECT pg_get_viewdef('public.vw_rank_posicoes_por_classe_todas'::regclass)"
        ).fetchone()[0]
        assert definicao.count("fn_app_config_int") == 2


def test_aluno_le_o_ranking_da_sua_turma():
    with _banco() as c:
        linhas = _le_ranking(c, ALUNO)

        assert linhas, "o aluno matriculado vê o ranking da própria turma"
        assert {classe for _, classe, _, _ in linhas} == {1}
        assert {aluno for _, _, _, aluno in linhas} == set(PEQUENA)
        # o ranking de pontuação da turma 1 vem ordenado: 30, 20, 10
        assert [aluno for _, _, _, aluno in linhas] == list(PEQUENA)

        # a turma 2 enxerga a dela (nove alunos, o corte de posições visíveis ainda não limita)
        outra = _le_ranking(c, FORASTEIRO)
        assert {classe for _, classe, _, _ in outra} == {2}
        assert len(outra) >= 9

        # professor vê as turmas dele
        prof = _le_ranking(c, PROF)
        assert {classe for _, classe, _, _ in prof} >= {1, 2}


def test_wrappers_devolvem_o_padrao_sem_chave():
    with _banco() as c:
        c.execute("DELETE FROM public.app_config WHERE chave IN ('elo_inicial', 'rank_progresso_min_participantes')")
        with c.transaction():
            _como_cliente(c, ALUNO)
            assert c.execute("SELECT public.app_elo_inicial()").fetchone()[0] == 1000
            assert c.execute("SELECT public.app_rank_progresso_min_participantes()").fetchone()[0] == 8


def test_wrappers_leem_a_chave_e_a_view_obedece():
    with _banco() as c:
        c.execute("UPDATE public.app_config SET valor = '3' WHERE chave = 'rank_progresso_min_participantes'")
        c.execute(
            "INSERT INTO public.app_config (chave, valor, descricao, publico) "
            "VALUES ('elo_inicial', '1200', 't', false)"
        )
        # valor com texto em volta cai nos dígitos, como `fn_app_config_int`
        c.execute("UPDATE public.app_config SET valor = 'abc' WHERE chave = 'elo_inicial'")
        with c.transaction():
            _como_cliente(c, ALUNO)
            assert c.execute("SELECT public.app_rank_progresso_min_participantes()").fetchone()[0] == 3
            assert c.execute("SELECT public.app_elo_inicial()").fetchone()[0] == 1000  # sem dígito: padrão
        c.execute("UPDATE public.app_config SET valor = ' 1.200 pts' WHERE chave = 'elo_inicial'")
        assert c.execute("SELECT public.app_elo_inicial()").fetchone()[0] == 1200
        # com o mínimo em 3, a turma pequena passa a ter percentual (a view obedece ao wrapper)
        pct = [
            r[0]
            for r in c.execute(
                "SELECT percentual_do_lider FROM public.vw_rank_posicoes_por_classe_todas "
                "WHERE rank_id = 11 ORDER BY posicao"
            ).fetchall()
        ]
        assert [float(p) for p in pct] == [100.0, 66.67, 33.33]


def test_aluno_nao_executa_fn_app_config_int():
    with _banco() as c:
        for papel in ("authenticated", "anon"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with c.transaction():
                    _como_cliente(c, ALUNO, papel)
                    c.execute("SELECT public.fn_app_config_int('credito_extra_maximo', 0)")


def test_anon_nao_executa_os_wrappers_e_nao_le_o_ranking():
    with _banco() as c:
        for funcao in ("app_elo_inicial", "app_rank_progresso_min_participantes"):
            assert not c.execute(
                f"SELECT has_function_privilege('anon', 'public.{funcao}()', 'EXECUTE')"
            ).fetchone()[0], funcao
            assert not c.execute(
                f"SELECT has_function_privilege('public', 'public.{funcao}()', 'EXECUTE')"
            ).fetchone()[0], funcao
            assert c.execute(
                f"SELECT has_function_privilege('authenticated', 'public.{funcao}()', 'EXECUTE')"
            ).fetchone()[0], funcao
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with c.transaction():
                    _como_cliente(c, ALUNO, "anon")
                    c.execute(f"SELECT public.{funcao}()")


def test_wrapper_nao_vaza_chave_privada():
    """Um wrapper devolve UMA chave: nenhum caminho dele chega aos tetos anti-abuso."""
    with _banco() as c:
        c.execute(
            "INSERT INTO public.app_config (chave, valor, descricao, publico) "
            "VALUES ('credito_extra_maximo', '777', 't', false)"
        )
        with c.transaction():
            _como_cliente(c, ALUNO)
            assert c.execute("SELECT public.app_elo_inicial()").fetchone()[0] == 1000
            assert c.execute("SELECT public.app_rank_progresso_min_participantes()").fetchone()[0] == 8
            assert c.execute("SELECT count(*) FROM public.app_config WHERE chave = 'credito_extra_maximo'").fetchone()[0] == 0


def test_i10_passa_depois_da_migration():
    with _banco() as c:
        assert c.execute("SELECT count(*) FROM public.fn_inv_i10()").fetchone()[0] == 0
        c.execute("SELECT public.fn_auditoria_metricas_rodar()")
        ok, linhas, erro = c.execute(
            "SELECT ok, linhas, erro FROM public.metricas_invariante_resultado WHERE invariante = 'I10'"
        ).fetchone()
        assert (ok, linhas, erro) == (True, 0, None)


def _i10_ids(c) -> list[str]:
    return [r[0] for r in c.execute("SELECT id FROM public.fn_inv_i10() ORDER BY id").fetchall()]


def test_i10_antes_da_migration_acusa_a_funcao_fechada():
    """Como em produção: a view cita `fn_app_config_int`, sem EXECUTE para `authenticated`. A I10 nova
    (aplicada sobre a view antiga) acusa a função pelo nome."""
    with _banco(aplica_nova=False) as c:
        for sql in base._sql_de(M_NOVA, "upgrade")[:1]:
            c.execute(sql)  # só os wrappers; a view continua a antiga
        c.execute(M_NOVA.i10_nova())
        ids = _i10_ids(c)
        assert len(ids) == 1 and "fn_app_config_int(text,integer)" in ids[0], ids


def test_i10_vazia_depois_da_migration():
    with _banco() as c:
        assert _i10_ids(c) == []


@pytest.mark.parametrize("funcao", ["app_elo_inicial", "app_rank_progresso_min_participantes"])
def test_i10_acusa_wrapper_que_perdeu_o_execute(funcao):
    """Perder o EXECUTE de um wrapper devolve o `42501` ao aluno: a I10 tem de pegar."""
    with _banco() as c:
        assert _i10_ids(c) == []
        c.execute(f"REVOKE EXECUTE ON FUNCTION public.{funcao}() FROM authenticated")
        ids = _i10_ids(c)
        assert len(ids) == 1 and f"{funcao}()" in ids[0], ids
        # e o aluno, de fato, toma 42501 ao ler o ranking
        # (`SELECT *`: o Postgres poda coluna não pedida, e o wrapper do percentual só roda se ela vier)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with c.transaction():
                _como_cliente(c, ALUNO)
                c.execute("SELECT * FROM public.vw_rank_posicoes_por_classe").fetchall()


def test_i10_acusa_funcao_fechada_nova_na_view_filtrada():
    """A view que o cliente lê também entra na conta: uma função fechada citada só nela é acusada."""
    with _banco() as c:
        c.execute("CREATE FUNCTION public.fechada_nova() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$")
        c.execute("REVOKE ALL ON FUNCTION public.fechada_nova() FROM PUBLIC, anon, authenticated")
        definicao = c.execute("SELECT pg_get_viewdef('public.vw_rank_posicoes_por_classe'::regclass)").fetchone()[0]
        c.execute(
            "CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe WITH (security_invoker = on) AS "
            f"SELECT v.*, public.fechada_nova() AS _f FROM ({definicao.rstrip().rstrip(';')}) v"
        )
        ids = _i10_ids(c)
        assert len(ids) == 1 and "fechada_nova()" in ids[0], ids


def test_downgrade_restaura_a_view_a_i10_e_tira_os_wrappers():
    with _banco() as c:
        for sql in base._sql_de(M_NOVA, "downgrade"):
            c.execute(sql)
        definicao = c.execute(
            "SELECT pg_get_viewdef('public.vw_rank_posicoes_por_classe_todas'::regclass)"
        ).fetchone()[0]
        assert definicao.count("fn_app_config_int") == 2
        assert c.execute(
            "SELECT count(*) FROM pg_proc WHERE proname IN ('app_elo_inicial','app_rank_progresso_min_participantes')"
        ).fetchone()[0] == 0
        # a I10 voltou ao corpo da F0: mede o GRANT que não existe, então devolve a linha
        assert [r[0] for r in c.execute("SELECT id FROM public.fn_inv_i10()").fetchall()] == ["fn_app_config_int"]
        # e a função genérica segue fechada
        assert not c.execute(
            "SELECT has_function_privilege('authenticated','public.fn_app_config_int(text,integer)','EXECUTE')"
        ).fetchone()[0]
