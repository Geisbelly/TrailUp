"""`20261105_28` num Postgres descartável: o dono cadastra, edita, troca a imagem e remove; ninguém mais."""

from __future__ import annotations

import json
import os

import pytest
from sqlalchemy import text

from tests.test_e2e_administracao_no_banco import OUTRO, como, voltar  # noqa: F401
from tests.test_e2e_administracao_no_banco import c as _c_base  # noqa: F401
from tests.test_e2e_monitor_disponibilidade import ALUNO, DONO, EMAIL_DONO, _modulo, banco  # noqa: F401

M = _modulo("20261105_28_molduras_com_imagem.py")
exige_docker = pytest.mark.skipif(os.environ.get("TRAILUP_TEST_DOCKER") != "1", reason="requer TRAILUP_TEST_DOCKER=1 e Docker")

URL = "https://x.supabase.co/storage/v1/object/public/molduras/nova-1.webp"
OUTRA_URL = "https://x.supabase.co/storage/v1/object/public/molduras/nova-2.webp"
ABERTURA = json.dumps({"x": 128, "y": 128, "radius": 90})
GRAVAR = "SELECT public.admin_moldura_gravar(%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)"

ESTRUTURA = """
ALTER TABLE public.conquistas ADD COLUMN classe_id bigint, ADD COLUMN ativa boolean NOT NULL DEFAULT true;
INSERT INTO public.conquistas (id, nome) VALUES (1, 'Sistema'), (2, 'Outra');
INSERT INTO public.conquistas (id, nome, classe_id) VALUES (3, 'Da turma', 7);
ALTER TABLE public.molduras ADD COLUMN atualizado_em timestamptz,
  ADD CONSTRAINT molduras_preco_so_na_loja CHECK ((origem = 'loja' AND preco BETWEEN 1 AND 1000) OR (origem <> 'loja' AND preco IS NULL));
ALTER TABLE public.molduras_acoes ADD COLUMN atualizado_em timestamptz;
CREATE FUNCTION public.economia_auditar(p_op text, p_ent text, p_id text, p_classe bigint, p_aluno uuid, p_antes jsonb, p_depois jsonb)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO public.economia_auditoria (operacao, entidade, entidade_id, antes, depois) VALUES (p_op, p_ent, p_id, p_antes, p_depois)
$f$;
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO authenticated;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;
"""


class _Coletor:
    def __init__(self) -> None:
        self.sql: list[str] = []

    def execute(self, sql: str) -> None:
        self.sql.append(sql)


def _sql_de(funcao: str) -> list[str]:
    coletor = _Coletor()
    original = M.op
    M.op = coletor
    try:
        getattr(M, funcao)()
    finally:
        M.op = original
    return coletor.sql


@pytest.fixture
def c(_c_base):  # noqa: F811
    _c_base.execute(ESTRUTURA)
    for sql in _sql_de("upgrade"):
        _c_base.execute(sql)
    return _c_base


def _gravar(c, nova=True, codigo="nova", nome="Nova", origem="loja", preco=10, conquista=None, ativa=True, url=URL, abertura=ABERTURA):
    return c.execute(GRAVAR, (nova, codigo, nome, origem, preco, conquista, ativa, url, abertura)).fetchone()[0]


def test_nenhum_bloco_vira_bind() -> None:
    for sql in _sql_de("upgrade") + _sql_de("downgrade"):
        assert text(sql).compile().params == {}


CHAMADAS = [
    (GRAVAR, (True, "nova", "Nova", "loja", 10, None, True, URL, ABERTURA)),
    ("SELECT public.admin_moldura_remover('ouro')", ()),
]


@exige_docker
@pytest.mark.parametrize(("sql", "args"), CHAMADAS)
def test_so_o_dono_grava(c, sql, args) -> None:
    import psycopg

    como(c, OUTRO, "prof@example.test")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute(sql, args)
    voltar(c)
    c.execute("SET ROLE anon")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute(sql, args)
    voltar(c)


@exige_docker
def test_cadastra_com_imagem_e_audita(c) -> None:
    como(c, DONO, EMAIL_DONO)
    _gravar(c)
    dados = c.execute("SELECT public.admin_molduras()").fetchone()[0]
    voltar(c)
    nova = next(m for m in dados["molduras"] if m["codigo"] == "nova")
    assert (nova["imagem_url"], nova["abertura"]["radius"], nova["preco"], nova["ordem"]) == (URL, 90, 10, 2)
    assert [x["nome"] for x in dados["conquistas"]] == ["Outra", "Sistema"]
    ator = c.execute("SELECT depois ->> 'ator' FROM public.economia_auditoria WHERE entidade_id = 'nova'").fetchone()[0]
    assert ator == EMAIL_DONO


@exige_docker
@pytest.mark.parametrize(
    "campos",
    [
        {"url": None, "abertura": None},
        {"url": "https://evil.example/x.png"},
        {"url": "https://x.supabase.co/storage/v1/object/public/perfil_fotos/x.png"},
        {"abertura": json.dumps({"x": 10, "y": 128, "radius": 90})},
        {"abertura": json.dumps({"x": "a", "y": 128, "radius": 90})},
        {"preco": 0},
        {"nome": "  "},
        {"origem": "doacao"},
        {"origem": "conquista", "preco": None, "conquista": 3},
        {"codigo": "Com Espaco"},
    ],
)
def test_recusa_o_que_nao_serve(c, campos) -> None:
    import psycopg

    como(c, DONO, EMAIL_DONO)
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        _gravar(c, **campos)
    voltar(c)


@exige_docker
def test_codigo_e_conquista_nao_repetem(c) -> None:
    import psycopg

    como(c, DONO, EMAIL_DONO)
    with pytest.raises(psycopg.errors.UniqueViolation):
        _gravar(c, codigo="ouro")
    _gravar(c, codigo="um", origem="conquista", preco=None, conquista=1)
    with pytest.raises(psycopg.errors.UniqueViolation):
        _gravar(c, codigo="dois", origem="conquista", preco=None, conquista=1)
    _gravar(c, nova=False, codigo="um", origem="conquista", preco=None, conquista=1, url=None, abertura=None)
    voltar(c)


@exige_docker
def test_trocar_a_imagem_devolve_a_anterior_e_editar_nome_mantem(c) -> None:
    como(c, DONO, EMAIL_DONO)
    _gravar(c)
    assert _gravar(c, nova=False, nome="Renomeada", url=None, abertura=None)["imagem_anterior"] is None
    resposta = _gravar(c, nova=False, nome="Renomeada", url=OUTRA_URL)
    voltar(c)
    assert resposta["imagem_anterior"] == URL
    assert c.execute("SELECT nome, imagem_url FROM public.molduras WHERE codigo = 'nova'").fetchone() == ("Renomeada", OUTRA_URL)


@exige_docker
def test_moldura_do_pacote_recebe_imagem_sem_mudar_o_resto(c) -> None:
    como(c, DONO, EMAIL_DONO)
    _gravar(c, nova=False, codigo="ouro", nome="Ouro", url=OUTRA_URL)
    voltar(c)
    assert c.execute("SELECT imagem_url FROM public.molduras WHERE codigo = 'ouro'").fetchone()[0] == OUTRA_URL


@exige_docker
def test_rara_que_muda_de_origem_solta_a_acao(c) -> None:
    c.execute("UPDATE public.molduras SET origem = 'acao', preco = NULL WHERE codigo = 'ouro'")
    como(c, DONO, EMAIL_DONO)
    _gravar(c, nova=False, codigo="ouro", nome="Ouro", origem="loja", preco=5, url=None, abertura=None)
    voltar(c)
    assert c.execute("SELECT moldura_codigo FROM public.molduras_acoes WHERE acao = 'perfil'").fetchone()[0] is None


@exige_docker
def test_remover_recusa_moldura_com_dono(c) -> None:
    import psycopg

    c.execute("INSERT INTO public.moldura_aluno (moldura_codigo) VALUES ('ouro'), ('ouro')")
    como(c, DONO, EMAIL_DONO)
    with pytest.raises(psycopg.errors.ForeignKeyViolation, match="2 aluno"):
        c.execute("SELECT public.admin_moldura_remover('ouro')")
    voltar(c)
    assert c.execute("SELECT count(*) FROM public.molduras WHERE codigo = 'ouro'").fetchone()[0] == 1


@exige_docker
def test_remover_sem_dono_devolve_o_arquivo_e_audita(c) -> None:
    import psycopg

    como(c, DONO, EMAIL_DONO)
    _gravar(c)
    assert c.execute("SELECT public.admin_moldura_remover('nova')").fetchone()[0]["imagem_anterior"] == URL
    with pytest.raises(psycopg.errors.NoDataFound):
        c.execute("SELECT public.admin_moldura_remover('nova')")
    voltar(c)
    assert c.execute(
        "SELECT depois ->> 'removida' FROM public.economia_auditoria WHERE entidade_id = 'nova' ORDER BY id DESC LIMIT 1"
    ).fetchone()[0] == "true"


@exige_docker
def test_so_o_dono_sobe_arquivo_e_o_bucket_e_publico(c) -> None:
    import psycopg

    assert c.execute("SELECT public, file_size_limit FROM storage.buckets WHERE id = 'molduras'").fetchone() == (True, M.LIMITE_BYTES)
    como(c, OUTRO, "prof@example.test")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("INSERT INTO storage.objects VALUES ('molduras', 'x.webp')")
    voltar(c)
    como(c, DONO, EMAIL_DONO)
    c.execute("INSERT INTO storage.objects VALUES ('molduras', 'x.webp')")
    assert c.execute("DELETE FROM storage.objects WHERE name = 'x.webp'").rowcount == 1
    voltar(c)


@exige_docker
def test_sem_schema_de_storage_a_migration_passa_e_downgrade_limpa(c) -> None:
    for sql in _sql_de("downgrade"):
        c.execute(sql)
    c.execute("DROP SCHEMA storage CASCADE")
    for sql in _sql_de("upgrade"):
        c.execute(sql)
    assert c.execute("SELECT count(*) FROM public.molduras WHERE imagem_url IS NOT NULL").fetchone()[0] == 0
