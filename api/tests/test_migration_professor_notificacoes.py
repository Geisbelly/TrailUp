"""`20261102_17`: notificações do professor — estrutura, autorização e o que nunca pode quebrar.

O comportamento (coalescência, reabertura, RLS, GRANT por coluna, isolamento de falha, Realtime) foi
exercitado num Postgres real (PGlite) com o esqueleto das tabelas: ver o PR. Aqui fica o que dá para
travar sem banco, para uma edição futura não desfazer uma decisão por engano.
"""

from io import StringIO

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261102_16:20261102_17", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261102_17:20261102_16", sql=True)
    return output.getvalue().replace("%%", "%")


def test_a_arvore_continua_com_uma_cabeca_e_a_migracao_vem_depois_da_16() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261102_17").down_revision == "20261102_16"


def test_a_tabela_nasce_com_rls_e_com_as_policies_no_mesmo_commit() -> None:
    sql = _upgrade_sql()
    assert "CREATE TABLE IF NOT EXISTS public.professor_notificacoes" in sql
    assert "ALTER TABLE public.professor_notificacoes ENABLE ROW LEVEL SECURITY" in sql
    for policy in ("professor_notificacoes_sel", "professor_notificacoes_upd", "professor_notificacoes_del"):
        assert f"CREATE POLICY {policy}" in sql
    assert "professor_id = auth.uid()" in sql


def test_o_cliente_nao_insere_e_so_muda_lida_em() -> None:
    sql = _upgrade_sql()
    # Só as funções SECURITY DEFINER gravam: nenhuma policy de INSERT, nenhum GRANT de INSERT.
    assert "FOR INSERT" not in sql
    assert "GRANT SELECT, DELETE ON public.professor_notificacoes TO authenticated" in sql
    assert "GRANT UPDATE (lida_em) ON public.professor_notificacoes TO authenticated" in sql
    assert "REVOKE ALL ON public.professor_notificacoes FROM PUBLIC, anon, authenticated" in sql


def test_as_funcoes_so_sao_alcancadas_pelos_gatilhos() -> None:
    sql = _upgrade_sql()
    for assinatura in (
        "fn_professor_notificar(uuid, bigint, text, text, text, text, text)",
        "fn_professor_notifica_recomendacao()",
        "fn_professor_notifica_entrega()",
        "fn_professor_notifica_geracao()",
        "fn_professor_notifica_evento()",
    ):
        assert f"REVOKE ALL ON FUNCTION public.{assinatura}" in sql, assinatura
    assert sql.count("SECURITY DEFINER") >= 5
    assert sql.count("SET search_path = public, pg_temp") >= 5


def test_o_aviso_nunca_derruba_quem_o_causa() -> None:
    sql = _upgrade_sql()
    # Uma proteção na função que grava e outra em cada gatilho.
    assert sql.count("EXCEPTION WHEN OTHERS THEN") >= 5
    assert sql.count("RAISE WARNING") >= 5


def test_coalescencia_por_dedupe_key() -> None:
    sql = _upgrade_sql()
    assert "CONSTRAINT professor_notificacoes_dedupe_uq UNIQUE (professor_id, dedupe_key)" in sql
    assert "ON CONFLICT (professor_id, dedupe_key) DO UPDATE" in sql
    assert "contagem      = n.contagem + 1" in sql
    assert "lida_em       = NULL" in sql


def test_os_quatro_gatilhos_e_so_o_que_o_professor_pode_agir() -> None:
    sql = _upgrade_sql()
    for gatilho, tabela in (
        ("trg_intervencoes_notifica_professor", "public.intervencoes"),
        ("trg_questao_aluno_notifica_professor", "public.questao_aluno"),
        ("trg_personalizacao_jobs_notifica_professor", "public.personalizacao_jobs"),
        ("trg_eventos_classe_notifica_professor", "public.eventos_classe"),
    ):
        assert f"CREATE TRIGGER {gatilho}" in sql
        assert f"ON {tabela}" in sql
    # Rotina do sistema não vira aviso ao professor.
    assert "('missao_diaria', 'student_cleanup')" in sql
    # Mesmo critério da fila de Notas.
    assert "('essay', 'dissertativa', 'questao', 'texto')" in sql


def test_a_tabela_entra_no_realtime() -> None:
    sql = _upgrade_sql()
    assert "ALTER PUBLICATION supabase_realtime ADD TABLE public.professor_notificacoes" in sql


def test_o_downgrade_desfaz_tudo_na_ordem_certa() -> None:
    sql = _downgrade_sql()
    assert sql.index("DROP TRIGGER IF EXISTS trg_eventos_classe_notifica_professor") < sql.index(
        "DROP FUNCTION IF EXISTS public.fn_professor_notifica_evento()"
    )
    assert sql.index("DROP FUNCTION IF EXISTS public.fn_professor_notificar(") < sql.index(
        "DROP TABLE IF EXISTS public.professor_notificacoes"
    )
    assert "DROP TABLE public.professor_notificacoes FROM" not in sql
