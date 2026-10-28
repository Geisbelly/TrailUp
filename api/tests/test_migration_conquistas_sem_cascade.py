"""`20261026_02`: conquista da turma sobrevive à turma, e a troca de critério fica registrada (#158).

Duas camadas:

- **estrutura** (roda sempre, sem banco): o SQL offline do Alembic troca a FK para `SET NULL`,
  instala a guarda de órfã, cria `conquistas_criterio_log` com RLS de leitura e sem escrita;
- **ponta a ponta** (só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL):
  banco descartável com o ESQUELETO do schema public da produção, o gatilho de conquistas de
  verdade (`20261021_04`), o pagamento de moedas (`20260912_02` / `20261020_05`), o
  `fn_evento_creditado` (`20261025_01`), a RPC do console (`20261017_09`) e esta migration.
  Dados sintéticos. Recusa banco hospedado.
"""

from __future__ import annotations

import importlib.util
import json
import os
import uuid
from contextlib import contextmanager
from io import StringIO
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

AQUI = Path(__file__).resolve().parent
VERSOES = AQUI.parent / "alembic" / "versions"
ESQUELETO = AQUI / "fixtures" / "schema_prod_esqueleto_20261024.sql"
ARQUIVO = "20261026_02_conquistas_sem_cascade_e_historico_de_criterio.py"

DSN = os.environ.get("TRAILUP_E2E_RETENCAO_DATABASE_URL", "")
e2e = pytest.mark.skipif(not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)")

if DSN:
    import psycopg

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e das conquistas recusa banco hospedado: use um Postgres local")


# --------------------------------------------------------------------------- estrutura


def _sql(origem: str, destino: str, *, down: bool = False) -> str:
    output = StringIO()
    cfg = _offline_alembic_config(output)
    (migrations.command.downgrade if down else migrations.command.upgrade)(cfg, f"{origem}:{destino}", sql=True)
    return output.getvalue()


def test_fk_da_turma_vira_set_null_procurando_o_nome_no_catalogo() -> None:
    sql = _sql("20261026_01", "20261026_02")

    assert "c.confrelid = 'public.classe'::regclass" in sql
    assert "a.attname = 'classe_id'" in sql
    assert "FOREIGN KEY (classe_id) REFERENCES public.classe(id) ON DELETE SET NULL" in sql
    assert "ON DELETE CASCADE" not in sql.split("conquistas_criterio_log")[0]


def test_turma_apagada_desativa_e_nao_deixa_reativar() -> None:
    sql = _sql("20261026_01", "20261026_02")

    assert "IF OLD.classe_id IS NOT NULL AND NEW.classe_id IS NULL THEN" in sql
    assert "NEW.ativa := false;" in sql
    assert "BEFORE UPDATE ON public.conquistas" in sql
    assert "USING ERRCODE = '22023'" in sql


def test_historico_tem_rls_de_leitura_e_ninguem_escreve_direto() -> None:
    sql = _sql("20261026_01", "20261026_02")

    assert "CREATE TABLE IF NOT EXISTS public.conquistas_criterio_log" in sql
    assert "ALTER TABLE public.conquistas_criterio_log ENABLE ROW LEVEL SECURITY" in sql
    assert "FOR SELECT TO authenticated" in sql
    assert "classe_id IN (SELECT public.app_classes_do_professor()) OR public.app_e_dono()" in sql
    assert "REVOKE ALL ON TABLE public.conquistas_criterio_log FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT SELECT ON TABLE public.conquistas_criterio_log TO authenticated" in sql
    # Nenhuma policy nem GRANT de escrita para cliente.
    for verbo in ("FOR INSERT", "FOR UPDATE", "FOR DELETE", "FOR ALL"):
        assert verbo not in sql
    assert "AFTER UPDATE OF criterio ON public.conquistas" in sql
    assert "INSERT INTO public.retencao_politica" in sql


def test_downgrade_volta_a_cascade_e_remove_o_historico() -> None:
    sql = _sql("20261026_02", "20261026_01", down=True)

    assert "DROP TABLE IF EXISTS public.conquistas_criterio_log" in sql
    assert "FOREIGN KEY (classe_id) REFERENCES public.classe(id) ON DELETE CASCADE" in sql
    assert "DROP TRIGGER IF EXISTS trg_conquistas_guarda_orfa ON public.conquistas" in sql


# --------------------------------------------------------------------------- ponta a ponta


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"e2e_158_{arquivo[:11]}", VERSOES / arquivo)
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


def _trecho(arquivo: str, inicio: str, fim: str) -> str:
    texto = (VERSOES / arquivo).read_text(encoding="utf-8")
    a = texto.index(inicio)
    return texto[a : texto.index(fim, a) + len(fim)]


PROF, PROF2, DONO, A, B, D = (uuid.UUID(int=i) for i in (11, 12, 13, 21, 22, 23))

PAPEIS = """
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $r$;
"""

# Só o que o esqueleto não traz e não é o objeto do teste.
DUBLES = """
-- fn_evento_creditado entra depois, com o resto da instalação.
SET check_function_bodies = off;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
CREATE TABLE IF NOT EXISTS public.retencao_politica (
  tabela text NOT NULL, acao text NOT NULL, coluna_aluno text NOT NULL DEFAULT 'aluno_id',
  categoria text NOT NULL, motivo text NOT NULL, PRIMARY KEY (tabela, acao));
CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_referencia_id(p text) RETURNS bigint
  LANGUAGE sql IMMUTABLE AS $$ SELECT NULL::bigint $$;
CREATE OR REPLACE FUNCTION public.fn_agregados_do_aluno(p_aluno uuid, p_classe_id bigint) RETURNS jsonb
  LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
-- Avaliador simplificado: conta eventos não creditados contra `minimo`.
CREATE OR REPLACE FUNCTION public.fn_avaliar_metrica(p_aluno uuid, p_agregados jsonb, p_criterio jsonb)
  RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (SELECT count(*) FROM public.eventos_aluno e
           WHERE e.aluno_id = p_aluno AND NOT public.fn_evento_creditado(e.tipo))
         >= COALESCE((p_criterio ->> 'minimo')::int, 1) $$;
CREATE OR REPLACE FUNCTION public.economia_avaliar_metas_de(p_aluno uuid, p_classe bigint) RETURNS void
  LANGUAGE sql AS $$ SELECT $$;
-- O esqueleto traz `aluno_perfil.afinidade` como text; o gatilho faz COALESCE(afinidade, 0).
ALTER TABLE public.aluno_perfil ALTER COLUMN afinidade DROP DEFAULT;
ALTER TABLE public.aluno_perfil ALTER COLUMN afinidade TYPE numeric USING afinidade::numeric;
CREATE UNIQUE INDEX IF NOT EXISTS moedas_ledger_ganho_unico
  ON public.moedas_ledger (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento';
"""

GATILHOS = """
CREATE TRIGGER trg_eventos_aluno_after_iud
  AFTER INSERT OR UPDATE OR DELETE ON public.eventos_aluno
  FOR EACH ROW EXECUTE FUNCTION public.trg_eventos_aluno_after_iud();
CREATE TRIGGER trg_eventos_aluno_paga_moeda
  AFTER INSERT ON public.eventos_aluno
  FOR EACH ROW EXECUTE FUNCTION public.fn_eventos_aluno_paga_moeda();
"""


def _instalacao() -> list[str]:
    medalhas = "20261017_09_evento_medalhas.py"
    return [
        _trecho(
            "20261025_01_pontos_do_evento_no_rank.py", "CREATE OR REPLACE FUNCTION public.fn_evento_creditado", "$fn$;"
        ),
        _trecho(
            "20260826_09_rls_posse_por_tabela.py", "CREATE OR REPLACE FUNCTION public.app_classes_do_professor()", "$$;"
        ),
        _trecho("20261013_02_aprovacoes_pendentes.py", "CREATE OR REPLACE FUNCTION public.app_e_dono()", "$function$;"),
        _trecho(medalhas, "CREATE OR REPLACE FUNCTION public.fn_conquista_metrica_suportada", "$function$;"),
        _trecho(medalhas, "CREATE OR REPLACE FUNCTION public.conquista_da_turma_salvar(", "$function$;"),
        _trecho("20260912_02_ganho_de_moedas.py", "CREATE OR REPLACE FUNCTION public.fn_moedas_do_evento(", "$fn$;"),
        _modulo("20261020_05_economia_conclusao_so_com_aprovacao.py").EVENTOS,
        *_sql_de(_modulo("20261003_01_referencia_de_item_personalizado.py"), "upgrade"),
        _modulo("20261021_04_missao_avaliada_no_gatilho.py").GATILHO,
        GATILHOS,
        *_sql_de(_modulo(ARQUIVO), "upgrade"),
    ]


def _seed() -> str:
    return f"""
INSERT INTO auth.users (id, email) VALUES
  ('{PROF}', 'prof@teste.invalid'), ('{PROF2}', 'prof2@teste.invalid'), ('{DONO}', 'dono@teste.invalid'),
  ('{A}', 'a@teste.invalid'), ('{B}', 'b@teste.invalid'), ('{D}', 'd@teste.invalid');
INSERT INTO public.app_config (chave, valor) VALUES ('dono_email', 'dono@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{PROF}', 'Prof'), ('{PROF2}', 'Prof 2');
INSERT INTO public.alunos (id, nome, email) VALUES
  ('{A}', 'A', 'a@teste.invalid'), ('{B}', 'B', 'b@teste.invalid'), ('{D}', 'D', 'd@teste.invalid');
INSERT INTO public.materia (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Mat');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, '{PROF}', 'Turma 1'), (2, 1, '{PROF2}', 'Turma 2');
-- A só na turma 1; B só na turma 2; D em turma nenhuma.
INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (1, '{A}'), (2, '{B}');
INSERT INTO public.conquistas (id, nome, escopo, criterio, pontos_recompensa, classe_id, criado_por, ativa)
OVERRIDING SYSTEM VALUE VALUES
  (101, 'Primeiro passo T1', 'comum', '{{"metrica":"eventos_totais","minimo":1,"aparencia":{{"icone":"estrela","cor":"#fff"}}}}', 10, 1, '{PROF}', true),
  (102, 'Primeiro passo T2', 'comum', '{{"metrica":"eventos_totais","minimo":1}}', 7, 2, '{PROF2}', true);
INSERT INTO public.eventos_pontuacao (tipo, pontos, moedas) VALUES ('conquista_desbloqueada', 0, 5);
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
    nome = f"tu158_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(_dsn_para(nome), autocommit=True) as c:
            c.execute(PAPEIS)
            c.execute(ESQUELETO.read_text(encoding="utf-8"))
            c.execute(DUBLES)
            for tabela in ("professor", "classe", "materia", "alunos", "notificacoes"):
                _afrouxa(c, tabela)
            for sql in _instalacao():
                c.execute(sql)
            c.execute(_seed())
            yield c
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _como(c, quem: uuid.UUID | None, email: str | None = None) -> None:
    """Sessão de quem chama (o que o PostgREST põe no JWT). `None` = service_role/migration."""
    sub = str(quem) if quem else ""
    claims = json.dumps({"sub": sub, "role": "authenticated", "email": email}) if quem else ""
    c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (sub,))
    c.execute("SELECT set_config('request.jwt.claims', %s, false)", (claims,))


def _evento(c, aluno: uuid.UUID, ref: str) -> None:
    c.execute(
        "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em) "
        "VALUES (%s, 'atividade_concluida', %s, 1, now())",
        (aluno, ref),
    )


def _ganhou(c, aluno: uuid.UUID) -> set[int]:
    return {
        r[0]
        for r in c.execute(
            "SELECT conquista_id FROM public.conquistas_aluno WHERE aluno_id = %s AND concluida", (aluno,)
        ).fetchall()
    }


def _ler_log_como(c, quem: uuid.UUID, email: str) -> int:
    _como(c, quem, email)
    c.execute("BEGIN")
    try:
        c.execute("SET LOCAL ROLE authenticated")
        return c.execute("SELECT count(*) FROM public.conquistas_criterio_log").fetchone()[0]
    finally:
        c.execute("ROLLBACK")
        _como(c, None)


@e2e
def test_apagar_a_turma_deixa_a_conquista_orfa_e_o_aluno_com_ela():
    with _banco() as c:
        _evento(c, A, "atividade:1")
        assert _ganhou(c, A) == {101}

        c.execute("DELETE FROM public.classe WHERE id = 1")

        ativa, classe, removida = c.execute(
            "SELECT ativa, classe_id, classe_removida_em IS NOT NULL FROM public.conquistas WHERE id = 101"
        ).fetchone()
        assert (ativa, classe, removida) == (False, None, True)
        # Antes da 20261026_02 a cascata levava a conquista e a posse de A.
        assert _ganhou(c, A) == {101}

        # Órfã não vira global: D (sem turma) cumpre o critério e não ganha.
        _evento(c, D, "atividade:2")
        assert _ganhou(c, D) == set()

        with pytest.raises(psycopg.errors.InvalidParameterValue):
            c.execute("UPDATE public.conquistas SET ativa = true WHERE id = 101")


@e2e
def test_aluno_de_outra_turma_nao_e_afetado():
    with _banco() as c:
        _evento(c, B, "atividade:3")
        assert _ganhou(c, B) == {102}

        c.execute("DELETE FROM public.classe WHERE id = 1")

        assert c.execute("SELECT ativa, classe_id FROM public.conquistas WHERE id = 102").fetchone() == (True, 2)
        assert _ganhou(c, B) == {102}
        # B continua sendo avaliado só pelas da turma 2: a órfã da turma 1 não entra.
        _evento(c, B, "atividade:4")
        assert _ganhou(c, B) == {102}


@e2e
def test_troca_de_criterio_grava_historico_lido_so_pelo_professor_e_pelo_dono():
    with _banco() as c:
        _como(c, PROF, "prof@teste.invalid")
        c.execute("BEGIN")
        c.execute("SET LOCAL ROLE authenticated")
        c.execute(
            "SELECT public.conquista_da_turma_salvar(1, 101, 'Primeiro passo T1', NULL, 'comum', NULL, %s, 10)",
            (json.dumps({"metrica": "eventos_totais", "minimo": 3, "aparencia": {"icone": "estrela", "cor": "#fff"}}),),
        )
        # Só a aparência mudou: não é troca de critério.
        c.execute(
            "SELECT public.conquista_da_turma_salvar(1, 101, 'Primeiro passo T1', NULL, 'comum', NULL, %s, 10)",
            (json.dumps({"metrica": "eventos_totais", "minimo": 3, "aparencia": {"icone": "raio", "cor": "#000"}}),),
        )
        c.execute("COMMIT")
        _como(c, None)

        linhas = c.execute(
            "SELECT conquista_id, classe_id, alterado_por, metrica_anterior, metrica_nova, "
            "limiar_anterior, limiar_novo, alterado_em IS NOT NULL FROM public.conquistas_criterio_log"
        ).fetchall()
        assert linhas == [(101, 1, PROF, "eventos_totais", "eventos_totais", {"minimo": 1}, {"minimo": 3}, True)]

        assert _ler_log_como(c, PROF, "prof@teste.invalid") == 1
        assert _ler_log_como(c, DONO, "dono@teste.invalid") == 1
        assert _ler_log_como(c, PROF2, "prof2@teste.invalid") == 0
        assert _ler_log_como(c, A, "a@teste.invalid") == 0

        # Ninguém escreve direto, nem o professor da turma.
        _como(c, PROF, "prof@teste.invalid")
        c.execute("BEGIN")
        try:
            c.execute("SET LOCAL ROLE authenticated")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute("INSERT INTO public.conquistas_criterio_log (conquista_id, classe_id) VALUES (101, 1)")
        finally:
            c.execute("ROLLBACK")
            _como(c, None)

        # O histórico é da turma: sai com ela.
        c.execute("DELETE FROM public.classe WHERE id = 1")
        assert c.execute("SELECT count(*) FROM public.conquistas_criterio_log").fetchone()[0] == 0


@e2e
def test_premio_da_conquista_e_creditado_e_cai_na_carteira():
    with _banco() as c:
        assert c.execute("SELECT public.fn_evento_creditado('conquista_desbloqueada')").fetchone()[0] is True

        _evento(c, A, "atividade:5")
        premios = c.execute(
            "SELECT referencia, valor FROM public.eventos_aluno "
            "WHERE aluno_id = %s AND tipo = 'conquista_desbloqueada'",
            (A,),
        ).fetchall()
        # Um prêmio só: o evento creditado não reentra no gatilho.
        assert [(r, int(v)) for r, v in premios] == [("conquista:101", 10)]

        carteira = c.execute(
            "SELECT delta, motivo, referencia FROM public.moedas_ledger "
            "WHERE aluno_id = %s AND evento_tipo = 'conquista_desbloqueada'",
            (A,),
        ).fetchall()
        assert [(int(d), m, r) for d, m, r in carteira] == [(5, "evento", "conquista:101")]

        # A turma some; o prêmio e a moeda de A ficam.
        c.execute("DELETE FROM public.classe WHERE id = 1")
        assert (
            c.execute(
                "SELECT count(*) FROM public.moedas_ledger WHERE aluno_id = %s AND evento_tipo = 'conquista_desbloqueada'",
                (A,),
            ).fetchone()[0]
            == 1
        )
