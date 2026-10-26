"""Ponta a ponta da `20261024_02` (consentimento do responsavel, #195) num Postgres de verdade.

Roda so com `TRAILUP_E2E_CONSENTIMENTO_DATABASE_URL` apontando para um Postgres LOCAL (o
usuario precisa poder `CREATE DATABASE`). Cada teste usa um banco descartavel com o minimo de
schema que as RPCs leem (`alunos`, `professor`, `classe`, `classe_aluno`, as quatro tabelas de
telemetria com a policy de posse) e aplica o SQL da migration exatamente como o `upgrade()`
emite. Recusa banco hospedado.

Cada papel entra como o PostgREST entraria: `SET ROLE authenticated` com o `sub` do JWT.
Nenhum dado aqui e de aluno real: uuids sinteticos e nomes de teste.
"""

from __future__ import annotations

import importlib.util
import json
import os
import uuid
from contextlib import contextmanager
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest

DSN = os.environ.get("TRAILUP_E2E_CONSENTIMENTO_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DSN,
    reason="TRAILUP_E2E_CONSENTIMENTO_DATABASE_URL nao definido (e2e so em banco local descartavel)",
)

if DSN:
    import psycopg
    from psycopg import errors

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e do consentimento recusa banco hospedado: use um Postgres local")

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"e2e_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M = _modulo("20261024_02_consentimento_do_responsavel.py")


class _Coletor:
    def __init__(self) -> None:
        self.sql: list[str] = []

    def execute(self, sql: str) -> None:
        self.sql.append(sql)


def _sql_de(fn) -> list[str]:
    coletor = _Coletor()
    original = M.op
    M.op = coletor
    try:
        fn()
    finally:
        M.op = original
    return coletor.sql


BASE = """
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $r$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.alunos (id uuid PRIMARY KEY, nome text);
CREATE TABLE public.professor (id uuid PRIMARY KEY, nome text);
CREATE TABLE public.classe (id bigint PRIMARY KEY, professor_id uuid);
CREATE TABLE public.classe_aluno (classe_id bigint, aluno_id uuid);
-- No Supabase o service_role tem GRANT de tabela por padrao; aqui tambem.
GRANT SELECT ON public.alunos, public.professor, public.classe, public.classe_aluno TO service_role;

CREATE FUNCTION public.trg_consentimento_carimbo_do_servidor() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN NEW.registrado_em := now(); RETURN NEW; END; $f$;
REVOKE EXECUTE ON FUNCTION public.trg_consentimento_carimbo_do_servidor() FROM PUBLIC, anon, authenticated;
"""

# As quatro tabelas de telemetria com a policy de posse PERMISSIVA, como na producao.
TELEMETRIA = "".join(
    f"""
CREATE TABLE public.{t} (id bigserial PRIMARY KEY, aluno_id uuid NOT NULL, marca text);
ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.{t} TO authenticated;
GRANT USAGE ON SEQUENCE public.{t}_id_seq TO authenticated;
CREATE POLICY {t}_posse ON public.{t} FOR ALL TO authenticated
  USING (aluno_id = auth.uid()) WITH CHECK (aluno_id = auth.uid());
"""
    for t in M.TABELAS_DE_TELEMETRIA
)

# Atores: ADULTO, MENOR e SEM_DATA na turma 1 do PROF; COLEGA tambem; OUTRO_PROF tem a turma 2.
ADULTO, MENOR, SEM_DATA, COLEGA, PROF, OUTRO_PROF, MENOR2 = (uuid.UUID(int=i) for i in range(1, 8))
HOJE = date.today()
NASC_ADULTO = date(HOJE.year - 30, 1, 15)
NASC_MENOR = date(HOJE.year - 12, 1, 15)

VR = M.VERSAO_RESPONSAVEL
VP = M.VERSAO_PESQUISA


def _seed() -> str:
    alunos = ",".join(f"('{u}','Aluno teste {n}')" for n, u in enumerate((ADULTO, MENOR, SEM_DATA, COLEGA, MENOR2)))
    return f"""
INSERT INTO public.alunos VALUES {alunos};
INSERT INTO public.professor VALUES ('{PROF}','Prof teste'),('{OUTRO_PROF}','Outro prof teste');
INSERT INTO public.classe VALUES (1,'{PROF}'),(2,'{OUTRO_PROF}');
INSERT INTO public.classe_aluno VALUES (1,'{ADULTO}'),(1,'{MENOR}'),(1,'{SEM_DATA}'),(1,'{COLEGA}'),(2,'{MENOR2}');
"""


def _dsn_para(banco: str) -> str:
    return urlunsplit(urlsplit(DSN)._replace(path=f"/{banco}"))


@contextmanager
def _banco():
    nome = f"tu195c_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    dsn = _dsn_para(nome)
    try:
        with psycopg.connect(dsn, autocommit=True) as c:
            c.execute(BASE)
            c.execute(TELEMETRIA)
            c.execute(_seed())
        with psycopg.connect(dsn) as c:  # uma transacao, como o Alembic
            for sql in _sql_de(M.upgrade):
                c.execute(sql)
            c.commit()
        yield dsn
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


@pytest.fixture()
def dsn():
    with _banco() as d:
        yield d


@contextmanager
def como(dsn: str, uid: uuid.UUID | None, papel: str = "authenticated"):
    c = psycopg.connect(dsn, autocommit=True)
    try:
        c.execute(f"SET ROLE {papel}")
        if uid is not None:
            c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (str(uid),))
        yield c
    finally:
        c.close()


def _um(dsn, uid, sql, params=(), papel="authenticated"):
    with como(dsn, uid, papel) as c:
        return c.execute(sql, params).fetchone()[0]


def _status(dsn, uid) -> dict:
    return _um(dsn, uid, "SELECT public.aluno_meu_consentimento()")


def _nasc(dsn, uid, data: date) -> dict:
    return _um(dsn, uid, "SELECT public.aluno_registrar_data_nascimento(%s)", (data,))


TUDO = {"camera": True, "telemetria": True, "emocional": True, "mentor": True, "pesquisa": False}

APARELHO = "SELECT public.responsavel_registrar_no_aparelho(%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s::jsonb)"
PAPEL = "SELECT public.professor_registrar_termo_papel(%s,%s,%s,%s,%s,%s::jsonb,%s,%s)"


def _aparelho(dsn, uid, *, aceito=True, finalidades=TUDO, versao=VR, declaracao=True,
              nome="Responsavel Teste", relacao="mae", pesquisa_versao=None, quando=None):
    return _um(dsn, uid, APARELHO, (
        versao, aceito, nome, relacao, declaracao, json.dumps(finalidades), pesquisa_versao,
        quando, json.dumps({"plataforma": "teste"}),
    ))


def _restrito(dsn, uid) -> bool:
    with psycopg.connect(dsn, autocommit=True) as c:
        return c.execute("SELECT public.aluno_modo_restrito(%s)", (uid,)).fetchone()[0]


def _permitida(dsn, uid, fin) -> bool:
    with psycopg.connect(dsn, autocommit=True) as c:
        return c.execute("SELECT public.aluno_finalidade_permitida(%s, %s)", (uid, fin)).fetchone()[0]


def _telemetria_direta(dsn, uid) -> None:
    with como(dsn, uid) as c:
        c.execute("INSERT INTO public.telemetria_lotes(aluno_id, marca) VALUES (%s, 'MARCA-SINTETICA')", (uid,))


# ---------------------------------------------------------------- sem data de nascimento


def test_sem_data_de_nascimento_fica_restrito_e_sem_nenhuma_finalidade(dsn) -> None:
    st = _status(dsn, SEM_DATA)
    assert st["data_nascimento_informada"] is False
    assert st["menor"] is None
    assert st["modo_restrito"] is True
    assert st["finalidades"] == {f: False for f in M.FINALIDADES}
    assert _restrito(dsn, SEM_DATA) is True


def test_aluno_restrito_nao_grava_telemetria_direto_no_supabase(dsn) -> None:
    with pytest.raises(errors.InsufficientPrivilege):
        _telemetria_direta(dsn, SEM_DATA)
    _nasc(dsn, ADULTO, NASC_ADULTO)
    _telemetria_direta(dsn, ADULTO)  # nao restrito: a policy de posse continua valendo


# ---------------------------------------------------------------- data de nascimento


def test_adulto_informa_data_e_sai_do_modo_restrito(dsn) -> None:
    st = _nasc(dsn, ADULTO, NASC_ADULTO)
    assert st["menor"] is False and st["modo_restrito"] is False
    assert st["finalidades"]["mentor"] is True and st["finalidades"]["camera"] is True
    # Pesquisa nunca vem de graca: precisa do aceite do proprio aluno.
    assert st["finalidades"]["pesquisa"] is False


def test_data_grava_uma_vez_so(dsn) -> None:
    _nasc(dsn, MENOR, NASC_MENOR)
    _nasc(dsn, MENOR, NASC_MENOR)  # reenvio igual e idempotente
    with pytest.raises(errors.UniqueViolation):
        _nasc(dsn, MENOR, NASC_ADULTO)  # o menor nao "envelhece" sozinho
    assert _restrito(dsn, MENOR) is True


@pytest.mark.parametrize("data", [HOJE + timedelta(days=1), date(1890, 1, 1)])
def test_data_impossivel_e_recusada(dsn, data) -> None:
    with pytest.raises(errors.DatetimeFieldOverflow):
        _nasc(dsn, ADULTO, data)


def test_quem_faz_18_hoje_e_maior(dsn) -> None:
    try:
        aniversario = HOJE.replace(year=HOJE.year - 18)
    except ValueError:  # 29/02
        pytest.skip("29 de fevereiro")
    with psycopg.connect(dsn, autocommit=True) as c:
        # O "hoje" da funcao e o de Brasilia; o do teste e o da maquina. Fixa o fuso do teste.
        hoje_br = c.execute("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date").fetchone()[0]
    if hoje_br != HOJE:
        pytest.skip("relogio do teste e de Brasilia em dias diferentes")
    _nasc(dsn, ADULTO, aniversario)
    assert _status(dsn, ADULTO)["menor"] is False


def test_colega_nao_le_a_data_de_nascimento(dsn) -> None:
    _nasc(dsn, MENOR, NASC_MENOR)
    with como(dsn, COLEGA) as c:
        assert c.execute("SELECT count(*) FROM public.aluno_nascimento").fetchone()[0] == 0
    with como(dsn, MENOR) as c:
        assert c.execute("SELECT count(*) FROM public.aluno_nascimento").fetchone()[0] == 1


def test_cliente_nao_escreve_data_nem_consentimento_direto(dsn) -> None:
    for sql in (
        f"INSERT INTO public.aluno_nascimento VALUES ('{MENOR}', DATE '1990-01-01', now(), '{MENOR}')",
        "INSERT INTO public.consentimento_responsavel(aluno_id, versao, status, metodo, nome_responsavel,"
        f" relacao, decidido_em, registrado_por) VALUES ('{MENOR}', '{VR}', 'accepted', 'aparelho',"
        f" 'Forjado', 'mae', now(), '{MENOR}')",
        f"INSERT INTO public.consentimento_pesquisa(aluno_id, versao, status, decidido_em)"
        f" VALUES ('{MENOR}', '{VP}', 'accepted', now())",
    ):
        with pytest.raises(errors.InsufficientPrivilege), como(dsn, MENOR) as c:
            c.execute(sql)


# ---------------------------------------------------------------- responsavel no aparelho (A)


def test_menor_fica_restrito_ate_o_responsavel_aceitar(dsn) -> None:
    st = _nasc(dsn, MENOR, NASC_MENOR)
    assert st["menor"] is True and st["modo_restrito"] is True
    with pytest.raises(errors.InsufficientPrivilege):
        _telemetria_direta(dsn, MENOR)

    fin = {"camera": False, "telemetria": True, "emocional": False, "mentor": True}
    st = _aparelho(dsn, MENOR, finalidades=fin)
    assert st["modo_restrito"] is False
    assert st["responsavel"]["metodo"] == "aparelho" and st["responsavel"]["vigente"] is True
    # Vale so o que o responsavel marcou; chave ausente e "nao".
    assert st["finalidades"] == {
        "camera": False, "telemetria": True, "emocional": False, "mentor": True, "pesquisa": False,
    }
    _telemetria_direta(dsn, MENOR)


def test_revogar_no_aparelho_volta_ao_modo_restrito(dsn) -> None:
    _nasc(dsn, MENOR, NASC_MENOR)
    _aparelho(dsn, MENOR)
    st = _aparelho(dsn, MENOR, aceito=False, nome=None, relacao=None, declaracao=False)
    assert st["modo_restrito"] is True
    assert st["responsavel"]["status"] == "rejected"
    with psycopg.connect(dsn, autocommit=True) as c:  # so cresce: as duas linhas ficam
        assert c.execute(
            "SELECT count(*) FROM public.consentimento_responsavel WHERE aluno_id=%s", (MENOR,)
        ).fetchone()[0] == 2


def test_reenvio_da_mesma_decisao_nao_duplica(dsn) -> None:
    _nasc(dsn, MENOR, NASC_MENOR)
    quando = "2026-01-10T10:00:00-03:00"
    _aparelho(dsn, MENOR, quando=quando)
    _aparelho(dsn, MENOR, quando=quando)
    with psycopg.connect(dsn, autocommit=True) as c:
        assert c.execute("SELECT count(*) FROM public.consentimento_responsavel").fetchone()[0] == 1


def test_carimbo_do_servidor_nao_vem_do_cliente(dsn) -> None:
    _nasc(dsn, MENOR, NASC_MENOR)
    _aparelho(dsn, MENOR, quando="2026-01-01T00:00:00-03:00")
    with psycopg.connect(dsn, autocommit=True) as c:
        dec, reg = c.execute(
            "SELECT decidido_em, registrado_em FROM public.consentimento_responsavel"
        ).fetchone()
        assert reg > dec
        assert c.execute("SELECT now() - %s < interval '1 minute'", (reg,)).fetchone()[0]


@pytest.mark.parametrize(
    ("kwargs", "erro"),
    [
        ({"declaracao": False}, "declarar"),
        ({"nome": "  "}, "nome do responsavel"),
        ({"relacao": "vizinho"}, "relacao"),
        ({"versao": "2020-01-01-velha"}, "desatualizada"),
        ({"finalidades": {**TUDO, "pesquisa": True}}, "pesquisa desatualizada"),
        ({"quando": "2099-01-01T00:00:00Z"}, "futuro"),
    ],
)
def test_aceite_do_responsavel_invalido_e_recusado(dsn, kwargs, erro) -> None:
    _nasc(dsn, MENOR, NASC_MENOR)
    with pytest.raises(psycopg.Error, match=erro):
        _aparelho(dsn, MENOR, **kwargs)
    assert _restrito(dsn, MENOR) is True


def test_termo_do_responsavel_nao_se_aplica_sem_data_nem_a_adulto(dsn) -> None:
    with pytest.raises(psycopg.Error, match="data de nascimento antes"):
        _aparelho(dsn, SEM_DATA)
    _nasc(dsn, ADULTO, NASC_ADULTO)
    with pytest.raises(psycopg.Error, match="maior de idade"):
        _aparelho(dsn, ADULTO)


# ---------------------------------------------------------------- termo em papel (C)


def _papel(dsn, prof, aluno, *, finalidades=TUDO, aceito=True, data=None, pesquisa_versao=None):
    return _um(dsn, prof, PAPEL, (
        aluno, VR, data or HOJE, "Responsavel Papel Teste", "pai", json.dumps(finalidades),
        pesquisa_versao, aceito,
    ))


def test_professor_da_turma_registra_termo_em_papel(dsn) -> None:
    _nasc(dsn, MENOR, NASC_MENOR)
    r = _papel(dsn, PROF, MENOR)
    assert r["modo_restrito"] is False
    st = _status(dsn, MENOR)
    assert st["responsavel"]["metodo"] == "papel"
    with psycopg.connect(dsn, autocommit=True) as c:
        prof, por = c.execute(
            "SELECT professor_id, registrado_por FROM public.consentimento_responsavel"
        ).fetchone()
    assert prof == PROF and por == PROF


def test_professor_de_outra_turma_e_barrado(dsn) -> None:
    _nasc(dsn, MENOR, NASC_MENOR)
    with pytest.raises(errors.InsufficientPrivilege, match="fora das suas turmas"):
        _papel(dsn, OUTRO_PROF, MENOR)
    assert _restrito(dsn, MENOR) is True


def test_aluno_nao_registra_termo_em_papel(dsn) -> None:
    _nasc(dsn, MENOR, NASC_MENOR)
    with pytest.raises(errors.InsufficientPrivilege, match="apenas professor"):
        _papel(dsn, MENOR, MENOR)


def test_papel_com_data_futura_e_recusado(dsn) -> None:
    _nasc(dsn, MENOR, NASC_MENOR)
    with pytest.raises(psycopg.Error, match="assinatura"):
        _papel(dsn, PROF, MENOR, data=HOJE + timedelta(days=2))


def test_revogacao_no_aparelho_depois_do_papel_revoga(dsn) -> None:
    _nasc(dsn, MENOR, NASC_MENOR)
    _papel(dsn, PROF, MENOR, data=HOJE - timedelta(days=3))
    assert _restrito(dsn, MENOR) is False
    _aparelho(dsn, MENOR, aceito=False, nome=None, relacao=None, declaracao=False)
    assert _restrito(dsn, MENOR) is True


def test_painel_do_professor_mostra_situacao_e_nunca_a_data(dsn) -> None:
    _nasc(dsn, ADULTO, NASC_ADULTO)
    _nasc(dsn, MENOR, NASC_MENOR)
    _nasc(dsn, COLEGA, NASC_MENOR)
    _papel(dsn, PROF, COLEGA)
    with como(dsn, PROF) as c:
        cur = c.execute("SELECT * FROM public.professor_termos_da_turma(1)")
        colunas = [d.name for d in cur.description]
        linhas = {r[0]: r for r in cur.fetchall()}
    assert colunas == ["aluno_id", "situacao", "metodo", "versao", "decidido_em", "vigente"]
    assert linhas[ADULTO][1] == "maior"
    assert linhas[MENOR][1] == "menor_sem_termo"
    assert linhas[SEM_DATA][1] == "sem_data_nascimento"
    assert linhas[COLEGA][1:4] == ("menor_com_termo", "papel", VR)
    assert linhas[COLEGA][5] is True
    with pytest.raises(errors.InsufficientPrivilege), como(dsn, OUTRO_PROF) as c:
        c.execute("SELECT * FROM public.professor_termos_da_turma(1)")


# ---------------------------------------------------------------- pesquisa


def _pesquisa(dsn, uid, aceito=True):
    return _um(dsn, uid, "SELECT public.aluno_registrar_consentimento_pesquisa(%s,%s,%s,%s::jsonb)",
               (aceito, VP, None, "{}"))


def _elegiveis(dsn) -> set:
    with como(dsn, None, "service_role") as c:
        return {r[0] for r in c.execute("SELECT aluno_id FROM public.vw_alunos_pesquisa_elegiveis")}


def test_pesquisa_adulto_so_com_aceite_proprio(dsn) -> None:
    _nasc(dsn, ADULTO, NASC_ADULTO)
    assert _elegiveis(dsn) == set()
    st = _pesquisa(dsn, ADULTO)
    assert st["finalidades"]["pesquisa"] is True
    assert _elegiveis(dsn) == {ADULTO}
    _pesquisa(dsn, ADULTO, aceito=False)
    assert _elegiveis(dsn) == set()


def test_pesquisa_do_menor_exige_responsavel_e_aluno(dsn) -> None:
    _nasc(dsn, MENOR, NASC_MENOR)
    _aparelho(dsn, MENOR)  # responsavel aceitou o resto, mas nao a pesquisa
    _pesquisa(dsn, MENOR)
    assert _permitida(dsn, MENOR, "pesquisa") is False
    _aparelho(dsn, MENOR, finalidades={**TUDO, "pesquisa": True}, pesquisa_versao=VP)
    assert _permitida(dsn, MENOR, "pesquisa") is True
    assert _elegiveis(dsn) == {MENOR}
    _pesquisa(dsn, MENOR, aceito=False)  # o assentimento do proprio aluno tambem conta
    assert _elegiveis(dsn) == set()


def test_view_de_pesquisa_so_para_service_role(dsn) -> None:
    for papel, uid in (("authenticated", ADULTO), ("anon", None)):
        with pytest.raises(errors.InsufficientPrivilege), como(dsn, uid, papel) as c:
            c.execute("SELECT * FROM public.vw_alunos_pesquisa_elegiveis")


# ---------------------------------------------------------------- ACL das funcoes


@pytest.mark.parametrize("assinatura", M.FUNCOES_INTERNAS)
def test_funcoes_internas_fechadas_ao_cliente(dsn, assinatura) -> None:
    with psycopg.connect(dsn, autocommit=True) as c:
        for papel in ("anon", "authenticated"):
            assert c.execute(
                "SELECT has_function_privilege(%s, %s, 'EXECUTE')", (papel, assinatura)
            ).fetchone()[0] is False, (papel, assinatura)
        assert c.execute(
            "SELECT has_function_privilege('service_role', %s, 'EXECUTE')", (assinatura,)
        ).fetchone()[0]


@pytest.mark.parametrize("assinatura", M.FUNCOES_DO_CLIENTE)
def test_rpcs_do_cliente_fechadas_ao_anon(dsn, assinatura) -> None:
    with psycopg.connect(dsn, autocommit=True) as c:
        assert c.execute(
            "SELECT has_function_privilege('anon', %s, 'EXECUTE')", (assinatura,)
        ).fetchone()[0] is False
        assert c.execute(
            "SELECT has_function_privilege('authenticated', %s, 'EXECUTE')", (assinatura,)
        ).fetchone()[0]
        definer, config = c.execute(
            "SELECT prosecdef, proconfig FROM pg_proc WHERE oid = %s::regprocedure", (assinatura,)
        ).fetchone()
        assert definer and any(s.startswith("search_path=") for s in config)


def test_sem_sessao_as_rpcs_recusam(dsn) -> None:
    with pytest.raises(errors.InsufficientPrivilege), como(dsn, None) as c:
        c.execute("SELECT public.aluno_meu_consentimento()")


# ---------------------------------------------------------------- downgrade


def test_downgrade_tira_funcoes_e_mantem_as_provas(dsn) -> None:
    _nasc(dsn, MENOR, NASC_MENOR)
    _aparelho(dsn, MENOR)
    with psycopg.connect(dsn) as c:
        for sql in _sql_de(M.downgrade):
            c.execute(sql)
        c.commit()
    with psycopg.connect(dsn, autocommit=True) as c:
        assert c.execute("SELECT to_regprocedure('public.aluno_modo_restrito(uuid)')").fetchone()[0] is None
        assert c.execute("SELECT count(*) FROM public.consentimento_responsavel").fetchone()[0] == 1
        assert c.execute("SELECT count(*) FROM public.aluno_nascimento").fetchone()[0] == 1
        assert c.execute(
            "SELECT count(*) FROM pg_policies WHERE policyname LIKE 'telemetria_%%_consentimento_%%'"
        ).fetchone()[0] == 0
