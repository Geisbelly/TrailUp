"""F3 (transporte da IA) — SQL offline da `20261029_09`: o banco enfileira a análise de todo lote novo.

O comportamento (entrada com folga, saída pela análise, reivindicação disjunta, espera entre falhas,
retroativo, I15 e downgrade) é medido contra Postgres de verdade em `test_e2e_analise_de_lote_pela_fila.py`.
Aqui fica o que a leitura do SQL garante sem banco.
"""

import re
from io import StringIO

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

FUNCOES = {
    "fn_telemetria_lote_enfileira_analise": "",
    "fn_telemetria_lote_sai_da_fila": "",
    "fn_telemetria_analise_reivindicar": "integer, integer, bigint[]",
    "fn_telemetria_analise_falhou": "uuid, text, boolean, integer",
}
DO_WORKER = ("fn_telemetria_analise_reivindicar", "fn_telemetria_analise_falhou")


def _sql_bruto(intervalo: str, *, downgrade: bool = False) -> str:
    output = StringIO()
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(_offline_alembic_config(output), intervalo, sql=True)
    return output.getvalue()


def _upgrade_sql() -> str:
    return _sql_bruto("20261029_08:20261029_09")


def _downgrade_sql() -> str:
    return _sql_bruto("20261029_09:20261029_08", downgrade=True)


def _funcao(sql: str, nome: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
    return sql[inicio : sql.index("$function$;", inicio)]


def test_uma_cabeca_so_e_ela_vem_depois_da_sessao_propria() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    heads = scripts.get_heads()
    assert len(heads) == 1, f"a árvore bifurcou: {sorted(heads)}"
    assert "20261029_09" in {r.revision for r in scripts.walk_revisions("base", heads[0])}
    assert scripts.get_revision("20261029_09").down_revision == "20261029_08"


def test_sql_offline_nao_tem_porcento() -> None:
    """O Alembic offline dobra `%` e corrompe plpgsql sem dar erro; aqui não há nenhum para dobrar."""
    assert "%" not in _upgrade_sql()
    assert "%" not in _downgrade_sql()


def test_tabela_da_fila() -> None:
    sql = _upgrade_sql()
    inicio = sql.index("CREATE TABLE IF NOT EXISTS public.telemetria_analise_fila (")
    tabela = re.sub(r"\s+", " ", sql[inicio : sql.index(");", inicio)])

    assert "lote_id uuid PRIMARY KEY REFERENCES public.telemetria_lotes (id) ON DELETE CASCADE" in tabela
    assert "enfileirado_em timestamptz NOT NULL DEFAULT now()" in tabela
    assert "proxima_tentativa_em timestamptz NOT NULL," in tabela
    assert "tentativas integer NOT NULL DEFAULT 0" in tabela
    assert "travado_em timestamptz," in tabela
    assert "ultimo_erro text" in tabela
    assert re.search(r"CREATE INDEX IF NOT EXISTS \w+\s+ON public\.telemetria_analise_fila \(proxima_tentativa_em\)", sql)


def test_tabela_com_rls_sem_policy_e_sem_cliente() -> None:
    sql = _upgrade_sql()
    assert "ALTER TABLE public.telemetria_analise_fila ENABLE ROW LEVEL SECURITY" in sql
    assert "CREATE POLICY" not in sql
    assert "REVOKE ALL ON TABLE public.telemetria_analise_fila FROM PUBLIC, anon, authenticated" in sql


def test_funcoes_definer_com_search_path_vazio_e_sem_execute_para_cliente() -> None:
    sql = _upgrade_sql()
    for nome, args in FUNCOES.items():
        corpo = _funcao(sql, nome)
        assert "SECURITY DEFINER" in corpo, nome
        assert "SET search_path = ''" in corpo, nome
        assert f"REVOKE ALL ON FUNCTION public.{nome}({args}) FROM PUBLIC, anon, authenticated" in sql, nome
    grants = re.findall(r"GRANT EXECUTE ON FUNCTION public\.(\w+)\(([^)]*)\) TO (\w+)", sql)
    assert sorted(grants) == sorted((n, FUNCOES[n], "service_role") for n in DO_WORKER)


def test_gatilhos_no_lote() -> None:
    sql = _upgrade_sql()
    assert re.search(
        r"CREATE TRIGGER trg_telemetria_lotes_enfileira_analise\s+AFTER INSERT ON public\.telemetria_lotes\s+"
        r"FOR EACH ROW EXECUTE FUNCTION public\.fn_telemetria_lote_enfileira_analise\(\)",
        sql,
    )
    assert re.search(
        r"CREATE TRIGGER trg_telemetria_lotes_sai_da_fila\s+"
        r"AFTER UPDATE OF analysis_ciclo_id, analysis_error ON public\.telemetria_lotes\s+"
        r"FOR EACH ROW EXECUTE FUNCTION public\.fn_telemetria_lote_sai_da_fila\(\)",
        sql,
    )
    entrada = _funcao(sql, "fn_telemetria_lote_enfileira_analise")
    assert "NEW.analysis_ciclo_id IS NULL AND NEW.analysis_error IS NULL" in entrada
    assert "now() + interval '5 minutes'" in entrada  # P2
    assert "ON CONFLICT (lote_id) DO NOTHING" in entrada


def test_reivindicar_trava_com_skip_locked_e_limpa_antes() -> None:
    corpo = _funcao(_upgrade_sql(), "fn_telemetria_analise_reivindicar")
    assert "RETURNS SETOF uuid" in corpo
    assert corpo.index("DELETE FROM public.telemetria_analise_fila") < corpo.index("UPDATE public.telemetria_analise_fila")
    assert corpo.count("FOR UPDATE OF f SKIP LOCKED") == 2
    assert "ORDER BY f.proxima_tentativa_em" in corpo
    assert "f.proxima_tentativa_em <= now()" in corpo
    assert "f.travado_em < now() - make_interval(secs => p_trava_seg)" in corpo
    assert "tentativas = f.tentativas + 1" in corpo


def test_falha_espera_2_elevado_a_n_e_desiste_na_quinta() -> None:
    corpo = _funcao(_upgrade_sql(), "fn_telemetria_analise_falhou")
    assert "v_tentativas >= 5" in corpo  # P4
    assert "left('fila: ' ||" in corpo
    assert "make_interval(mins => power(2, v_tentativas)::int)" in corpo
    assert "travado_em = NULL" in corpo


def test_falha_trava_o_lote_antes_do_item() -> None:
    """Ordem lote -> item, a do pedido: o UPDATE do lote e depois o DELETE do item pelo gatilho."""
    corpo = _funcao(_upgrade_sql(), "fn_telemetria_analise_falhou")
    trava_lote = corpo.index("PERFORM 1 FROM public.telemetria_lotes WHERE id = p_lote FOR UPDATE;")
    assert trava_lote < corpo.index("FROM public.telemetria_analise_fila f")


def test_reivindicar_desiste_da_trava_vencida_na_quinta_antes_de_tudo() -> None:
    corpo = _funcao(_upgrade_sql(), "fn_telemetria_analise_reivindicar")
    desiste = corpo.index("UPDATE public.telemetria_lotes")
    assert desiste < corpo.index("DELETE FROM public.telemetria_analise_fila")
    trecho = corpo[desiste : corpo.index("DELETE FROM public.telemetria_analise_fila")]
    assert "SET analysis_error = 'fila: trava vencida'" in trecho
    assert "f.tentativas >= 5" in trecho
    assert "f.travado_em < now() - make_interval(secs => p_trava_seg)" in trecho
    assert "l.analysis_ciclo_id IS NULL AND l.analysis_error IS NULL" in trecho
    # trava os lotes (não os itens) e não espera pelo lote que o pedido está gravando
    assert "FOR UPDATE OF l SKIP LOCKED" in trecho
    assert "FOR UPDATE OF f" not in trecho


def test_retroativo_7_dias_e_rotulo() -> None:
    sql = _upgrade_sql()
    assert "l.created_at >= now() - interval '7 days'" in sql  # P3
    assert "SET analysis_error = 'expirado_sem_analise'" in sql
    assert "created_at < now() - interval '7 days'" in sql


def test_downgrade_tira_tudo_e_nao_desfaz_o_rotulo() -> None:
    sql = _downgrade_sql()
    for gatilho in ("trg_telemetria_lotes_enfileira_analise", "trg_telemetria_lotes_sai_da_fila"):
        assert f"DROP TRIGGER IF EXISTS {gatilho} ON public.telemetria_lotes" in sql
    for nome, args in FUNCOES.items():
        assert f"DROP FUNCTION IF EXISTS public.{nome}({args})" in sql
    assert "DROP TABLE IF EXISTS public.telemetria_analise_fila" in sql
    assert "expirado_sem_analise" not in sql
    assert "UPDATE public.telemetria_lotes" not in sql


def test_assinaturas_antigas_saem_antes_das_novas() -> None:
    """Com as duas assinaturas, a chamada de 2 argumentos ficaria ambígua (os novos têm DEFAULT)."""
    sql = _upgrade_sql()
    for antiga, nova in (
        ("fn_telemetria_analise_reivindicar(integer, integer);", "fn_telemetria_analise_reivindicar("),
        ("fn_telemetria_analise_falhou(uuid, text);", "fn_telemetria_analise_falhou("),
    ):
        drop = sql.index(f"DROP FUNCTION IF EXISTS public.{antiga}")
        assert drop < sql.index(f"CREATE OR REPLACE FUNCTION public.{nova}"), antiga
