"""Ponta a ponta da `20261025_03` (a guilda mantém os pontos de quem saiu da turma, #153).

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. Cada teste cria
um banco descartável com o ESQUELETO do schema public da produção, instala o que a apuração usa
(resolvedor de turma da `20261003_01`, gatilho de valor da `20261021_06`, o registro de saída da
`20261024_03` e o que a `20261025_03` emite no `upgrade()`) e apura um evento de guilda de verdade.
Dados sintéticos. Recusa banco hospedado.
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
        raise RuntimeError("e2e da guilda recusa banco hospedado: use um Postgres local")

AQUI = Path(__file__).resolve().parent
VERSOES = AQUI.parent / "alembic" / "versions"
ESQUELETO = AQUI / "fixtures" / "schema_prod_esqueleto_20261024.sql"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"e2e_153_{arquivo[:11]}", VERSOES / arquivo)
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
M_GUILDA = _modulo("20261025_03_guilda_mantem_quem_saiu_da_turma.py")


def _trecho(arquivo: str, inicio: str, fim: str) -> str:
    texto = (VERSOES / arquivo).read_text(encoding="utf-8")
    a = texto.index(inicio)
    return texto[a : texto.index(fim, a) + len(fim)]


# O registro de saída de verdade (tabela, função e gatilho da `20261024_03`).
RETENCAO = "20261024_03_retencao_e_expurgo.py"
SAIDAS = _trecho(RETENCAO, "CREATE TABLE IF NOT EXISTS public.classe_aluno_saidas (", ");")
GATILHO_SAIDA = _trecho(
    RETENCAO,
    "CREATE OR REPLACE FUNCTION public.trg_classe_aluno_saida()",
    "FOR EACH ROW EXECUTE FUNCTION public.trg_classe_aluno_saida();",
)

PROF, A, B, C = (uuid.UUID(int=i) for i in (11, 21, 22, 23))
G1, G2 = uuid.UUID(int=301), uuid.UUID(int=302)
EVENTO = uuid.UUID(int=901)

PAPEIS = """
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $r$;
"""

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
-- C criou as duas guildas (FK RESTRICT): fica na turma e com conta em todos os testes.
INSERT INTO public.guildas (id, classe_id, nome, criado_por) VALUES
  ('{G1}', 1, 'Guilda 1', '{C}'), ('{G2}', 1, 'Guilda 2', '{C}');
INSERT INTO public.eventos_classe (id, classe_id, titulo, status, inicio, fim, pontos, moedas, criado_por,
                                   medalha_participacao, modalidade_guilda)
VALUES ('{EVENTO}', 1, 'Maratona', 'aberto', now() - interval '1 day', now() + interval '1 day', 0, 0,
        '{PROF}', false, true);
-- Cópia congelada ao abrir: G1 = A e B, G2 = C.
INSERT INTO public.guilda_evento_snapshot (evento_id, classe_id, guilda_id, aluno_id, aluno_nome, posicao)
VALUES ('{EVENTO}', 1, '{G1}', '{A}', 'A', 1), ('{EVENTO}', 1, '{G1}', '{B}', 'B', 2),
       ('{EVENTO}', 1, '{G2}', '{C}', 'C', 1);
INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em, concedido_por) VALUES
  ('{A}', 'presenca_aula', 'classe:1:aula:1', 7, now() - interval '2 hour', '{PROF}'),
  ('{B}', 'presenca_aula', 'classe:1:aula:2', 3, now() - interval '1 hour', '{PROF}'),
  ('{C}', 'presenca_aula', 'classe:1:aula:3', 5, now() - interval '1 hour', '{PROF}');
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
    nome = f"tu153_{uuid.uuid4().hex[:12]}"
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
            c.execute(SAIDAS)
            c.execute(GATILHO_SAIDA)
            for sql in _sql_de(M_PONTOS, "upgrade"):
                c.execute(sql)
            for sql in _sql_de(M_GUILDA, "upgrade"):
                c.execute(sql)
            c.execute(_seed())
            yield c
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _apurar(c) -> None:
    c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (str(PROF),))
    c.execute("SELECT set_config('request.jwt.claims', %s, false)", (json.dumps({"sub": str(PROF)}),))
    c.execute("SELECT public.fn_evento_classe_apurar(%s)", (EVENTO,))


def _guildas(c) -> dict[str, tuple]:
    linhas = c.execute(
        "SELECT guilda_id::text, pontos, membros FROM public.eventos_classe_resultado_guilda WHERE evento_id = %s",
        (EVENTO,),
    ).fetchall()
    return {r[0]: (r[1], r[2]) for r in linhas}


def _individual(c) -> dict[str, int]:
    return dict(
        c.execute(
            "SELECT aluno_id::text, pontos FROM public.eventos_classe_resultado WHERE evento_id = %s",
            (EVENTO,),
        ).fetchall()
    )


def _desmatricula(c, aluno: uuid.UUID) -> None:
    c.execute("DELETE FROM public.classe_aluno WHERE classe_id = 1 AND aluno_id = %s", (aluno,))


def test_quem_saiu_no_meio_do_evento_continua_somando_para_a_guilda():
    with _banco() as c:
        _desmatricula(c, A)
        assert (
            c.execute(
                "SELECT count(*) FROM public.classe_aluno_saidas WHERE classe_id = 1 AND aluno_id = %s", (A,)
            ).fetchone()[0]
            == 1
        )
        _apurar(c)
        # Antes da 20261025_03, G1 dava 3: o 7 de A sumia junto com a matrícula.
        assert _guildas(c) == {str(G1): (10, 2), str(G2): (5, 1)}
        # O resultado individual continua só de quem está matriculado.
        assert _individual(c) == {str(B): 3, str(C): 5}


def test_so_conta_o_que_foi_feito_ate_a_saida():
    with _banco() as c:
        _desmatricula(c, A)
        c.execute(
            "UPDATE public.classe_aluno_saidas SET saiu_em = now() - interval '90 minutes' WHERE aluno_id = %s",
            (A,),
        )
        # Atividade de A na turma depois da saída (não deveria existir; se existir, não conta).
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em, concedido_por) "
            "VALUES (%s, 'presenca_aula', 'classe:1:aula:9', 100, now() - interval '30 minutes', %s)",
            (A, PROF),
        )
        _apurar(c)
        assert _guildas(c)[str(G1)] == (10, 2)


def test_sem_registro_de_saida_vale_a_janela_do_evento():
    with _banco() as c:
        _desmatricula(c, A)
        c.execute("DELETE FROM public.classe_aluno_saidas")
        _apurar(c)
        assert _guildas(c)[str(G1)] == (10, 2)


def test_quem_volta_para_a_turma_e_apurado_como_matriculado():
    with _banco() as c:
        _desmatricula(c, A)
        c.execute("INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (1, %s)", (A,))
        assert c.execute("SELECT count(*) FROM public.classe_aluno_saidas").fetchone()[0] == 0
        _apurar(c)
        assert _individual(c)[str(A)] == 7
        assert _guildas(c)[str(G1)] == (10, 2)


def test_excluir_a_conta_depois_de_encerrar_nao_muda_o_total_da_guilda():
    with _banco() as c:
        _desmatricula(c, A)
        _apurar(c)
        c.execute("UPDATE public.eventos_classe SET status = 'encerrado' WHERE id = %s", (EVENTO,))
        antes = _guildas(c)
        c.execute("DELETE FROM public.alunos WHERE id = %s", (A,))
        # LGPD: a atividade sai em cascata e a cópia congelada perde o vínculo (SET NULL)...
        assert c.execute("SELECT count(*) FROM public.eventos_aluno WHERE aluno_id = %s", (A,)).fetchone()[0] == 0
        assert c.execute("SELECT count(*) FROM public.guilda_evento_snapshot WHERE aluno_id IS NULL").fetchone()[0] == 1
        # ...e o resultado gravado do evento encerrado não muda.
        assert _guildas(c) == antes == {str(G1): (10, 2), str(G2): (5, 1)}


def test_conta_excluida_com_o_evento_aberto_nao_contribui_mais():
    with _banco() as c:
        _desmatricula(c, A)
        c.execute("DELETE FROM public.alunos WHERE id = %s", (A,))
        _apurar(c)
        # A atividade foi apagada a pedido do titular; o integrante continua contado em `membros`.
        assert _guildas(c)[str(G1)] == (3, 2)
