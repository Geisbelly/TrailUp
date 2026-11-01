"""Banco descartável das migrations da F5 (views e RPC de métricas).

Postgres LOCAL (`TRAILUP_E2E_RETENCAO_DATABASE_URL`) com o esqueleto do schema public da produção.
Recusa banco hospedado. Cada teste ganha um banco novo e o apaga no fim.
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

DSN = os.environ.get("TRAILUP_E2E_RETENCAO_DATABASE_URL", "")
e2e = pytest.mark.skipif(not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)")

if DSN:
    import psycopg

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e da F5 recusa banco hospedado: use um Postgres local")

AQUI = Path(__file__).resolve().parent
VERSOES = AQUI.parent / "alembic" / "versions"
ESQUELETO = AQUI / "fixtures" / "schema_prod_esqueleto_20261024.sql"

PAPEIS = """
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $r$;
"""


# Onde o esqueleto difere da produção nas colunas que as views leem. Medido: em produção
# `aluno_perfil.afinidade` é numeric e `status` das três tabelas de progresso é o enum
# `status_atividade` (com acento); o esqueleto traz os dois como text. Sem isto, o texto que o
# Postgres devolve para a view muda (`ta.status = ...` em vez de `ta.status::text = ...`).
AJUSTES_DO_ESQUELETO = """
ALTER TABLE public.aluno_perfil ALTER COLUMN afinidade DROP DEFAULT;
ALTER TABLE public.aluno_perfil ALTER COLUMN afinidade TYPE numeric USING afinidade::numeric;
CREATE TYPE public.status_atividade AS ENUM ('não iniciado', 'em andamento', 'concluido');
DO $a$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['topico_aluno', 'conteudo_aluno', 'atividade_aluno'] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN status DROP DEFAULT', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN status TYPE public.status_atividade '
                   'USING status::public.status_atividade', t);
    EXECUTE format($$ALTER TABLE public.%I ALTER COLUMN status SET DEFAULT 'não iniciado'$$, t);
  END LOOP;
END $a$;
"""


def modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"f5_{arquivo[:11]}", VERSOES / arquivo)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _Coletor:
    def __init__(self) -> None:
        self.sql: list[str] = []

    def execute(self, sql) -> None:
        self.sql.append(str(sql))


def sql_de(mod, fn: str = "upgrade") -> list[str]:
    coletor = _Coletor()
    original = mod.op
    mod.op = coletor
    try:
        getattr(mod, fn)()
    finally:
        mod.op = original
    return coletor.sql


def _dsn_para(banco: str) -> str:
    return urlunsplit(urlsplit(DSN)._replace(path=f"/{banco}"))


def afrouxa(c, tabela: str) -> None:
    """O esqueleto pode exigir colunas NOT NULL sem default; afrouxa só no banco descartável."""
    for (coluna,) in c.execute(
        """
        SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = %s AND is_nullable = 'NO'
           AND column_default IS NULL AND is_identity = 'NO' AND column_name <> 'id'
        """,
        (tabela,),
    ).fetchall():
        c.execute(f'ALTER TABLE public."{tabela}" ALTER COLUMN "{coluna}" DROP NOT NULL')


@contextmanager
def banco(*instalar: str):
    """Cria o banco, aplica o esqueleto e cada SQL de `instalar`, nesta ordem."""
    nome = f"tuf5_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(_dsn_para(nome), autocommit=True) as c:
            c.execute(PAPEIS)
            c.execute(ESQUELETO.read_text(encoding="utf-8"))
            c.execute(AJUSTES_DO_ESQUELETO)
            for sql in instalar:
                c.execute(sql)
            yield c
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def como(c, quem: uuid.UUID | None) -> None:
    """Sessão de quem chama (o que o PostgREST põe no JWT). `None` = dono/migration."""
    sub = str(quem) if quem else ""
    c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (sub,))
    claims = json.dumps({"sub": sub, "role": "authenticated"}) if quem else ""
    c.execute("SELECT set_config('request.jwt.claims', %s, false)", (claims,))


# --------------------------------------------------------------------------- dados sintéticos

PROF = uuid.UUID(int=11)
A, B, C = (uuid.UUID(int=i) for i in (21, 22, 23))
TURMA = 1
TOPICOS = (10, 11, 12)


def semear_turma(c) -> None:
    """Professor, turma 1 com três tópicos em ordem, e os alunos A, B e C matriculados."""
    for tabela in ("professor", "classe", "materia", "alunos", "topicos", "telemetria_lotes",
                   "telemetria_eventos_app", "telemetria_time_metric_entries", "telemetria_sessoes"):
        afrouxa(c, tabela)
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES
  ('{PROF}', 'prof@teste.invalid'), ('{A}', 'a@teste.invalid'), ('{B}', 'b@teste.invalid'), ('{C}', 'c@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{PROF}', 'Prof');
INSERT INTO public.alunos (id, nome, email) VALUES
  ('{A}', 'A', 'a@teste.invalid'), ('{B}', 'B', 'b@teste.invalid'), ('{C}', 'C', 'c@teste.invalid');
INSERT INTO public.materia (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Mat');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES ({TURMA}, 1, '{PROF}', 'T');
INSERT INTO public.topicos (id, classe_id, nome, ordem) OVERRIDING SYSTEM VALUE VALUES
  (10, {TURMA}, 'Um', 1), (11, {TURMA}, 'Dois', 2), (12, {TURMA}, 'Tres', 3);
INSERT INTO public.classe_aluno (classe_id, aluno_id, created_at) VALUES
  ({TURMA}, '{A}', '2026-10-01T12:00:00Z'), ({TURMA}, '{B}', '2026-10-01T12:00:00Z'),
  ({TURMA}, '{C}', '2026-10-01T12:00:00Z');
"""
    )


def sessao(c, sid: uuid.UUID, aluno: uuid.UUID, inicio: str, fim: str | None) -> None:
    c.execute(
        "INSERT INTO public.telemetria_sessoes (id, aluno_id, classe_id, started_at, ended_at) VALUES (%s, %s, %s, %s, %s)",
        (sid, aluno, TURMA, inicio, fim),
    )


def tempo(c, sid: uuid.UUID, aluno: uuid.UUID, escopo: str, topico: int | None, ativo: float, ocioso: float,
          quando: str) -> None:
    """Uma linha de `telemetria_time_metric_entries` (num lote próprio)."""
    lote = uuid.uuid4()
    c.execute(
        "INSERT INTO public.telemetria_lotes (id, sessao_id, aluno_id, classe_id, topico_id, screen_name, route_name,"
        " flush_reason, captured_at, study_elapsed_sec, screen_dwell_sec, active_sec, idle_sec, touch_count,"
        " scroll_distance_px, max_depth_px, payload)"
        " VALUES (%s, %s, %s, %s, %s, 't', 'r', 'interval', %s, 0, %s, %s, %s, 0, 0, 0, '{}')",
        (lote, sid, aluno, TURMA, topico, quando, ativo + ocioso, ativo, ocioso),
    )
    c.execute(
        "INSERT INTO public.telemetria_time_metric_entries (lote_id, sessao_id, aluno_id, classe_id, topico_id, scope,"
        " dwell_sec, active_sec, idle_sec, captured_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (lote, sid, aluno, TURMA, topico, escopo, ativo + ocioso, ativo, ocioso, quando),
    )


def evento(c, sid: uuid.UUID, aluno: uuid.UUID, nome: str, topico: int | None, quando: str,
           grupo: str = "navigation") -> None:
    c.execute(
        "INSERT INTO public.telemetria_eventos_app (client_event_id, sessao_id, aluno_id, classe_id, topico_id,"
        " event_group, event_name, occurred_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        (str(uuid.uuid4()), sid, aluno, TURMA, topico, grupo, nome, quando),
    )
