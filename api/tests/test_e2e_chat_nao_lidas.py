"""Ponta a ponta da `20261102_06` (mensagens não lidas) contra um Postgres de verdade.

Roda só com `TRAILUP_E2E_CHAT_DATABASE_URL` apontando para um Postgres LOCAL (o usuário precisa
poder `CREATE DATABASE`), no mesmo molde de `test_e2e_conversas_cifradas.py`: cada teste cria um
banco descartável, monta o mínimo de schema que as funções leem, cria `social_notificar_evento`
com o texto de produção (`docs/mobile/sql/20260913_04_notificacoes_convites_social.sql`), aplica o
upgrade da `_06` e apaga o banco no fim.

`notificacoes_enviar_push` é um dublê que só registra a chamada: o push de verdade sai por
`pg_net`, que não existe aqui. Todos os textos de mensagem são marcas sintéticas.

Cada papel entra como o PostgREST entraria: `SET ROLE authenticated` com o `sub` do JWT.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest

DSN = os.environ.get("TRAILUP_E2E_CHAT_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_CHAT_DATABASE_URL não definido (e2e só em banco local descartável)"
)

if DSN:
    import psycopg
    from psycopg import errors

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e do chat recusa banco hospedado: use um Postgres local descartável")

_RAIZ = Path(__file__).resolve().parents[2]
_VERSOES = _RAIZ / "api" / "alembic" / "versions"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"e2e_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M06 = _modulo("20261102_06_chat_mensagens_nao_lidas.py")


def _notificar_de_producao() -> str:
    sql = (_RAIZ / "docs" / "mobile" / "sql" / "20260913_04_notificacoes_convites_social.sql").read_text(
        encoding="utf-8"
    )
    m = re.search(r"CREATE OR REPLACE FUNCTION public\.social_notificar_evento\(.*?\$fn\$;", sql, re.S)
    assert m, "social_notificar_evento não encontrada no SQL de produção"
    return m.group(0)


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

CREATE TABLE public.alunos (id uuid PRIMARY KEY, nome text, apelido text);
CREATE TABLE public.social_relacionamentos (aluno_a_id uuid, aluno_b_id uuid, status text);
CREATE TABLE public.guildas (id uuid PRIMARY KEY, classe_id bigint, nome text);
CREATE TABLE public.guilda_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guilda_id uuid NOT NULL REFERENCES public.guildas(id),
  classe_id bigint NOT NULL,
  aluno_id uuid REFERENCES public.alunos(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz
);
CREATE TABLE public.guilda_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guilda_id uuid NOT NULL REFERENCES public.guildas(id),
  classe_id bigint NOT NULL,
  autor_id uuid NOT NULL REFERENCES public.alunos(id),
  tipo text NOT NULL DEFAULT 'text',
  texto text NOT NULL DEFAULT '',
  conteudo jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.social_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remetente_id uuid NOT NULL REFERENCES public.alunos(id),
  destinatario_id uuid NOT NULL REFERENCES public.alunos(id),
  texto text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (remetente_id <> destinatario_id)
);
ALTER TABLE public.social_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guilda_mensagens ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notificacoes (
  id bigserial PRIMARY KEY,
  aluno_id uuid NOT NULL,
  titulo text, corpo text, tipo text,
  horario_envio timestamptz, status text, read boolean,
  origem text, contexto jsonb
);
CREATE UNIQUE INDEX notificacoes_social_evento_uidx
  ON public.notificacoes (aluno_id, origem, ((contexto ->> 'dedupe_key')))
  WHERE origem = 'social';
-- Dublê do push: a produção sai por pg_net.
CREATE TABLE public.push_enviados (aluno_id uuid, notificacao_id bigint, titulo text, corpo text, dados jsonb);
CREATE FUNCTION public.notificacoes_enviar_push(
  p_aluno_id uuid, p_notificacao_id bigint, p_titulo text, p_corpo text, p_dados jsonb, p_prioridade integer
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ INSERT INTO public.push_enviados VALUES (p_aluno_id, p_notificacao_id, p_titulo, p_corpo, p_dados) $$;
"""

# A e B conversam; C bloqueou A; G é a guilda de A, B e D; D saiu da guilda.
A, B, C, D = (uuid.UUID(int=i) for i in range(1, 5))
GUILDA = uuid.UUID(int=100)


def _seed() -> str:
    return f"""
INSERT INTO public.alunos VALUES
  ('{A}','Ana Souza','Aninha'), ('{B}','Bruno Lima',''), ('{C}','Caio Reis',NULL), ('{D}','Duda Melo',NULL);
INSERT INTO public.social_relacionamentos VALUES (LEAST('{A}'::uuid,'{C}'::uuid), GREATEST('{A}'::uuid,'{C}'::uuid), 'blocked');
INSERT INTO public.guildas VALUES ('{GUILDA}', 1, 'Guilda teste');
INSERT INTO public.guilda_membros (guilda_id, classe_id, aluno_id, joined_at, left_at) VALUES
  ('{GUILDA}', 1, '{A}', now() - interval '2 days', NULL),
  ('{GUILDA}', 1, '{B}', now() - interval '2 days', NULL),
  ('{GUILDA}', 1, '{D}', now() - interval '2 days', now() - interval '1 day');
"""


def _dsn_para(banco: str) -> str:
    partes = urlsplit(DSN)
    return urlunsplit(partes._replace(path=f"/{banco}"))


@contextmanager
def _banco(*, antes_do_upgrade: str = ""):
    nome = f"tuchat_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    dsn = _dsn_para(nome)
    try:
        with psycopg.connect(dsn, autocommit=True) as c:
            c.execute(BASE)
            c.execute(_notificar_de_producao())
            c.execute(_seed())
            if antes_do_upgrade:
                c.execute(antes_do_upgrade)
        with psycopg.connect(dsn) as c:
            c.execute(M06.UPGRADE)
            c.commit()
        yield dsn
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


@contextmanager
def como(dsn: str, uid: uuid.UUID | None, papel: str = "authenticated"):
    c = psycopg.connect(dsn, autocommit=True)
    try:
        c.execute(f"SET ROLE {papel}")
        sub = str(uid) if uid else ""
        c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (sub,))
        c.execute("SELECT set_config('request.jwt.claims', %s, false)", (json.dumps({"sub": sub, "role": papel}),))
        yield c
    finally:
        c.close()


def _manda(dsn: str, de: uuid.UUID, para: uuid.UUID, *, ha: str = "0 seconds") -> None:
    """Grava como o `social_chat_enviar` grava: dono da função, não o aluno."""
    with psycopg.connect(dsn, autocommit=True) as c:
        c.execute(
            "INSERT INTO public.social_mensagens (remetente_id, destinatario_id, created_at) "
            "VALUES (%s, %s, now() - %s::interval)",
            (de, para, ha),
        )


def _guilda(dsn: str, autor: uuid.UUID, *, ha: str = "0 seconds") -> None:
    with psycopg.connect(dsn, autocommit=True) as c:
        c.execute(
            "INSERT INTO public.guilda_mensagens (guilda_id, classe_id, autor_id, created_at) "
            "VALUES (%s, 1, %s, now() - %s::interval)",
            (GUILDA, autor, ha),
        )


def _nao_lidas(dsn: str, uid: uuid.UUID) -> dict[tuple[str, uuid.UUID], int]:
    with como(dsn, uid) as c:
        return {(t, conv): n for t, conv, n, _ in c.execute("SELECT * FROM public.chat_nao_lidas()").fetchall()}


def _marca(dsn: str, uid: uuid.UUID, tipo: str, conversa: uuid.UUID) -> None:
    with como(dsn, uid) as c:
        c.execute("SELECT public.chat_marcar_lido(%s, %s)", (tipo, conversa))


def _avisos(dsn: str, uid: uuid.UUID) -> list[tuple[str, str, dict]]:
    with psycopg.connect(dsn, autocommit=True) as c:
        return c.execute(
            "SELECT titulo, corpo, contexto FROM public.notificacoes WHERE aluno_id = %s ORDER BY id", (uid,)
        ).fetchall()


def _pushes(dsn: str, uid: uuid.UUID) -> int:
    with psycopg.connect(dsn, autocommit=True) as c:
        return c.execute("SELECT count(*) FROM public.push_enviados WHERE aluno_id = %s", (uid,)).fetchone()[0]


def test_conta_o_que_chegou_e_zera_ao_abrir():
    with _banco() as dsn:
        _manda(dsn, B, A)
        _manda(dsn, B, A)
        _manda(dsn, A, B)  # o que A mandou não conta para A
        assert _nao_lidas(dsn, A) == {("privado", B): 2}
        assert _nao_lidas(dsn, B) == {("privado", A): 1}

        _marca(dsn, A, "privado", B)
        assert _nao_lidas(dsn, A) == {}
        _manda(dsn, B, A)
        assert _nao_lidas(dsn, A) == {("privado", B): 1}


def test_um_aviso_por_leva_sem_o_texto_e_com_o_apelido():
    with _banco() as dsn:
        _manda(dsn, A, B)
        _manda(dsn, A, B)
        _manda(dsn, A, B)
        avisos = _avisos(dsn, B)
        assert len(avisos) == 1
        titulo, corpo, contexto = avisos[0]
        assert titulo == "Nova mensagem"
        assert corpo == "Aninha mandou uma mensagem para você."
        assert contexto["remetente_id"] == str(A) and contexto["dedupe_key"].startswith(f"chat:{A}:")
        assert _pushes(dsn, B) == 1

        # Abrir a conversa abre uma leva nova: a próxima mensagem avisa de novo.
        _marca(dsn, B, "privado", A)
        _manda(dsn, A, B)
        assert len(_avisos(dsn, B)) == 2
        assert _pushes(dsn, B) == 2


def test_sem_apelido_usa_o_primeiro_nome():
    with _banco() as dsn:
        _manda(dsn, B, A)
        assert _avisos(dsn, A)[0][1] == "Bruno mandou uma mensagem para você."


def test_bloqueado_nao_conta():
    with _banco() as dsn:
        _manda(dsn, C, A)
        assert _nao_lidas(dsn, A) == {}


def test_guilda_conta_dos_outros_so_enquanto_membro_e_sem_push():
    with _banco() as dsn:
        _guilda(dsn, B)
        _guilda(dsn, B)
        _guilda(dsn, A)
        assert _nao_lidas(dsn, A) == {("guilda", GUILDA): 2}
        assert _nao_lidas(dsn, B) == {("guilda", GUILDA): 1}
        assert _nao_lidas(dsn, D) == {}  # saiu da guilda
        assert _avisos(dsn, A) == [] and _pushes(dsn, A) == 0

        _marca(dsn, A, "guilda", GUILDA)
        assert _nao_lidas(dsn, A) == {}


def test_guilda_nao_conta_o_que_veio_antes_de_entrar():
    with _banco() as dsn:
        _guilda(dsn, B, ha="3 days")
        assert _nao_lidas(dsn, A) == {}


def test_marcar_guilda_exige_membro_ativo_e_sessao():
    with _banco() as dsn:
        with pytest.raises(errors.RaiseException, match="chat_conversa_invalida"):
            _marca(dsn, D, "guilda", GUILDA)
        with pytest.raises(errors.RaiseException, match="chat_conversa_invalida"):
            _marca(dsn, A, "outro", B)
        with pytest.raises(errors.RaiseException, match="chat_sem_sessao"):
            with como(dsn, None) as c:
                c.execute("SELECT public.chat_marcar_lido('privado', %s)", (B,))


def test_marca_nunca_anda_para_tras():
    with _banco() as dsn:
        _marca(dsn, A, "privado", B)
        with psycopg.connect(dsn, autocommit=True) as c:
            c.execute("UPDATE public.chat_leitura SET lido_ate = now() + interval '1 hour' WHERE aluno_id = %s", (A,))
        _marca(dsn, A, "privado", B)
        with psycopg.connect(dsn, autocommit=True) as c:
            futuro = c.execute(
                "SELECT lido_ate > now() + interval '30 minutes' FROM public.chat_leitura WHERE aluno_id = %s", (A,)
            ).fetchone()[0]
        assert futuro


def test_backfill_marca_o_que_ja_existia_como_lido():
    antes = f"""
      INSERT INTO public.social_mensagens (remetente_id, destinatario_id, created_at)
        VALUES ('{B}', '{A}', now() - interval '1 hour');
      INSERT INTO public.guilda_mensagens (guilda_id, classe_id, autor_id, created_at)
        VALUES ('{GUILDA}', 1, '{B}', now() - interval '1 hour');
    """
    with _banco(antes_do_upgrade=antes) as dsn:
        assert _nao_lidas(dsn, A) == {}
        assert _avisos(dsn, A) == []  # o backfill não dispara aviso


def test_rls_aluno_le_so_a_propria_marca_e_nao_escreve():
    with _banco() as dsn:
        _marca(dsn, A, "privado", B)
        _marca(dsn, B, "privado", A)
        with como(dsn, A) as c:
            # A tem duas marcas: a da conversa com B e a da guilda, do backfill.
            assert {r[0] for r in c.execute("SELECT aluno_id FROM public.chat_leitura").fetchall()} == {A}
            with pytest.raises(errors.InsufficientPrivilege):
                c.execute("UPDATE public.chat_leitura SET lido_ate = now()")
        with como(dsn, A, "anon") as c:
            with pytest.raises(errors.InsufficientPrivilege):
                c.execute("SELECT public.chat_nao_lidas()")
            with pytest.raises(errors.InsufficientPrivilege):
                c.execute("SELECT 1 FROM public.chat_leitura")


def test_aviso_que_falha_nao_derruba_a_mensagem():
    quebra = """
      CREATE OR REPLACE FUNCTION public.notificacoes_enviar_push(
        p_aluno_id uuid, p_notificacao_id bigint, p_titulo text, p_corpo text, p_dados jsonb, p_prioridade integer
      ) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'push fora do ar'; END $$;
    """
    with _banco(antes_do_upgrade=quebra) as dsn:
        _manda(dsn, B, A)
        assert _nao_lidas(dsn, A) == {("privado", B): 1}
        assert _avisos(dsn, A) == []


def test_downgrade_remove_tudo():
    with _banco() as dsn:
        with psycopg.connect(dsn) as c:
            c.execute(M06.DOWNGRADE)
            c.commit()
        _manda(dsn, B, A)
        with psycopg.connect(dsn, autocommit=True) as c:
            assert c.execute("SELECT to_regclass('public.chat_leitura')").fetchone()[0] is None
            assert c.execute("SELECT to_regprocedure('public.chat_nao_lidas()')").fetchone()[0] is None
