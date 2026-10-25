"""Ponta a ponta da `20261025_02` (formato de `ranks.periodo` e percentual do líder, #155).

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. Cada teste cria
um banco descartável com o ESQUELETO do schema public da produção, aplica o que a `20261025_02`
emite no `upgrade()` (view do rank inteira, como a `20261021_18` a deixa mais a troca) e lê a view
de verdade. Dados sintéticos. Recusa banco hospedado.
"""

from __future__ import annotations

import importlib.util
import os
import re
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest

DSN = os.environ.get("TRAILUP_E2E_RETENCAO_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

if DSN:
    import psycopg

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e do rank recusa banco hospedado: use um Postgres local")

AQUI = Path(__file__).resolve().parent
VERSOES = AQUI.parent / "alembic" / "versions"
ESQUELETO = AQUI / "fixtures" / "schema_prod_esqueleto_20261024.sql"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"e2e_155_{arquivo[:11]}", VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


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


M155 = _modulo("20261025_02_periodo_e_progresso_do_rank.py")

# `fn_app_config_int` como a `20261021_05` a cria (o esqueleto não tem funções).
_TEXTO_05 = (VERSOES / "20261021_05_missao_diaria_deterministica.py").read_text(encoding="utf-8")
APP_CONFIG_INT = re.search(
    r"CREATE OR REPLACE FUNCTION public\.fn_app_config_int\(.*?\$function\$;", _TEXTO_05, re.S
).group(0)

PROF = uuid.UUID(int=11)
PEQUENA = [uuid.UUID(int=100 + i) for i in range(3)]  # turma 1: 3 alunos
GRANDE = [uuid.UUID(int=200 + i) for i in range(9)]  # turma 2: 9 alunos
ZERADA = [uuid.UUID(int=300 + i) for i in range(8)]  # turma 3: 8 alunos, ninguém pontuou

PAPEIS = """
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $r$;
"""


def _seed() -> str:
    todos = PEQUENA + GRANDE + ZERADA
    usuarios = ",".join(f"('{u}', 'u{u.int}@teste.invalid')" for u in [PROF, *todos])
    alunos = ",".join(f"('{u}', 'a{u.int}', 'u{u.int}@teste.invalid')" for u in todos)
    matriculas = ",".join(
        f"({classe}, '{u}')" for classe, grupo in ((1, PEQUENA), (2, GRANDE), (3, ZERADA)) for u in grupo
    )
    # Turma 1: 30, 20, 10. Turma 2: 90, 80, ..., 10.
    pontos = [(1, u, 30 - 10 * i) for i, u in enumerate(PEQUENA)] + [
        (2, u, 90 - 10 * i) for i, u in enumerate(GRANDE)
    ]
    eventos = ",".join(
        f"('{u}', 'presenca_aula', 'classe:{c}:aula:{u.int}', {v}, now() - interval '1 hour', {c})"
        for c, u, v in pontos
    )
    elo = ",".join(f"(2, '{u}', {1016 - i})" for i, u in enumerate(GRANDE))
    return f"""
INSERT INTO auth.users (id, email) VALUES {usuarios};
INSERT INTO public.professor (id, nome) VALUES ('{PROF}', 'Prof');
INSERT INTO public.alunos (id, nome, email) VALUES {alunos};
INSERT INTO public.materia (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Mat');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, '{PROF}', 'P'), (2, 1, '{PROF}', 'G'), (3, 1, '{PROF}', 'Z');
INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES {matriculas};
INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em, classe_id) VALUES {eventos};
INSERT INTO public.ranqueada_elo (classe_id, aluno_id, rating) VALUES {elo};
INSERT INTO public.rank_tipo (id, nome, criterio) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Pontuação', 'pontuacao'), (2, 'Elo', 'elo');
"""


RANKS = """
INSERT INTO public.ranks (id, tipo_id, classe_id, periodo, inicio) OVERRIDING SYSTEM VALUE VALUES
  (11, 1, 1, '2026.2', now() - interval '1 day'),
  (12, 1, 2, '2026.2', now() - interval '1 day'),
  (13, 2, 2, '2026.2', now() - interval '1 day'),
  (14, 1, 3, '2026.2', now() - interval '1 day');
"""


def _dsn_para(banco: str) -> str:
    return urlunsplit(urlsplit(DSN)._replace(path=f"/{banco}"))


def _afrouxa(c, tabela: str) -> None:
    """O esqueleto pode exigir colunas NOT NULL sem default; afrouxa só no banco descartável."""
    linhas = c.execute(
        """
        SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = %s AND is_nullable = 'NO'
           AND column_default IS NULL AND is_identity = 'NO' AND column_name <> 'id'
        """,
        (tabela,),
    ).fetchall()
    for (coluna,) in linhas:
        c.execute(f'ALTER TABLE public."{tabela}" ALTER COLUMN "{coluna}" DROP NOT NULL')


@contextmanager
def _banco(antes_da_migration: str = ""):
    nome = f"tu155_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(_dsn_para(nome), autocommit=True) as c:
            c.execute(PAPEIS)
            c.execute(ESQUELETO.read_text(encoding="utf-8"))
            for tabela in ("professor", "classe", "materia"):
                _afrouxa(c, tabela)
            c.execute(APP_CONFIG_INT)
            c.execute(_seed())
            if antes_da_migration:
                c.execute(antes_da_migration)
            for sql in _sql_de(M155, "upgrade"):
                c.execute(sql)
            c.execute(RANKS)
            yield c
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _percentuais(c, rank_id: int) -> list:
    return [
        None if r[0] is None else float(r[0])
        for r in c.execute(
            "SELECT percentual_do_lider FROM public.vw_rank_posicoes_por_classe_todas "
            "WHERE rank_id = %s ORDER BY posicao, id_aluno",
            (rank_id,),
        ).fetchall()
    ]


def test_rank_pequeno_nao_mostra_percentual_e_o_grande_mostra():
    with _banco() as c:
        assert _percentuais(c, 11) == [None, None, None]
        assert _percentuais(c, 12) == [round(v / 90 * 100, 2) for v in range(90, 0, -10)]
        # posições e pontuação não mudam
        assert [float(r[0]) for r in c.execute(
            "SELECT pontuacao FROM public.vw_rank_posicoes_por_classe_todas WHERE rank_id = 11 ORDER BY posicao"
        )] == [30, 20, 10]


def test_elo_e_lider_sem_ponto_nao_tem_percentual():
    with _banco() as c:
        assert _percentuais(c, 13) == [None] * 9
        assert _percentuais(c, 14) == [None] * 8


def test_minimo_vem_do_app_config():
    with _banco() as c:
        c.execute("UPDATE public.app_config SET valor = '3' WHERE chave = 'rank_progresso_min_participantes'")
        assert _percentuais(c, 11) == [100.0, 66.67, 33.33]


def test_periodo_e_aparado_e_validado_na_gravacao():
    with _banco() as c:
        c.execute("INSERT INTO public.ranks (tipo_id, classe_id, periodo) VALUES (2, 1, '  2027.1  ')")
        assert c.execute("SELECT periodo FROM public.ranks WHERE tipo_id = 2 AND classe_id = 1").fetchone()[0] == "2027.1"
        for ruim in ("", "   ", "x" * 41, None):
            with pytest.raises(psycopg.errors.InvalidParameterValue):
                c.execute("INSERT INTO public.ranks (tipo_id, classe_id, periodo) VALUES (2, 3, %s)", (ruim,))
        with pytest.raises(psycopg.errors.InvalidParameterValue):
            c.execute("UPDATE public.ranks SET periodo = '' WHERE id = 12")


def test_linha_legada_fora_do_formato_continua_encerravel():
    legado = (
        "INSERT INTO public.ranks (id, tipo_id, classe_id, periodo, inicio) OVERRIDING SYSTEM VALUE "
        "VALUES (90, 2, 1, '', now() - interval '2 day'), (91, 2, 3, NULL, now() - interval '2 day');"
    )
    with _banco(legado) as c:
        c.execute("UPDATE public.ranks SET fim = now() WHERE id IN (90, 91)")
        assert c.execute("SELECT count(*) FROM public.ranks WHERE id IN (90, 91) AND fim IS NOT NULL").fetchone()[0] == 2
        assert c.execute("SELECT periodo FROM public.ranks WHERE id = 90").fetchone()[0] == ""
