"""Ponta a ponta da `20261025_01` (pontos do evento no rank, #141) num Postgres de verdade.

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. Cada teste cria
um banco descartável com o ESQUELETO do schema public da produção, instala o que a apuração usa
(o gatilho de valor da `20261021_06`, o resolvedor de turma da `20261003_01` e o que a `20261025_01`
emite no `upgrade()`) e encerra um evento de verdade. Dados sintéticos. Recusa banco hospedado.
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

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

if DSN:
    import psycopg

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e dos pontos do evento recusa banco hospedado: use um Postgres local")

AQUI = Path(__file__).resolve().parent
VERSOES = AQUI.parent / "alembic" / "versions"
ESQUELETO = AQUI / "fixtures" / "schema_prod_esqueleto_20261024.sql"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"e2e_141_{arquivo[:11]}", VERSOES / arquivo)
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


M_REF = _modulo("20261003_01_referencia_de_item_personalizado.py")
M_GATILHO = _modulo("20261021_06_aposta_e_pontuacao_ranqueada.py")
M_PONTOS = _modulo("20261025_01_pontos_do_evento_no_rank.py")

PROF, A, B, C = (uuid.UUID(int=i) for i in (11, 21, 22, 23))
EVENTO = uuid.UUID(int=901)
SOBREPOSTO = uuid.UUID(int=902)

PAPEIS = """
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $r$;
"""

# O esqueleto só tem tabelas. Do que a apuração e o gatilho tocam, entra o de verdade (abaixo);
# aqui ficam dublês do que o caminho testado não exercita (tipo creditado sai do gatilho antes
# de precificar) e os índices parciais que o ON CONFLICT das moedas pede.
DUBLES = """
CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_referencia_id(p text) RETURNS bigint
  LANGUAGE sql IMMUTABLE AS $$ SELECT NULL::bigint $$;
CREATE OR REPLACE FUNCTION public.fn_pontos_do_evento(p text) RETURNS numeric
  LANGUAGE sql STABLE AS $$ SELECT 0::numeric $$;
CREATE UNIQUE INDEX IF NOT EXISTS moedas_ledger_ganho_unico
  ON public.moedas_ledger (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento';
CREATE UNIQUE INDEX IF NOT EXISTS eventos_aluno_creditado_unico
  ON public.eventos_aluno (aluno_id, tipo, referencia)
  WHERE tipo IN ('presenca_aula', 'participacao_aula', 'conquista_desbloqueada', 'nota_professor');
DROP TRIGGER IF EXISTS trg_eventos_aluno_valor_ins ON public.eventos_aluno;
"""

GATILHOS = """
CREATE TRIGGER trg_eventos_aluno_valor_ins
  BEFORE INSERT ON public.eventos_aluno
  FOR EACH ROW EXECUTE FUNCTION public.trg_eventos_aluno_valor_do_banco();
CREATE TRIGGER trg_eventos_aluno_valor_upd
  BEFORE UPDATE OF valor, tipo ON public.eventos_aluno
  FOR EACH ROW EXECUTE FUNCTION public.trg_eventos_aluno_valor_do_banco();
"""


def _seed() -> str:
    return f"""
INSERT INTO auth.users (id, email) VALUES
  ('{PROF}', 'prof@teste.invalid'), ('{A}', 'a@teste.invalid'),
  ('{B}', 'b@teste.invalid'), ('{C}', 'c@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{PROF}', 'Prof');
INSERT INTO public.alunos (id, nome, email) VALUES
  ('{A}', 'A', 'a@teste.invalid'), ('{B}', 'B', 'b@teste.invalid'), ('{C}', 'C', 'c@teste.invalid');
INSERT INTO public.materia (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Mat');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, '{PROF}', 'A');
INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (1, '{A}'), (1, '{B}'), (1, '{C}');
-- Dois eventos sobrepostos na turma 1, a janela cobrindo agora.
INSERT INTO public.eventos_classe (id, classe_id, titulo, status, inicio, fim, pontos, moedas, criado_por,
                                   medalha_participacao)
VALUES ('{EVENTO}', 1, 'Maratona', 'aberto', now() - interval '1 day', now() + interval '1 day', 50, 0,
        '{PROF}', false),
       ('{SOBREPOSTO}', 1, 'Outro', 'aberto', now() - interval '1 day', now() + interval '2 day', 0, 0,
        '{PROF}', false);
-- A e B fizeram algo na janela; C não.
INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em, concedido_por) VALUES
  ('{A}', 'presenca_aula', 'classe:1:aula:1', 7, now() - interval '1 hour', '{PROF}'),
  ('{B}', 'presenca_aula', 'classe:1:aula:2', 3, now() - interval '1 hour', '{PROF}');
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
def _banco():
    nome = f"tu141_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(_dsn_para(nome), autocommit=True) as c:
            c.execute(PAPEIS)
            c.execute(ESQUELETO.read_text(encoding="utf-8"))
            c.execute(DUBLES)
            for tabela in ("professor", "classe", "materia"):
                _afrouxa(c, tabela)
            for sql in _sql_de(M_REF, "upgrade"):
                c.execute(sql)
            c.execute(M_GATILHO.GATILHO)
            c.execute(GATILHOS)
            for sql in _sql_de(M_PONTOS, "upgrade"):
                c.execute(sql)
            c.execute(_seed())
            yield c
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _apurar(c, evento: uuid.UUID, como: uuid.UUID | None = PROF) -> None:
    c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (str(como) if como else "",))
    c.execute("SELECT set_config('request.jwt.claims', %s, false)", (json.dumps({"sub": str(como or "")}),))
    c.execute("SELECT public.fn_evento_classe_apurar(%s)", (evento,))


def _creditos(c) -> dict[str, tuple]:
    linhas = c.execute(
        """SELECT aluno_id::text, valor, classe_id, referencia, concedido_por::text, motivo
             FROM public.eventos_aluno WHERE tipo = 'evento_classe_pontos' ORDER BY aluno_id"""
    ).fetchall()
    return {r[0]: tuple(r[1:]) for r in linhas}


def test_participante_recebe_os_pontos_do_evento_na_turma_do_evento():
    with _banco() as c:
        _apurar(c, EVENTO)
        creditos = _creditos(c)
        ref = f"classe:1:evento:{EVENTO}"
        assert creditos == {
            str(A): (50, 1, ref, str(PROF), "Evento: Maratona"),
            str(B): (50, 1, ref, str(PROF), "Evento: Maratona"),
        }  # C não participou: não ganha nada


def test_reapurar_nao_credita_de_novo_nem_muda_o_resultado():
    with _banco() as c:
        _apurar(c, EVENTO)
        antes = c.execute(
            "SELECT aluno_id::text, pontos, participou, posicao FROM public.eventos_classe_resultado "
            "WHERE evento_id = %s ORDER BY aluno_id",
            (EVENTO,),
        ).fetchall()
        _apurar(c, EVENTO)
        _apurar(c, EVENTO, como=None)
        assert c.execute(
            "SELECT count(*) FROM public.eventos_aluno WHERE tipo = 'evento_classe_pontos'"
        ).fetchone()[0] == 2
        depois = c.execute(
            "SELECT aluno_id::text, pontos, participou, posicao FROM public.eventos_classe_resultado "
            "WHERE evento_id = %s ORDER BY aluno_id",
            (EVENTO,),
        ).fetchall()
        assert antes == depois
        # A fez 7, B fez 3: o crédito do evento não entra na própria soma.
        assert [(r[1], r[2]) for r in depois] == [(7, True), (3, True), (0, False)]


def test_credito_de_um_evento_nao_vira_participacao_no_outro():
    with _banco() as c:
        _apurar(c, EVENTO)
        _apurar(c, SOBREPOSTO)
        linhas = dict(
            c.execute(
                "SELECT aluno_id::text, pontos FROM public.eventos_classe_resultado WHERE evento_id = %s",
                (SOBREPOSTO,),
            ).fetchall()
        )
        assert linhas == {str(A): 7, str(B): 3, str(C): 0}
        # Evento com pontos = 0 não grava crédito.
        assert c.execute(
            "SELECT count(*) FROM public.eventos_aluno WHERE referencia = %s",
            (f"classe:1:evento:{SOBREPOSTO}",),
        ).fetchone()[0] == 0


def test_valor_do_credito_e_congelado_no_update():
    with _banco() as c:
        _apurar(c, EVENTO)
        c.execute(
            "UPDATE public.eventos_aluno SET valor = 99999, tipo = 'atividade_concluida' "
            "WHERE tipo = 'evento_classe_pontos' AND aluno_id = %s",
            (A,),
        )
        assert _creditos(c)[str(A)][0] == 50


def test_aluno_nao_se_da_ponto_de_evento():
    with _banco() as c:
        assert c.execute("SELECT public.fn_evento_creditado('evento_classe_pontos')").fetchone()[0] is True
        assert c.execute("SELECT public.fn_evento_creditado('atividade_concluida')").fetchone()[0] is False
