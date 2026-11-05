"""`20261105_16` num Postgres descartável: só o dono entra, e cada ação grava o que a página da API gravava."""

from __future__ import annotations

import json
import os
import uuid

import pytest
from sqlalchemy import text

from tests.test_e2e_monitor_disponibilidade import ALUNO, DONO, EMAIL_DONO, _modulo, banco  # noqa: F401

M = _modulo("20261105_16_administracao_no_banco.py")
exige_docker = pytest.mark.skipif(os.environ.get("TRAILUP_TEST_DOCKER") != "1", reason="requer TRAILUP_TEST_DOCKER=1 e Docker")
OUTRO = str(uuid.uuid4())

ESTRUTURA = f"""
ALTER TABLE public.professor ADD COLUMN nome text, ADD COLUMN descricao text, ADD COLUMN instituicao text,
  ADD COLUMN disciplina text, ADD COLUMN liberado boolean NOT NULL DEFAULT false;
ALTER TABLE public.alunos ADD COLUMN email text;
INSERT INTO auth.users VALUES ('{OUTRO}', 'prof@example.test');
INSERT INTO public.professor (id, nome) VALUES ('{OUTRO}', 'Prof');
CREATE TABLE public.professor_aluno (
  professor_id uuid, aluno_id uuid, has_acesso boolean NOT NULL DEFAULT true, PRIMARY KEY (professor_id, aluno_id));
ALTER TABLE public.professor_aluno ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.conquistas (id bigint PRIMARY KEY, nome text);
CREATE TABLE public.molduras (codigo text PRIMARY KEY, nome text, origem text, preco integer, ativa boolean,
  conquista_id bigint, ordem integer NOT NULL DEFAULT 0);
INSERT INTO public.molduras VALUES ('ouro', 'Ouro', 'loja', 10, true, NULL, 1);
CREATE TABLE public.moldura_aluno (moldura_codigo text);
CREATE TABLE public.molduras_acoes (acao text PRIMARY KEY, rotulo text, descricao text, moldura_codigo text, ativa boolean);
INSERT INTO public.molduras_acoes VALUES ('perfil', 'Perfil', NULL, 'ouro', true);
CREATE TABLE public.moldura_acao_aluno (acao text);
CREATE TABLE public.chamadas (quem text);
CREATE FUNCTION public.molduras_admin_salvar(p_codigo text, p_ativa boolean, p_preco integer, p_ator text)
RETURNS jsonb LANGUAGE plpgsql AS $f$
BEGIN
  INSERT INTO public.chamadas VALUES (p_ator);
  RETURN jsonb_build_object('codigo', p_codigo);
END $f$;
CREATE FUNCTION public.molduras_admin_salvar_acao(p_acao text, p_ativa boolean, p_moldura text, p_ator text)
RETURNS jsonb LANGUAGE plpgsql AS $f$
BEGIN
  INSERT INTO public.chamadas VALUES (p_ator);
  RETURN jsonb_build_object('acao', p_acao);
END $f$;
REVOKE ALL ON FUNCTION public.molduras_admin_salvar(text, boolean, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.molduras_admin_salvar_acao(text, boolean, text, text) FROM PUBLIC;
CREATE TABLE public.economia_auditoria (id bigserial PRIMARY KEY, ocorrido_em timestamptz NOT NULL DEFAULT now(),
  ator_id uuid, operacao text, entidade text, entidade_id text, classe_id bigint, aluno_id uuid, antes jsonb, depois jsonb);
INSERT INTO public.economia_auditoria (operacao) VALUES ('compra'), ('estorno');
CREATE FUNCTION public.economia_consistencia()
RETURNS TABLE (aluno_id uuid, saldo numeric, saldo_negativo boolean, compras_sem_debito bigint, estornos_sem_credito bigint)
LANGUAGE sql AS $f$ SELECT NULL::uuid, 0::numeric, false, 0::bigint, 0::bigint WHERE false $f$;
REVOKE ALL ON FUNCTION public.economia_consistencia() FROM PUBLIC;
"""


@pytest.fixture
def c(banco):  # noqa: F811
    banco.execute(ESTRUTURA)
    banco.execute(M.FUNCOES)
    return banco


def como(c, uid, email):
    c.execute("SELECT set_config('request.jwt.claims', %s, false)", (json.dumps({"sub": uid, "email": email}),))
    c.execute("SET ROLE authenticated")


def voltar(c):
    c.execute("RESET ROLE")
    c.execute("SELECT set_config('request.jwt.claims', '', false)")


CHAMADAS = [
    "SELECT public.admin_acessos()",
    f"SELECT public.admin_professor_liberar('{OUTRO}', true)",
    f"SELECT public.admin_professor_aluno('{OUTRO}', '{ALUNO}', true)",
    "SELECT public.admin_molduras()",
    "SELECT public.admin_moldura_salvar('ouro', true, 5)",
    "SELECT public.admin_moldura_acao_salvar('perfil', true, 'ouro')",
    "SELECT public.admin_economia()",
]


@exige_docker
@pytest.mark.parametrize("sql", CHAMADAS)
def test_professor_comum_e_recusado(c, sql) -> None:
    import psycopg

    como(c, OUTRO, "prof@example.test")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute(sql)
    voltar(c)


@exige_docker
@pytest.mark.parametrize("sql", CHAMADAS)
def test_anon_nao_tem_execute(c, sql) -> None:
    import psycopg

    c.execute("SET ROLE anon")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute(sql)
    voltar(c)


@exige_docker
def test_liberar_e_bloquear(c) -> None:
    como(c, DONO, EMAIL_DONO)
    c.execute(f"SELECT public.admin_professor_liberar('{OUTRO}', true)")
    voltar(c)
    assert c.execute(f"SELECT liberado FROM public.professor WHERE id = '{OUTRO}'").fetchone()[0] is True
    como(c, DONO, EMAIL_DONO)
    c.execute(f"SELECT public.admin_professor_liberar('{OUTRO}', false)")
    voltar(c)
    assert c.execute(f"SELECT liberado FROM public.professor WHERE id = '{OUTRO}'").fetchone()[0] is False


@exige_docker
def test_vinculo_passa_pela_rls_e_aparece_e_sai_da_lista(c) -> None:
    como(c, DONO, EMAIL_DONO)
    c.execute(f"SELECT public.admin_professor_aluno('{OUTRO}', '{ALUNO}', true)")
    dados = c.execute("SELECT public.admin_acessos()").fetchone()[0]
    prof = next(p for p in dados["professores"] if p["professor_id"] == OUTRO)
    assert [a["aluno_id"] for a in prof["alunos"]] == [ALUNO]
    c.execute(f"SELECT public.admin_professor_aluno('{OUTRO}', '{ALUNO}', false)")
    dados = c.execute("SELECT public.admin_acessos()").fetchone()[0]
    voltar(c)
    assert next(p for p in dados["professores"] if p["professor_id"] == OUTRO)["alunos"] == []
    assert len(dados["alunos"]) == 1


@exige_docker
def test_alvo_inexistente_e_avisado(c) -> None:
    import psycopg

    como(c, DONO, EMAIL_DONO)
    with pytest.raises(psycopg.errors.NoDataFound):
        c.execute(f"SELECT public.admin_professor_liberar('{uuid.uuid4()}', true)")
    with pytest.raises(psycopg.errors.NoDataFound):
        c.execute(f"SELECT public.admin_professor_aluno('{OUTRO}', '{uuid.uuid4()}', true)")
    voltar(c)


@exige_docker
def test_molduras_gravam_o_dono_como_ator(c) -> None:
    como(c, DONO, EMAIL_DONO)
    c.execute("SELECT public.admin_moldura_salvar('ouro', false, 5)")
    c.execute("SELECT public.admin_moldura_acao_salvar('perfil', true, 'ouro')")
    dados = c.execute("SELECT public.admin_molduras()").fetchone()[0]
    voltar(c)
    assert [r[0] for r in c.execute("SELECT quem FROM public.chamadas").fetchall()] == [EMAIL_DONO, EMAIL_DONO]
    assert dados["molduras"][0]["codigo"] == "ouro" and dados["acoes"][0]["acao"] == "perfil"


@exige_docker
def test_economia_filtra_e_limita(c) -> None:
    import psycopg

    como(c, DONO, EMAIL_DONO)
    dados = c.execute("SELECT public.admin_economia('compra', 10)").fetchone()[0]
    assert [a["operacao"] for a in dados["auditoria"]] == ["compra"] and dados["consistencia"] == []
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        c.execute("SELECT public.admin_economia(NULL, 201)")
    voltar(c)


def test_nenhum_bloco_vira_parametro_de_bind() -> None:
    assert not text(M.FUNCOES).compile().params
