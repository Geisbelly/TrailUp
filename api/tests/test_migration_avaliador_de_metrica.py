import re
from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

# As 11 métricas que `fn_conquista_metrica_suportada` declara e que o gatilho avaliava inline,
# mais `atividade_especifica`, que a fase 2 aceitava em `missoes` sem ninguém avaliar.
METRICAS = (
    "eventos_totais",
    "eventos_do_tipo",
    "atividades_concluidas",
    "topicos_concluidos",
    "topicos_visitados",
    "dias_seguidos",
    "minutos_totais",
    "acertos_percentual",
    "trilha_percentual",
    "atividade_rapida",
    "atividades_rapidas",
    "atividade_especifica",
)


def _sem_comentarios(sql: str) -> str:
    """SQL sem os comentários `--`. Asserção de AUSÊNCIA tem de olhar o código, não a
    documentação: esta migration cita `fn_conquista_metrica_suportada` em comentário de
    propósito, para registrar que NÃO a altera. (Terceira vez que isto me pega nesta pilha —
    o mesmo helper está em `test_migration_missoes_entidade.py`.)"""
    return "\n".join(linha.split("--")[0] for linha in sql.splitlines())


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_02:20261021_03", sql=True)
    return output.getvalue()


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_03:20261021_02", sql=True)
    return output.getvalue()


def test_duas_funcoes_e_nao_uma() -> None:
    """O gatilho antigo diz, em comentário, `Agregados: uma vez por evento, nao uma vez por
    conquista`. Uma `fn_avaliar_metrica(aluno, criterio)` autossuficiente recalcularia os dez
    agregados 27 vezes por evento em produção — regressão que o autor original evitou."""
    sql = _upgrade_sql()

    assert "CREATE OR REPLACE FUNCTION public.fn_agregados_do_aluno(p_aluno uuid, p_classe_id bigint)" in sql
    assert "CREATE OR REPLACE FUNCTION public.fn_avaliar_metrica(p_aluno uuid, p_agregados jsonb, p_criterio jsonb)" in sql
    # O avaliador RECEBE os agregados; não os calcula.
    corpo = sql[sql.index("fn_avaliar_metrica(p_aluno uuid") :]
    corpo = corpo[: corpo.index("$function$;")]
    assert "fn_agregados_do_aluno" not in corpo


def test_o_gatilho_calcula_os_agregados_uma_vez_fora_do_laco() -> None:
    sql = _upgrade_sql()
    gatilho = sql[sql.index("CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud") :]

    chamada = gatilho.index("public.fn_agregados_do_aluno(v_aluno_id, v_classe_id)")
    laco = gatilho.index("FOR v_conquista IN")
    assert chamada < laco, "os agregados têm de ser calculados antes do laço"
    assert gatilho.count("public.fn_agregados_do_aluno(") == 1


def test_todas_as_metricas_continuam_cobertas() -> None:
    sql = _upgrade_sql()
    avaliador = sql[sql.index("fn_avaliar_metrica(p_aluno uuid") :]
    avaliador = avaliador[: avaliador.index("$function$;")]

    for m in METRICAS:
        assert f"'{m}'" in avaliador, f"{m} saiu do avaliador"


def test_atividade_especifica_entra_no_avaliador_mas_nao_em_conquista() -> None:
    """Era o buraco da fase 2: `missoes` aceitava a métrica e nada a avaliava. Ela NÃO entra em
    `fn_conquista_metrica_suportada` — o escopo de conquista é o aluno, não um item da trilha,
    e deixá-la fora mantém o editor de conquista incapaz de oferecê-la."""
    sql = _upgrade_sql()

    assert "'atividade_especifica'" in sql
    assert "fn_conquista_metrica_suportada" not in _sem_comentarios(sql)


def test_preserva_os_detalhes_que_mudam_resultado() -> None:
    sql = _upgrade_sql()

    # Sentinela: sem atividade concluída, `atividade_rapida` tem de falhar. Com 0, passaria sempre.
    assert "COALESCE(min(tempo_gasto_min), 999999)" in sql
    assert "999999)" in sql.split("'atividade_rapida'")[1][:400]

    # Duas consultas de `topicos_visitados`, não uma com filtro opcional.
    assert "v_topicos_da_classe := 0;" in sql
    assert sql.count("status::text <> 'não iniciado'") == 2

    # `visitados = 'todos'` depende de `topicos_da_classe > 0`: sem turma o agregado é 0 e o
    # ramo falha de propósito. Olha o RAMO, não a última menção da métrica no arquivo.
    inicio = sql.index("ELSIF v_metrica = 'topicos_visitados' THEN")
    ramo = sql[inicio : sql.index("ELSIF v_metrica = 'dias_seguidos'", inicio)]
    assert "(v_ag ->> 'topicos_da_classe')::int, 0) > 0" in ramo
    assert "'todos'" in ramo

    # Status por `position('concl' ...)`, nunca por igualdade — o enum tem `concluido` sem acento
    # no í, e o `::text` antes do lower evita o COALESCE(enum,'') que estoura em runtime.
    assert "position('concl' in lower(coalesce(status::text, ''))) > 0" in sql
    assert "status = 'concluido'" not in _sem_comentarios(sql)


def test_todo_limiar_tem_coalesce_zero() -> None:
    """Critério sem o parâmetro vira alvo zero e a conquista é atingida. É o comportamento
    atual; mudá-lo aqui seria mudar resultado. (E é o motivo de `criterio.ts` travar cada par
    métrica→chave no console.)"""
    sql = _upgrade_sql()
    avaliador = sql[sql.index("fn_avaliar_metrica(p_aluno uuid") :]
    avaliador = avaliador[: avaliador.index("$function$;")]

    limiares = re.findall(r"\(p_criterio ->> '[a-z_]+'\)::(?:int|numeric)", avaliador)
    assert len(limiares) >= 10
    # Todo acesso a limiar aparece dentro de um COALESCE.
    for m in re.finditer(r"\(p_criterio ->> '([a-z_]+)'\)::(?:int|numeric)", avaliador):
        antes = avaliador[max(0, m.start() - 10) : m.start()]
        assert "COALESCE(" in antes.upper(), f"limiar {m.group(1)} sem COALESCE"


def test_nenhuma_das_novas_e_exposta_ao_cliente() -> None:
    sql = _upgrade_sql()

    assert "REVOKE ALL ON FUNCTION public.fn_agregados_do_aluno(uuid, bigint) FROM PUBLIC, anon, authenticated;" in sql
    assert "REVOKE ALL ON FUNCTION public.fn_avaliar_metrica(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;" in sql
    assert "GRANT EXECUTE" not in sql


def test_nao_liga_missao_ainda() -> None:
    """Separar é de propósito: um problema de equivalência aparece antes de haver escrita nova
    dependendo do avaliador."""
    sql = _upgrade_sql()

    codigo = _sem_comentarios(sql)
    assert "missao_aluno" not in codigo
    assert "FROM public.missoes" not in codigo


def test_guardas_do_gatilho_intactas() -> None:
    sql = _upgrade_sql()
    gatilho = sql[sql.index("CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud") :]

    # Guarda de recursão: o prêmio é um evento.
    assert "IF public.fn_evento_creditado(v_tipo) THEN" in gatilho
    # O filtro de classe e os parênteses da disjunção de perfil (20260911_06).
    assert "c.classe_id IS NULL" in gatilho
    assert "c.ativa IS NOT FALSE" in gatilho
    # Paga uma vez só.
    assert "IF v_premiar THEN" in gatilho


def test_downgrade_devolve_o_gatilho_monolitico() -> None:
    sql = _downgrade_sql()

    assert "CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud" in sql
    # O corpo antigo calcula inline.
    assert "SELECT count(*) INTO v_eventos_totais" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_avaliar_metrica(uuid, jsonb, jsonb)" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_agregados_do_aluno(uuid, bigint)" in sql
