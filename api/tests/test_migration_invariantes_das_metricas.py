"""F0 (medir antes de mexer) — SQL offline da `20261029_03`: as invariantes I01…I20, o executor e o `pg_cron`.

O comportamento (banco coerente passa, violação semeada reprova e vai para a amostra, função dependente
ausente vira `erro` sem parar a rodada, retenção de 30 dias, cliente sem EXECUTE) é medido contra
Postgres de verdade em `test_e2e_invariantes_das_metricas.py`. Aqui fica o que a leitura do SQL
garante sem banco: quem pode chamar, nomes qualificados, o contrato do executor e o agendamento.
"""

import re
from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

NN = [f"{n:02d}" for n in range(1, 21)]
FUNCOES = [f"fn_inv_i{n}" for n in NN] + ["fn_auditoria_metricas_rodar"]
JOB = "trailup_auditoria_metricas"


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261029_02:20261029_03", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261029_03:20261029_02", sql=True)
    return output.getvalue().replace("%%", "%")


def _bloco(sql: str, nome: str) -> str:
    """Do `CREATE OR REPLACE FUNCTION public.<nome>()` até o fim do corpo (`$function$;`)."""
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}()")
    fim = sql.index("$function$;", inicio)
    return sql[inicio:fim]


def _corpo(sql: str, nome: str) -> str:
    """Só o que está entre os dólares: o SQL que a função roda."""
    bloco = _bloco(sql, nome)
    return bloco[bloco.index("$function$") + len("$function$") :]


def test_as_vinte_invariantes_tem_o_contrato():
    sql = _upgrade_sql()

    for n in NN:
        bloco = _bloco(sql, f"fn_inv_i{n}")
        assert re.search(rf"FUNCTION public\.fn_inv_i{n}\(\)\s+RETURNS TABLE \(id text\)", bloco), n
        # plpgsql: o corpo só é resolvido quando roda. Em SQL puro, função/tabela ausente num banco novo
        # (trailup_progresso_percurso, vw_metricas_*) derrubaria a migration em vez de virar `erro`.
        assert "LANGUAGE plpgsql" in bloco, n
        assert "SECURITY DEFINER" in bloco, n
        assert "SET search_path = ''" in bloco, n
        assert "RETURN QUERY" in bloco, n


def test_executor_tem_o_contrato():
    sql = _upgrade_sql()
    bloco = _bloco(sql, "fn_auditoria_metricas_rodar")

    assert re.search(r"FUNCTION public\.fn_auditoria_metricas_rodar\(\)\s+RETURNS jsonb", bloco)
    assert "LANGUAGE plpgsql" in bloco
    assert "SECURITY DEFINER" in bloco
    assert "SET search_path = ''" in bloco


def test_ninguem_de_fora_executa():
    sql = _upgrade_sql()

    for nome in FUNCOES:
        assert f"REVOKE ALL ON FUNCTION public.{nome}() FROM PUBLIC, anon, authenticated;" in sql, nome
    assert "GRANT EXECUTE" not in sql
    assert not re.search(r"^\s*GRANT ", sql, re.M)


def test_nomes_qualificados_em_todo_corpo():
    """Com `search_path = ''`, nome sem esquema não resolve: tudo é `public.` ou `pg_catalog.`."""
    sql = _upgrade_sql()

    for nome in FUNCOES:
        corpo = _corpo(sql, nome)
        ctes = set(re.findall(r"(?:WITH|,)\s+(\w+)\s+AS\s+(?:MATERIALIZED\s+)?\(", corpo))
        for m in re.finditer(r"\b(?:FROM|JOIN|INTO|UPDATE)\s+(?!public\.|pg_catalog\.|LATERAL\b|\()(\w+)", corpo):
            # `INTO v_x` é variável plpgsql; CTE declarada no próprio corpo não tem esquema
            assert m.group(1).startswith("v_") or m.group(1) in ctes, (nome, m.group(0))


def test_i01_a_i15_seguem_o_apendice_a():
    sql = _upgrade_sql()
    c = {n: _corpo(sql, f"fn_inv_i{n}") for n in NN}

    assert "FROM public.telemetria_time_metric_entries" in c["01"] and "HAVING count(*) > 1" in c["01"]
    assert "abs(e.active_sec + e.idle_sec - e.dwell_sec) > 1" in c["02"]
    assert "e.active_sec > e.dwell_sec + 0.5" in c["02"]
    assert "FILTER (WHERE e.scope = 'content')" in c["03"] and "FILTER (WHERE e.scope = 'topic') + 1" in c["03"]
    # enum sem COALESCE(enum,''): status sempre como ::text, rótulos com acento
    assert "ta.status::text = 'concluido'" in c["04"] and "ta.status::text <> 'não iniciado'" in c["04"]
    assert c["05"].count("public.trailup_progresso_percurso(") == 2
    assert "x.status::text LIKE 'concl%'" in c["05"]
    assert "public.trailup_tempo_sessao_min(ta.aluno_id, 'topic', ta.topico_id, NULL, NULL)" in c["06"]
    assert 'ca."tempoGastoMin"' in c["07"]
    assert "NOT EXISTS (SELECT 1 FROM public.classe c WHERE c.id = e.classe_id)" in c["08"]
    assert "e.referencia NOT LIKE 'classe:%'" in c["09"]
    assert "split_part(e.referencia, ':', 1) NOT IN ('topico', 'conteudo', 'atividade')" in c["09"]
    assert "has_function_privilege('authenticated', 'public.fn_app_config_int(text,integer)', 'EXECUTE')" in c["10"]
    assert "pg_catalog.pg_class" in c["11"] and "'{security_invoker=on}'" in c["11"]
    assert "c.relname NOT IN ('vw_rank_posicoes_por_classe')" in c["11"]  # allowlist da spec, só ela
    assert "p.percentual_concluido NOT BETWEEN 0 AND 100" in c["12"]
    assert "e.tipo = 'conquista_desbloqueada'" in c["13"]
    assert "c.conquista_id::text = split_part(e.referencia, ':', 2)" in c["13"]
    assert "<> 7" in c["14"] and "FROM public.aluno_perfil" in c["14"]
    assert "l.analysis_ciclo_id IS NULL AND l.analysis_error IS NULL" in c["15"]
    assert "interval '1 hour'" in c["15"]


def test_i16_a_i20_seguem_a_spec():
    sql = _upgrade_sql()
    c = {n: _corpo(sql, f"fn_inv_i{n}") for n in NN}

    assert "public.vw_metricas_engajamento_aluno_classe" in c["16"]
    assert "public.vw_metricas_sessoes_aluno_dia" in c["16"]
    assert "round(" in c["16"] and "<> 1" in c["16"]
    assert "s.ended_at IS NULL" in c["17"]
    assert "('session_end', 'app_background', 'screen_blur')" in c["17"]
    assert "l.via = 'direta' AND l.fallback_motivo IS NULL" in c["18"]
    assert "FROM public.questao_aluno" in c["19"] and "public.questoes" in c["19"] and "public.atividades" in c["19"]
    assert "'cobertura'" in c["20"] and "< 0.95" in c["20"] and "interval '7 days'" in c["20"]
    assert "count(*) > 0" in c["20"]  # sem lote não é falha


def test_ids_sempre_texto():
    """`RETURNS TABLE (id text)`: o executor ordena e amostra texto; cada invariante converte o seu id."""
    sql = _upgrade_sql()

    for n in NN:
        corpo = _corpo(sql, f"fn_inv_i{n}")
        assert "::text" in corpo, n


def test_executor_roda_cada_uma_numa_subtransacao():
    sql = _upgrade_sql()
    corpo = _corpo(sql, "fn_auditoria_metricas_rodar")

    assert "FOR v_n IN 1..20 LOOP" in corpo
    assert "'I' || lpad(v_n::text, 2, '0')" in corpo  # R1: I01…I20, como o CHECK da 20261029_02
    # o nome vem do próprio laço, com %I; nada de fora entra no EXECUTE
    assert "v_fn := 'fn_inv_i' || lpad(v_n::text, 2, '0')" in corpo
    assert "FROM public.%I() AS f" in corpo
    assert "EXCEPTION WHEN OTHERS THEN" in corpo
    # R6: só SQLSTATE + mensagem curta; nada de DETAIL/HINT/valores
    assert "SQLSTATE || ': ' || left(SQLERRM, 200)" in corpo
    for proibido in ("PG_EXCEPTION_DETAIL", "PG_EXCEPTION_HINT", "PG_EXCEPTION_CONTEXT", "MESSAGE_TEXT"):
        assert proibido not in corpo
    assert "INSERT INTO public.metricas_invariante_resultado" in corpo
    assert "v_linhas = 0" in corpo
    assert "INSERT INTO public.metricas_invariante_amostra" in corpo
    assert "LIMIT 20" in corpo


def test_executor_apaga_mais_de_30_dias_e_devolve_o_resumo():
    sql = _upgrade_sql()
    corpo = _corpo(sql, "fn_auditoria_metricas_rodar")

    for tabela in ("metricas_invariante_resultado", "metricas_invariante_amostra"):
        assert re.search(
            rf"DELETE FROM public\.{tabela}\s+WHERE rodado_em < now\(\) - interval '30 days'", corpo
        ), tabela
    assert "jsonb_build_object('rodadas', v_rodadas, 'falharam', to_jsonb(v_falharam), 'erros', to_jsonb(v_erros))" in corpo


def test_cron_guardado_as_0330_de_sao_paulo():
    sql = _upgrade_sql()

    assert "IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN" in sql
    assert f"PERFORM cron.schedule('{JOB}', '30 6 * * *', 'SELECT public.fn_auditoria_metricas_rodar()');" in sql
    # reagendar por nome: aplicar de novo não duplica o job
    assert sql.index(f"PERFORM cron.unschedule('{JOB}')") < sql.index(f"PERFORM cron.schedule('{JOB}'")
    # o agendamento vem depois de as funções existirem
    assert sql.index("CREATE OR REPLACE FUNCTION public.fn_auditoria_metricas_rodar()") < sql.index(
        f"PERFORM cron.schedule('{JOB}'"
    )


def test_downgrade_desagenda_antes_de_dropar():
    sql = _downgrade_sql()

    assert "IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN" in sql
    desagenda = sql.index(f"PERFORM cron.unschedule('{JOB}')")
    assert f"cron.schedule('{JOB}'" not in sql
    for nome in FUNCOES:
        drop = f"DROP FUNCTION IF EXISTS public.{nome}()"
        assert drop in sql, nome
        assert desagenda < sql.index(drop), nome
    # o executor sai antes das invariantes que ele chama
    assert sql.index("DROP FUNCTION IF EXISTS public.fn_auditoria_metricas_rodar()") < sql.index(
        "DROP FUNCTION IF EXISTS public.fn_inv_i01()"
    )
