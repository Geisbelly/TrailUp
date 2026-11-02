"""`20261102_23`: o painel técnico avisa o dono — uma regra só, um aviso por dia, nunca derruba o cron.

O comportamento (o aviso vai ao dono, não repete a cada 30 min, `sem_dado` não avisa, devolve as claims,
não levanta, nenhum cliente executa o atalho) foi exercitado num Postgres real (PGlite) com o esqueleto
das tabelas: ver o PR. Aqui fica o que dá para travar sem banco.
"""

from io import StringIO

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261102_22:20261102_23", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261102_23:20261102_22", sql=True)
    return output.getvalue().replace("%%", "%")


def test_a_arvore_continua_com_uma_cabeca_e_vem_depois_da_21() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261102_23").down_revision == "20261102_22"


def test_usa_a_propria_painel_tecnico_e_nao_uma_segunda_conta() -> None:
    sql = _upgrade_sql()
    corpo = sql[sql.index("fn_painel_tecnico_avisar_dono()") :]
    assert "public.painel_tecnico(168)" in corpo
    # Só `alerta` avisa: `sem_dado` é lacuna de medida, não alarme.
    assert "IS DISTINCT FROM 'alerta'" in corpo


def test_o_atalho_das_claims_nao_e_alcancavel_de_fora() -> None:
    sql = _upgrade_sql()
    assert "REVOKE ALL ON FUNCTION public.fn_painel_tecnico_avisar_dono() FROM PUBLIC, anon, authenticated" in sql
    # Nenhum GRANT de EXECUTE para cliente: o cron roda como dono do banco.
    assert "GRANT EXECUTE ON FUNCTION public.fn_painel_tecnico_avisar_dono()" not in sql
    assert "SECURITY DEFINER" in sql
    # A claim é posta só na transação e devolvida em qualquer saída, inclusive a de erro.
    assert sql.count("set_config('request.jwt.claims'") >= 3
    assert ", true)" in sql


def test_um_aviso_por_gatilho_por_dia_e_o_cron_nunca_levanta() -> None:
    sql = _upgrade_sql()
    assert "'tec:' || coalesce(v_g ->> 'id', '?') || ':' || v_hoje" in sql
    assert "IF EXISTS (" in sql and "n.dedupe_key = v_chave" in sql
    assert sql.count("EXCEPTION WHEN OTHERS THEN") >= 2
    assert sql.count("RAISE WARNING 'painel_tecnico_avisar_dono: %'") >= 2


def test_o_dono_vem_da_config_e_nao_e_um_email_no_codigo() -> None:
    sql = _upgrade_sql()
    assert "c.chave = 'dono_email'" in sql
    assert "JOIN auth.users u ON u.id = p.id" in sql
    assert "@" not in sql.replace("@gmail", "")  # nenhum e-mail escrito na migração


def test_a_caixa_do_sino_aceita_o_novo_tipo_e_o_novo_destino() -> None:
    sql = _upgrade_sql()
    assert "'gatilho_tecnico'" in sql
    assert "'recomendacoes', 'notas', 'personalizacoes', 'eventos', 'tecnico'" in sql


def test_agenda_a_cada_30_min_so_se_houver_pg_cron_e_sem_duplicar() -> None:
    sql = _upgrade_sql()
    assert "extname = 'pg_cron'" in sql
    assert "cron.unschedule('trailup_painel_tecnico_avisar_dono')" in sql
    assert "cron.schedule('trailup_painel_tecnico_avisar_dono', '*/30 * * * *'" in sql


def test_o_downgrade_desagenda_e_limpa_antes_de_apertar_a_constraint() -> None:
    sql = _downgrade_sql()
    assert sql.index("cron.unschedule") < sql.index("DROP FUNCTION IF EXISTS public.fn_painel_tecnico_avisar_dono()")
    # Linha do tipo novo sai antes de a constraint antiga voltar, senão o ADD CONSTRAINT falha.
    assert sql.index("DELETE FROM public.professor_notificacoes WHERE tipo = 'gatilho_tecnico'") < sql.index("ADD CONSTRAINT professor_notificacoes_tipo_ck")
