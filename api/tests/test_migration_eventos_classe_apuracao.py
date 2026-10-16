from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261017_02:20261017_03", sql=True)
    return output.getvalue()


def test_resultado_persistido_em_duas_tabelas_com_rls_e_policies() -> None:
    sql = _upgrade_sql()

    for tabela in ("eventos_classe_resultado", "eventos_classe_resultado_guilda"):
        assert f"CREATE TABLE IF NOT EXISTS public.{tabela}" in sql
        assert f"ALTER TABLE public.{tabela} ENABLE ROW LEVEL SECURITY" in sql
        assert f"REVOKE ALL ON public.{tabela} FROM anon, authenticated" in sql
        assert f"GRANT SELECT ON public.{tabela} TO authenticated" in sql
    for nome in ("resultado_professor_sel", "resultado_aluno_sel", "resultado_guilda_professor_sel", "resultado_guilda_aluno_sel"):
        assert f"CREATE POLICY eventos_classe_{nome}" in sql
    # ninguém escreve pelo cliente
    assert "GRANT INSERT" not in sql and "GRANT UPDATE" not in sql
    assert " NOT IN " not in sql


def test_aluno_so_ve_evento_encerrado_proprio_e_top_10() -> None:
    sql = _upgrade_sql()

    assert "e.status = 'encerrado'" in sql
    assert "aluno_id = auth.uid() OR posicao <= 10" in sql


def test_pontos_so_da_janela_do_evento_e_nunca_negativos() -> None:
    sql = _upgrade_sql()

    assert "SUM(GREATEST(ea.valor, 0))" in sql
    assert "ea.criado_em >= v_evento.inicio" in sql
    assert "ea.criado_em <= v_evento.fim" in sql
    assert "ea.classe_id = v_evento.classe_id" in sql
    assert "CHECK (pontos >= 0)" in sql


def test_destaque_so_com_medalha_ligada_participacao_e_top_3() -> None:
    sql = _upgrade_sql()

    assert "v_evento.medalha_destaque AND t.participou AND t.pontos > 0 AND t.posicao <= 3" in sql
    assert "dense_rank()" in sql


def test_guilda_usa_a_copia_congelada_e_fica_fora_do_rank_individual() -> None:
    sql = _upgrade_sql()

    assert "FROM public.guilda_evento_snapshot s" in sql
    assert "s.evento_id = p_evento_id::text" in sql
    assert "IF v_evento.modalidade_guilda THEN" in sql
    assert "eventos_aluno" in sql and "INSERT INTO public.eventos_aluno" not in sql


def test_apuracao_interna_e_encerrar_a_chama_depois_da_posse() -> None:
    sql = _upgrade_sql()

    assert "REVOKE ALL ON FUNCTION public.fn_evento_classe_apurar(uuid) FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT EXECUTE ON FUNCTION public.fn_evento_classe_apurar" not in sql
    corpo = sql[sql.index("CREATE OR REPLACE FUNCTION public.evento_classe_encerrar") :]
    assert corpo.index("app_classes_do_professor()") < corpo.index("fn_evento_classe_apurar(p_evento_id)")
    assert "'participantes', v_participantes" in corpo


def test_downgrade_restaura_o_encerrar_anterior() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261017_03:20261017_02", sql=True)
    sql = output.getvalue()
    assert "DROP TABLE IF EXISTS public.eventos_classe_resultado" in sql
    assert "fn_evento_classe_apurar(p_evento_id)" not in sql
