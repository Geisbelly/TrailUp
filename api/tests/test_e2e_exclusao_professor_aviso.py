"""Ponta a ponta da `20261024_07` (#195) num Postgres LOCAL.

Exclusao da conta de professor (as turmas dele somem, com tudo o que depende
delas) e aviso
de conta inativa por e-mail (pg_net + Brevo, aqui com dubles de `net` e
`vault`: nada sai da maquina). Mesmo esqueleto e mesmas regras do
`test_e2e_retencao_expurgo.py`: roda so com `TRAILUP_E2E_RETENCAO_DATABASE_URL`,
recusa banco hospedado, dados sinteticos.
"""

from __future__ import annotations

import json
import re
import uuid
from contextlib import contextmanager

import pytest

from app.services import retencao_externa as rx
from tests.test_e2e_retencao_expurgo import (
    CARIMBO,
    DSN,
    ESQUELETO,
    M02,
    M03,
    PAPEIS,
    _dsn_para,
    _modulo,
    _sql_de,
)

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

if DSN:
    import psycopg

M07 = _modulo("20261024_07_exclusao_professor_e_aviso_inatividade.py")

DONO_EMAIL = "dono@teste.invalid"
PROF, PROF2, DONO, ALUNO, INATIVO = (uuid.UUID(int=i) for i in (11, 12, 13, 21, 22))

# O que o esqueleto (so tabelas) nao traz: auth.jwt, app_e_dono (20261013_02),
# e dubles de pg_net e do Vault que so registram o pedido.
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
"""


@contextmanager
def _banco():
    nome = f"tu195p_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(_dsn_para(nome), autocommit=True) as c:
            c.execute(PAPEIS)
            c.execute(ESQUELETO.read_text(encoding="utf-8"))
            c.execute(CARIMBO)
            c.execute(DUBLES)
            for modulo in (M02, M03, M07):
                for sql in _sql_de(modulo, "upgrade"):
                    c.execute(sql)
            c.execute(_seed())
            yield c
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _seed() -> str:
    return f"""
INSERT INTO auth.users (id, email, created_at, last_sign_in_at) VALUES
  ('{PROF}', 'prof@teste.invalid', now(), now()),
  ('{PROF2}', 'prof2@teste.invalid', now(), now()),
  ('{DONO}', '{DONO_EMAIL}', now(), now()),
  ('{ALUNO}', 'aluno@teste.invalid', now(), now()),
  ('{INATIVO}', 'inativo@teste.invalid', now() - interval '900 days', now() - interval '800 days');
INSERT INTO public.professor (id, nome, descricao, instituicao, disciplina, liberado) VALUES
  ('{PROF}', 'Prof Um', 'bio', 'Escola', 'Mat', true),
  ('{PROF2}', 'Prof Dois', NULL, 'Escola', 'Hist', true),
  ('{DONO}', 'Dono', NULL, 'Escola', NULL, true);
INSERT INTO public.alunos (id, nome, email) VALUES
  ('{ALUNO}', 'aluno', 'aluno@teste.invalid'),
  ('{INATIVO}', 'inativo', 'inativo@teste.invalid'),
  ('{PROF}', 'Prof Um', 'prof@teste.invalid');
INSERT INTO public.materia (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Matematica');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, '{PROF}', 'Turma A'), (2, 1, '{PROF}', 'Turma B'), (3, 1, '{PROF2}', 'Turma C');
INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (1, '{ALUNO}'), (2, '{ALUNO}'), (3, '{ALUNO}');
INSERT INTO public.topicos (classe_id, nome) VALUES (1, 'Fracoes'), (2, 'Equacoes');
"""


def _um(c, sql: str):
    return c.execute(sql).fetchone()[0]


def _como(c, uid: uuid.UUID | None, email: str = "") -> None:
    c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (str(uid) if uid else "",))
    c.execute("SELECT set_config('request.jwt.claims', %s, false)", (json.dumps({"email": email}),))


# --- semeadura generica da turma ---------------------------------------------
#
# Para conferir a exclusao de forma exaustiva, o teste semeia UMA linha em cada
# tabela do esquema que depende da turma: as que tem coluna de ligacao
# (classe_id, topico_id, ...; com ou sem FK) e as que descendem de `classe`
# pelas FKs. Colunas NOT NULL sem default recebem um valor do tipo; FK NOT
# NULL aponta para a linha da turma 1 (ou a primeira linha da tabela-mae).
# Varias passadas: a filha entra depois da mae.

LIGACAO = ("classe_id", "topico_id", "conteudo_id", "atividade_id", "questao_id")
POR_COLUNA = {
    "classe_id": "public.classe",
    "topico_id": "public.topicos",
    "conteudo_id": "public.conteudos",
    "atividade_id": "public.atividades",
    "questao_id": "public.questoes",
    "aluno_id": "public.alunos",
    "professor_id": "public.professor",
}
# O que fica por regra (dado do aluno fora da turma) ou e da maquinaria da retencao.
FORA_DA_TURMA = re.compile(r"^(consentimento_|retencao_|exclusao_conta_|aluno_perfil|alunos$|professor$|classe$)")

ALVOS_SQL = """
WITH RECURSIVE desce(tabela) AS (
  SELECT 'public.classe'::regclass
  UNION
  SELECT c.conrelid::regclass FROM pg_constraint c JOIN desce d ON c.confrelid = d.tabela
   WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
)
SELECT DISTINCT k.relname
  FROM pg_class k
 WHERE k.relnamespace = 'public'::regnamespace AND k.relkind = 'r'
   AND (k.oid IN (SELECT tabela FROM desce)
        OR EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = k.oid AND a.attnum > 0
                     AND NOT a.attisdropped AND a.attname = ANY (%s)))
 ORDER BY 1
"""

COLUNAS_SQL = """
SELECT a.attname, a.attnotnull AND NOT a.atthasdef AND a.attidentity = '' AND a.attgenerated = '' AS obrigatoria,
       t.typcategory, t.typname, format_type(a.atttypid, a.atttypmod),
       (SELECT f.confrelid::regclass::text FROM pg_constraint f
         WHERE f.conrelid = a.attrelid AND f.contype = 'f' AND f.conkey = ARRAY[a.attnum]::int2[] LIMIT 1),
       (SELECT fa.attname FROM pg_constraint f JOIN pg_attribute fa
            ON fa.attrelid = f.confrelid AND fa.attnum = f.confkey[1]
         WHERE f.conrelid = a.attrelid AND f.contype = 'f' AND f.conkey = ARRAY[a.attnum]::int2[] LIMIT 1),
       (SELECT e.enumlabel FROM pg_enum e WHERE e.enumtypid = a.atttypid ORDER BY e.enumsortorder LIMIT 1),
       a.attidentity <> '' OR a.attgenerated <> ''
  FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
 WHERE a.attrelid = %s::regclass AND a.attnum > 0 AND NOT a.attisdropped
 ORDER BY a.attnum
"""


def _valor_do_tipo(cat: str, typname: str, tipo: str, enum: str | None):
    if enum is not None:
        return enum
    if typname in ("json", "jsonb"):
        return "{}"
    if typname == "uuid":
        return str(uuid.uuid4())
    if typname == "bytea":
        return b"x"
    if cat == "A":
        return "{}"
    return {"S": "x", "N": 1, "B": False, "D": "2026-10-01", "T": "1 day"}.get(cat)


def _inserir(
    c, tabela: str, escolha: dict[str, object], fixos: dict[str, object] | None = None, profundidade: int = 0
) -> bool:
    fixos = fixos or {}
    nomes, valores = [], []
    for nome, obrigatoria, cat, typname, tipo, ref, refcol, enum, gerada in c.execute(
        COLUNAS_SQL, (f"public.{tabela}",)
    ).fetchall():
        if gerada:
            continue
        ref = None if ref is None else ref if "." in ref else f"public.{ref}"
        por_nome = POR_COLUNA.get(nome)
        if nome in fixos:
            valor = fixos[nome]
        elif ref is not None and ref in escolha and (obrigatoria or nome in POR_COLUNA):
            valor = escolha[ref]
        elif ref is None and por_nome in escolha:
            # Coluna de ligacao SEM FK: e justamente a que poderia ficar orfa.
            valor = escolha[por_nome]
        elif not obrigatoria:
            continue
        elif ref is not None:
            valor = c.execute(f"SELECT {refcol}::text FROM {ref} LIMIT 1").fetchone()
            if valor is None and ref.startswith("public.") and ref != f"public.{tabela}" and profundidade < 3:
                # Catalogo vazio (loja_itens, tipos de rank...): semeia a mae antes.
                _inserir(c, ref.removeprefix("public."), escolha, profundidade=profundidade + 1)
                valor = c.execute(f"SELECT {refcol}::text FROM {ref} LIMIT 1").fetchone()
            if valor is None:
                return False
            valor = valor[0]
        else:
            valor = _valor_do_tipo(cat, typname, tipo, enum)
            if valor is None:
                return False
        nomes.append(f'"{nome}"')
        valores.append(valor)
    sql = f"INSERT INTO public.{tabela} ({', '.join(nomes)}) VALUES ({', '.join(['%s'] * len(nomes))})"
    try:
        with c.transaction():
            c.execute(sql, valores)
    except psycopg.Error:
        return False
    return True


def _semear_turma_1(c) -> dict[str, int]:
    """Uma linha por tabela dependente da turma 1. Devolve {tabela: linhas}."""
    t1 = _um(c, "SELECT id FROM public.topicos WHERE classe_id = 1")
    escolha: dict[str, object] = {
        "public.classe": 1,
        "public.topicos": t1,
        "public.alunos": str(ALUNO),
        "auth.users": str(ALUNO),
        "public.professor": str(PROF),
    }
    for tabela, ref, fixos in (
        ("conteudos", "public.conteudos", {"topico_id": t1}),
        ("atividades", "public.atividades", {"topico_id": t1}),
    ):
        assert _inserir(c, tabela, escolha, fixos), tabela
        escolha[ref] = _um(c, f"SELECT max(id) FROM public.{tabela}")
    assert _inserir(c, "questoes", escolha, {"atividade_id": escolha["public.atividades"]})
    escolha["public.questoes"] = _um(c, "SELECT max(id) FROM public.questoes")

    alvos = [r[0] for r in c.execute(ALVOS_SQL, (list(LIGACAO),)) if not FORA_DA_TURMA.match(r[0])]
    feitas = {"conteudos", "atividades", "questoes", "topicos", "classe_aluno"}
    for _ in range(8):
        novas = [t for t in alvos if t not in feitas and _inserir(c, t, escolha)]
        if not novas:
            break
        feitas.update(novas)
        for t in novas:
            # A primeira linha de cada mae vira a escolha das filhas.
            escolha.setdefault(f"public.{t}", c.execute(_id_sql(c, t)).fetchone()[0])
    return {t: _um(c, f"SELECT count(*) FROM public.{t}") for t in sorted(feitas)}


def _id_sql(c, tabela: str) -> str:
    pk = c.execute(
        "SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]"
        " WHERE i.indrelid = %s::regclass AND i.indisprimary AND i.indnkeyatts = 1",
        (f"public.{tabela}",),
    ).fetchone()
    return f"SELECT {pk[0]}::text FROM public.{tabela} LIMIT 1" if pk else "SELECT NULL"


def _ids_da_turma(c, classes: tuple[int, ...]) -> dict[str, list[int]]:
    lista = ",".join(map(str, classes))
    return {
        "classe_id": list(classes),
        "topico_id": [r[0] for r in c.execute(f"SELECT id FROM public.topicos WHERE classe_id IN ({lista})")],
        "conteudo_id": [
            r[0]
            for r in c.execute(
                f"SELECT c.id FROM public.conteudos c JOIN public.topicos t ON t.id = c.topico_id"
                f" WHERE t.classe_id IN ({lista})"
            )
        ],
        "atividade_id": [
            r[0]
            for r in c.execute(
                f"SELECT a.id FROM public.atividades a JOIN public.topicos t ON t.id = a.topico_id"
                f" WHERE t.classe_id IN ({lista})"
            )
        ],
        "questao_id": [
            r[0]
            for r in c.execute(
                f"SELECT q.id FROM public.questoes q JOIN public.atividades a ON a.id = q.atividade_id"
                f" JOIN public.topicos t ON t.id = a.topico_id WHERE t.classe_id IN ({lista})"
            )
        ],
    }


def _sobras(c, ids: dict[str, list[int]]) -> list[str]:
    """Linhas em QUALQUER tabela publica que ainda citam a turma apagada."""
    sobras = []
    for tabela, coluna in c.execute(
        "SELECT a.attrelid::regclass::text, a.attname FROM pg_attribute a JOIN pg_class k ON k.oid = a.attrelid"
        " WHERE k.relnamespace = 'public'::regnamespace AND k.relkind = 'r' AND a.attnum > 0"
        " AND NOT a.attisdropped AND a.attname = ANY (%s) AND format_type(a.atttypid, a.atttypmod) IN"
        " ('bigint', 'integer')",
        (list(LIGACAO),),
    ).fetchall():
        if tabela in ("classe", "public.classe") or not ids[coluna]:
            continue
        n = _um(c, f"SELECT count(*) FROM {tabela} WHERE {coluna} = ANY (ARRAY{ids[coluna]}::bigint[])")
        if n:
            sobras.append(f"{tabela}.{coluna}={n}")
    return sobras


# --- exclusao de professor -------------------------------------------------


def test_professor_exclui_a_conta_e_as_turmas_somem_com_tudo() -> None:
    with _banco() as c:
        semeadas = _semear_turma_1(c)
        # Prova de que a semeadura cobre o que importa (notas, respostas, entregas,
        # mochila, moedas, guilda, saidas, telemetria, material personalizado...).
        for t in (
            "atividade_aluno", "questao_aluno", "conteudo_aluno", "topico_aluno", "bag_itens", "moedas_ledger",
            "eventos_aluno", "guildas", "guilda_convites", "classe_aluno_saidas", "telemetria_eventos_app",
            "telemetria_agregado_turma_dia", "conteudo_personalizado", "cards_personalizados",
            "fontes_personalizacao", "ia_decision_logs", "trilha_modelo", "missoes", "conquistas",
        ):  # fmt: skip
            assert semeadas.get(t, 0) >= 1, f"semeadura nao alcancou {t}"
        ids = _ids_da_turma(c, (1, 2))
        assert len(semeadas) >= 80, sorted(semeadas)
        _como(c, PROF, "prof@teste.invalid")
        r = _um(c, "SELECT public.fn_excluir_minha_conta_professor()")
        assert r == {"ok": True, "turmas_apagadas": 2, "alunos_afetados": 1}
        _como(c, None)
        # Dado pessoal do professor saiu agora (professor e o perfil de aluno dele).
        assert _um(c, f"SELECT count(*) FROM public.professor WHERE id = '{PROF}'") == 0
        assert _um(c, f"SELECT count(*) FROM public.alunos WHERE id = '{PROF}'") == 0
        # As turmas dele sumiram, e nada no banco cita mais a turma.
        assert [r[0] for r in c.execute("SELECT id FROM public.classe ORDER BY id")] == [3]
        assert _sobras(c, ids) == []
        restantes = {t: _um(c, f"SELECT count(*) FROM public.{t}") for t in semeadas}
        # O que ficou e da turma 3 (outro professor): so a matricula e o topico dela.
        assert {t: n for t, n in restantes.items() if n} == {"classe_aluno": 1}, restantes
        # O aluno continua, com a outra turma.
        assert _um(c, f"SELECT count(*) FROM public.alunos WHERE id = '{ALUNO}'") == 1
        assert c.execute("SELECT classe_id FROM public.classe_aluno").fetchall() == [(3,)]
        # Usuario do Auth vai para a fila do worker, com o motivo.
        fila = c.execute(
            "SELECT caminho, ref ->> 'motivo' FROM public.retencao_fila_externa WHERE destino = 'auth_user'"
        ).fetchall()
        assert fila == [(str(PROF), "exclusao_professor")]
        assert c.execute(
            f"SELECT turmas_apagadas, alunos_afetados FROM public.exclusao_conta_professor WHERE professor_id = '{PROF}'"
        ).fetchone() == (2, 1)
        # E o que o worker faz (API admin) nao esbarra em FK.
        c.execute(f"DELETE FROM auth.users WHERE id = '{PROF}'")
        assert _um(c, "SELECT count(*) FROM public.classe") == 1


def test_dado_do_aluno_fora_da_turma_fica() -> None:
    with _banco() as c:
        c.execute(
            f"""
            INSERT INTO public.perfil (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Conquistador');
            INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) VALUES ('{ALUNO}', 1, 0.8);
            INSERT INTO public.consentimento_telemetria (aluno_id, versao, status, decidido_em)
              VALUES ('{ALUNO}', 'v1', 'accepted', now());
            INSERT INTO public.consentimento_pesquisa (aluno_id, versao, status, decidido_em)
              VALUES ('{ALUNO}', 'v1', 'accepted', now());
            """
        )
        antes = c.execute(
            "SELECT (SELECT count(*) FROM public.aluno_perfil), (SELECT count(*) FROM public.consentimento_telemetria),"
            " (SELECT count(*) FROM public.consentimento_pesquisa), (SELECT count(*) FROM public.alunos)"
        ).fetchone()
        _como(c, PROF, "prof@teste.invalid")
        c.execute("SELECT public.fn_excluir_minha_conta_professor()")
        _como(c, None)
        depois = c.execute(
            "SELECT (SELECT count(*) FROM public.aluno_perfil), (SELECT count(*) FROM public.consentimento_telemetria),"
            " (SELECT count(*) FROM public.consentimento_pesquisa), (SELECT count(*) FROM public.alunos)"
        ).fetchone()
        # So o perfil de aluno do proprio professor sai.
        assert depois == (antes[0], antes[1], antes[2], antes[3] - 1)


def test_arquivos_da_turma_vao_para_a_fila_do_worker() -> None:
    with _banco() as c:
        t1 = _um(c, "SELECT id FROM public.topicos WHERE classe_id = 1")
        t3 = _um(c, "INSERT INTO public.topicos (classe_id, nome) VALUES (3, 'Outra') RETURNING id")
        cid = _um(
            c,
            f"INSERT INTO public.conteudos (topico_id, titulo, tipo, conteudo, metadata) VALUES ({t1}, 'Aula', 'arquivo',"
            f" '{PROF}/{t1}/aula.pdf',"
            f' \'{{"files": [{{"path": "{PROF}/{t1}/extra.pptx"}}]}}\') RETURNING id',
        )
        # Copia (turma duplicada de outro professor) aponta para o mesmo arquivo.
        c.execute(
            f"INSERT INTO public.conteudos (topico_id, titulo, tipo, conteudo) VALUES ({t3}, 'Copia', 'arquivo',"
            f" '{PROF}/{t1}/extra.pptx')"
        )
        c.execute(
            f"INSERT INTO public.midias (conteudo_id, tipo, url) VALUES ({cid}, 'video',"
            f" 'https://proj.supabase.co/storage/v1/object/public/conteudos/{PROF}/{t1}/video.mp4')"
        )
        c.execute(
            f"INSERT INTO public.conteudo_personalizado (ciclo_id, conteudo_id, classe_id, topico_id, materiais)"
            f' VALUES (\'c1\', {cid}, 1, {t1}, \'{{"audio": {{"storage_path": "gerado/a.mp3",'
            f' "partes": [{{"storage_path": "gerado/a1.mp3"}}]}}}}\')'
        )
        _como(c, PROF, "prof@teste.invalid")
        c.execute("SELECT public.fn_excluir_minha_conta_professor()")
        _como(c, None)
        fila = set(
            c.execute(
                "SELECT destino, bucket, caminho FROM public.retencao_fila_externa WHERE destino IN ('storage', 'r2')"
            ).fetchall()
        )
        for caminho in ("aula.pdf", "extra.pptx", "video.mp4"):
            assert ("storage", "conteudos", f"{PROF}/{t1}/{caminho}") in fila
            assert ("r2", "", f"{PROF}/{t1}/{caminho}") in fila
        for caminho in ("gerado/a.mp3", "gerado/a1.mp3"):
            assert ("storage", "conteudo_aluno", caminho) in fila
            assert ("r2", "", caminho) in fila
        # O worker confere antes de apagar: o arquivo ainda usado pela copia fica.
        # (O esqueleto so tem tabelas: a view do gateway entra vazia.)
        c.execute("CREATE VIEW public.vw_material_storage_paths AS SELECT NULL::text AS storage_path WHERE false")
        material = str(rx.AINDA_USADO_SQL["material"]).replace(":caminho", "%(caminho)s")
        assert _um_p(c, material, {"caminho": f"{PROF}/{t1}/extra.pptx"}) is True
        assert _um_p(c, material, {"caminho": f"{PROF}/{t1}/aula.pdf"}) is False


def _um_p(c, sql: str, params: dict):
    return c.execute(sql, params).fetchone()[0]


def test_quem_nao_e_professor_e_o_dono_sao_recusados() -> None:
    with _banco() as c:
        for uid, email in ((None, ""), (ALUNO, "aluno@teste.invalid"), (DONO, DONO_EMAIL)):
            _como(c, uid, email)
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute("SELECT public.fn_excluir_minha_conta_professor()")
        _como(c, None)
        assert _um(c, "SELECT count(*) FROM public.professor") == 3
        assert _um(c, "SELECT count(*) FROM public.classe") == 3
        assert _um(c, "SELECT count(*) FROM public.retencao_fila_externa") == 0


def test_apagar_o_usuario_do_auth_tambem_apaga_as_turmas() -> None:
    # Caminho sem a RPC (dono pelo painel, cascata do Auth): o gatilho apaga igual.
    with _banco() as c:
        c.execute("INSERT INTO public.topicos (classe_id, nome) VALUES (3, 'Historia')")
        c.execute(f"DELETE FROM auth.users WHERE id = '{PROF2}'")
        assert [r[0] for r in c.execute("SELECT id FROM public.classe ORDER BY id")] == [1, 2]
        assert _um(c, "SELECT count(*) FROM public.classe_aluno WHERE classe_id = 3") == 0
        assert _um(c, "SELECT count(*) FROM public.topicos WHERE classe_id = 3") == 0
        # Cascata nao e "saida" do aluno: nada fica retido.
        assert _um(c, "SELECT count(*) FROM public.classe_aluno_saidas") == 0
        assert _um(c, f"SELECT count(*) FROM public.alunos WHERE id = '{ALUNO}'") == 1


def test_apagar_so_a_linha_do_professor_tambem_apaga_as_turmas() -> None:
    with _banco() as c:
        _semear_turma_1(c)
        ids = _ids_da_turma(c, (1, 2))
        c.execute(f"DELETE FROM public.professor WHERE id = '{PROF}'")
        assert [r[0] for r in c.execute("SELECT id FROM public.classe")] == [3]
        assert _sobras(c, ids) == []


def test_funcoes_expostas_so_para_authenticated() -> None:
    with _banco() as c:
        fn = "public.fn_excluir_minha_conta_professor()"
        assert _um(c, f"SELECT has_function_privilege('authenticated', '{fn}', 'EXECUTE')")
        assert not _um(c, f"SELECT has_function_privilege('anon', '{fn}', 'EXECUTE')")
        for fn in (
            "public.retencao_avisos_email(boolean)",
            "public.trailup_retencao(boolean)",
            "public.trailup_apagar_turma_inteira(bigint)",
            "public.trg_professor_removido_apaga_turmas()",
        ):
            assert not _um(c, f"SELECT has_function_privilege('authenticated', '{fn}', 'EXECUTE')")
        for antiga in ("turmas_sem_professor()", "professores_para_turma()", "fn_reatribuir_turma(bigint, uuid)"):
            assert _um(c, f"SELECT to_regprocedure('public.{antiga}')") is None
        assert (
            _um(
                c,
                "SELECT count(*) FROM information_schema.columns WHERE table_name = 'classe'"
                " AND column_name = 'professor_removido_em'",
            )
            == 0
        )
        assert _um(c, "SELECT confdeltype FROM pg_constraint WHERE conname = 'classe_professor_id_fkey'") == "c"
        assert not _um(c, "SELECT has_table_privilege('authenticated', 'public.exclusao_conta_professor', 'SELECT')")


# --- aviso de conta inativa por e-mail ---------------------------------------


def _aplicar(c) -> None:
    c.execute("UPDATE public.app_config SET valor = 'aplicar' WHERE chave = 'retencao_modo'")


def _chave(c) -> None:
    c.execute("INSERT INTO vault.decrypted_secrets VALUES ('brevo_api_key', 'chave-de-teste')")


def _aviso(c, coluna: str = "*"):
    return c.execute(f"SELECT {coluna} FROM public.retencao_avisos_inatividade WHERE aluno_id = '{INATIVO}'").fetchone()


def test_simular_relata_quem_seria_avisado_sem_enviar() -> None:
    with _banco() as c:
        _chave(c)
        r = _um(c, "SELECT public.trailup_retencao()")
        contas = r["contas_inativas"]
        assert r["modo"] == "simular"
        assert contas["avisos"] == 1 and contas["avisaria"] == [str(INATIVO)]
        assert contas["email"]["modo"] == "simular"
        assert _um(c, "SELECT count(*) FROM public.retencao_avisos_inatividade") == 0
        assert _um(c, "SELECT count(*) FROM net.pedidos") == 0
        assert _um(c, "SELECT count(*) FROM public.notificacoes") == 0


def test_aviso_sai_por_email_e_o_prazo_conta_da_entrega() -> None:
    with _banco() as c:
        _aplicar(c)
        _chave(c)
        r = _um(c, "SELECT public.trailup_retencao()")
        assert r["contas_inativas"]["email"]["enviados"] == 1
        pedido = c.execute("SELECT url, body, headers FROM net.pedidos").fetchone()
        assert pedido[0] == "https://api.brevo.com/v3/smtp/email"
        assert pedido[1]["to"] == [{"email": "inativo@teste.invalid"}]
        assert pedido[1]["sender"]["email"] == DONO_EMAIL
        assert "https://trailup.vercel.app" in pedido[1]["textContent"]
        assert "menos de 18 anos" in pedido[1]["textContent"]
        assert pedido[2]["api-key"] == "chave-de-teste"
        assert _um(c, "SELECT count(*) FROM public.notificacoes") == 1
        # Ainda sem resposta da Brevo: nada de exclusao, nem com o prazo vencido.
        c.execute("UPDATE public.retencao_avisos_inatividade SET avisado_em = now() - interval '40 days'")
        r = _um(c, "SELECT public.trailup_retencao()")
        assert r["contas_inativas"]["exclusoes"] == 0
        assert r["contas_inativas"]["retidas_sem_email"] == 1
        # Brevo aceitou (2xx): o envio e confirmado e o prazo comeca dali.
        req = _aviso(c, "email_request_id")[0]
        c.execute(f"INSERT INTO net._http_response (id, status_code) VALUES ({req}, 201)")
        r = _um(c, "SELECT public.retencao_avisos_email()")
        assert r["confirmados"] == 1
        assert _aviso(c, "email_enviado_em IS NOT NULL, email_request_id")[0:2] == (True, None)
        assert _um(c, "SELECT public.trailup_retencao()")["contas_inativas"]["exclusoes"] == 0
        c.execute("UPDATE public.retencao_avisos_inatividade SET email_enviado_em = now() - interval '31 days'")
        r = _um(c, "SELECT public.trailup_retencao()")
        assert r["contas_inativas"]["exclusoes"] == 1
        assert c.execute(
            "SELECT caminho, ref ->> 'motivo' FROM public.retencao_fila_externa WHERE destino = 'auth_user'"
        ).fetchall() == [(str(INATIVO), "conta_inativa")]
        # So um e-mail no total.
        assert _um(c, "SELECT count(*) FROM net.pedidos") == 1


def test_falha_da_brevo_volta_para_a_fila_sem_apagar() -> None:
    with _banco() as c:
        _aplicar(c)
        _chave(c)
        c.execute("SELECT public.trailup_retencao()")
        req = _aviso(c, "email_request_id")[0]
        c.execute(f"INSERT INTO net._http_response (id, status_code, error_msg) VALUES ({req}, 500, 'erro')")
        r = _um(c, "SELECT public.retencao_avisos_email()")
        assert r["falhas"] == 1 and r["enviados"] == 0
        erro, proxima, tentativas = _aviso(c, "email_ultimo_erro, email_proxima_tentativa_em > now(), email_tentativas")
        assert erro.startswith("HTTP 500") and proxima and tentativas == 1
        # Na hora da nova tentativa, reenvia.
        c.execute("UPDATE public.retencao_avisos_inatividade SET email_proxima_tentativa_em = now()")
        assert _um(c, "SELECT public.retencao_avisos_email()")["enviados"] == 1
        assert _um(c, "SELECT count(*) FROM net.pedidos") == 2


def test_sem_chave_ou_sem_email_nao_envia_nem_apaga() -> None:
    with _banco() as c:
        _aplicar(c)
        c.execute("SELECT public.trailup_retencao()")
        assert _aviso(c, "email_ultimo_erro")[0] == "segredo brevo_api_key ausente no Vault"
        assert _um(c, "SELECT count(*) FROM net.pedidos") == 0

        _chave(c)
        c.execute(f"UPDATE auth.users SET email = NULL WHERE id = '{INATIVO}'")
        c.execute(f"UPDATE public.alunos SET email = '' WHERE id = '{INATIVO}'")
        c.execute("UPDATE public.retencao_avisos_inatividade SET email_proxima_tentativa_em = now()")
        r = _um(c, "SELECT public.retencao_avisos_email()")
        assert r["sem_email"] == 1 and r["enviados"] == 0
        assert _aviso(c, "email_ultimo_erro")[0] == "sem_email"
        c.execute("UPDATE public.retencao_avisos_inatividade SET avisado_em = now() - interval '400 days'")
        assert _um(c, "SELECT public.trailup_retencao()")["contas_inativas"]["exclusoes"] == 0
        assert _um(c, "SELECT count(*) FROM public.retencao_fila_externa WHERE destino = 'auth_user'") == 0


def test_voltar_a_entrar_cancela_o_prazo() -> None:
    with _banco() as c:
        _aplicar(c)
        _chave(c)
        c.execute("SELECT public.trailup_retencao()")
        req = _aviso(c, "email_request_id")[0]
        c.execute(f"INSERT INTO net._http_response (id, status_code) VALUES ({req}, 201)")
        c.execute("SELECT public.retencao_avisos_email()")
        c.execute(f"UPDATE auth.users SET last_sign_in_at = now() WHERE id = '{INATIVO}'")
        r = _um(c, "SELECT public.trailup_retencao()")
        assert r["contas_inativas"]["voltaram"] == 1
        assert _aviso(c) is None
        assert _um(c, "SELECT count(*) FROM public.retencao_fila_externa WHERE destino = 'auth_user'") == 0


def test_downgrade_volta_ao_job_da_03() -> None:
    with _banco() as c:
        for sql in _sql_de(M07, "downgrade"):
            c.execute(sql)
        assert _um(c, "SELECT to_regprocedure('public.retencao_avisos_email(boolean)')") is None
        assert _um(c, "SELECT to_regclass('public.exclusao_conta_professor')") is None
        assert _um(c, "SELECT to_regprocedure('public.trailup_apagar_turma_inteira(bigint)')") is None
        assert _um(c, "SELECT confdeltype FROM pg_constraint WHERE conname = 'classe_professor_id_fkey'") == "a"
        r = _um(c, "SELECT public.trailup_retencao()")
        assert "email" not in r["contas_inativas"]
