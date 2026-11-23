import importlib.util
from io import StringIO
from pathlib import Path

from sqlalchemy import text

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

_ARQUIVO = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "20261123_01_pesquisa_avaliadores.py"


def _modulo():
    spec = importlib.util.spec_from_file_location("m20261123_01", _ARQUIVO)
    assert spec and spec.loader
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261121_05:20261123_01", sql=True)
    return output.getvalue()


def test_tabela_nasce_com_rls_policy_e_sem_escrita_do_cliente() -> None:
    sql = _upgrade_sql()

    assert "CREATE TABLE IF NOT EXISTS public.pesquisa_avaliador" in sql
    assert "ALTER TABLE public.pesquisa_avaliador ENABLE ROW LEVEL SECURITY" in sql
    assert "REVOKE ALL ON public.pesquisa_avaliador FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT SELECT ON public.pesquisa_avaliador TO authenticated" in sql
    # Criar a tabela e a policy no mesmo commit: sem ela, a aba do console sumiria em silêncio.
    assert "CREATE POLICY pesquisa_avaliador_sel ON public.pesquisa_avaliador" in sql
    assert "USING (professor_id = auth.uid() OR public.app_e_dono())" in sql
    # Senha não tem coluna.
    assert "senha" not in sql.split("CREATE TABLE IF NOT EXISTS public.pesquisa_avaliador")[1].split(");")[0]


def test_preparar_avaliador_e_so_do_service_role() -> None:
    sql = _upgrade_sql()

    assert "RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER" in sql
    assert (
        "REVOKE ALL ON FUNCTION public.pesquisa_preparar_avaliador(text, text, text, uuid, uuid, text)\n"
        "  FROM PUBLIC, anon, authenticated" in sql
    )
    assert "TO service_role;" in sql.split("GRANT EXECUTE ON FUNCTION public.pesquisa_preparar_avaliador")[1][:120]


def test_professor_nasce_liberado_num_insert_e_a_copia_passa_para_ele() -> None:
    sql = _upgrade_sql()
    corpo = sql.split("CREATE OR REPLACE FUNCTION public.pesquisa_preparar_avaliador")[1].split("$function$;")[0]

    # INSERT, não UPDATE: professor_block_self_approve recusa mudar liberado sem o e-mail do dono.
    assert "INSERT INTO public.professor (id, nome, descricao, instituicao, liberado)" in corpo
    assert "UPDATE public.professor" not in corpo
    # As claims do dono valem só durante a cópia, locais à transação, e voltam ao valor anterior.
    inicio = corpo.index("PERFORM set_config('request.jwt.claims',")
    copia = corpo.index("v_nova := public.duplicar_classe(v_modelo);")
    volta = corpo.index("PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);")
    assert inicio < copia < volta
    assert "SET request" not in corpo and "SET LOCAL" not in corpo
    assert corpo.index("SET professor_id = p_professor") > volta
    # Idempotente por e-mail, antes de criar qualquer coisa.
    assert corpo.index("WHERE lower(email) = lower(btrim(p_email))") < corpo.index("INSERT INTO public.professor")


def test_matricula_do_aluno_de_teste_roda_no_commit_e_nao_derruba_o_cadastro() -> None:
    sql = _upgrade_sql()

    assert "CREATE CONSTRAINT TRIGGER trg_pesquisa_matricula_aluno_teste" in sql
    assert "AFTER INSERT ON public.alunos\n  DEFERRABLE INITIALLY DEFERRED" in sql
    corpo = sql.split("CREATE OR REPLACE FUNCTION public.fn_pesquisa_matricula_aluno_teste()")[1].split("$function$;")[0]
    assert "EXCEPTION WHEN OTHERS THEN" in corpo
    assert "NOT EXISTS (" in corpo


def test_sql_sem_bind_acidental() -> None:
    modulo = _modulo()
    # `:palavra` dentro do op.execute viraria parâmetro do text() e quebraria só ao aplicar.
    assert text(modulo.SQL).compile().params == {}
    assert text(modulo.DOWNGRADE_SQL).compile().params == {}


def test_link_da_avaliacao_so_sai_para_avaliador_ou_dono() -> None:
    sql = _upgrade_sql()
    corpo = sql.split("CREATE OR REPLACE FUNCTION public.pesquisa_meu_acesso()")[1].split("$function$;")[0]

    assert "WHEN pa.id IS NOT NULL OR public.app_e_dono() THEN" in corpo
    assert "chave = 'pesquisa_link_avaliacao'" in corpo
    assert "REVOKE ALL ON FUNCTION public.pesquisa_meu_acesso() FROM PUBLIC, anon" in sql
