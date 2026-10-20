"""Fase 4 do plano: missão de guilda = soma do progresso dos membros (`20261021_15`).

O comportamento foi exercitado num Postgres local com o esqueleto das tabelas envolvidas (ver o
PR); estes testes travam o LUGAR e a FORMA de cada regra no SQL gerado, no estilo de
`test_migration_missao_no_gatilho.py`.
"""

import importlib.util
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M15 = _modulo("20261021_15_missao_de_guilda_soma_os_membros.py")


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_14:20261021_15", sql=True)
    return output.getvalue()


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_15:20261021_14", sql=True)
    return output.getvalue()


def _sem_comentarios(sql: str) -> str:
    return "\n".join(linha.split("--")[0] for linha in sql.splitlines())


def _gatilho(sql: str) -> str:
    inicio = sql.index("CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud")
    return sql[inicio : sql.index("$function$;", inicio)]


def _funcao(sql: str, nome: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
    return sql[inicio : sql.index("$function$;", inicio)]


def test_encadeia_depois_da_14() -> None:
    assert _M15.revision == "20261021_15"
    assert _M15.down_revision == "20261021_14"


def test_o_gatilho_e_o_da_fase_5a_com_tres_trocas_so() -> None:
    """O corpo base é o de `20261021_04` (md5 conferido contra a produção). Desfazendo as três
    trocas, tem de voltar byte a byte — nada mais no gatilho mudou."""
    novo = _M15.gatilho()
    volta = (
        novo.replace(_M15._DECLARE_DEPOIS, _M15._DECLARE_ANTES)
        .replace(_M15._FILTRO_DEPOIS, _M15._FILTRO_ANTES)
        .replace(_M15._FIM_DO_LACO_DEPOIS, _M15._FIM_DO_LACO_ANTES)
    )
    assert volta == _M15.gatilho_anterior()


def test_o_laco_individual_pula_a_guilda_e_o_de_guilda_vem_depois() -> None:
    gatilho = _gatilho(_upgrade_sql())
    individual = gatilho.index("FOR v_missao IN")
    fim_individual = gatilho.index("END LOOP;", individual)
    assert "AND m.escopo <> 'guilda'" in gatilho[individual:fim_individual]

    guilda = gatilho.index("FOR v_missao_guilda IN")
    assert guilda > fim_individual
    laco = gatilho[guilda : gatilho.index("END LOOP;", guilda)]
    assert "m.escopo = 'guilda'" in laco
    assert "gm.left_at IS NULL" in laco
    assert "gm.aluno_id = v_aluno_id" in laco
    assert "m.aprovacao = ANY (ARRAY['nao_requer'::text, 'aprovada'::text])" in laco
    assert "m.janela_fim    IS NULL OR m.janela_fim    >= now()" in laco
    assert "public.fn_missao_guilda_avaliar(v_missao_guilda.missao_id, v_missao_guilda.guilda_id)" in laco


def test_o_laco_de_guilda_esta_dentro_do_exception() -> None:
    """Falha de missão de guilda não pode desfazer o evento nem a conquista."""
    gatilho = _gatilho(_upgrade_sql())
    guilda = gatilho.index("FOR v_missao_guilda IN")
    excecao = gatilho.index("EXCEPTION WHEN OTHERS THEN", guilda)
    assert gatilho.rindex("BEGIN", 0, guilda) < guilda < excecao
    assert "RAISE WARNING 'avaliacao de missao do aluno" in gatilho[excecao:]


def test_progresso_soma_so_o_que_soma_e_so_na_janela_e_na_filiacao() -> None:
    progresso = _funcao(_upgrade_sql(), "fn_missao_guilda_progresso")
    for m in ("eventos_totais", "eventos_do_tipo", "atividades_concluidas", "eventos_no_dia", "minutos_no_dia"):
        assert f"'{m}'::text" in progresso
    for nao_soma in ("acertos_percentual", "trilha_percentual", "dias_seguidos", "atividade_especifica"):
        assert nao_soma not in progresso
    # Janela: sem início, vale desde a criação da missão — nunca "desde sempre".
    assert "COALESCE(v_m.janela_inicio, v_m.criado_em)" in progresso
    # Filiação datada: a contribuição de cada membro é a interseção com o período dele.
    assert "GREATEST(COALESCE(gm.joined_at, '-infinity'::timestamptz), v_inicio)" in progresso
    assert "LEAST(COALESCE(gm.left_at, 'infinity'::timestamptz), v_fim)" in progresso
    # `criado_em` é timestamp sem fuso, em UTC.
    assert "(e.criado_em AT TIME ZONE 'UTC') >= p.ini" in progresso
    assert "NOT public.fn_evento_creditado(e.tipo)" in progresso


def test_avaliar_e_idempotente_e_paga_uma_vez() -> None:
    avaliar = _funcao(_upgrade_sql(), "fn_missao_guilda_avaliar")
    assert "pg_advisory_xact_lock(hashtextextended('missao_guilda:'" in avaliar
    assert "ma.guilda_id = p_guilda AND ma.status = 'concluida'" in avaliar
    assert avaliar.count("ON CONFLICT (aluno_id, missao_id) DO UPDATE") == 2
    assert avaliar.count("WHERE public.missao_aluno.status <> 'concluida'") == 2
    assert "GET DIAGNOSTICS v_mudou = ROW_COUNT" in avaliar
    assert "IF v_mudou > 0 AND v_m.recompensa_tipo IS NOT NULL THEN" in avaliar
    # Mesmo prêmio e mesma guarda de recursão da missão individual.
    assert "'missao:' || p_missao::text" in avaliar
    assert "set_config('app.missao_premiando', 'on', true)" in avaliar
    assert avaliar.count("set_config('app.missao_premiando', '', true)") >= 2
    # Recebe quem é membro ativo no momento da conclusão.
    assert "gm.left_at IS NULL" in avaliar


def test_as_mesmas_chaves_de_alvo_do_avaliador_individual() -> None:
    avaliar = _funcao(_upgrade_sql(), "fn_missao_guilda_avaliar")
    assert "(v_m.criterio ->> 'minutos')::numeric" in avaliar
    assert "(v_m.criterio ->> 'minimo')::numeric" in avaliar


def test_funcoes_novas_definer_com_search_path_e_revogadas() -> None:
    sql = _upgrade_sql()
    for nome, assinatura in (("fn_missao_guilda_progresso", "bigint, uuid"), ("fn_missao_guilda_avaliar", "bigint, uuid")):
        corpo = _funcao(sql, nome)
        assert "SECURITY DEFINER" in corpo
        assert "SET search_path = public, pg_temp" in corpo
        assert f"REVOKE ALL ON FUNCTION public.{nome}({assinatura}) FROM PUBLIC, anon, authenticated;" in sql
    assert "GRANT EXECUTE" not in _sem_comentarios(sql)


def test_a_guarda_recusa_guilda_com_metrica_que_nao_soma() -> None:
    novo = _M15.guarda()
    assert novo.replace(_M15._GUARDA_DEPOIS, _M15._GUARDA_ANTES) == _M15.guarda_anterior()
    assert "IF NEW.escopo = 'guilda' AND v_metrica <> ALL (ARRAY['eventos_totais'::text" in novo
    assert "USING ERRCODE = '22023'" in novo[novo.index("NEW.escopo = 'guilda'") :]
    # A guarda roda como quem escreve: a lista está nela, não numa função revogada.
    assert "fn_missao_guilda" not in novo


def test_nao_cria_tabela_nem_policy() -> None:
    codigo = _sem_comentarios(_upgrade_sql())
    assert "CREATE TABLE" not in codigo
    assert "ALTER TABLE" not in codigo
    assert "CREATE POLICY" not in codigo


def test_downgrade_volta_o_gatilho_e_a_guarda_e_tira_as_funcoes() -> None:
    sql = _downgrade_sql()
    gatilho = _gatilho(sql)
    assert "FOR v_missao_guilda IN" not in gatilho
    assert "m.escopo <> 'guilda'" not in gatilho
    assert "FOR v_missao IN" in gatilho
    assert "NEW.escopo = 'guilda'" not in sql
    assert "DROP FUNCTION IF EXISTS public.fn_missao_guilda_avaliar(bigint, uuid)" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_missao_guilda_progresso(bigint, uuid)" in sql
    # O gatilho volta antes das funções saírem: o corpo novo as chama.
    assert sql.index("CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud") < sql.index(
        "DROP FUNCTION IF EXISTS public.fn_missao_guilda_avaliar"
    )
