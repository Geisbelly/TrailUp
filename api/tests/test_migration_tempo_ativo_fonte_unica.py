"""F4a (tempo ativo) — SQL offline da `20261030_01`: uma conta, um dono, e a matrícula acompanha.

O comportamento (lote grava o tempo ativo e a matrícula acompanha, cronômetro não sobrescreve, ordem
indiferente, duas turmas, duplicata, DELETE, presença, I06, retroativo, segurança e downgrade) é medido
contra Postgres de verdade em `test_e2e_tempo_ativo_fonte_unica.py`. Aqui fica o que a leitura do SQL
garante sem banco.
"""

import re
from io import StringIO

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

FUNCOES = (
    "trailup_sync_tempo_da_telemetria",
    "trailup_registrar_sessao_estudo",
    "trailup_registrar_intervalo_estudo",
    "trailup_tempo_presenca_min",
)
TABELAS = (
    "conteudo_aluno",
    "atividade_aluno",
    "topico_aluno",
    "classe_aluno",
    "topicos",
    "conteudos",
    "atividades",
    "estudo_sessoes",
    "estudo_intervalos",
    "telemetria_time_metric_entries",
)


def _sql_bruto(intervalo: str, *, downgrade: bool = False) -> str:
    output = StringIO()
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(_offline_alembic_config(output), intervalo, sql=True)
    return output.getvalue()


def _upgrade_sql() -> str:
    return _sql_bruto("20261029_09:20261030_01")


def _downgrade_sql() -> str:
    return _sql_bruto("20261030_01:20261029_09", downgrade=True)


def _funcao(sql: str, nome: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
    fim = re.compile(r"\$(function|fn)\$;").search(sql, inicio)
    assert fim, nome
    return sql[inicio : fim.end()]


def test_uma_cabeca_so_e_ela_vem_depois_da_f3() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    heads = scripts.get_heads()
    assert heads == ["20261030_01"], f"a árvore bifurcou ou a cabeça é outra: {sorted(heads)}"
    assert scripts.get_revision("20261030_01").down_revision == "20261029_09"


def test_sql_offline_nao_tem_porcento() -> None:
    """O Alembic offline dobra `%` e corrompe plpgsql sem dar erro; aqui não há nenhum para dobrar."""
    assert "%" not in _upgrade_sql()
    assert "%" not in _downgrade_sql()


def test_funcoes_com_search_path_vazio_e_nomes_qualificados() -> None:
    sql = _upgrade_sql()
    for nome in FUNCOES:
        corpo = _funcao(sql, nome)
        assert "SET search_path = ''" in corpo, nome
        for tabela in TABELAS:
            soltas = re.findall(rf"(?:FROM|JOIN|UPDATE|INTO)\s+{tabela}\b", corpo)
            assert not soltas, f"{nome}: {tabela} sem schema"
        for chamada in re.findall(r"(?<![.\w])(trailup_\w+|auth\.uid)\(", corpo):
            assert chamada == nome or chamada == "auth.uid", f"{nome}: {chamada}() sem schema"


def test_tempo_gasto_min_so_tem_a_conta_ativa() -> None:
    sql = _upgrade_sql()
    expressoes = re.findall(r"tempo_gasto_min\s*=\s*(.+?)(?:,\n|\n\s*(?:WHERE|AND)|;)", sql, re.S)
    assert expressoes
    for expr in expressoes:
        assert "trailup_tempo_sessao_min" not in expr
        assert "tempo_direto_min" not in expr
        expr = expr.lstrip()
        # `x.tempo` vem de uma subconsulta que calcula a conta uma vez; ela só pode ser a conta ativa.
        assert expr.startswith("public.trailup_tempo_telemetria_min(") or expr.startswith("x.tempo"), expr
    origens = re.findall(r"(\S+)\(([^()]*)\) AS tempo\b", sql)
    assert origens
    assert {nome for nome, _ in origens} == {"public.trailup_tempo_telemetria_min"}
    # Nem nos VALUES do INSERT da RPC de intervalo.
    intervalo = _funcao(sql, "trailup_registrar_intervalo_estudo")
    assert "trailup_tempo_sessao_min" not in intervalo
    assert "p_tempo_min +" not in intervalo
    assert "tempo_direto_min = topico_aluno.tempo_direto_min + p_tempo_min" in intervalo


def test_gatilhos_por_instrucao_com_a_tabela_de_transicao_certa() -> None:
    """Os três de produção, mais o `_upd_old`: UPDATE que troca a chave também recalcula a antiga."""
    sql = _upgrade_sql()
    esperado = {
        "ins": ("INSERT", "NEW"),
        "upd": ("UPDATE", "NEW"),
        "upd_old": ("UPDATE", "OLD"),
        "del": ("DELETE", "OLD"),
    }
    for sufixo, (evento, tabela) in esperado.items():
        assert f"DROP TRIGGER IF EXISTS trg_tme_sync_tempo_{sufixo} ON public.telemetria_time_metric_entries" in sql
        assert (
            f"CREATE TRIGGER trg_tme_sync_tempo_{sufixo} AFTER {evento} ON public.telemetria_time_metric_entries"
            f" REFERENCING {tabela} TABLE AS afetadas FOR EACH STATEMENT"
            " EXECUTE FUNCTION public.trailup_sync_tempo_da_telemetria()"
        ) in sql
    assert sql.count("CREATE TRIGGER") == 4


def test_gatilho_recalcula_so_a_matricula_e_so_o_que_mudou() -> None:
    """O tópico não tem gatilho de progresso e percentual/status não dependem de tempo: o gatilho recalcula
    só a matrícula, só dos tópicos cujo tempo mudou, e só grava onde o valor muda. O gatilho por linha de
    `conteudo_aluno`/`atividade_aluno` já recalcula tópico e matrícula quando aquelas linhas mudam."""
    corpo = _funcao(_upgrade_sql(), "trailup_sync_tempo_da_telemetria")
    assert "trailup_recalcular_topico_aluno" not in corpo
    assert corpo.rindex("UPDATE public.topico_aluno") < corpo.index("public.trailup_recalcular_classe_aluno(")
    assert "RETURNING ta.aluno_id, ta.topico_id" in corpo
    assert corpo.count("IS DISTINCT FROM x.tempo") == 3
    assert "SECURITY DEFINER" in corpo


def test_gatilho_ignora_aluno_e_topico_que_ja_nao_existem() -> None:
    """Na cascata de uma exclusão, recalcular o que está sumindo faria o upsert de progresso violar a FK."""
    corpo = _funcao(_upgrade_sql(), "trailup_sync_tempo_da_telemetria")
    assert corpo.count("EXISTS (SELECT 1 FROM public.alunos al WHERE al.id = t.aluno_id)") == 3
    assert corpo.count("EXISTS (SELECT 1 FROM public.topicos tp WHERE tp.id = t.topico_id)") == 3


def test_i06_nova_mede_a_conta_ativa_e_o_downgrade_restaura_a_f0() -> None:
    novo = _funcao(_upgrade_sql(), "fn_inv_i06")
    assert "trailup_tempo_telemetria_min" in novo
    assert "trailup_tempo_sessao_min" not in novo
    velho = _funcao(_downgrade_sql(), "fn_inv_i06")
    assert "trailup_tempo_sessao_min" in velho


def test_downgrade_restaura_rpcs_e_gatilho_de_producao() -> None:
    sql = _downgrade_sql()
    assert "trailup_tempo_sessao_min" in _funcao(sql, "trailup_registrar_sessao_estudo")
    assert "trailup_tempo_sessao_min" in _funcao(sql, "trailup_registrar_intervalo_estudo")
    sync = _funcao(sql, "trailup_sync_tempo_da_telemetria")
    assert "SET search_path TO 'public', 'pg_temp'" in sync
    assert "trailup_recalcular" not in sync
    assert "DROP FUNCTION IF EXISTS public.trailup_tempo_presenca_min(" in sql
    gatilhos = re.findall(r"DROP TRIGGER IF EXISTS (\w+)", sql)
    assert gatilhos == ["trg_tme_sync_tempo_upd_old"], gatilhos


def test_gatilho_de_progresso_por_linha_ganha_search_path() -> None:
    """Disparado de dentro de uma função com `search_path = ''`, ele não achava `conteudos` e o lote abortava."""
    sql = _upgrade_sql()
    alter = "ALTER FUNCTION public.trailup_progresso_after_item() SET search_path = public, pg_temp;"
    assert alter in sql
    assert sql.index(alter) < sql.index("CREATE OR REPLACE FUNCTION public.trailup_sync_tempo_da_telemetria(")
