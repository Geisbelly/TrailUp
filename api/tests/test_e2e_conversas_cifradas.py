"""Ponta a ponta da `20261022_05` (conversas cifradas) contra um Postgres de verdade.

Roda só com `TRAILUP_E2E_CHAT_DATABASE_URL` apontando para um Postgres LOCAL com pgcrypto
(o usuário precisa poder `CREATE DATABASE`). Cada fixture cria um banco descartável, monta o
mínimo de schema que as RPCs do chat leem, cria as funções com o texto de produção (das
migrations `20261021_22` e `20260913_10`), aplica o SQL de upgrade/downgrade da `_05` exatamente
como o Alembic emitiria e apaga o banco no fim.

**O Vault aqui é SIMULADO**: `vault.decrypted_secrets` é uma tabela comum com uma chave **só
de teste**, sem a extensão `supabase_vault` e sem os GRANT que o Supabase dá. Por isso este
arquivo prova o comportamento das funções e o ACL que a migration define, mas **não** prova
quem consegue ler o Vault na produção: lá o `service_role` lê `vault.decrypted_secrets` e
executa `pgp_sym_decrypt`, e decifra sem passar por `chat_chave()`. A cifra protege dump,
backup e réplica; o REVOKE fecha a `chat_chave()` para os papéis do cliente.
Todos os textos de mensagem são marcas sintéticas, nunca conteúdo de aluno.

Por que não a cadeia inteira: ela não cria o schema base (`alunos`, `classe`, `questoes`...),
ver `docs/architecture/schema-nao-versionado.md`.

Cada papel entra como o PostgREST entraria: `SET ROLE authenticated` com o `sub` do JWT.
"""

from __future__ import annotations

import importlib.util
import json
import os
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

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"e2e_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M05 = _modulo("20261022_05_conversas_cifradas_em_repouso.py")
M22 = _modulo("20261021_22_guildas_chat_e_config_no_alembic.py")
M10 = _modulo("20260913_10_chat_colegas_sem_amizade.py")

CHAVE_DE_TESTE = "chave-so-de-teste-local-nao-e-segredo"

BASE = """
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $r$;
CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions, public TO anon, authenticated, service_role;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
-- Vault SIMULADO: tabela comum, sem supabase_vault e sem os GRANT da produção.
CREATE SCHEMA vault;
CREATE TABLE vault.decrypted_secrets (name text PRIMARY KEY, decrypted_secret text);
REVOKE ALL ON vault.decrypted_secrets FROM PUBLIC;

CREATE TABLE public.alunos (id uuid PRIMARY KEY, nome text, foto_url text);
CREATE TABLE public.classe_aluno (classe_id bigint, aluno_id uuid);
CREATE TABLE public.social_relacionamentos (aluno_a_id uuid, aluno_b_id uuid, status text);
CREATE TABLE public.guildas (id uuid PRIMARY KEY, classe_id bigint, nome text, descricao text, emblema text,
  logo_url text, modo_perfil text, perfil_alvo text, criado_por uuid, ativa boolean DEFAULT true, updated_at timestamptz);
CREATE TABLE public.guilda_membros (guilda_id uuid, aluno_id uuid, left_at timestamptz);
CREATE TABLE public.questoes (id bigint PRIMARY KEY, enunciado text, tipo text, alternativas jsonb,
  atividade_id bigint, resposta_correta text);
CREATE TABLE public.questao_aluno (aluno_id uuid, questao_id bigint, atividade_id bigint, tentativa integer,
  resposta text, correta boolean, acertos_percentual numeric);
CREATE TABLE public.liberadas_teste (aluno_id uuid, questao_id bigint);
CREATE FUNCTION public.fn_questao_liberada(p_questao_id bigint) RETURNS boolean LANGUAGE sql STABLE
  SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT EXISTS (SELECT 1 FROM public.liberadas_teste WHERE aluno_id=auth.uid() AND questao_id=p_questao_id) $$;
CREATE FUNCTION public.app_classes_do_professor() RETURNS SETOF bigint LANGUAGE sql AS $$ SELECT NULL::bigint WHERE false $$;

-- As duas tabelas como na produção (constraints com os mesmos nomes).
CREATE TABLE public.guilda_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guilda_id uuid NOT NULL REFERENCES public.guildas(id) ON DELETE CASCADE,
  classe_id bigint NOT NULL,
  autor_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'text' CHECK (tipo IN ('text', 'desafio', 'questao')),
  texto text NOT NULL DEFAULT '' CHECK (char_length(texto) <= 500),
  conteudo jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guilda_mensagens_feed_idx ON public.guilda_mensagens(guilda_id, created_at);
ALTER TABLE public.guilda_mensagens ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.social_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remetente_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  destinatario_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  texto text NOT NULL CHECK (((char_length(btrim(texto)) >= 1) AND (char_length(btrim(texto)) <= 500))),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (remetente_id <> destinatario_id)
);
CREATE INDEX social_mensagens_par_idx ON public.social_mensagens(remetente_id, destinatario_id, created_at);
ALTER TABLE public.social_mensagens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guilda_mensagens, public.social_mensagens FROM anon, authenticated;
-- No Supabase o service_role tem GRANT de tabela por padrão; aqui também.
GRANT SELECT, INSERT, UPDATE ON public.guilda_mensagens, public.social_mensagens TO service_role;
"""

# Atores: A e B na guilda e na turma; C na turma, fora da guilda; D saiu da guilda; E de outra turma.
A, B, C, D, E = (uuid.UUID(int=i) for i in range(1, 6))
GUILDA = uuid.UUID(int=100)
QUESTAO = 7


def _dsn_para(banco: str) -> str:
    partes = urlsplit(DSN)
    return urlunsplit(partes._replace(path=f"/{banco}"))


def _funcoes_de_producao() -> list[str]:
    return [
        M22.VERSIONADAS,
        M10._function("social_chat_listar", "", M10.LISTAR),
        M10._function("social_chat_enviar", "", M10.ENVIAR),
        "REVOKE ALL ON FUNCTION public.social_chat_listar(uuid) FROM PUBLIC, anon;"
        "GRANT EXECUTE ON FUNCTION public.social_chat_listar(uuid) TO authenticated, service_role;"
        "REVOKE ALL ON FUNCTION public.social_chat_enviar(uuid,text) FROM PUBLIC, anon;"
        "GRANT EXECUTE ON FUNCTION public.social_chat_enviar(uuid,text) TO authenticated, service_role;",
    ]


def _seed() -> str:
    alunos = ",".join(f"('{u}','Aluno {n}',NULL)" for n, u in zip("ABCDE", (A, B, C, D, E)))
    return f"""
INSERT INTO public.alunos VALUES {alunos};
INSERT INTO public.classe_aluno VALUES (1,'{A}'),(1,'{B}'),(1,'{C}'),(1,'{D}'),(2,'{E}');
INSERT INTO public.guildas(id,classe_id,nome,criado_por) VALUES ('{GUILDA}',1,'Guilda teste','{A}');
INSERT INTO public.guilda_membros VALUES ('{GUILDA}','{A}',NULL),('{GUILDA}','{B}',NULL),('{GUILDA}','{D}',now());
INSERT INTO public.questoes VALUES ({QUESTAO},'Enunciado sintético','objetiva','["x","y"]'::jsonb,70,'x');
INSERT INTO public.liberadas_teste VALUES ('{A}',{QUESTAO});
"""


@contextmanager
def _banco(*, com_chave: bool = True):
    nome = f"tu195_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    dsn = _dsn_para(nome)
    try:
        with psycopg.connect(dsn, autocommit=True) as c:
            c.execute(BASE)
            if com_chave:
                c.execute(
                    "INSERT INTO vault.decrypted_secrets VALUES (%s, %s)",
                    (M05.CHAVE_VAULT, CHAVE_DE_TESTE),
                )
            for sql in _funcoes_de_producao():
                c.execute(sql)
            c.execute(_seed())
        yield dsn
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _aplica(dsn: str, comandos: list[str]) -> None:
    """Uma transação, como o Alembic faz por migration."""
    with psycopg.connect(dsn) as c:
        for sql in comandos:
            c.execute(sql)
        c.commit()


@contextmanager
def como(dsn: str, uid: uuid.UUID, papel: str = "authenticated"):
    c = psycopg.connect(dsn, autocommit=True)
    try:
        c.execute(f"SET ROLE {papel}")
        c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (str(uid),))
        c.execute(
            "SELECT set_config('request.jwt.claims', %s, false)",
            (json.dumps({"sub": str(uid), "role": papel}),),
        )
        yield c
    finally:
        c.close()


def _rpc(dsn: str, uid: uuid.UUID, sql: str, params: tuple = ()):
    with como(dsn, uid) as c:
        return c.execute(sql, params).fetchone()[0]


def _conversa(dsn: str) -> None:
    """O que o app faz: as RPCs de escrita, mais um INSERT direto como os desafios fazem."""
    enviar = "SELECT public.guilda_chat_enviar(%s, %s, %s, %s::jsonb)"
    _rpc(dsn, A, enviar, (GUILDA, "text", "MARCA-SINTETICA-guilda-1", "{}"))
    _rpc(
        dsn,
        B,
        enviar,
        (GUILDA, "text", "MARCA-SINTETICA-guilda-2", json.dumps({"id": "t1", "titulo": "MARCA-SINTETICA-titulo"})),
    )
    _rpc(dsn, A, enviar, (GUILDA, "questao", "", json.dumps({"id": str(QUESTAO)})))
    with psycopg.connect(dsn, autocommit=True) as c:  # como guilda_desafio_criar / arena_desafio_criar
        c.execute(
            "INSERT INTO public.guilda_mensagens(guilda_id,classe_id,autor_id,tipo,texto,conteudo)"
            " VALUES (%s,1,%s,'desafio','MARCA-SINTETICA-desafio',%s::jsonb)",
            (GUILDA, A, json.dumps({"desafio_id": "MARCA-SINTETICA-desafio-id"})),
        )
    social = "SELECT public.social_chat_enviar(%s, %s)"
    _rpc(dsn, A, social, (B, "MARCA-SINTETICA-social-1"))
    _rpc(dsn, B, social, (A, "  MARCA-SINTETICA-social-2  "))


def _leituras(dsn: str) -> dict:
    return {
        "guilda_A": _rpc(dsn, A, "SELECT public.guilda_chat_listar(%s, 100)", (GUILDA,)),
        "guilda_B": _rpc(dsn, B, "SELECT public.guilda_chat_listar(%s, 100)", (GUILDA,)),
        "guilda_B_2": _rpc(dsn, B, "SELECT public.guilda_chat_listar(%s, 2)", (GUILDA,)),
        "social_A": _rpc(dsn, A, "SELECT public.social_chat_listar(%s)", (B,)),
        "social_B": _rpc(dsn, B, "SELECT public.social_chat_listar(%s)", (A,)),
    }


def _id_questao(dsn: str):
    feed = _rpc(dsn, A, "SELECT public.guilda_chat_listar(%s, 100)", (GUILDA,))
    return next(m["id"] for m in feed if m["tipo"] == "questao")


@pytest.fixture(scope="module")
def mundo():
    with _banco() as dsn:
        _conversa(dsn)
        antes = _leituras(dsn)
        msg_q = _id_questao(dsn)
        resp_antes = _rpc(dsn, A, "SELECT public.guilda_chat_questao_responder(%s, 'x')", (msg_q,))
        _aplica(dsn, M05.UPGRADE_SQL)
        yield {"dsn": dsn, "antes": antes, "msg_q": msg_q, "resp_antes": resp_antes}


def _marcas_em_claro(dsn: str) -> int:
    with psycopg.connect(dsn, autocommit=True) as c:
        return c.execute(
            """SELECT
                 (SELECT count(*) FROM public.guilda_mensagens WHERE texto <> '' OR conteudo <> '{}'::jsonb
                    OR position('MARCA-SINTETICA'::bytea IN texto_cifrado) > 0
                    OR position('MARCA-SINTETICA'::bytea IN conteudo_cifrado) > 0)
               + (SELECT count(*) FROM public.social_mensagens WHERE texto <> ''
                    OR position('MARCA-SINTETICA'::bytea IN texto_cifrado) > 0)"""
        ).fetchone()[0]


def test_leitoras_devolvem_o_mesmo_json(mundo) -> None:
    depois = _leituras(mundo["dsn"])
    for chave, antes in mundo["antes"].items():
        assert depois[chave] == antes, f"{chave} mudou de formato depois da cifra"
    # Sanidade do cenário: B vê a questão bloqueada, A vê o enunciado; o JSON não é vazio.
    tipos_b = {m["tipo"]: m for m in depois["guilda_B"]}
    assert tipos_b["questao"]["conteudo"].get("bloqueada") is True
    assert "enunciado" in {m["tipo"]: m for m in depois["guilda_A"]}["questao"]["conteudo"]
    assert len(depois["guilda_A"]) == 4 and len(depois["social_A"]) == 2 and len(depois["guilda_B_2"]) == 2


def test_responder_questao_igual(mundo) -> None:
    resp = _rpc(mundo["dsn"], A, "SELECT public.guilda_chat_questao_responder(%s, 'x')", (mundo["msg_q"],))
    assert resp == mundo["resp_antes"] == {"correta": True, "tipo": "objetiva"}


def test_dado_gravado_fica_cifrado(mundo) -> None:
    """O backfill cifrou o que havia; o trigger cifra o que chega depois, por qualquer escritor."""
    dsn = mundo["dsn"]
    assert _marcas_em_claro(dsn) == 0
    _conversa(dsn)  # de novo, agora depois do upgrade: as quatro escritoras passam pelo trigger
    assert _marcas_em_claro(dsn) == 0
    with psycopg.connect(dsn, autocommit=True) as c:
        n_g, n_s = c.execute(
            "SELECT (SELECT count(*) FROM public.guilda_mensagens WHERE texto_cifrado IS NOT NULL AND conteudo_cifrado IS NOT NULL),"
            " (SELECT count(*) FROM public.social_mensagens WHERE texto_cifrado IS NOT NULL)"
        ).fetchone()
    assert (n_g, n_s) == (8, 4)
    feed = _rpc(dsn, A, "SELECT public.guilda_chat_listar(%s, 100)", (GUILDA,))
    assert [m["texto"] for m in feed[4:]] == [m["texto"] for m in feed[:4]]
    assert [m["conteudo"] for m in feed[4:]] == [m["conteudo"] for m in feed[:4]]


def test_quem_nao_participa_continua_barrado(mundo) -> None:
    dsn = mundo["dsn"]
    for fora in (C, D):  # C nunca foi membro; D saiu (left_at)
        assert _rpc(dsn, fora, "SELECT public.guilda_chat_listar(%s, 100)", (GUILDA,)) == []
        with pytest.raises(errors.RaiseException, match="guilda_questao_sem_permissao"):
            _rpc(dsn, fora, "SELECT public.guilda_chat_questao_responder(%s, 'x')", (mundo["msg_q"],))
        with pytest.raises(errors.RaiseException, match="guilda_sem_permissao"):
            _rpc(dsn, fora, "SELECT public.guilda_chat_enviar(%s, 'text', 'x', '{}'::jsonb)", (GUILDA,))
    with pytest.raises(errors.RaiseException, match="social_chat_fora_da_turma"):
        _rpc(dsn, E, "SELECT public.social_chat_listar(%s)", (A,))
    # C é da turma, mas a conversa A<->B não é dele: lista com B só traz o que é de C.
    assert _rpc(dsn, C, "SELECT public.social_chat_listar(%s)", (B,)) == []


def test_cliente_nao_le_tabela_nem_chave(mundo) -> None:
    dsn = mundo["dsn"]
    with psycopg.connect(dsn, autocommit=True) as c:
        for papel in ("anon", "authenticated", "service_role"):
            for fn in (
                "chat_chave()",
                "chat_cifrar(text,text)",
                "chat_decifrar(bytea,text)",
                "chat_guilda_mensagens_cifrar()",
                "chat_social_mensagens_cifrar()",
            ):
                assert not c.execute(
                    "SELECT has_function_privilege(%s, %s, 'EXECUTE')", (papel, f"public.{fn}")
                ).fetchone()[0], f"{papel} executa {fn}"
    for papel in ("authenticated", "anon"):
        for sql in (
            "SELECT texto_cifrado FROM public.social_mensagens",
            "SELECT public.chat_chave()",
            "SELECT public.chat_decifrar('\\x00'::bytea, 'x')",
            "SELECT public.chat_cifrar('x', 'x')",
        ):
            with como(dsn, A, papel) as c, pytest.raises(errors.InsufficientPrivilege):
                c.execute(sql)


def test_service_role_escreve_cifrado(mundo) -> None:
    """INSERT direto do `service_role` também sai cifrado (trigger DEFINER).

    O `InsufficientPrivilege` abaixo prova só o REVOKE da `chat_chave()`. Não prova que o
    `service_role` não decifra: no Vault simulado ele não tem acesso a `vault`, mas na produção
    tem, e decifra direto com `pgp_sym_decrypt`.
    """
    dsn = mundo["dsn"]
    with como(dsn, A, "service_role") as c:
        c.execute(
            "INSERT INTO public.social_mensagens(remetente_id,destinatario_id,texto) VALUES (%s,%s,'MARCA-SINTETICA-sr')",
            (C, A),
        )
        assert c.execute("SELECT texto FROM public.social_mensagens WHERE remetente_id=%s", (C,)).fetchone()[0] == ""
        with pytest.raises(errors.InsufficientPrivilege):
            c.execute("SELECT public.chat_chave()")
    assert _marcas_em_claro(dsn) == 0
    assert _rpc(dsn, A, "SELECT public.social_chat_listar(%s)", (C,))[0]["texto"] == "MARCA-SINTETICA-sr"


def test_validacao_de_tamanho_continua(mundo) -> None:
    dsn = mundo["dsn"]
    with psycopg.connect(dsn, autocommit=True) as c:
        with pytest.raises(errors.CheckViolation, match="social_mensagens_texto_check"):
            c.execute(
                "INSERT INTO public.social_mensagens(remetente_id,destinatario_id,texto) VALUES (%s,%s,'   ')", (A, B)
            )
        with pytest.raises(errors.CheckViolation, match="social_mensagens_texto_check"):
            c.execute(
                "INSERT INTO public.social_mensagens(remetente_id,destinatario_id,texto) VALUES (%s,%s,%s)",
                (A, B, "x" * 501),
            )
        with pytest.raises(errors.CheckViolation, match="guilda_mensagens_texto_check"):
            c.execute(
                "INSERT INTO public.guilda_mensagens(guilda_id,classe_id,autor_id,texto) VALUES (%s,1,%s,%s)",
                (GUILDA, A, "x" * 501),
            )
        with pytest.raises(errors.NotNullViolation):
            c.execute(
                "INSERT INTO public.social_mensagens(remetente_id,destinatario_id,texto) VALUES (%s,%s,NULL)", (A, B)
            )
        with pytest.raises(errors.CheckViolation, match="em_claro_vazio"):  # nem o dono grava em claro por fora
            c.execute("ALTER TABLE public.social_mensagens DISABLE TRIGGER social_mensagens_cifrar")
            try:
                c.execute(
                    "INSERT INTO public.social_mensagens(remetente_id,destinatario_id,texto,texto_cifrado) VALUES (%s,%s,'claro','\\x00')",
                    (A, B),
                )
            finally:
                c.execute("ALTER TABLE public.social_mensagens ENABLE TRIGGER social_mensagens_cifrar")
    with pytest.raises(errors.RaiseException, match="social_chat_texto_invalido"):
        _rpc(dsn, A, "SELECT public.social_chat_enviar(%s, '  ')", (B,))


def test_update_do_texto_recifra(mundo) -> None:
    dsn = mundo["dsn"]
    with psycopg.connect(dsn, autocommit=True) as c:
        c.execute("UPDATE public.guilda_mensagens SET texto='MARCA-SINTETICA-editada' WHERE tipo='desafio'")
        c.execute("UPDATE public.guilda_mensagens SET created_at=created_at WHERE tipo='desafio'")  # não mexe na cifra
    assert _marcas_em_claro(dsn) == 0
    feed = _rpc(dsn, A, "SELECT public.guilda_chat_listar(%s, 100)", (GUILDA,))
    desafio = next(m for m in feed if m["tipo"] == "desafio")
    assert desafio["texto"] == "MARCA-SINTETICA-editada"
    assert desafio["conteudo"] == {"desafio_id": "MARCA-SINTETICA-desafio-id"}


def test_listar_so_decifra_o_que_cabe_no_limite(mundo) -> None:
    """Estraga a cifra da mensagem mais antiga: com limite 1 ela não pode ser decifrada."""
    dsn = mundo["dsn"]
    with psycopg.connect(dsn, autocommit=True) as c:
        mais_antiga, cifra = c.execute(
            "SELECT id, texto_cifrado FROM public.guilda_mensagens ORDER BY created_at LIMIT 1"
        ).fetchone()
        c.execute("UPDATE public.guilda_mensagens SET texto_cifrado='\\x00'::bytea WHERE id=%s", (mais_antiga,))
        try:
            with pytest.raises(errors.ExternalRoutineInvocationException):  # a cifra estragada estoura
                _rpc(dsn, A, "SELECT public.guilda_chat_listar(%s, 100)", (GUILDA,))
            feed = _rpc(dsn, A, "SELECT public.guilda_chat_listar(%s, 1)", (GUILDA,))
            assert len(feed) == 1 and feed[0]["id"] != str(mais_antiga)
        finally:
            c.execute("UPDATE public.guilda_mensagens SET texto_cifrado=%s WHERE id=%s", (cifra, mais_antiga))


def test_downgrade_devolve_o_texto_em_claro(mundo) -> None:
    dsn = mundo["dsn"]
    antes = _leituras(dsn)
    _aplica(dsn, M05.DOWNGRADE_SQL)
    assert _leituras(dsn) == antes
    with psycopg.connect(dsn, autocommit=True) as c:
        colunas = c.execute(
            "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND column_name LIKE '%cifrado'"
        ).fetchone()[0]
        funcoes = c.execute("SELECT count(*) FROM pg_proc WHERE proname LIKE 'chat\\_%'").fetchone()[0]
        claro, total = c.execute(
            "SELECT count(*) FILTER (WHERE texto LIKE 'MARCA-SINTETICA%'), count(*) FROM public.social_mensagens"
        ).fetchone()
        check = c.execute(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='social_mensagens_texto_check'"
        ).fetchone()[0]
        md5 = dict(
            c.execute(
                "SELECT proname, md5(prosrc) FROM pg_proc WHERE proname IN"
                " ('guilda_chat_listar','guilda_chat_questao_responder','social_chat_listar')"
            ).fetchall()
        )
    assert (colunas, funcoes) == (0, 0)
    assert claro == total == 5
    assert check == "CHECK (((char_length(btrim(texto)) >= 1) AND (char_length(btrim(texto)) <= 500)))"
    assert md5 == {
        "guilda_chat_listar": "2822b3229b5e63de6ff3cdcea66071fb",
        "guilda_chat_questao_responder": "3c04e17c195d8563a5e7e07315e572ec",
        "social_chat_listar": "f022a529f461420afa4e7602ee0b102d",
    }


def test_sem_chave_no_vault_o_upgrade_aborta_sem_mudar_nada() -> None:
    with _banco(com_chave=False) as dsn:
        _conversa(dsn)
        antes = _leituras(dsn)
        with pytest.raises(errors.RaiseException, match="segredo chat_mensagens_chave ausente no Vault"):
            _aplica(dsn, M05.UPGRADE_SQL)
        assert _leituras(dsn) == antes
        with psycopg.connect(dsn, autocommit=True) as c:
            assert c.execute("SELECT count(*) FROM pg_proc WHERE proname='chat_chave'").fetchone()[0] == 0


def test_pelo_alembic_de_verdade_sobe_e_desce() -> None:
    """O mesmo caminho da subida da API (`alembic upgrade`, online), não o SQL colado.

    Pega o que o psycopg cru não pegaria: `text()` do SQLAlchemy tratando `:nome` como bind,
    `%` dobrado, a trava de migração. O banco começa marcado na `20261022_04`.
    """
    from alembic.config import Config

    from app.db import migrations

    with _banco() as dsn:
        _conversa(dsn)
        antes = _leituras(dsn)
        with psycopg.connect(dsn, autocommit=True) as c:
            c.execute("CREATE TABLE alembic_version (version_num varchar(32) PRIMARY KEY)")
            c.execute("INSERT INTO alembic_version VALUES ('20261022_04')")
        api = Path(__file__).resolve().parents[1]
        config = Config(str(api / "alembic.ini"))
        config.set_main_option("script_location", str(api / "alembic"))
        config.attributes["database_url_override"] = dsn

        migrations.command.upgrade(config, "20261022_05")
        assert _marcas_em_claro(dsn) == 0
        assert _leituras(dsn) == antes
        with psycopg.connect(dsn, autocommit=True) as c:
            assert c.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "20261022_05"
            rowtype = c.execute("SELECT prosrc FROM pg_proc WHERE proname='guilda_chat_questao_responder'").fetchone()[
                0
            ]
        assert "%ROWTYPE" in rowtype and "%%ROWTYPE" not in rowtype

        migrations.command.downgrade(config, "20261022_04")
        assert _leituras(dsn) == antes
        with psycopg.connect(dsn, autocommit=True) as c:
            assert c.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "20261022_04"
            assert c.execute("SELECT count(*) FROM public.social_mensagens WHERE texto = ''").fetchone()[0] == 0


def test_lock_timeout_desiste_em_vez_de_enfileirar() -> None:
    """Com outra transação segurando `social_mensagens`, o upgrade desiste (55P03) e volta."""
    import time

    with _banco() as dsn:
        _conversa(dsn)
        antes = _leituras(dsn)
        with psycopg.connect(dsn) as segura:
            segura.execute("LOCK TABLE public.social_mensagens IN ACCESS SHARE MODE")
            inicio = time.monotonic()
            with pytest.raises(errors.LockNotAvailable):
                _aplica(dsn, M05.UPGRADE_SQL)
            espera = time.monotonic() - inicio
            segura.rollback()
        assert 4 < espera < 15
        assert _leituras(dsn) == antes
        with psycopg.connect(dsn, autocommit=True) as c:
            assert c.execute("SELECT count(*) FROM pg_proc WHERE proname='chat_chave'").fetchone()[0] == 0
