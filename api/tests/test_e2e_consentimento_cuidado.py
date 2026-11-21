"""Ponta a ponta da `20261120_04` (consentimento do modo de cuidado) num Postgres de verdade.

Roda so com `TRAILUP_E2E_CUIDADO_DATABASE_URL` apontando para um Postgres LOCAL (o usuario
precisa poder `CREATE DATABASE`). Cada teste usa um banco descartavel: aplica a `20261024_02`
(consentimento do responsavel, de que o cuidado depende) e depois a `20261120_04`, exatamente
como o `upgrade()` emite. Recusa banco hospedado. Uuids e nomes sinteticos.
"""

from __future__ import annotations

import importlib.util
import json
import os
import uuid
from contextlib import contextmanager
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest

DSN = os.environ.get("TRAILUP_E2E_CUIDADO_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DSN,
    reason="TRAILUP_E2E_CUIDADO_DATABASE_URL nao definido (e2e so em banco local descartavel)",
)

if DSN:
    import psycopg

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e do cuidado recusa banco hospedado: use um Postgres local")

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"e2e_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


class _Coletor:
    def __init__(self) -> None:
        self.sql: list[str] = []

    def execute(self, sql: str) -> None:
        self.sql.append(sql)


def _sql_de(modulo, fn) -> list[str]:
    coletor = _Coletor()
    original = modulo.op
    modulo.op = coletor
    try:
        fn()
    finally:
        modulo.op = original
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
GRANT SELECT ON public.alunos, public.professor, public.classe, public.classe_aluno TO service_role;

CREATE FUNCTION public.trg_consentimento_carimbo_do_servidor() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN NEW.registrado_em := now(); RETURN NEW; END; $f$;
REVOKE EXECUTE ON FUNCTION public.trg_consentimento_carimbo_do_servidor() FROM PUBLIC, anon, authenticated;

-- A 20261024_02 poe policies de telemetria; o cuidado nao as usa, mas as tabelas precisam existir.
CREATE TABLE public.telemetria_sessoes (id bigserial PRIMARY KEY, aluno_id uuid);
CREATE TABLE public.telemetria_lotes (id bigserial PRIMARY KEY, aluno_id uuid);
CREATE TABLE public.telemetria_eventos_app (id bigserial PRIMARY KEY, aluno_id uuid);
CREATE TABLE public.telemetria_time_metric_entries (id bigserial PRIMARY KEY, aluno_id uuid);

-- O que a 20261120_05 (momentos de cuidado) le: turma, tentativas, cronometro e configuracao.
CREATE TABLE public.topicos (id bigint PRIMARY KEY, classe_id bigint NOT NULL);
CREATE TABLE public.atividades (id bigint PRIMARY KEY, topico_id bigint);
CREATE TABLE public.atividade_tentativas (
  id bigserial PRIMARY KEY, aluno_id uuid, classe_id bigint, atividade_id bigint,
  respondida_em timestamptz, acertos_percentual numeric);
CREATE TABLE public.aluno_cronometro (aluno_id uuid PRIMARY KEY, ligado boolean NOT NULL, origem text NOT NULL);
CREATE TABLE public.perfil (id bigint PRIMARY KEY, nome text);
CREATE TABLE public.aluno_perfil (aluno_id uuid, perfil_id bigint, afinidade numeric);
CREATE TABLE public.app_config (
  chave text PRIMARY KEY, valor text NOT NULL, descricao text, publico boolean NOT NULL DEFAULT false);
CREATE TABLE public.retencao_politica (
  tabela text NOT NULL, acao text NOT NULL, coluna_tempo text,
  coluna_aluno text NOT NULL DEFAULT 'aluno_id', dias integer, dias_pesquisa integer, filtro text,
  ajuste text, ordem integer NOT NULL DEFAULT 0, ativo boolean NOT NULL DEFAULT true,
  categoria text NOT NULL, motivo text NOT NULL, revisado_em date NOT NULL DEFAULT current_date,
  PRIMARY KEY (tabela, acao));
CREATE FUNCTION public.app_classes_do_professor() RETURNS SETOF bigint LANGUAGE sql STABLE
  SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT c.id FROM classe c WHERE c.professor_id = auth.uid() $$;
CREATE FUNCTION public.fn_cronometro_ligado(p_aluno uuid) RETURNS boolean LANGUAGE sql STABLE
  SET search_path TO 'public', 'pg_temp' AS $$
  SELECT COALESCE(
    (SELECT ac.ligado FROM public.aluno_cronometro ac WHERE ac.aluno_id = p_aluno),
    (SELECT lower(p.nome) IN ('survivor', 'mastermind', 'achiever', 'conqueror', 'daredevil')
       FROM public.aluno_perfil ap JOIN public.perfil p ON p.id = ap.perfil_id
      WHERE ap.aluno_id = p_aluno ORDER BY ap.afinidade DESC NULLS LAST, p.nome ASC LIMIT 1),
    false) $$;
REVOKE ALL ON FUNCTION public.fn_cronometro_ligado(uuid) FROM PUBLIC, anon, authenticated;
-- copia de `20261024_03` (so o ramo generico): a prova do consentimento sobrevive a conta.
CREATE FUNCTION public.trg_consentimento_anonimiza() RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  NEW.titular_hash := encode(sha256(convert_to(OLD.aluno_id::text, 'UTF8')), 'hex');
  NEW.anonimizado_em := now();
  NEW.origem := '{}'::jsonb;
  RETURN NEW;
END;
$function$;
"""

ADULTO, MENOR_COM, MENOR_SEM = (uuid.UUID(int=i) for i in range(1, 4))
HOJE = date.today()
NASC_ADULTO = date(HOJE.year - 30, 1, 15)
NASC_MENOR = date(HOJE.year - 12, 1, 15)
TUDO = {"camera": True, "telemetria": True, "emocional": True, "mentor": True, "pesquisa": False}


def _dsn_para(banco: str) -> str:
    return urlunsplit(urlsplit(DSN)._replace(path=f"/{banco}"))


@contextmanager
def _banco():
    resp = _modulo("20261024_02_consentimento_do_responsavel.py")
    cuid = _modulo("20261120_04_consentimento_cuidado.py")
    momentos = _modulo("20261120_05_momentos_de_cuidado.py")
    nome = f"tu_cuid_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    dsn = _dsn_para(nome)
    try:
        with psycopg.connect(dsn, autocommit=True) as c:
            c.execute(BASE)
            for n, u in enumerate((ADULTO, MENOR_COM, MENOR_SEM)):
                c.execute("INSERT INTO public.alunos VALUES (%s, %s)", (u, f"Aluno teste {n}"))
        with psycopg.connect(dsn) as c:
            for sql in _sql_de(resp, resp.upgrade) + _sql_de(cuid, cuid.upgrade) + _sql_de(momentos, momentos.upgrade):
                c.execute(sql)
            c.commit()
        yield dsn
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


@pytest.fixture()
def db():
    with _banco() as d:
        yield d


@contextmanager
def como(dsn: str, uid: uuid.UUID):
    c = psycopg.connect(dsn, autocommit=True)
    try:
        c.execute("SET ROLE authenticated")
        c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (str(uid),))
        yield c
    finally:
        c.close()


def _um(dsn, uid, sql, params=()):
    with como(dsn, uid) as c:
        return c.execute(sql, params).fetchone()[0]


def _admin(dsn, sql, params=()):
    with psycopg.connect(dsn, autocommit=True) as c:
        return c.execute(sql, params).fetchone()[0]


VERSAO = "2026-11-20-cuid-v1"


def permitido(dsn, uid) -> bool:
    return _admin(dsn, "SELECT public.aluno_cuidado_permitido(%s)", (uid,))


def registrar(dsn, uid, *, aceito=True, versao=VERSAO):
    return _um(
        dsn,
        uid,
        "SELECT public.aluno_registrar_consentimento_cuidado(%s,%s,%s,%s::jsonb)",
        (aceito, versao, None, json.dumps({"plataforma": "teste"})),
    )


def responsavel_cuidado(dsn, uid, *, aceito=True):
    return _um(
        dsn,
        uid,
        "SELECT public.responsavel_registrar_cuidado(%s,%s,%s,%s,%s)",
        (aceito, "Responsavel Teste", "mae", True, None),
    )


def finalidades(dsn, uid) -> dict:
    return _um(dsn, uid, "SELECT public.aluno_meu_consentimento()")["finalidades"]


def modo_restrito(dsn, uid) -> bool:
    return _admin(dsn, "SELECT public.aluno_modo_restrito(%s)", (uid,))


def _nasc(dsn, uid, data):
    _um(dsn, uid, "SELECT public.aluno_registrar_data_nascimento(%s)", (data,))


def _termo_do_responsavel(dsn, uid):
    resp = _modulo("20261024_02_consentimento_do_responsavel.py")
    _um(
        dsn,
        uid,
        "SELECT public.responsavel_registrar_no_aparelho(%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s::jsonb)",
        (resp.VERSAO_RESPONSAVEL, True, "Responsavel Teste", "mae", True, json.dumps(TUDO), None, None, "{}"),
    )


@pytest.fixture()
def adulto(db):
    _nasc(db, ADULTO, NASC_ADULTO)
    return ADULTO


@pytest.fixture()
def menor_sem_responsavel(db):
    _nasc(db, MENOR_SEM, NASC_MENOR)
    return MENOR_SEM


@pytest.fixture()
def menor_com_responsavel(db):
    _nasc(db, MENOR_COM, NASC_MENOR)
    _termo_do_responsavel(db, MENOR_COM)
    return MENOR_COM


def test_adulto_sem_aceite_nao_tem_cuidado(db, adulto):
    assert not permitido(db, adulto)


def test_adulto_com_aceite_vigente_tem_cuidado(db, adulto):
    registrar(db, adulto, aceito=True)
    assert permitido(db, adulto)
    assert _um(db, adulto, "SELECT public.aluno_meu_cuidado_permitido()") is True


def test_aceite_de_versao_antiga_nao_vale(db, adulto):
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        registrar(db, adulto, aceito=True, versao="2026-01-01-cuid-v0")  # a RPC recusa
    assert not permitido(db, adulto)


def test_modo_restrito_barra_mesmo_com_aceite(db, menor_sem_responsavel):
    registrar(db, menor_sem_responsavel, aceito=True)
    assert not permitido(db, menor_sem_responsavel)


def test_menor_precisa_do_proprio_aceite_e_do_responsavel(db, menor_com_responsavel):
    registrar(db, menor_com_responsavel, aceito=True)
    assert not permitido(db, menor_com_responsavel)
    assert responsavel_cuidado(db, menor_com_responsavel, aceito=True)["ok"] is True
    assert permitido(db, menor_com_responsavel)


def test_revogar_do_aluno_ou_do_responsavel_derruba(db, menor_com_responsavel):
    registrar(db, menor_com_responsavel, aceito=True)
    responsavel_cuidado(db, menor_com_responsavel, aceito=True)
    assert permitido(db, menor_com_responsavel)
    responsavel_cuidado(db, menor_com_responsavel, aceito=False)
    assert not permitido(db, menor_com_responsavel)


def test_responsavel_cuidado_nao_muda_as_outras_finalidades(db, menor_com_responsavel):
    antes = finalidades(db, menor_com_responsavel)
    responsavel_cuidado(db, menor_com_responsavel, aceito=True)
    depois = finalidades(db, menor_com_responsavel)
    assert {k: v for k, v in depois.items() if k != "cuidado"} == antes
    assert not modo_restrito(db, menor_com_responsavel)


def test_responsavel_cuidado_recusa_sem_aceite_vigente(db, menor_sem_responsavel):
    assert responsavel_cuidado(db, menor_sem_responsavel, aceito=True)["ok"] is False


def test_cliente_nao_executa_a_funcao_interna(db, adulto):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        _um(db, adulto, "SELECT public.aluno_cuidado_permitido(%s)", (adulto,))


def test_cliente_nao_escreve_na_tabela_e_so_le_a_propria(db, adulto):
    registrar(db, adulto, aceito=True)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        _um(
            db,
            adulto,
            "INSERT INTO public.consentimento_cuidado(aluno_id, versao, status, decidido_em)"
            " VALUES (%s, 'x', 'accepted', now()) RETURNING id",
            (adulto,),
        )
    assert _um(db, adulto, "SELECT count(*) FROM public.consentimento_cuidado") == 1
    assert _um(db, MENOR_SEM, "SELECT count(*) FROM public.consentimento_cuidado") == 0


def contar_momentos(dsn, uid) -> int:
    return _admin(dsn, "SELECT count(*) FROM public.aluno_momento_cuidado WHERE aluno_id = %s", (uid,))


def _momento(dsn, uid):
    _admin(dsn, "INSERT INTO public.classe VALUES (1, NULL) ON CONFLICT DO NOTHING RETURNING 1")
    _admin(
        dsn,
        "INSERT INTO public.aluno_momento_cuidado (aluno_id, classe_id, origem, expira_em)"
        " VALUES (%s, 1, 'sinais_de_uso', now() + interval '1 hour') RETURNING 1",
        (uid,),
    )


def test_revogar_apaga_os_momentos(db, adulto):
    registrar(db, adulto, aceito=True)
    _momento(db, adulto)
    registrar(db, adulto, aceito=False)
    assert contar_momentos(db, adulto) == 0


def test_revogar_do_responsavel_apaga_os_momentos(db, menor_com_responsavel):
    registrar(db, menor_com_responsavel, aceito=True)
    responsavel_cuidado(db, menor_com_responsavel, aceito=True)
    _momento(db, menor_com_responsavel)
    assert contar_momentos(db, menor_com_responsavel) == 1
    responsavel_cuidado(db, menor_com_responsavel, aceito=False)
    assert contar_momentos(db, menor_com_responsavel) == 0


def test_conta_apagada_deixa_a_prova_anonimizada(db):
    registrar(db, ADULTO, aceito=True)
    with psycopg.connect(db, autocommit=True) as c:
        c.execute("DELETE FROM public.alunos WHERE id = %s", (ADULTO,))
        linha = c.execute(
            "SELECT aluno_id, titular_hash IS NOT NULL, anonimizado_em IS NOT NULL, origem, status"
            " FROM public.consentimento_cuidado"
        ).fetchone()
        politica = c.execute(
            "SELECT dias, categoria FROM public.retencao_politica WHERE tabela = 'consentimento_cuidado'"
        ).fetchone()
    assert linha == (None, True, True, {}, "accepted")
    assert politica == (1826, "prova_consentimento")
