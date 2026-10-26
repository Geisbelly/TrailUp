"""Ponta a ponta da `20261024_10` (bucket `conteudos` privado, #195) num Postgres de verdade.

Mesmo harness da `test_e2e_buckets_privados`: banco descartavel com o
ESQUELETO do schema public da producao, um schema `storage` minimo com RLS e
as politicas que `conteudos` tinha em producao (para conferir que saem). Aplica
02, 03, 07 (`trailup_caminho_arquivo`, fila do worker), 09 e 10 como o
`upgrade()` emite e le `storage.objects` COMO `authenticated`.
Dados sinteticos. Recusa banco hospedado.
"""

from __future__ import annotations

import json
import uuid
from contextlib import contextmanager

import pytest

from app.services import retencao_externa as rx
from tests.test_e2e_buckets_privados import (
    DSN,
    ESQUELETO,
    M09,
    PAPEIS,
    _colunas_obrigatorias_de,
    _dsn_para,
    _modulo,
    _sql_de,
)
from tests.test_e2e_retencao_expurgo import CARIMBO, M02, M03

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

if DSN:
    import psycopg

M07 = _modulo("20261024_07_exclusao_professor_e_aviso_inatividade.py")
M10 = _modulo("20261024_10_bucket_conteudos_privado.py")

DONO_EMAIL = "dono@teste.invalid"
PROF, PROF2, DONO, ALUNO, ALUNO2, OUTRO = (uuid.UUID(int=i) for i in (11, 12, 13, 21, 22, 23))
BASE = "https://exemplo.supabase.invalid"
PUB = f"{BASE}/storage/v1/object/public/conteudos"
GW = f"{BASE}/functions/v1/storage-redirect?path="

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
CREATE SCHEMA net;
CREATE TABLE net.pedidos (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, url text, body jsonb, headers jsonb);
CREATE TABLE net._http_response (id bigint PRIMARY KEY, status_code integer, content_type text,
  headers jsonb, content text, timed_out boolean, error_msg text, created timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{{}}', params jsonb DEFAULT '{{}}',
  headers jsonb DEFAULT '{{}}', timeout_milliseconds integer DEFAULT 5000) RETURNS bigint
LANGUAGE sql AS $$ INSERT INTO net.pedidos (url, body, headers) VALUES (url, body, headers) RETURNING id $$;
CREATE SCHEMA vault;
CREATE TABLE vault.decrypted_secrets (name text PRIMARY KEY, decrypted_secret text);
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean NOT NULL DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id), name text NOT NULL, owner uuid,
  UNIQUE (bucket_id, name));
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage, public, auth TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.buckets TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO authenticated;
INSERT INTO storage.buckets (id, name, public) VALUES
  ('conteudo_aluno', 'conteudo_aluno', true), ('perfil_fotos', 'perfil_fotos', true),
  ('banners_fotos', 'banners_fotos', true), ('conteudos', 'conteudos', true);
"""


def _politicas_de_producao() -> str:
    return "\n".join(
        f'CREATE POLICY "{nome}" ON storage.objects FOR {cmd} TO authenticated {expr};'
        for nome, (cmd, expr) in M10.POLITICAS_ANTIGAS.items()
    )


def _caminhos(t1: int) -> dict[str, str]:
    return {
        "aula": f"{PROF}/{t1}/1_aula.pdf",  # conteudos.conteudo (caminho puro)
        "extra": f"{PROF}/{t1}/2_extra.pptx",  # metadata.files (e a copia da turma 3)
        "midia_ia": f"{PROF}/classes/1/materials/3_v.mp4",  # metadata.media_storage_path
        "video": f"{PROF}/{t1}/4_video.mp4",  # midias.url (URL publica antiga)
        "questao": f"{PROF}/{t1}/5_q.png",  # questoes.midia_url (URL assinada antiga)
        "card": f"{PROF}/{t1}/6_card.png",  # cards.imagem_url (URL publica antiga)
        "fonte_ind": f"{PROF}/fontes/7_ind.pdf",  # fonte individual do professor
        "fonte_turma": f"{PROF}/fontes/8_turma.pdf",  # fonte da turma
        "orfao": f"{PROF}/{t1}/9_orfao.pdf",  # ninguem aponta
        "prof2": f"{PROF2}/x/10_y.pdf",  # pasta do PROF2, sem referencia
    }


def _seed(c) -> dict[str, str]:
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES
  ('{PROF}', 'prof@teste.invalid'), ('{PROF2}', 'prof2@teste.invalid'), ('{DONO}', '{DONO_EMAIL}'),
  ('{ALUNO}', 'aluno@teste.invalid'), ('{ALUNO2}', 'aluno2@teste.invalid'), ('{OUTRO}', 'outro@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{PROF}', 'Prof'), ('{PROF2}', 'Prof2');
INSERT INTO public.alunos (id, nome, email) VALUES
  ('{ALUNO}', 'aluno', 'aluno@teste.invalid'), ('{ALUNO2}', 'aluno2', 'aluno2@teste.invalid'),
  ('{OUTRO}', 'outro', 'outro@teste.invalid');
INSERT INTO public.materia (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Mat');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, '{PROF}', 'Original'), (3, 1, '{PROF2}', 'Duplicada'), (4, 1, '{PROF2}', 'Outra');
INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (1, '{ALUNO}'), (3, '{ALUNO2}'), (4, '{OUTRO}');
"""
    )
    t1 = c.execute("INSERT INTO public.topicos (classe_id, nome) VALUES (1, 'T1') RETURNING id").fetchone()[0]
    t3 = c.execute("INSERT INTO public.topicos (classe_id, nome) VALUES (3, 'T3') RETURNING id").fetchone()[0]
    p = _caminhos(t1)
    cid = c.execute(
        "INSERT INTO public.conteudos (topico_id, titulo, tipo, conteudo, metadata) VALUES (%s, 'Aula', 'arquivo', %s, %s)"
        " RETURNING id",
        (t1, p["aula"], json.dumps({"files": [{"path": f"{PUB}/{p['extra']}", "name": "extra.pptx"}]})),
    ).fetchone()[0]
    c.execute(
        "INSERT INTO public.conteudos (topico_id, titulo, tipo, conteudo, metadata) VALUES (%s, 'IA', 'video', 'roteiro', %s)",
        (t1, json.dumps({"ai_generated_media": True, "media_storage_path": p["midia_ia"]})),
    )
    # Turma duplicada: aponta para o MESMO arquivo da original.
    c.execute(
        "INSERT INTO public.conteudos (topico_id, titulo, tipo, conteudo) VALUES (%s, 'Copia', 'arquivo', %s)",
        (t3, p["extra"]),
    )
    c.execute(
        "INSERT INTO public.midias (conteudo_id, tipo, url) VALUES (%s, 'video', %s)", (cid, f"{PUB}/{p['video']}")
    )
    aid = c.execute(
        "INSERT INTO public.atividades (topico_id, titulo) VALUES (%s, 'Quiz') RETURNING id", (t1,)
    ).fetchone()[0]
    c.execute(
        "INSERT INTO public.questoes (atividade_id, enunciado, midia_url) VALUES (%s, 'Q?', %s)",
        (aid, f"{BASE}/storage/v1/object/sign/conteudos/{p['questao']}?token=abc"),
    )
    c.execute("INSERT INTO public.cards (conteudo_id, imagem_url) VALUES (%s, %s)", (cid, f"{PUB}/{p['card']}"))
    c.execute(
        "INSERT INTO public.fontes_personalizacao (classe_id, professor_id, visibilidade, tipo, storage_path,"
        " arquivo_url, metadata) VALUES"
        " (1, %s, 'individual', 'documento', %s, NULL, '{\"bucket\": \"conteudos\"}'),"
        " (1, %s, 'classe', 'documento', %s, %s, '{\"bucket\": \"conteudos\"}')",
        (str(PROF), p["fonte_ind"], str(PROF), p["fonte_turma"], f"{PUB}/{p['fonte_turma']}"),
    )
    c.execute(
        "INSERT INTO public.conteudo_personalizado (classe_id, materiais) VALUES (1, %s)",
        (json.dumps({"pdf": {"storage_path": p["fonte_turma"], "arquivo_url": f"{PUB}/{p['fonte_turma']}"}}),),
    )
    with c.cursor() as cur:
        cur.executemany(
            "INSERT INTO storage.objects (bucket_id, name) VALUES ('conteudos', %s)", [(v,) for v in p.values()]
        )
    return p


@contextmanager
def _banco():
    nome = f"tu195c_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(_dsn_para(nome), autocommit=True) as c:
            c.execute(PAPEIS)
            c.execute(ESQUELETO.read_text(encoding="utf-8"))
            c.execute(CARIMBO)
            c.execute(DUBLES)
            c.execute(_politicas_de_producao())
            for tabela in (
                "conteudo_personalizado",
                "fontes_personalizacao",
                "professor",
                "classe",
                "conteudos",
                "atividades",
                "questoes",
                "cards",
                "midias",
            ):
                _colunas_obrigatorias_de(c.cursor(), tabela)
            c.execute("GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated")
            for modulo in (M02, M03, M07, M09, M10):
                for sql in _sql_de(modulo, "upgrade"):
                    c.execute(sql)
            yield c, _seed(c)
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


def _visiveis(c, p: dict[str, str], uid: uuid.UUID | None, email: str = "") -> set[str]:
    nomes = {v: k for k, v in p.items()}
    with _como(c, uid, email):
        linhas = c.execute("SELECT name FROM storage.objects WHERE bucket_id = 'conteudos'").fetchall()
    return {nomes[n] for (n,) in linhas}


ALUNO_DA_ORIGINAL = {"aula", "extra", "midia_ia", "video", "questao", "card", "fonte_turma"}


def _confere_leitores(c, p) -> None:
    proprios = set(p) - {"prof2"}
    # professor dono: a propria pasta inteira (inclusive o orfao)
    assert _visiveis(c, p, PROF) == proprios
    # aluno da turma original: tudo o que a turma usa, menos a fonte individual e o orfao
    assert _visiveis(c, p, ALUNO) == ALUNO_DA_ORIGINAL
    # aluno da turma duplicada: so' o arquivo que a copia usa
    assert _visiveis(c, p, ALUNO2) == {"extra"}
    # professor da duplicada: o arquivo compartilhado e a propria pasta
    assert _visiveis(c, p, PROF2) == {"extra", "prof2"}
    # aluno de outra turma, sem sessao: nada
    assert _visiveis(c, p, OUTRO) == set()
    assert _visiveis(c, p, None) == set()
    # dono do app: tudo
    assert _visiveis(c, p, DONO, DONO_EMAIL) == set(p)


def test_quem_le_cada_arquivo_do_professor():
    with _banco() as (c, p):
        _confere_leitores(c, p)


def test_politicas_amplas_saem_e_so_as_novas_ficam():
    with _banco() as (c, _p):
        nomes = {r[0] for r in c.execute("SELECT policyname FROM pg_policies WHERE schemaname = 'storage'")}
        assert nomes == set(M10.POLITICAS_NOVAS) | {
            "trailup_le_arquivos_do_aluno",
            "trailup_sobe_propria_foto",
            "trailup_troca_propria_foto",
            "trailup_apaga_propria_foto",
        }


def test_upload_so_na_pasta_do_proprio_professor():
    with _banco() as (c, p):
        with _como(c, PROF):
            c.execute("INSERT INTO storage.objects (bucket_id, name) VALUES ('conteudos', %s)", (f"{PROF}/1/novo.pdf",))
        for uid, nome in (
            (PROF, f"{PROF2}/1/invasao.pdf"),  # pasta de outro professor
            (PROF, "sem-uuid/x.pdf"),
            (PROF, f"{PROF}"),  # sem pasta
            (ALUNO, f"{ALUNO}/1/x.pdf"),  # aluno nao e' professor
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with _como(c, uid):
                    c.execute("INSERT INTO storage.objects (bucket_id, name) VALUES ('conteudos', %s)", (nome,))
        with _como(c, PROF2):
            # nao troca nem apaga o arquivo do PROF, nem o compartilhado que ele le
            assert (
                c.execute(
                    "UPDATE storage.objects SET owner = %s WHERE bucket_id = 'conteudos' AND name LIKE %s RETURNING 1",
                    (str(PROF2), f"{PROF}/%"),
                ).fetchall()
                == []
            )
            assert (
                c.execute(
                    "DELETE FROM storage.objects WHERE bucket_id = 'conteudos' AND name LIKE %s RETURNING 1",
                    (f"{PROF}/%",),
                ).fetchall()
                == []
            )
        with _como(c, PROF):
            apagadas = c.execute("DELETE FROM storage.objects WHERE bucket_id = 'conteudos' RETURNING name").fetchall()
            assert {n for (n,) in apagadas} == set(p.values()) - {p["prof2"]}


def test_funcoes_so_para_quem_deve():
    with _banco() as (c, _p):
        for fn in (
            "trailup_fechar_buckets_privados()",
            "trailup_reabrir_buckets_publicos(text)",
            "trailup_fechar_bucket_conteudos()",
            "trailup_fechar_buckets_do_aluno()",
            "trailup_reabrir_buckets_do_aluno(text)",
            "trailup_turmas_que_usam_conteudo(text)",
        ):
            for papel in ("authenticated", "anon"):
                assert not c.execute(f"SELECT has_function_privilege('{papel}', 'public.{fn}', 'EXECUTE')").fetchone()[
                    0
                ], (papel, fn)
            assert c.execute(f"SELECT has_function_privilege('service_role', 'public.{fn}', 'EXECUTE')").fetchone()[0]
        assert not c.execute(
            "SELECT has_function_privilege('anon', 'public.trailup_pode_ler_conteudo_professor(text)', 'EXECUTE')"
        ).fetchone()[0]


def test_fechar_reescreve_para_caminho_e_reabrir_mantem():
    with _banco() as (c, p):
        r = c.execute("SELECT public.trailup_fechar_buckets_privados()").fetchone()[0]
        assert r["buckets_fechados"] == 4
        assert r["conteudos_professor"] == {
            "conteudos": 0,
            "metadata": 1,
            "midias": 1,
            "questoes": 1,
            "cards": 1,
            "fontes": 1,
            "conteudos_personalizados": 1,
        }
        assert dict(c.execute("SELECT id, public FROM storage.buckets").fetchall()) == {
            "conteudo_aluno": False,
            "perfil_fotos": False,
            "banners_fotos": False,
            "conteudos": False,
        }
        meta = c.execute("SELECT metadata FROM public.conteudos WHERE titulo = 'Aula'").fetchone()[0]
        assert meta["files"] == [{"path": p["extra"], "name": "extra.pptx"}]
        assert c.execute("SELECT url FROM public.midias").fetchone()[0] == p["video"]
        assert c.execute("SELECT midia_url FROM public.questoes").fetchone()[0] == p["questao"]
        assert c.execute("SELECT imagem_url FROM public.cards").fetchone()[0] == p["card"]
        assert (
            c.execute("SELECT arquivo_url FROM public.fontes_personalizacao WHERE visibilidade = 'classe'").fetchone()[
                0
            ]
            == GW + p["fonte_turma"]
        )
        mat = c.execute("SELECT materiais FROM public.conteudo_personalizado").fetchone()[0]
        assert mat["pdf"]["arquivo_url"] == GW + p["fonte_turma"]
        # a RLS le igual com as referencias ja' em caminho
        _confere_leitores(c, p)
        # idempotente
        r2 = c.execute("SELECT public.trailup_fechar_buckets_privados()").fetchone()[0]
        assert r2["buckets_fechados"] == 0
        assert set(r2["conteudos_professor"].values()) == {0}

        r3 = c.execute("SELECT public.trailup_reabrir_buckets_publicos(%s)", (BASE,)).fetchone()[0]
        assert r3["buckets_reabertos"] == 4
        assert c.execute("SELECT public FROM storage.buckets WHERE id = 'conteudos'").fetchone()[0] is True
        # caminho puro serve com o bucket publico ou privado: fica
        assert c.execute("SELECT url FROM public.midias").fetchone()[0] == p["video"]


def test_ref_de_conteudo_so_mexe_na_url_inteira_do_bucket():
    with _banco() as (c, _p):
        casos = {
            f"{PUB}/a/b.pdf": "a/b.pdf",
            f"{BASE}/storage/v1/object/sign/conteudos/a/b.pdf?token=x#y": "a/b.pdf",
            f"{BASE}/storage/v1/object/authenticated/conteudos/a/b.pdf": "a/b.pdf",
            "a/b.pdf": "a/b.pdf",
            f"veja {PUB}/a/b.pdf aqui": f"veja {PUB}/a/b.pdf aqui",
            f"{BASE}/storage/v1/object/public/conteudo_aluno/a/b.pdf": f"{BASE}/storage/v1/object/public/conteudo_aluno/a/b.pdf",
            f"{GW}a/b.pdf": f"{GW}a/b.pdf",
            f"{PUB}/": f"{PUB}/",
        }
        for entrada, esperado in casos.items():
            assert c.execute("SELECT public.trailup_ref_de_conteudo(%s)", (entrada,)).fetchone()[0] == esperado


def test_worker_e_ainda_em_uso_com_referencia_em_caminho():
    with _banco() as (c, p):
        c.execute("SELECT public.trailup_fechar_buckets_privados()")
        # (O esqueleto so tem tabelas: a view do gateway entra vazia.)
        c.execute("CREATE VIEW public.vw_material_storage_paths AS SELECT NULL::text AS storage_path WHERE false")
        material = str(rx.AINDA_USADO_SQL["material"]).replace(":caminho", "%(caminho)s")

        def usado(chave: str) -> bool:
            return c.execute(material, {"caminho": p[chave]}).fetchone()[0]

        for chave in ("aula", "extra", "midia_ia", "video", "questao", "card", "fonte_turma"):
            assert usado(chave) is True, chave
        assert usado("orfao") is False

        # Apaga a turma original: os arquivos dela vao para a fila, ja' em caminho.
        c.execute("SELECT public.trailup_apagar_turma_inteira(1)")
        fila = set(c.execute("SELECT caminho FROM public.retencao_fila_externa WHERE destino = 'storage'").fetchall())
        for chave in ("aula", "extra", "video", "questao", "card", "fonte_turma", "fonte_ind"):
            assert (p[chave],) in fila, chave
        # A copia da turma 3 ainda usa `extra`: o worker nao apaga. Os outros, sim.
        assert usado("extra") is True
        for chave in ("aula", "video", "questao", "card"):
            assert usado(chave) is False, chave
        # E o aluno da duplicada segue lendo o arquivo compartilhado.
        assert _visiveis(c, p, ALUNO2) == {"extra"}
        assert _visiveis(c, p, ALUNO) == set()


def test_downgrade_volta_as_politicas_e_as_funcoes_da_09():
    with _banco() as (c, _p):
        for sql in _sql_de(M10, "downgrade"):
            c.execute(sql)
        nomes = {r[0] for r in c.execute("SELECT policyname FROM pg_policies WHERE schemaname = 'storage'")}
        assert nomes == set(M10.POLITICAS_ANTIGAS) | {
            "trailup_le_arquivos_do_aluno",
            "trailup_sobe_propria_foto",
            "trailup_troca_propria_foto",
            "trailup_apaga_propria_foto",
        }
        r = c.execute("SELECT public.trailup_fechar_buckets_privados()").fetchone()[0]
        assert set(r) == {"buckets_fechados", "fotos", "banners", "conteudos_personalizados"}
        assert c.execute("SELECT public FROM storage.buckets WHERE id = 'conteudos'").fetchone()[0] is True
        assert (
            c.execute("SELECT to_regprocedure('public.trailup_pode_ler_conteudo_professor(text)')").fetchone()[0]
            is None
        )
        # e a 09 inteira desce depois
        for sql in _sql_de(M09, "downgrade"):
            c.execute(sql)
