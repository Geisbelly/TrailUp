"""#141 — SQL offline da `20261025_04`: o evento abre e encerra sozinho no horário (pg_cron).

O comportamento (abre/encerra no horário, sem crédito em dobro, corrida com o clique) é medido contra
Postgres de verdade em `test_e2e_evento_abre_e_encerra_no_horario.py`. Aqui fica o que a leitura do SQL
garante sem banco: quem pode chamar o quê, as travas e o agendamento.
"""

from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261025_03:20261025_04", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261025_04:20261025_03", sql=True)
    return output.getvalue().replace("%%", "%")


def _corpo(sql: str, nome: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
    fim = sql.index("$function$;", inicio)
    return sql[inicio:fim]


def test_coluna_opt_in_e_check_de_peca() -> None:
    """Abrir sozinho é escolha do professor: o rascunho continua rascunho por padrão."""
    sql = _upgrade_sql()

    assert "ADD COLUMN IF NOT EXISTS abrir_no_inicio boolean NOT NULL DEFAULT false" in sql
    assert "eventos_classe_agendado_com_peca" in sql
    assert "jsonb_array_length(pecas) > 0" in sql
    assert "eventos_classe_a_abrir_idx" in sql
    assert "eventos_classe_a_encerrar_idx" in sql


def test_miolos_sem_sessao_ficam_fora_do_alcance_do_cliente() -> None:
    """O cron não tem `auth.uid()`; os miolos não conferem posse, então nenhum papel de cliente os chama."""
    sql = _upgrade_sql()

    for nome in ("fn_evento_classe_abrir_agora", "fn_evento_classe_encerrar_agora", "fn_guilda_congelar_composicao"):
        assert "auth.uid()" not in _corpo(sql, nome)
    for assinatura in (
        "fn_evento_classe_abrir_agora(uuid)",
        "fn_evento_classe_encerrar_agora(uuid)",
        "fn_guilda_congelar_composicao(text, bigint)",
        "fn_eventos_classe_varrer()",
    ):
        assert f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon, authenticated;" in sql
        assert f"GRANT EXECUTE ON FUNCTION public.{assinatura}" not in sql


def test_portas_conferem_posse_antes_de_delegar() -> None:
    sql = _upgrade_sql()

    for porta, miolo in (
        ("evento_classe_abrir", "fn_evento_classe_abrir_agora"),
        ("evento_classe_encerrar", "fn_evento_classe_encerrar_agora"),
    ):
        corpo = _corpo(sql, porta)
        assert corpo.index("auth.uid() IS NULL") < corpo.index(f"public.{miolo}(")
        assert "app_classes_do_professor()" in corpo
        assert f"GRANT EXECUTE ON FUNCTION public.{porta}(uuid) TO authenticated;" in sql

    congelar = _corpo(sql, "guilda_congelar_composicao")
    assert congelar.index("app_classes_do_professor()") < congelar.index("fn_guilda_congelar_composicao(")


def test_miolos_travam_a_linha_e_decidem_pelo_estado() -> None:
    """Clique e cron ao mesmo tempo: o segundo espera a trava e devolve `novo: false`, sem erro nem crédito."""
    sql = _upgrade_sql()

    abrir = _corpo(sql, "fn_evento_classe_abrir_agora")
    encerrar = _corpo(sql, "fn_evento_classe_encerrar_agora")
    assert "FOR UPDATE" in abrir and "FOR UPDATE" in encerrar
    assert "'novo', false" in abrir and "'novo', false" in encerrar
    assert encerrar.index("v_evento.status = 'encerrado'") < encerrar.index("fn_evento_classe_apurar(")


def test_varredura_uma_por_vez_e_pula_o_que_esta_travado() -> None:
    sql = _upgrade_sql()
    corpo = _corpo(sql, "fn_eventos_classe_varrer")

    assert "pg_try_advisory_xact_lock(hashtext('trailup_eventos_classe_varredura'))" in corpo
    assert corpo.count("FOR UPDATE SKIP LOCKED") == 2
    assert "e.status = 'aberto' AND e.fim <= now()" in corpo
    assert "e.status = 'rascunho' AND e.abrir_no_inicio" in corpo
    assert "e.inicio <= now() AND e.fim > now()" in corpo
    assert "EXCEPTION WHEN OTHERS" in corpo
    assert "LIMIT 100" in corpo


def test_cron_guardado_a_cada_minuto() -> None:
    sql = _upgrade_sql()

    assert "IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN" in sql
    assert (
        "PERFORM cron.schedule('trailup_eventos_classe_varredura', '* * * * *', "
        "'SELECT public.fn_eventos_classe_varrer()');" in sql
    )
    assert "PERFORM cron.unschedule('trailup_eventos_classe_varredura')" in sql
    assert "NOTIFY pgrst, 'reload schema';" in sql


def test_downgrade_desagenda_e_volta_as_portas_antigas() -> None:
    sql = _downgrade_sql()

    assert sql.index("cron.unschedule('trailup_eventos_classe_varredura')") < sql.index(
        "DROP FUNCTION IF EXISTS public.fn_eventos_classe_varrer()"
    )
    # Corpos antigos: a porta volta a apurar/congelar direto, sem miolo.
    assert "public.guilda_congelar_composicao(v_evento.id::text, v_evento.classe_id)" in sql
    assert "fn_evento_classe_abrir_agora(p_evento_id)" not in sql.split("DROP FUNCTION IF EXISTS public.fn_evento_classe_encerrar_agora")[0]
    assert sql.index("CREATE OR REPLACE FUNCTION public.evento_classe_abrir(") < sql.index(
        "DROP FUNCTION IF EXISTS public.fn_evento_classe_abrir_agora(uuid)"
    )
    assert "DROP FUNCTION IF EXISTS public.fn_guilda_congelar_composicao(text, bigint)" in sql
    assert "DROP COLUMN IF EXISTS abrir_no_inicio" in sql
