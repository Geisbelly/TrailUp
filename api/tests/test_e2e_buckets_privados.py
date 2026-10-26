"""Ponta a ponta da `20261024_09` (buckets privados, #195) num Postgres de verdade.

Roda so com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres
LOCAL. Cada teste cria um banco descartavel com o ESQUELETO do schema public
da producao e um schema `storage` minimo (so `buckets` e `objects`, como o
Supabase os tem, com RLS ligado), aplica a migration como o `upgrade()` emite
e confere as politicas lendo `storage.objects` COMO `authenticated`.
Dados sinteticos. Recusa banco hospedado.
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

DSN = os.environ.get("TRAILUP_E2E_RETENCAO_DATABASE_URL") or os.environ.get(
    "TRAILUP_E2E_CONSENTIMENTO_DATABASE_URL", ""
)

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

if DSN:
    import psycopg

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e dos buckets recusa banco hospedado: use um Postgres local")

AQUI = Path(__file__).resolve().parent
VERSOES = AQUI.parent / "alembic" / "versions"
ESQUELETO = AQUI / "fixtures" / "schema_prod_esqueleto_20261024.sql"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"e2e_bkt_{arquivo[:11]}", VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M09 = _modulo("20261024_09_buckets_privados.py")


class _Coletor:
    def __init__(self) -> None:
        self.sql: list[str] = []

    def execute(self, sql: str) -> None:
        self.sql.append(sql)


def _sql_de(modulo, fn: str) -> list[str]:
    coletor = _Coletor()
    original = modulo.op
    modulo.op = coletor
    try:
        getattr(modulo, fn)()
    finally:
        modulo.op = original
    return coletor.sql


DONO_EMAIL = "dono@teste.invalid"
PROF, PROF2, DONO, ALUNO, COLEGA, OUTRO = (uuid.UUID(int=i) for i in (11, 12, 13, 21, 22, 23))
BASE = "https://exemplo.supabase.invalid"

PAPEIS = """
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $r$;
"""

# O que o esqueleto (so public) nao traz: auth.jwt, app_e_dono (20261013_02)
# e o schema storage do Supabase, reduzido ao que as politicas usam. As
# politicas antigas entram para conferir que saem.
DUBLES = f"""
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{{}}')::jsonb $$;
CREATE OR REPLACE FUNCTION public.app_e_dono() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $f$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) <> ''
     AND lower(coalesce(auth.jwt() ->> 'email', '')) =
         lower(coalesce((SELECT valor FROM public.app_config WHERE chave = 'dono_email'), ''));
$f$;
INSERT INTO public.app_config (chave, valor) VALUES ('dono_email', '{DONO_EMAIL}');
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean NOT NULL DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id), name text NOT NULL, owner uuid,
  UNIQUE (bucket_id, name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage, public, auth TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.buckets TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO authenticated;
INSERT INTO storage.buckets (id, name, public) VALUES
  ('conteudo_aluno', 'conteudo_aluno', true), ('perfil_fotos', 'perfil_fotos', true),
  ('banners_fotos', 'banners_fotos', true), ('conteudos', 'conteudos', true);
CREATE POLICY "authenticated_le_conteudo_aluno_storage" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'conteudo_aluno');
CREATE POLICY "upload perfil_fotos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'perfil_fotos');
CREATE POLICY "update perfil_fotos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'perfil_fotos');
CREATE POLICY "upload banners_fotos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'banners_fotos');
CREATE POLICY "update banners_fotos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'banners_fotos');
"""

OBJETOS = {
    # material da turma 1 (prof PROF; ALUNO e COLEGA matriculados)
    "mat1": ("conteudo_aluno", "brainhex/mastermind/classe-1/topico-1/conteudo-1/deck.html"),
    # material da turma 3 (prof PROF2; ninguem daqui)
    "mat3": ("conteudo_aluno", "brainhex/seeker/classe-3/topico-9/apresentacao/a.html"),
    # fonte individual do ALUNO e fonte da turma, ambas na turma 1
    "fonte_ind": ("conteudo_aluno", "fontes/classe-1/topico-1/conteudo-1/aaa-ind.pdf"),
    "fonte_turma": ("conteudo_aluno", "fontes/classe-1/topico-1/conteudo-1/bbb-turma.pdf"),
    # avatar do chefe na pasta do ALUNO
    "boss": ("conteudo_aluno", f"{ALUNO}/boss/topico-1/content-1/c.png"),
    # caminho solto na raiz (placeholder)
    "raiz": ("conteudo_aluno", ".emptyFolderPlaceholder"),
    # foto do ALUNO no formato velho e no novo; banner do OUTRO (sem turma comum)
    "foto_velha": ("perfil_fotos", f"{ALUNO}-1700000000000.app/blob"),
    "foto_nova": ("perfil_fotos", f"{ALUNO}/1700000000001.jpg"),
    "banner_outro": ("banners_fotos", f"{OUTRO}/1700000000002.png"),
}


def _seed() -> str:
    objetos = ",".join(f"('{b}', '{n}')" for b, n in OBJETOS.values())
    return f"""
INSERT INTO auth.users (id, email) VALUES
  ('{PROF}', 'prof@teste.invalid'), ('{PROF2}', 'prof2@teste.invalid'), ('{DONO}', '{DONO_EMAIL}'),
  ('{ALUNO}', 'aluno@teste.invalid'), ('{COLEGA}', 'colega@teste.invalid'), ('{OUTRO}', 'outro@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{PROF}', 'Prof'), ('{PROF2}', 'Prof2');
INSERT INTO public.alunos (id, nome, email, foto_url, banner_url) VALUES
  ('{ALUNO}', 'aluno', 'aluno@teste.invalid',
   '{BASE}/storage/v1/object/public/perfil_fotos/{ALUNO}-1700000000000.app/blob',
   '{BASE}/storage/v1/object/public/banners_fotos/{ALUNO}-1700000000003.jpg?t=1'),
  ('{COLEGA}', 'colega', 'colega@teste.invalid', 'perfil_fotos/{COLEGA}/1.jpg', NULL),
  ('{OUTRO}', 'outro', 'outro@teste.invalid', 'https://cdn.exemplo.invalid/avatar.png', NULL);
INSERT INTO public.materia (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Mat');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, '{PROF}', 'A'), (3, 1, '{PROF2}', 'C'), (4, 1, '{PROF2}', 'D');
INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES
  (1, '{ALUNO}'), (1, '{COLEGA}'), (4, '{OUTRO}');
INSERT INTO public.fontes_personalizacao (classe_id, aluno_id, visibilidade, tipo, storage_path) VALUES
  (1, '{ALUNO}', 'individual', 'documento', '{OBJETOS["fonte_ind"][1]}'),
  (1, NULL, 'classe', 'documento', '{OBJETOS["fonte_turma"][1]}');
INSERT INTO public.conteudo_personalizado (classe_id, materiais)
SELECT 1, jsonb_build_object(
  'markdown', jsonb_build_object(
     'storage_path', 'brainhex/mastermind/classe-1/topico-1/markdown/m.md',
     'arquivo_url', '{BASE}/storage/v1/object/public/conteudo_aluno/brainhex/mastermind/classe-1/topico-1/markdown/m.md'),
  'pdf', jsonb_build_object(
     'storage_path', 'brainhex/mastermind/classe-1/topico-1/pdf/p.pdf',
     'arquivo_url', '{BASE}/functions/v1/storage-redirect?path=brainhex/mastermind/classe-1/topico-1/pdf/p.pdf',
     'partes', jsonb_build_array(jsonb_build_object(
        'storage_path', 'brainhex/mastermind/classe-1/topico-1/pdf/p1.pdf',
        'arquivo_url', '{BASE}/storage/v1/object/public/conteudo_aluno/brainhex/mastermind/classe-1/topico-1/pdf/p1.pdf'))));
INSERT INTO storage.objects (bucket_id, name) VALUES {objetos};
"""


def _dsn_para(banco: str) -> str:
    return urlunsplit(urlsplit(DSN)._replace(path=f"/{banco}"))


def _colunas_obrigatorias_de(c, tabela: str) -> None:
    """O esqueleto pode exigir colunas NOT NULL sem default; afrouxa so' no banco descartavel."""
    c.execute(
        """
        SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = %s AND is_nullable = 'NO'
           AND column_default IS NULL AND is_identity = 'NO'
           AND column_name NOT IN (
             SELECT a.attname FROM pg_index i
               JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
              WHERE i.indrelid = format('public.%%I', %s::text)::regclass AND i.indisprimary)
        """,
        (tabela, tabela),
    )
    for (coluna,) in c.fetchall():
        c.execute(f'ALTER TABLE public."{tabela}" ALTER COLUMN "{coluna}" DROP NOT NULL')


@contextmanager
def _banco():
    nome = f"tu195b_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(_dsn_para(nome), autocommit=True) as c:
            c.execute(PAPEIS)
            c.execute(ESQUELETO.read_text(encoding="utf-8"))
            c.execute(DUBLES)
            for tabela in ("conteudo_personalizado", "fontes_personalizacao", "professor", "classe"):
                _colunas_obrigatorias_de(c.cursor(), tabela)
            c.execute("GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated")
            for sql in _sql_de(M09, "upgrade"):
                c.execute(sql)
            c.execute(_seed())
            yield c
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


@contextmanager
def _como(c, uid: uuid.UUID | None, email: str = ""):
    c.execute("BEGIN")
    try:
        c.execute("SELECT set_config('request.jwt.claim.sub', %s, true)", (str(uid) if uid else "",))
        c.execute("SELECT set_config('request.jwt.claims', %s, true)", (json.dumps({"email": email}),))
        c.execute("SET LOCAL ROLE authenticated")
        yield
    finally:
        c.execute("ROLLBACK")


def _visiveis(c, uid: uuid.UUID | None, email: str = "") -> set[str]:
    nomes = {(b, n): k for k, (b, n) in OBJETOS.items()}
    with _como(c, uid, email):
        linhas = c.execute("SELECT bucket_id, name FROM storage.objects").fetchall()
    return {nomes[(b, n)] for b, n in linhas}


def test_quem_le_cada_objeto():
    with _banco() as c:
        assert _visiveis(c, ALUNO) == {"mat1", "fonte_ind", "fonte_turma", "boss", "foto_velha", "foto_nova"}
        # colega da turma 1: material e fonte da turma, foto do ALUNO; nao a fonte individual nem o chefe
        assert _visiveis(c, COLEGA) == {"mat1", "fonte_turma", "foto_velha", "foto_nova"}
        # professor da turma 1: tudo da turma 1 (inclusive a fonte individual) e a foto do aluno dele
        assert _visiveis(c, PROF) == {"mat1", "fonte_ind", "fonte_turma", "foto_velha", "foto_nova"}
        # professor das turmas 3 e 4: o material da 3 e o banner do OUTRO (aluno da 4)
        assert _visiveis(c, PROF2) == {"mat3", "banner_outro"}
        # OUTRO nao divide turma com ninguem daqui: so' o proprio banner
        assert _visiveis(c, OUTRO) == {"banner_outro"}
        # dono do app: tudo
        assert _visiveis(c, DONO, DONO_EMAIL) == set(OBJETOS)
        # sem sessao: nada
        assert _visiveis(c, None) == set()


def test_politicas_amplas_saem_e_so_as_novas_ficam():
    with _banco() as c:
        nomes = {r[0] for r in c.execute("SELECT policyname FROM pg_policies WHERE schemaname = 'storage'")}
        assert nomes == {
            "trailup_le_arquivos_do_aluno",
            "trailup_sobe_propria_foto",
            "trailup_troca_propria_foto",
            "trailup_apaga_propria_foto",
        }


def test_upload_de_foto_so_no_proprio_prefixo():
    with _banco() as c:
        for nome in (f"{ALUNO}/1800000000000.jpg", f"{ALUNO}-1800000000000.jpg"):
            with _como(c, ALUNO):
                c.execute("INSERT INTO storage.objects (bucket_id, name) VALUES ('perfil_fotos', %s)", (nome,))
        for bucket, nome in (
            ("perfil_fotos", f"{COLEGA}/1800000000000.jpg"),
            ("banners_fotos", "sem-uuid.jpg"),
            ("conteudo_aluno", f"{ALUNO}/x.png"),
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with _como(c, ALUNO):
                    c.execute("INSERT INTO storage.objects (bucket_id, name) VALUES (%s, %s)", (bucket, nome))
        # nao troca nem apaga a foto do outro (o UPDATE/DELETE simplesmente nao acha a linha)
        with _como(c, COLEGA):
            assert (
                c.execute(
                    "UPDATE storage.objects SET owner = %s WHERE bucket_id = 'perfil_fotos' RETURNING 1", (str(COLEGA),)
                ).fetchall()
                == []
            )
            assert (
                c.execute("DELETE FROM storage.objects WHERE bucket_id = 'perfil_fotos' RETURNING 1").fetchall() == []
            )
        with _como(c, ALUNO):
            apagadas = c.execute(
                "DELETE FROM storage.objects WHERE bucket_id = 'perfil_fotos' RETURNING name"
            ).fetchall()
            assert len(apagadas) == 2


def test_funcoes_de_fechamento_so_para_o_servico():
    with _banco() as c:
        for fn in ("trailup_fechar_buckets_privados()", "trailup_reabrir_buckets_publicos(text)"):
            assert not c.execute(
                f"SELECT has_function_privilege('authenticated', 'public.{fn}', 'EXECUTE')"
            ).fetchone()[0]
            assert not c.execute(f"SELECT has_function_privilege('anon', 'public.{fn}', 'EXECUTE')").fetchone()[0]
            assert c.execute(f"SELECT has_function_privilege('service_role', 'public.{fn}', 'EXECUTE')").fetchone()[0]
        assert not c.execute(
            "SELECT has_function_privilege('anon', 'public.trailup_pode_ler_arquivo(text,text)', 'EXECUTE')"
        ).fetchone()[0]


def test_fechar_reescreve_urls_e_reabrir_desfaz():
    with _banco() as c:
        r = c.execute("SELECT public.trailup_fechar_buckets_privados()").fetchone()[0]
        assert r == {"buckets_fechados": 3, "fotos": 1, "banners": 1, "conteudos_personalizados": 1}
        buckets = dict(c.execute("SELECT id, public FROM storage.buckets").fetchall())
        assert buckets == {"conteudo_aluno": False, "perfil_fotos": False, "banners_fotos": False, "conteudos": True}
        limites = c.execute(
            "SELECT file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'perfil_fotos'"
        ).fetchone()
        assert limites == (5 * 1024 * 1024, ["image/*"])
        fotos = dict(
            (str(i), (f, b)) for i, f, b in c.execute("SELECT id, foto_url, banner_url FROM public.alunos").fetchall()
        )
        assert fotos[str(ALUNO)] == (
            f"perfil_fotos/{ALUNO}-1700000000000.app/blob",
            f"banners_fotos/{ALUNO}-1700000000003.jpg",
        )
        assert fotos[str(COLEGA)] == (f"perfil_fotos/{COLEGA}/1.jpg", None)
        assert fotos[str(OUTRO)] == ("https://cdn.exemplo.invalid/avatar.png", None)
        mat = c.execute("SELECT materiais FROM public.conteudo_personalizado").fetchone()[0]
        gw = f"{BASE}/functions/v1/storage-redirect?path="
        assert mat["markdown"]["arquivo_url"] == gw + "brainhex/mastermind/classe-1/topico-1/markdown/m.md"
        assert mat["pdf"]["arquivo_url"] == gw + "brainhex/mastermind/classe-1/topico-1/pdf/p.pdf"
        assert mat["pdf"]["partes"][0]["arquivo_url"] == gw + "brainhex/mastermind/classe-1/topico-1/pdf/p1.pdf"
        # idempotente
        r2 = c.execute("SELECT public.trailup_fechar_buckets_privados()").fetchone()[0]
        assert r2 == {"buckets_fechados": 0, "fotos": 0, "banners": 0, "conteudos_personalizados": 0}

        r3 = c.execute("SELECT public.trailup_reabrir_buckets_publicos(%s)", (BASE + "/",)).fetchone()[0]
        assert r3 == {"buckets_reabertos": 3, "alunos_com_url_publica": 2}
        foto = c.execute("SELECT foto_url FROM public.alunos WHERE id = %s", (str(ALUNO),)).fetchone()[0]
        assert foto == f"{BASE}/storage/v1/object/public/perfil_fotos/{ALUNO}-1700000000000.app/blob"


def test_downgrade_volta_as_politicas_amplas():
    with _banco() as c:
        for sql in _sql_de(M09, "downgrade"):
            c.execute(sql)
        nomes = {r[0] for r in c.execute("SELECT policyname FROM pg_policies WHERE schemaname = 'storage'")}
        assert nomes == set(M09.POLITICAS_ANTIGAS)
        assert c.execute("SELECT to_regprocedure('public.trailup_pode_ler_arquivo(text,text)')").fetchone()[0] is None
