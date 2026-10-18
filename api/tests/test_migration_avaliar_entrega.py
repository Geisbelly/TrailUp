from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261016_04:20261016_05", sql=True)
    return output.getvalue()


def test_posse_e_matricula_conferidas_antes_de_qualquer_escrita() -> None:
    sql = _upgrade_sql()

    posse = sql.index("app_classes_do_professor()")
    matricula = sql.index("FROM public.classe_aluno ca WHERE ca.classe_id = v_classe")
    assert posse < matricula < sql.index("UPDATE public.atividade_aluno") < sql.index("INSERT INTO public.eventos_aluno")
    assert "NOT EXISTS (" in sql[sql.index("IF v_professor IS NULL") :][:200]
    assert "USING ERRCODE = '42501'" in sql
    assert "SECURITY DEFINER" in sql and "SET search_path = public, pg_temp" in sql


def test_nota_limitada_a_pontuacao_maxima_e_sem_maxima_recusa() -> None:
    sql = _upgrade_sql()

    assert "v_max := coalesce(v_max_aluno, v_max_ativ)" in sql
    assert "A atividade não tem pontuação máxima definida." in sql
    assert "p_nota < 0 OR p_nota > v_max" in sql
    assert "O feedback passa de 2000 caracteres." in sql


def test_preserva_o_que_a_ia_gravou_e_so_escreve_a_chave_professor() -> None:
    sql = _upgrade_sql()

    assert "avaliacao_metadata = v_meta || jsonb_build_object(" in sql
    assert "'professor', jsonb_build_object(" in sql
    for campo in ("'avaliado_por'", "'avaliado_em'", "'feedback'", "'nota_anterior'"):
        assert campo in sql


def test_nao_mexe_em_status_nem_em_progresso() -> None:
    sql = _upgrade_sql()
    corpo = sql[sql.index("UPDATE public.atividade_aluno") : sql.index("INSERT INTO public.eventos_aluno")]
    assert "status" not in corpo
    assert "percentual_concluido" not in corpo


def test_evento_creditado_uma_vez_por_aluno_e_atividade_atualizavel() -> None:
    sql = _upgrade_sql()

    assert "'nota_professor'" in sql
    assert "'classe:' || v_classe::text || ':nota:' || p_atividade_id::text" in sql
    assert "concedido_por" in sql
    # corrigir de novo atualiza o mesmo evento em vez de somar duas notas
    assert "ON CONFLICT (aluno_id, tipo, referencia)" in sql
    assert "'conquista_desbloqueada', 'nota_professor')" in sql
    assert "DO UPDATE SET valor = EXCLUDED.valor" in sql


def test_execute_so_para_autenticado_e_downgrade() -> None:
    sql = _upgrade_sql()
    assert "REVOKE ALL ON FUNCTION public.avaliar_entrega(bigint, uuid, numeric, text) FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.avaliar_entrega(bigint, uuid, numeric, text) TO authenticated" in sql

    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261016_05:20261016_04", sql=True)
    assert "DROP FUNCTION IF EXISTS public.avaliar_entrega(bigint, uuid, numeric, text)" in output.getvalue()
