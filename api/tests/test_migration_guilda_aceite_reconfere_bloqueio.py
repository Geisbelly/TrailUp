"""`20261031_09`: aceitar convite de guilda reconfere o bloqueio feito depois do convite (#153)."""

from __future__ import annotations

import uuid

import pytest

from tests.test_migration_conquistas_sem_cascade import DSN, ESQUELETO, PAPEIS, _afrouxa, _dsn_para, _modulo, _sql, e2e
from tests.test_migration_guilda_trava_com_evento_aberto import DUBLES, G1, A, B, _como, _seed
from tests.test_migration_guilda_trava_com_evento_aberto import M as M_TRAVA

M = _modulo("20261031_09_guilda_aceite_reconfere_bloqueio.py")

if DSN:
    import psycopg

# O helper de verdade (docs/mobile/sql/20260912_03), no lugar do dublê que sempre diz "sem bloqueio".
BLOQUEIO = (
    (ESQUELETO.parents[3] / "docs" / "mobile" / "sql" / "20260912_03_guildas_perfil_publico.sql").read_text(
        encoding="utf-8"
    )
)
a = BLOQUEIO.index("CREATE OR REPLACE FUNCTION public.guilda_bloqueio_ativo")
BLOQUEIO = BLOQUEIO[a : BLOQUEIO.index("$$;", a) + 3]


def test_encadeia_na_cabeca_da_f5() -> None:
    assert (M.revision, M.down_revision) == ("20261031_09", "20261031_08")


def test_o_bloqueio_vem_antes_de_qualquer_escrita_e_nao_levanta() -> None:
    sql = _sql("20261031_08", "20261031_09")
    corpo = sql[sql.index("CREATE OR REPLACE FUNCTION public.guilda_aceitar_convite(") :]
    corpo = corpo[: corpo.index("$function$;")]
    assert "public.guilda_bloqueio_ativo(v_i.convidante_id, v_i.convidado_id)" in corpo
    assert corpo.index("guilda_bloqueio_ativo") < corpo.index("INSERT INTO public.guilda_membros")
    trecho = corpo[corpo.index("guilda_bloqueio_ativo") : corpo.index("END IF;", corpo.index("guilda_bloqueio_ativo"))]
    assert "RAISE" not in trecho  # não conta ao convidado que foi bloqueado
    assert "status='cancelled'" in trecho
    # A trava de evento aberto da 20261031_02 continua.
    assert "public.fn_guilda_composicao_congelada(v_i.classe_id)" in corpo


def test_downgrade_volta_ao_corpo_da_02() -> None:
    sql = _sql("20261031_09", "20261031_08", down=True)
    assert "guilda_bloqueio_ativo" not in sql
    assert "guilda_evento_aberto" in sql


@pytest.fixture
def banco():
    nome = f"tu153b_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(_dsn_para(nome), autocommit=True) as c:
            c.execute(PAPEIS)
            c.execute(ESQUELETO.read_text(encoding="utf-8"))
            c.execute(DUBLES)
            c.execute("DROP FUNCTION public.guilda_bloqueio_ativo(uuid, uuid)")
            c.execute(BLOQUEIO)
            for tabela in ("professor", "classe", "materia", "alunos", "guildas", "eventos_classe", "social_relacionamentos"):
                _afrouxa(c, tabela)
            c.execute(M_TRAVA.HELPER)
            c.execute(M_TRAVA.FORMACAO)
            c.execute(M_TRAVA.CONGELAR)
            c.execute(M.ACEITAR)
            c.execute(_seed())
            yield c
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _convite(c) -> uuid.UUID:
    _como(c, A)
    c.execute("SELECT public.guilda_convidar(%s, %s)", (G1, B))
    _como(c, None)
    return c.execute("SELECT id FROM public.guilda_convites WHERE convidado_id = %s", (B,)).fetchone()[0]


def _bloquear(c, quem, quem_bloqueia) -> None:
    a_, b_ = sorted((A, B), key=str)
    c.execute(
        "INSERT INTO public.social_relacionamentos (aluno_a_id, aluno_b_id, solicitante_id, status, blocked_by_id)"
        " VALUES (LEAST(%s::uuid, %s::uuid), GREATEST(%s::uuid, %s::uuid), %s, 'blocked', %s)",
        (a_, b_, a_, b_, quem_bloqueia, quem_bloqueia),
    )


@e2e
def test_sem_bloqueio_aceitar_entra_na_guilda(banco) -> None:
    convite = _convite(banco)
    _como(banco, B)
    r = banco.execute("SELECT public.guilda_aceitar_convite(%s)", (convite,)).fetchone()[0]
    _como(banco, None)
    assert r["status"] == "accepted"
    assert banco.execute(
        "SELECT count(*) FROM public.guilda_membros WHERE guilda_id = %s AND aluno_id = %s AND left_at IS NULL", (G1, B)
    ).fetchone()[0] == 1


@e2e
@pytest.mark.parametrize("quem_bloqueia", ["convidante", "convidado"])
def test_bloqueio_depois_do_convite_cancela_sem_entrar_e_sem_erro(banco, quem_bloqueia) -> None:
    convite = _convite(banco)
    _bloquear(banco, None, A if quem_bloqueia == "convidante" else B)
    _como(banco, B)
    r = banco.execute("SELECT public.guilda_aceitar_convite(%s)", (convite,)).fetchone()[0]
    _como(banco, None)
    assert r["status"] == "cancelled"
    assert banco.execute(
        "SELECT count(*) FROM public.guilda_membros WHERE guilda_id = %s AND aluno_id = %s", (G1, B)
    ).fetchone()[0] == 0
    assert banco.execute("SELECT status FROM public.guilda_convites WHERE id = %s", (convite,)).fetchone()[0] == "cancelled"


@e2e
def test_convite_cancelado_nao_pode_ser_aceito_de_novo(banco) -> None:
    convite = _convite(banco)
    _bloquear(banco, None, A)
    _como(banco, B)
    banco.execute("SELECT public.guilda_aceitar_convite(%s)", (convite,))
    with pytest.raises(psycopg.errors.RaiseException, match="guilda_convite_nao_encontrado"):
        banco.execute("SELECT public.guilda_aceitar_convite(%s)", (convite,))
    _como(banco, None)
