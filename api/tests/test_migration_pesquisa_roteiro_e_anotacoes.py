import importlib.util
from io import StringIO
from pathlib import Path

from sqlalchemy import text

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

_ARQUIVO = (
    Path(__file__).resolve().parents[1] / "alembic" / "versions" / "20261123_03_pesquisa_roteiro_e_anotacoes.py"
)


def _modulo():
    spec = importlib.util.spec_from_file_location("m20261123_03", _ARQUIVO)
    assert spec and spec.loader
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261123_02:20261123_03", sql=True)
    return output.getvalue()


def _corpo(sql: str, assinatura: str) -> str:
    return sql.split(f"CREATE OR REPLACE FUNCTION public.{assinatura}")[1].split("$function$;")[0]


def test_tabelas_nascem_com_rls_e_policy_no_mesmo_commit() -> None:
    sql = _upgrade_sql()

    for tabela in ("pesquisa_roteiro_marca", "pesquisa_anotacao"):
        assert f"CREATE TABLE IF NOT EXISTS public.{tabela}" in sql
        assert f"ALTER TABLE public.{tabela} ENABLE ROW LEVEL SECURITY" in sql
        assert f"REVOKE ALL ON public.{tabela} FROM PUBLIC, anon, authenticated" in sql
        for comando in ("SELECT", "INSERT", "DELETE"):
            assert f"ON public.{tabela}\n  FOR {comando} TO authenticated" in sql
    assert "ON public.pesquisa_anotacao\n  FOR UPDATE TO authenticated" in sql


def test_toda_policy_filtra_pelo_avaliador_da_conta_logada() -> None:
    sql = _upgrade_sql()
    policies = [p.split(";")[0] for p in sql.split("CREATE POLICY ")[1:]]

    assert len(policies) == 7
    for policy in policies:
        assert "avaliador_id = public.pesquisa_meu_avaliador_id()" in policy, policy
    # Anotação é do avaliador, não dado da pesquisa: nem o dono lê.
    assert "app_e_dono" not in sql


def test_cliente_nao_escolhe_de_quem_e_a_linha() -> None:
    sql = _upgrade_sql()

    # avaliador_id e autor_id vêm do banco, e o cliente não tem GRANT nessas colunas.
    assert sql.count("avaliador_id bigint NOT NULL DEFAULT public.pesquisa_meu_avaliador_id()") == 2
    assert sql.count("autor_id uuid NOT NULL DEFAULT auth.uid()") == 2
    assert "GRANT INSERT (etapa) ON public.pesquisa_roteiro_marca TO authenticated" in sql
    assert "GRANT INSERT (etapa, plataforma, texto) ON public.pesquisa_anotacao TO authenticated" in sql
    assert "GRANT UPDATE (etapa, texto) ON public.pesquisa_anotacao TO authenticated" in sql
    assert "GRANT INSERT ON public.pesquisa" not in sql
    assert "GRANT UPDATE ON public.pesquisa" not in sql


def test_avaliador_vale_para_professor_e_aluno_de_teste() -> None:
    sql = _upgrade_sql()

    for funcao in ("pesquisa_meu_avaliador_id()", "pesquisa_meu_roteiro()"):
        corpo = _corpo(sql, funcao)
        assert "SECURITY DEFINER" in corpo
        assert "auth.uid() IS NOT NULL" in corpo
        assert "pa.professor_id = auth.uid() OR pa.aluno_teste_id = auth.uid()" in corpo
        assert f"REVOKE ALL ON FUNCTION public.{funcao} FROM PUBLIC, anon" in sql
    assert "'papel', CASE WHEN pa.professor_id = auth.uid() THEN 'professor' ELSE 'aluno' END" in sql


def test_retencao_registrada_e_sai_com_o_avaliador() -> None:
    sql = _upgrade_sql()

    assert "INSERT INTO public.retencao_politica" in sql
    assert "('pesquisa_roteiro_marca', 'vida_da_conta', 'autor_id', 'vida_da_conta'" in sql
    assert "('pesquisa_anotacao', 'vida_da_conta', 'autor_id', 'vida_da_conta'" in sql
    assert sql.count("REFERENCES public.pesquisa_avaliador(id) ON DELETE CASCADE") == 2


def test_texto_da_anotacao_tem_limite() -> None:
    sql = _upgrade_sql()

    assert "CHECK (char_length(btrim(texto)) BETWEEN 1 AND 2000)" in sql
    assert "CHECK (plataforma IN ('console', 'app'))" in sql


def test_sql_sem_bind_acidental() -> None:
    modulo = _modulo()
    assert text(modulo.SQL).compile().params == {}
    assert text(modulo.DOWNGRADE_SQL).compile().params == {}
