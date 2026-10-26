"""Ponta a ponta da `20261024_03` (retencao e expurgo, #195) num Postgres de verdade.

Roda so com `TRAILUP_E2E_RETENCAO_DATABASE_URL` (ou o DSN do e2e do
consentimento) apontando para um Postgres LOCAL onde o usuario pode
`CREATE DATABASE`. Cada teste cria um banco descartavel com o ESQUELETO do
schema public da producao (`fixtures/schema_prod_esqueleto_20261024.sql`: so
estrutura, nenhuma linha), aplica a `20261024_02` e a `20261024_03` como o
`upgrade()` emite e confere o job. Recusa banco hospedado. Dados sinteticos.
"""

from __future__ import annotations

import importlib.util
import os
import re
import uuid
from contextlib import contextmanager
from datetime import date
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
        raise RuntimeError("e2e da retencao recusa banco hospedado: use um Postgres local")

AQUI = Path(__file__).resolve().parent
VERSOES = AQUI.parent / "alembic" / "versions"
ESQUELETO = AQUI / "fixtures" / "schema_prod_esqueleto_20261024.sql"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"e2e_ret_{arquivo[:11]}", VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M02 = _modulo("20261024_02_consentimento_do_responsavel.py")
M03 = _modulo("20261024_03_retencao_e_expurgo.py")


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


PAPEIS = """
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $r$;
"""

# Da 20261003_10, que o esqueleto (so tabelas) nao traz.
CARIMBO = """
CREATE OR REPLACE FUNCTION public.trg_consentimento_carimbo_do_servidor() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN NEW.registrado_em := now(); RETURN NEW; END; $f$;
"""

PESQ, COMUM, INATIVO, PROF = (uuid.UUID(int=i) for i in (1, 2, 3, 9))
HOJE = date.today()


def _dsn_para(banco: str) -> str:
    return urlunsplit(urlsplit(DSN)._replace(path=f"/{banco}"))


@contextmanager
def _banco():
    nome = f"tu195r_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(_dsn_para(nome), autocommit=True) as c:
            c.execute(PAPEIS)
            c.execute(ESQUELETO.read_text(encoding="utf-8"))
            c.execute(CARIMBO)
            for sql in _sql_de(M02, "upgrade"):
                c.execute(sql)
            for sql in _sql_de(M03, "upgrade"):
                c.execute(sql)
            c.execute(_seed())
            yield c
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _seed() -> str:
    alunos = [(PESQ, "pesq"), (COMUM, "comum"), (INATIVO, "inativo")]
    usuarios = ",".join(f"('{u}', '{n}@teste.invalid', now() - interval '1 day', now())" for u, n in alunos)
    return f"""
INSERT INTO auth.users (id, email, created_at, last_sign_in_at) VALUES {usuarios},
  ('{PROF}', 'prof@teste.invalid', now(), now());
UPDATE auth.users SET created_at = now() - interval '900 days', last_sign_in_at = now() - interval '800 days'
 WHERE id = '{INATIVO}';
INSERT INTO public.alunos (id, nome, email)
SELECT id, split_part(email, '@', 1), email FROM auth.users WHERE id <> '{PROF}';
INSERT INTO public.professor (id) VALUES ('{PROF}');
INSERT INTO public.classe (id, professor_id) OVERRIDING SYSTEM VALUE VALUES (1, '{PROF}');
INSERT INTO public.classe_aluno (classe_id, aluno_id)
VALUES (1, '{PESQ}'), (1, '{COMUM}'), (1, '{INATIVO}');
-- PESQ: adulto com aceite de pesquisa vigente.
INSERT INTO public.aluno_nascimento (aluno_id, data_nascimento, registrado_por)
VALUES ('{PESQ}', DATE '{HOJE.year - 30}-01-15', '{PESQ}'), ('{COMUM}', DATE '{HOJE.year - 30}-01-15', '{COMUM}');
INSERT INTO public.consentimento_pesquisa (aluno_id, versao, status, decidido_em)
VALUES ('{PESQ}', '{M02.VERSAO_PESQUISA}', 'accepted', now());
"""


def _telemetria(c, aluno: uuid.UUID, dias: int) -> uuid.UUID:
    """Uma sessao, um lote com ponteiro no R2, um evento e uma metrica de `dias` atras."""
    sessao, lote = uuid.uuid4(), uuid.uuid4()
    quando = f"now() - interval '{dias} days'"
    c.execute(
        f"""
INSERT INTO public.telemetria_sessoes (id, aluno_id, classe_id, started_at, created_at)
VALUES ('{sessao}', '{aluno}', 1, {quando}, {quando});
INSERT INTO public.telemetria_lotes (id, sessao_id, aluno_id, classe_id, screen_name, route_name,
  flush_reason, captured_at, study_elapsed_sec, screen_dwell_sec, active_sec, idle_sec, touch_count,
  scroll_distance_px, max_depth_px, payload, created_at)
VALUES ('{lote}', '{sessao}', '{aluno}', 1, 's', 'r', 'f', {quando}, 1, 1, 1, 0, 3, 0, 0,
  jsonb_build_object('_r2', 'telemetria/lotes/{lote}.json', '_bucket', 'b'), {quando});
INSERT INTO public.telemetria_eventos_app (client_event_id, sessao_id, aluno_id, classe_id,
  event_group, event_name, occurred_at, payload, created_at)
VALUES ('e1', '{sessao}', '{aluno}', 1, 'g', 'n', {quando},
  jsonb_build_object('_r2', 'telemetria/eventos/{sessao}.json', '_bucket', 'b', '_i', 0), {quando}),
       ('e2', '{sessao}', '{aluno}', 1, 'g', 'n', {quando},
  jsonb_build_object('_r2', 'telemetria/eventos/{sessao}.json', '_bucket', 'b', '_i', 1), {quando});
INSERT INTO public.telemetria_time_metric_entries (lote_id, sessao_id, aluno_id, classe_id, topico_id,
  scope, visits, dwell_sec, active_sec, idle_sec, touch_count, captured_at, created_at, entry_key)
VALUES ('{lote}', '{sessao}', '{aluno}', 1, 7, 'topico', 1, 60, 50, 10, 4, {quando}, {quando}, 'k');
"""
    )
    return sessao


def _um(c, sql: str):
    return c.execute(sql).fetchone()[0]


def _linhas(resultado: dict, tabela: str, acao: str) -> int:
    for item in resultado["tabelas"]:
        if item["tabela"] == tabela and item["acao"] == acao:
            assert "erro" not in item, item
            return item["linhas"]
    raise AssertionError(f"{tabela}/{acao} fora do resultado")


def test_portao_vivo_toda_tabela_com_pessoa_tem_politica() -> None:
    from tests.test_retencao_politica import COLUNA_DE_PESSOA, _isentas

    with _banco() as c:
        colunas = c.execute(
            """
            SELECT c.table_name, c.column_name
              FROM information_schema.columns c
              JOIN information_schema.tables t
                ON t.table_schema = c.table_schema AND t.table_name = c.table_name
             WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
            """
        ).fetchall()
        registradas = {r[0] for r in c.execute("SELECT tabela FROM public.retencao_politica")}
        existentes = {r[0] for r in c.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'")}
    com_pessoa = {t for t, col in colunas if COLUNA_DE_PESSOA.match(col)}
    assert not sorted(com_pessoa - registradas - set(_isentas()))
    # Politica apontando para tabela que nao existe e erro de digitacao.
    assert not sorted(registradas - existentes)


def test_fk_para_pessoa_nao_bloqueia_exclusao() -> None:
    with _banco() as c:
        bloqueiam = {
            (r[0], r[1])
            for r in c.execute(
                """
                SELECT conrelid::regclass::text, conname
                  FROM pg_constraint
                 WHERE contype = 'f' AND confdeltype IN ('a', 'r')
                   AND confrelid IN ('public.alunos'::regclass, 'auth.users'::regclass)
                """
            )
        }
        nao_validadas = c.execute(
            "SELECT count(*) FROM pg_constraint WHERE contype='f' AND NOT convalidated"
        ).fetchone()[0]
    # So o professor fica bloqueado de proposito (ver PR): turma sem dono quebra o console.
    assert bloqueiam == {("professor", "professor_id_fkey")}
    assert nao_validadas == 0


def test_simular_nao_apaga_e_registra() -> None:
    with _banco() as c:
        _telemetria(c, COMUM, 200)
        resultado = _um(c, "SELECT public.trailup_retencao()")
        assert resultado["modo"] == "simular"
        assert _linhas(resultado, "telemetria_eventos_app", "apagar") == 2
        assert _um(c, "SELECT count(*) FROM public.telemetria_eventos_app") == 2
        assert _um(c, "SELECT count(*) FROM public.retencao_execucoes WHERE modo = 'simular'") == 1
        assert _um(c, "SELECT count(*) FROM public.retencao_fila_externa") == 0


def test_janelas_de_telemetria_respeitam_pesquisa() -> None:
    with _banco() as c:
        for aluno in (PESQ, COMUM):
            for dias in (100, 200, 400, 800):
                _telemetria(c, aluno, dias)
        c.execute("UPDATE public.app_config SET valor = 'aplicar' WHERE chave = 'retencao_modo'")
        resultado = _um(c, "SELECT public.trailup_retencao()")
        assert resultado["modo"] == "aplicar"

        def idades(tabela: str, aluno: uuid.UUID, extra: str = "") -> list[int]:
            return [
                r[0]
                for r in c.execute(
                    f"SELECT round(extract(epoch FROM now() - created_at) / 86400)::int FROM public.{tabela}"
                    f" WHERE aluno_id = '{aluno}' {extra} ORDER BY 1"
                )
            ]

        # Bruta: 90 dias para todos, 180 para quem consentiu pesquisa.
        assert idades("telemetria_eventos_app", COMUM) == []
        assert idades("telemetria_eventos_app", PESQ) == [100, 100]
        assert idades("telemetria_lotes", COMUM, "AND NOT (payload ? '_r2')") == [100, 200]
        assert idades("telemetria_lotes", PESQ, "AND payload ? '_r2'") == [100]
        # Derivada: 13 meses para todos, 24 para pesquisa; agregada antes.
        assert idades("telemetria_time_metric_entries", COMUM) == [100, 200]
        assert idades("telemetria_time_metric_entries", PESQ) == [100, 200, 400]
        assert idades("telemetria_sessoes", COMUM) == [100, 200]
        assert idades("telemetria_sessoes", PESQ) == [100, 200, 400]
        agregado = c.execute(
            "SELECT sum(entradas), sum(dwell_sec), count(DISTINCT topico_id) FROM public.telemetria_agregado_turma_dia"
        ).fetchone()
        assert (int(agregado[0]), int(agregado[1]), agregado[2]) == (3, 180, 1)
        colunas_agregado = {
            r[0]
            for r in c.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'telemetria_agregado_turma_dia'"
            )
        }
        assert not {"aluno_id", "sessao_id", "lote_id"} & colunas_agregado

        # Tudo o que saiu do banco com ponteiro no R2 esta na fila, uma vez por objeto.
        fila = {r[0] for r in c.execute("SELECT caminho FROM public.retencao_fila_externa WHERE destino = 'r2'")}
        # Eventos: COMUM 4 sessoes, PESQ 3 (a de 100 dias fica). Lotes: 7 redigidos ou apagados.
        assert len([f for f in fila if f.startswith("telemetria/eventos/")]) == 7
        assert len([f for f in fila if f.startswith("telemetria/lotes/")]) == 7

        # Rodar de novo nao muda nada.
        segundo = _um(c, "SELECT public.trailup_retencao()")
        assert all(item.get("linhas", 0) == 0 for item in segundo["tabelas"]), segundo


def test_inferencia_emocional_30_dias_para_todos() -> None:
    with _banco() as c:
        c.execute(
            f"""
            INSERT INTO public.aluno_mental_state_history (aluno_id, kind, created_at) VALUES
              ('{PESQ}', 'k', now() - interval '31 days'), ('{COMUM}', 'k', now() - interval '31 days'),
              ('{COMUM}', 'k', now() - interval '29 days')
            """
        )
        _um(c, "SELECT public.trailup_retencao(true)")
        assert _um(c, "SELECT count(*) FROM public.aluno_mental_state_history") == 1


def test_conta_apagada_deixa_so_prova_anonimizada() -> None:
    with _banco() as c:
        c.execute(
            f"""
            INSERT INTO public.consentimento_responsavel
              (aluno_id, versao, status, metodo, nome_responsavel, relacao, decidido_em, registrado_por, origem)
            VALUES ('{COMUM}', '{M02.VERSAO_RESPONSAVEL}', 'accepted', 'aparelho', 'Responsavel Teste',
                    'mae', now(), '{COMUM}', '{{"ip": "203.0.113.9"}}');
            INSERT INTO public.consentimento_telemetria (aluno_id, versao, status, decidido_em, origem)
            VALUES ('{COMUM}', 'v1', 'accepted', now(), '{{"plataforma": "android"}}');
            """
        )
        _telemetria(c, COMUM, 1)
        c.execute(f"DELETE FROM auth.users WHERE id = '{COMUM}'")

        assert _um(c, f"SELECT count(*) FROM public.alunos WHERE id = '{COMUM}'") == 0
        assert _um(c, f"SELECT count(*) FROM public.aluno_nascimento WHERE aluno_id = '{COMUM}'") == 0
        assert _um(c, f"SELECT count(*) FROM public.telemetria_sessoes WHERE aluno_id = '{COMUM}'") == 0
        esperado = _um(c, f"SELECT encode(sha256(convert_to('{COMUM}', 'UTF8')), 'hex')")
        resp = c.execute(
            "SELECT aluno_id, titular_hash, anonimizado_em IS NOT NULL, nome_responsavel, relacao,"
            " registrado_por, origem, status FROM public.consentimento_responsavel"
        ).fetchall()
        assert resp == [(None, esperado, True, None, "mae", None, {}, "accepted")]
        tele = c.execute("SELECT aluno_id, titular_hash, origem FROM public.consentimento_telemetria").fetchall()
        assert tele == [(None, esperado, {})]
        # A saida da turma por causa da conta apagada nao e "saida".
        assert _um(c, "SELECT count(*) FROM public.classe_aluno_saidas") == 0

        # 5 anos depois a prova vai embora.
        c.execute("UPDATE public.consentimento_responsavel SET anonimizado_em = now() - interval '1827 days'")
        _um(c, "SELECT public.trailup_retencao(true)")
        assert _um(c, "SELECT count(*) FROM public.consentimento_responsavel") == 0
        assert _um(c, "SELECT count(*) FROM public.consentimento_telemetria") == 1


def test_saida_da_turma() -> None:
    with _banco() as c:
        c.execute(
            f"""
            INSERT INTO public.conteudo_personalizado (aluno_id, classe_id, ciclo_id) VALUES ('{COMUM}', 1, 'c1');
            INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo) VALUES ('{COMUM}', 1, 't');
            DELETE FROM public.classe_aluno WHERE aluno_id = '{COMUM}';
            """
        )
        assert _um(c, f"SELECT count(*) FROM public.classe_aluno_saidas WHERE aluno_id = '{COMUM}'") == 1
        # Voltou: a saida some.
        c.execute(f"INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (1, '{COMUM}')")
        assert _um(c, "SELECT count(*) FROM public.classe_aluno_saidas") == 0
        c.execute(f"DELETE FROM public.classe_aluno WHERE aluno_id = '{COMUM}'")

        c.execute("UPDATE public.classe_aluno_saidas SET saiu_em = now() - interval '100 days'")
        r = _um(c, "SELECT public.trailup_retencao(true)")
        assert _linhas(r, "conteudo_personalizado", "saida_turma") == 1
        assert _um(c, "SELECT count(*) FROM public.conteudo_personalizado") == 0
        assert _um(c, "SELECT count(*) FROM public.eventos_aluno") == 1

        c.execute("UPDATE public.classe_aluno_saidas SET saiu_em = now() - interval '366 days'")
        _um(c, "SELECT public.trailup_retencao(true)")
        assert _um(c, "SELECT count(*) FROM public.eventos_aluno") == 0


def test_conta_inativa_aviso_depois_exclusao() -> None:
    with _banco() as c:
        r = _um(c, "SELECT public.trailup_retencao(false)")
        assert r["contas_inativas"]["avisos"] == 1
        assert _um(c, "SELECT count(*) FROM public.retencao_avisos_inatividade") == 0

        _um(c, "SELECT public.trailup_retencao(true)")
        assert _um(c, "SELECT aluno_id FROM public.retencao_avisos_inatividade") == INATIVO
        assert _um(c, f"SELECT count(*) FROM public.notificacoes WHERE aluno_id = '{INATIVO}'") == 1
        # Dentro dos 30 dias: nada.
        _um(c, "SELECT public.trailup_retencao(true)")
        assert _um(c, "SELECT count(*) FROM public.retencao_fila_externa WHERE destino = 'auth_user'") == 0
        assert _um(c, f"SELECT count(*) FROM public.notificacoes WHERE aluno_id = '{INATIVO}'") == 1

        c.execute("UPDATE public.retencao_avisos_inatividade SET avisado_em = now() - interval '31 days'")
        _um(c, "SELECT public.trailup_retencao(true)")
        fila = c.execute("SELECT caminho FROM public.retencao_fila_externa WHERE destino = 'auth_user'").fetchall()
        assert fila == [(str(INATIVO),)]
        # O job nao apaga a conta sozinho: quem apaga e o worker, pelo Auth.
        assert _um(c, f"SELECT count(*) FROM public.alunos WHERE id = '{INATIVO}'") == 1


def test_quem_volta_depois_do_aviso_sai_da_lista() -> None:
    with _banco() as c:
        _um(c, "SELECT public.trailup_retencao(true)")
        c.execute("UPDATE public.retencao_avisos_inatividade SET avisado_em = now() - interval '31 days'")
        c.execute(f"UPDATE auth.users SET last_sign_in_at = now() WHERE id = '{INATIVO}'")
        _um(c, "SELECT public.trailup_retencao(true)")
        assert _um(c, "SELECT count(*) FROM public.retencao_avisos_inatividade") == 0
        assert _um(c, "SELECT count(*) FROM public.retencao_fila_externa WHERE destino = 'auth_user'") == 0


def test_lote_max_limita_cada_execucao() -> None:
    with _banco() as c:
        for _ in range(3):
            _telemetria(c, COMUM, 200)
        c.execute("UPDATE public.app_config SET valor = '2' WHERE chave = 'retencao_lote_max'")
        r = _um(c, "SELECT public.trailup_retencao(true)")
        assert _linhas(r, "telemetria_eventos_app", "apagar") == 2
        assert _um(c, "SELECT count(*) FROM public.telemetria_eventos_app") == 4


def test_cliente_nao_le_nem_roda() -> None:
    with _banco() as c:
        c.execute("SET ROLE authenticated")
        for sql in (
            "SELECT public.trailup_retencao()",
            "SELECT * FROM public.retencao_fila_externa",
            "SELECT * FROM public.retencao_politica",
            "SELECT * FROM public.classe_aluno_saidas",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute(sql)
        c.execute("RESET ROLE")


def test_material_apagado_vai_para_a_fila_do_storage_e_do_r2() -> None:
    with _banco() as c:
        c.execute(
            f"""
            INSERT INTO public.materiais_gerados (aluno_id, tipo, storage_path)
            VALUES ('{COMUM}', 'pdf', 'personalizacao/{COMUM}/a.pdf');
            INSERT INTO public.rag_openai_files (vector_store_id, openai_file_id, scope, source_hash, aluno_id)
            VALUES ('vs_teste', 'file_teste', 'aluno', 'h', '{COMUM}');
            DELETE FROM auth.users WHERE id = '{COMUM}';
            """
        )
        fila = set(c.execute("SELECT destino, bucket, caminho FROM public.retencao_fila_externa").fetchall())
        assert ("storage", "conteudo_aluno", f"personalizacao/{COMUM}/a.pdf") in fila
        assert ("r2", "", f"personalizacao/{COMUM}/a.pdf") in fila
        assert ("openai", "vs_teste", "file_teste") in fila


def test_downgrade_e_upgrade_de_novo() -> None:
    with _banco() as c:
        for sql in _sql_de(M03, "downgrade"):
            c.execute(sql)
        assert _um(c, "SELECT to_regclass('public.retencao_politica')") is None
        for sql in _sql_de(M03, "upgrade"):
            c.execute(sql)
        for sql in _sql_de(M03, "upgrade"):
            c.execute(sql)
        assert _um(c, "SELECT count(*) FROM public.retencao_politica") == len(M03.POLITICAS)
        assert re.search(r"simular", _um(c, "SELECT valor FROM public.app_config WHERE chave='retencao_modo'"))
