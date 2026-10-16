from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261017_07:20261017_08", sql=True)
    return output.getvalue()


def _funcao(sql: str) -> str:
    return sql[sql.index("CREATE OR REPLACE FUNCTION") : sql.index("REVOKE ALL")]


def test_posse_da_turma_antes_de_ler_dado_de_aluno_e_rascunho_recusado() -> None:
    f = _funcao(_upgrade_sql())

    assert f.index("app_classes_do_professor()") < f.index("FROM public.classe_aluno ca")
    assert "NOT EXISTS (" in f[f.index("IF auth.uid() IS NULL") :][:200]
    assert "USING ERRCODE = '42501'" in f
    assert "IF v_evento.status = 'rascunho' THEN" in f
    assert " NOT IN " not in f
    assert "SECURITY DEFINER" in f and "STABLE" in f and "SET search_path = public, pg_temp" in f


def test_so_leitura() -> None:
    f = _funcao(_upgrade_sql())

    for escrita in ("INSERT ", "UPDATE ", "DELETE "):
        assert escrita not in f


def test_janela_e_classe_resolvida_como_na_apuracao() -> None:
    f = _funcao(_upgrade_sql())

    assert "v_fim := LEAST(v_evento.fim, now())" in f
    assert "ea.criado_em >= v_evento.inicio" in f and "ea.criado_em <= v_fim" in f
    assert "ea.classe_id IS NULL AND public.fn_eventos_aluno_resolve_classe_id(ea.tipo, ea.referencia) = v_evento.classe_id" in f


def test_parou_so_com_evento_aberto_e_janela_correndo() -> None:
    f = _funcao(_upgrade_sql())

    assert "WHEN qtd = 0 THEN 'nao_comecou'" in f
    assert "v_evento.status = 'aberto' AND now() <= v_evento.fim AND ultima < now() - interval '3 days' THEN 'parou'" in f


def test_guilda_ativa_usa_a_copia_congelada() -> None:
    f = _funcao(_upgrade_sql())

    assert "FROM public.guilda_evento_snapshot s" in f
    assert "s.evento_id = p_evento_id::text" in f
    assert "bool_or(e.situacao <> 'nao_comecou')" in f


def test_sem_dado_pessoal_alem_de_id_e_nome() -> None:
    f = _funcao(_upgrade_sql())

    for proibido in ("email", "foto_url", "apelido", "auth.users"):
        assert proibido not in f


def test_execute_so_para_autenticado_e_downgrade() -> None:
    sql = _upgrade_sql()
    assert "REVOKE ALL ON FUNCTION public.evento_classe_durante(uuid) FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.evento_classe_durante(uuid) TO authenticated" in sql

    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261017_08:20261017_07", sql=True)
    assert "DROP FUNCTION IF EXISTS public.evento_classe_durante(uuid)" in output.getvalue()
