"""`20261105_27` num Postgres descartável: o dono vê e gerencia termos sem reescrever prova, e o professor passa a ter aceite."""

from __future__ import annotations

import json
import os
import uuid

import pytest
from sqlalchemy import text

from tests.test_e2e_administracao_no_banco import como, voltar
from tests.test_e2e_monitor_disponibilidade import ALUNO, DONO, EMAIL_DONO, _modulo, banco  # noqa: F401

C = _modulo("20261024_02_consentimento_do_responsavel.py")
M = _modulo("20261105_27_termos_na_administracao.py")
exige_docker = pytest.mark.skipif(os.environ.get("TRAILUP_TEST_DOCKER") != "1", reason="requer TRAILUP_TEST_DOCKER=1 e Docker")

PROF = str(uuid.uuid4())
OUTRO_PROF = str(uuid.uuid4())
MENOR = str(uuid.uuid4())
TERMO = "2026-10-24-v5"
SEM_FINALIDADE = json.dumps({"camera": False})


class _Coletor:
    def __init__(self) -> None:
        self.sql: list[str] = []

    def execute(self, sql: str) -> None:
        self.sql.append(sql)


def _sql_de(modulo, funcao: str = "upgrade") -> list[str]:
    coletor = _Coletor()
    original = modulo.op
    modulo.op = coletor
    try:
        getattr(modulo, funcao)()
    finally:
        modulo.op = original
    return coletor.sql


ESTRUTURA = f"""
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
ALTER TABLE public.professor ADD COLUMN IF NOT EXISTS nome text, ADD COLUMN IF NOT EXISTS instituicao text,
  ADD COLUMN IF NOT EXISTS liberado boolean NOT NULL DEFAULT false;
ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS email text, ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.classe ADD COLUMN IF NOT EXISTS professor_id uuid;
INSERT INTO auth.users VALUES ('{PROF}', 'prof@example.test'), ('{OUTRO_PROF}', 'outro@example.test');
INSERT INTO public.professor (id, nome) VALUES ('{PROF}', 'Prof'), ('{OUTRO_PROF}', 'Outro');
INSERT INTO public.alunos (id, nome) VALUES ('{MENOR}', 'Menor');
CREATE FUNCTION public.trg_consentimento_carimbo_do_servidor() RETURNS trigger
LANGUAGE plpgsql AS $f$ BEGIN NEW.registrado_em := now(); RETURN NEW; END $f$;
CREATE TABLE public.consentimento_telemetria (
  id bigserial PRIMARY KEY, aluno_id uuid REFERENCES public.alunos(id) ON DELETE SET NULL, versao text, status text,
  decidido_em timestamptz, registrado_em timestamptz, origem jsonb NOT NULL DEFAULT '{{}}'::jsonb);
DROP TABLE IF EXISTS public.retencao_politica CASCADE;
CREATE TABLE public.retencao_politica (
  tabela text, acao text, coluna_tempo text, coluna_aluno text, dias integer, dias_pesquisa integer,
  filtro text, ajuste text, ordem integer, categoria text, motivo text, revisado_em date, PRIMARY KEY (tabela, acao));
"""
TELEMETRIA = "".join(
    f"CREATE TABLE IF NOT EXISTS public.{t} (id bigserial PRIMARY KEY, aluno_id uuid NOT NULL, marca text);"
    for t in C.TABELAS_DE_TELEMETRIA
)


@pytest.fixture
def termos(banco):  # noqa: F811
    banco.execute(ESTRUTURA)
    banco.execute(TELEMETRIA)
    for sql in _sql_de(C):
        banco.execute(sql)
    for sql in _sql_de(M):
        banco.execute(sql)
    return banco


def _nascer(c, aluno: str, ano: int) -> None:
    c.execute(
        "INSERT INTO public.aluno_nascimento (aluno_id, data_nascimento, registrado_por) VALUES (%s, make_date(%s, 1, 15), %s)",
        (aluno, ano, aluno),
    )


def _responsavel_aceitou(c, aluno: str) -> None:
    c.execute(
        "INSERT INTO public.consentimento_responsavel (aluno_id, versao, status, metodo, finalidades, nome_responsavel,"
        " relacao, declaracao, decidido_em, registrado_por) VALUES (%s, %s, 'accepted', 'aparelho', '{}', 'Mãe', 'mae', true,"
        " now() - interval '1 day', %s)",
        (aluno, C.VERSAO_RESPONSAVEL, aluno),
    )


def _papel(aluno: str) -> tuple:
    return (aluno, C.VERSAO_RESPONSAVEL, "2026-10-01", "Maria Responsável", "mae", SEM_FINALIDADE, None, True)


PAPEL = "SELECT public.professor_registrar_termo_papel(%s, %s, %s::date, %s, %s, %s::jsonb, %s, %s)"


def test_nenhuma_funcao_tem_bind_escondido() -> None:
    for sql in _sql_de(M) + _sql_de(M, "downgrade"):
        assert text(sql).compile().params == {}


CHAMADAS = [
    ("SELECT public.admin_termos()", ()),
    ("SELECT public.admin_termos_detalhe('aluno', %s)", (ALUNO,)),
    ("SELECT public.admin_termo_revogar('pesquisa', %s, 'pedido do titular')", (ALUNO,)),
    ("SELECT public.admin_aluno_nascimento_corrigir(%s, DATE '2000-01-01', 'erro de digitação')", (ALUNO,)),
]


@exige_docker
@pytest.mark.parametrize(("sql", "args"), CHAMADAS)
def test_so_o_dono_entra(termos, sql, args) -> None:
    import psycopg

    como(termos, PROF, "prof@example.test")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        termos.execute(sql, args)
    voltar(termos)
    termos.execute("SET ROLE anon")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        termos.execute(sql, args)
    voltar(termos)


@exige_docker
def test_professor_aceita_e_so_ve_o_proprio(termos) -> None:
    import psycopg

    como(termos, PROF, "prof@example.test")
    assert termos.execute("SELECT public.professor_meu_aceite() ->> 'vigente'").fetchone()[0] == "false"
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        termos.execute("SELECT public.professor_registrar_aceite_termos('velha', NULL)")
    for _ in range(2):
        resposta = termos.execute(
            "SELECT public.professor_registrar_aceite_termos(%s, '{\"via\": \"console\"}')", (M.VERSAO_PROFESSOR,)
        ).fetchone()[0]
    assert resposta["vigente"] is True
    assert termos.execute("SELECT count(*) FROM public.consentimento_professor").fetchone()[0] == 1
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        termos.execute(
            "INSERT INTO public.consentimento_professor (professor_id, versao, status) VALUES (%s, 'x', 'accepted')", (PROF,)
        )
    voltar(termos)

    como(termos, OUTRO_PROF, "outro@example.test")
    assert termos.execute("SELECT count(*) FROM public.consentimento_professor").fetchone()[0] == 0
    voltar(termos)


@exige_docker
def test_aluno_nao_aceita_termo_de_professor(termos) -> None:
    import psycopg

    como(termos, ALUNO, "aluno@example.test")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        termos.execute("SELECT public.professor_registrar_aceite_termos(%s, NULL)", (M.VERSAO_PROFESSOR,))
    voltar(termos)


@exige_docker
def test_dono_le_situacao_e_historico(termos) -> None:
    _nascer(termos, MENOR, 2015)
    _responsavel_aceitou(termos, MENOR)
    termos.execute(
        "INSERT INTO public.consentimento_telemetria (aluno_id, versao, status, decidido_em, origem)"
        " VALUES (%s, %s, 'accepted', now(), '{\"plataforma\": \"web\"}')",
        (MENOR, TERMO),
    )
    como(termos, DONO, EMAIL_DONO)
    dados = termos.execute("SELECT public.admin_termos()").fetchone()[0]
    detalhe = termos.execute("SELECT public.admin_termos_detalhe('aluno', %s)", (MENOR,)).fetchone()[0]
    voltar(termos)

    assert dados["versoes"]["professor"] == M.VERSAO_PROFESSOR
    menor = next(a for a in dados["alunos"] if a["aluno_id"] == MENOR)
    assert (menor["idade"], menor["modo_restrito"]) == ("menor", False)
    assert menor["responsavel"]["vigente"] is True
    assert menor["termo"]["versao"] == TERMO
    assert menor["pesquisa"] is None
    sem_nada = next(a for a in dados["alunos"] if a["aluno_id"] == ALUNO)
    assert (sem_nada["idade"], sem_nada["modo_restrito"], sem_nada["termo"]) == ("desconhecida", True, None)
    professor = next(p for p in dados["professores"] if p["professor_id"] == PROF)
    assert (professor["email"], professor["aceite"]) == ("prof@example.test", None)

    assert detalhe["nascimento"]["data"] == "2015-01-15"
    assert detalhe["responsavel"][0]["nome"] == "Mãe"
    assert detalhe["termos"][0]["plataforma"] == "web"


@exige_docker
def test_dono_registra_papel_de_qualquer_turma_e_professor_nao(termos) -> None:
    import psycopg

    _nascer(termos, MENOR, 2015)
    como(termos, PROF, "prof@example.test")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        termos.execute(PAPEL, _papel(MENOR))
    voltar(termos)

    como(termos, DONO, EMAIL_DONO)
    termos.execute(PAPEL, _papel(MENOR))
    voltar(termos)
    linha = termos.execute(
        "SELECT metodo, professor_id, origem ->> 'canal', public.aluno_modo_restrito(aluno_id)"
        " FROM public.consentimento_responsavel WHERE aluno_id = %s",
        (MENOR,),
    ).fetchone()
    assert (linha[0], str(linha[1]), linha[2], linha[3]) == ("papel", DONO, "administracao", False)


@exige_docker
def test_revogar_acrescenta_linha_e_devolve_o_modo_restrito(termos) -> None:
    import psycopg

    _nascer(termos, MENOR, 2015)
    _responsavel_aceitou(termos, MENOR)
    como(termos, DONO, EMAIL_DONO)
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        termos.execute("SELECT public.admin_termo_revogar('responsavel', %s, ' ')", (MENOR,))
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        termos.execute("SELECT public.admin_termo_revogar('telemetria', %s, 'pedido do titular')", (MENOR,))
    termos.execute("SELECT public.admin_termo_revogar('responsavel', %s, 'pedido da mãe')", (MENOR,))
    with pytest.raises(psycopg.errors.NoDataFound):
        termos.execute("SELECT public.admin_termo_revogar('responsavel', %s, 'pedido da mãe')", (MENOR,))
    voltar(termos)

    linhas = termos.execute(
        "SELECT status, origem ->> 'motivo' FROM public.consentimento_responsavel WHERE aluno_id = %s ORDER BY decidido_em",
        (MENOR,),
    ).fetchall()
    assert linhas == [("accepted", None), ("rejected", "pedido da mãe")]
    assert termos.execute("SELECT public.aluno_modo_restrito(%s)", (MENOR,)).fetchone()[0] is True


@exige_docker
def test_revogar_aceite_do_professor_pede_de_novo(termos) -> None:
    como(termos, PROF, "prof@example.test")
    termos.execute("SELECT public.professor_registrar_aceite_termos(%s, NULL)", (M.VERSAO_PROFESSOR,))
    voltar(termos)
    como(termos, DONO, EMAIL_DONO)
    termos.execute("SELECT public.admin_termo_revogar('professor', %s, 'conferência')", (PROF,))
    detalhe = termos.execute("SELECT public.admin_termos_detalhe('professor', %s)", (PROF,)).fetchone()[0]
    voltar(termos)
    assert [a["status"] for a in detalhe["aceites"]] == ["rejected", "accepted"]
    assert detalhe["aceites"][0]["motivo"] == "conferência"
    como(termos, PROF, "prof@example.test")
    assert termos.execute("SELECT public.professor_meu_aceite() ->> 'vigente'").fetchone()[0] == "false"
    voltar(termos)


@exige_docker
def test_corrigir_nascimento_guarda_a_data_anterior(termos) -> None:
    import psycopg

    _nascer(termos, MENOR, 2015)
    como(termos, DONO, EMAIL_DONO)
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        termos.execute("SELECT public.admin_aluno_nascimento_corrigir(%s, DATE '2015-01-15', 'mesma data')", (MENOR,))
    with pytest.raises(psycopg.errors.DatetimeFieldOverflow):
        termos.execute("SELECT public.admin_aluno_nascimento_corrigir(%s, DATE '2999-01-01', 'no futuro')", (MENOR,))
    resposta = termos.execute(
        "SELECT public.admin_aluno_nascimento_corrigir(%s, DATE '1990-01-15', 'erro de digitação')", (MENOR,)
    ).fetchone()[0]
    detalhe = termos.execute("SELECT public.admin_termos_detalhe('aluno', %s)", (MENOR,)).fetchone()[0]
    voltar(termos)
    assert resposta["modo_restrito"] is False
    assert detalhe["correcoes"][0]["data_anterior"] == "2015-01-15"
    assert detalhe["nascimento"]["data"] == "1990-01-15"

    # Quem não tinha data também pode receber a primeira pela correção.
    como(termos, DONO, EMAIL_DONO)
    termos.execute("SELECT public.admin_aluno_nascimento_corrigir(%s, DATE '1995-02-02', 'informado pela escola')", (ALUNO,))
    voltar(termos)
    assert termos.execute("SELECT public.aluno_eh_menor(%s)", (ALUNO,)).fetchone()[0] is False


@exige_docker
def test_trilha_da_correcao_e_invisivel_ao_cliente(termos) -> None:
    import psycopg

    termos.execute("SET ROLE authenticated")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        termos.execute("SELECT count(*) FROM public.aluno_nascimento_correcao")
    voltar(termos)


@exige_docker
def test_conta_de_professor_apagada_deixa_so_a_prova_minima(termos) -> None:
    como(termos, PROF, "prof@example.test")
    termos.execute("SELECT public.professor_registrar_aceite_termos(%s, '{\"via\": \"console\"}')", (M.VERSAO_PROFESSOR,))
    voltar(termos)
    termos.execute("DELETE FROM public.professor WHERE id = %s", (PROF,))
    linha = termos.execute(
        "SELECT professor_id, registrado_por, origem, titular_hash IS NOT NULL, anonimizado_em IS NOT NULL, versao"
        " FROM public.consentimento_professor"
    ).fetchone()
    assert linha == (None, None, {}, True, True, M.VERSAO_PROFESSOR)


@exige_docker
def test_downgrade_devolve_o_termo_em_papel(termos) -> None:
    for sql in _sql_de(M, "downgrade"):
        termos.execute(sql)
    assert termos.execute("SELECT to_regclass('public.consentimento_professor')").fetchone()[0] is None
    corpo = termos.execute("SELECT prosrc FROM pg_proc WHERE proname = 'professor_registrar_termo_papel'").fetchone()[0]
    assert "app_e_dono" not in corpo
