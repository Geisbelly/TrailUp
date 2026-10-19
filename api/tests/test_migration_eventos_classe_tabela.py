from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261016_05:20261017_01", sql=True)
    return output.getvalue()


def test_nome_nao_colide_com_eventos_aluno_e_e_por_classe() -> None:
    sql = _upgrade_sql()

    assert "CREATE TABLE IF NOT EXISTS public.eventos_classe" in sql
    assert "classe_id bigint NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE" in sql
    assert "topico_id bigint REFERENCES public.topicos(id) ON DELETE SET NULL" in sql


def test_regras_de_dado_no_proprio_banco() -> None:
    sql = _upgrade_sql()

    assert "CHECK (status IN ('rascunho', 'aberto', 'encerrado'))" in sql
    assert "CONSTRAINT eventos_classe_janela CHECK (fim > inicio)" in sql
    # medalha de destaque nunca sem a de participação (decisão da #152)
    assert "CHECK (NOT medalha_destaque OR medalha_participacao)" in sql
    assert "CHECK (pontos >= 0)" in sql and "CHECK (moedas >= 0)" in sql


def test_status_so_muda_pelas_funcoes_do_banco() -> None:
    sql = _upgrade_sql()

    assert "current_setting('app.evento_transicao', true)" in sql
    assert "NEW.status := 'rascunho'" in sql
    assert "Depois de aberto, o evento só aceita título e descrição." in sql


def test_rls_nasce_com_policy_para_professor_e_aluno() -> None:
    sql = _upgrade_sql()

    assert "ALTER TABLE public.eventos_classe ENABLE ROW LEVEL SECURITY" in sql
    for nome in ("professor_sel", "professor_ins", "professor_upd", "professor_del", "aluno_sel"):
        assert f"CREATE POLICY eventos_classe_{nome}" in sql
    assert "app_classes_do_professor()" in sql and "app_minhas_classes()" in sql
    # aluno nunca vê rascunho; professor só apaga rascunho
    assert "status <> 'rascunho'" in sql
    assert "status = 'rascunho'" in sql
    assert " NOT IN " not in sql


def test_anon_sem_acesso_e_downgrade() -> None:
    sql = _upgrade_sql()
    assert "REVOKE ALL ON public.eventos_classe FROM anon" in sql

    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261017_01:20261016_05", sql=True)
    assert "DROP TABLE IF EXISTS public.eventos_classe" in output.getvalue()
