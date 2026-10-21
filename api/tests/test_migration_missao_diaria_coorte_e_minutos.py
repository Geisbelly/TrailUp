"""`20261021_20`: missão só do PERFIL DA MISSÃO do aluno (gerador e os dois gatilhos), e
`minutos_no_dia` reavaliada quando `aluno_atividade_diaria.tempo_uso_seg` muda.

O comportamento foi exercitado num Postgres 17 local com o esqueleto das tabelas e os perfis
dos dois alunos de produção (ver o PR): o gerador antigo dá as mesmas 29 missões de 20/10, o
novo dá 20, e o gatilho conclui e paga uma vez só. Estes testes travam o LUGAR e a FORMA de cada
regra no SQL gerado, no estilo de `test_migration_missao_de_guilda.py`.
"""

import hashlib
import importlib.util
import re
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


_M20 = _modulo("20261021_20_missao_diaria_coorte_representativa_e_minutos.py")
_M15 = _modulo("20261021_15_missao_de_guilda_soma_os_membros.py")

# md5 de `prosrc` lido em produção em 20/10/2026 (SELECT md5(prosrc) FROM pg_proc).
_MD5_GERADOR_EM_PRODUCAO = "2fff7e98465ba618995d6656483d4d4f"
_MD5_GATILHO_EM_PRODUCAO = "9bf05f969f0b3bb206226cc43c5dfcea"


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_19:20261021_20", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_20:20261021_19", sql=True)
    return output.getvalue().replace("%%", "%")


def _corpo(sql: str) -> str:
    inicio = sql.index("AS $function$") + len("AS $function$")
    return sql[inicio : sql.index("$function$;", inicio)]


def _funcao(sql: str, nome: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
    return sql[inicio : sql.index("$function$;", inicio)]


def _representativos(sql: str) -> str:
    inicio = sql.index("WITH representativos AS (")
    return sql[inicio : sql.index("    )\n", inicio)]


def _normal(texto: str) -> str:
    return re.sub(r"\s+", " ", texto).strip()


def test_encadeia_depois_da_19_sem_bifurcar_a_arvore() -> None:
    """O invariante é **uma head só**, não que a head seja a `_20`.

    Este teste exigia `get_heads() == ["20261021_20"]`, e por isso a primeira migration escrita
    depois dela (a `_21`) o quebrou — sem que nada estivesse errado. Duas migrations com o mesmo
    `down_revision` é o defeito de verdade: o Alembic passa a ter duas pontas e `upgrade head`
    falha pedindo para escolher.
    """
    assert _M20.revision == "20261021_20"
    assert _M20.down_revision == "20261021_19"
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    heads = ScriptDirectory.from_config(cfg).get_heads()
    assert len(heads) == 1, f"a árvore bifurcou: {sorted(heads)}"
    # E a `_20` continua no caminho até essa ponta — não ficou órfã num galho morto.
    script = ScriptDirectory.from_config(cfg)
    ancestrais = {r.revision for r in script.walk_revisions("base", heads[0])}
    assert "20261021_20" in ancestrais


# --- 1. gerador -------------------------------------------------------------------------


def test_o_gerador_base_e_o_que_esta_em_producao() -> None:
    assert hashlib.md5(_corpo(_M20.gerador_anterior()).encode()).hexdigest() == _MD5_GERADOR_EM_PRODUCAO


def test_o_gerador_so_mudou_no_recorte_da_coorte() -> None:
    novo = _M20.gerador()
    assert novo.replace(_M20._COORTE_DEPOIS, _M20._COORTE_ANTES) == _M20.gerador_anterior()


def _predicado(cte: str) -> str:
    """O miolo de `representativos`: ordem e corte. Tudo o resto (colunas, nome do parâmetro,
    indentação) pode variar."""
    ordem = re.search(r"ORDER BY [^\n]+", cte).group(0)
    corte = cte[cte.index("WHERE rep.af") :]
    corte = corte[: corte.index(")", corte.index("rep.pos")) + 1]
    return _normal(ordem + " " + corte)


def test_perfil_da_missao_usa_o_mesmo_representativo_do_gatilho() -> None:
    fn = _M20.PERFIL_DA_MISSAO
    conquista = _M15.gatilho()
    assert _predicado(fn) == _predicado(conquista)
    assert (
        _predicado(fn)
        == "ORDER BY COALESCE(ap.afinidade, 0) DESC, p.nome ASC WHERE rep.af >= 20 OR (rep.af > 0 AND rep.pos <= 2)"
    )


def test_perfil_da_missao_e_o_ativo_se_representativo_senao_o_primeiro() -> None:
    fn = _normal(_M20.PERFIL_DA_MISSAO)
    assert "JOIN public.alunos a ON a.id = p_aluno WHERE r.nome = lower(btrim(a.perfil_ativo))" in fn
    assert "(SELECT r.nome FROM representativos r ORDER BY r.pos LIMIT 1)" in fn
    assert fn.index("lower(btrim(a.perfil_ativo))") < fn.index("ORDER BY r.pos LIMIT 1")
    assert "SELECT COALESCE(" in fn
    assert "STABLE SECURITY DEFINER SET search_path = public, pg_temp" in fn
    assert "REVOKE ALL ON FUNCTION public.fn_perfil_da_missao(uuid) FROM PUBLIC, anon, authenticated;" in fn


def test_a_coorte_e_o_perfil_da_missao_de_cada_aluno() -> None:
    gerador = _funcao(_upgrade_sql(), "fn_missao_diaria_gerar")
    laco = gerador[gerador.index("FOR v_coorte IN") : gerador.index("LOOP", gerador.index("FOR v_coorte IN"))]
    assert "CROSS JOIN LATERAL (SELECT public.fn_perfil_da_missao(ca.aluno_id) AS perfil) pm" in laco
    assert "AND pm.perfil IS NOT NULL" in laco
    assert "GROUP BY ca.classe_id, pm.perfil" in laco
    assert "aluno_perfil" not in laco


def test_a_funcao_nasce_antes_de_quem_a_usa() -> None:
    sql = _upgrade_sql()
    criada = sql.index("CREATE OR REPLACE FUNCTION public.fn_perfil_da_missao(")
    assert criada < sql.index("CREATE OR REPLACE FUNCTION public.fn_missao_diaria_gerar")
    assert criada < sql.index("CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud")
    assert criada < sql.index("CREATE OR REPLACE FUNCTION public.trg_aluno_atividade_diaria_missao_minutos")


# --- 1b. gatilho de eventos ---------------------------------------------------------------


def test_o_gatilho_base_e_o_que_esta_em_producao() -> None:
    assert hashlib.md5(_corpo(_M20.gatilho_anterior()).encode()).hexdigest() == _MD5_GATILHO_EM_PRODUCAO


def test_o_gatilho_so_mudou_no_laco_individual_de_missao() -> None:
    novo = _M20.gatilho()
    volta = (
        novo.replace(_M20._G_DECLARE_DEPOIS, _M20._G_DECLARE_ANTES)
        .replace(_M20._G_LACO_DEPOIS, _M20._G_LACO_ANTES)
        .replace(_M20._G_PERFIL_DEPOIS, _M20._G_PERFIL_ANTES)
    )
    assert volta == _M20.gatilho_anterior()


def test_o_laco_individual_avalia_so_o_perfil_da_missao() -> None:
    gatilho = _funcao(_upgrade_sql(), "trg_eventos_aluno_after_iud")
    individual = gatilho[gatilho.index("FOR v_missao IN") : gatilho.index("FOR v_missao_guilda IN")]
    assert "representativos" not in individual
    assert "OR lower(m.perfil_alvo) = v_perfil_missao)" in individual
    assert gatilho.index("v_perfil_missao := public.fn_perfil_da_missao(v_aluno_id);") < gatilho.index(
        "FOR v_missao IN"
    )
    # A conquista segue por TODOS os representativos: a decisão é só sobre missão.
    conquista = gatilho[gatilho.index("FOR v_conquista IN") : gatilho.index("FOR v_missao IN")]
    assert "OR lower(COALESCE(c.perfil_alvo, '')) IN (SELECT nome FROM representativos)" in conquista


def test_o_gerador_continua_idempotente_e_revogado() -> None:
    sql = _upgrade_sql()
    gerador = _funcao(sql, "fn_missao_diaria_gerar")
    assert "ON CONFLICT (classe_id, coalesce(perfil_alvo, ''), dia, slot) WHERE dia IS NOT NULL" in gerador
    assert "REVOKE ALL ON FUNCTION public.fn_missao_diaria_gerar(date) FROM PUBLIC, anon, authenticated;" in sql


# --- 2. minutos_no_dia pelo tempo de uso -------------------------------------------------


def test_gatilho_de_update_so_de_tempo_uso_e_insert_com_tempo() -> None:
    sql = _normal(_upgrade_sql())
    assert (
        "CREATE TRIGGER trg_aluno_atividade_diaria_missao_minutos_upd "
        "AFTER UPDATE OF tempo_uso_seg ON public.aluno_atividade_diaria FOR EACH ROW "
        "WHEN (NEW.tempo_uso_seg IS DISTINCT FROM OLD.tempo_uso_seg AND COALESCE(NEW.tempo_uso_seg, 0) > 0)"
    ) in sql
    assert (
        "CREATE TRIGGER trg_aluno_atividade_diaria_missao_minutos_ins "
        "AFTER INSERT ON public.aluno_atividade_diaria FOR EACH ROW "
        "WHEN (COALESCE(NEW.tempo_uso_seg, 0) > 0)"
    ) in sql


def test_so_o_laco_de_missao_e_so_minutos_no_dia() -> None:
    fn = _funcao(_upgrade_sql(), "trg_aluno_atividade_diaria_missao_minutos")
    # Nada de conquista nem de agregados: é só o laço de missão.
    assert "conquistas" not in fn
    assert "fn_agregados_do_aluno" not in fn
    assert "fn_avaliar_metrica(v_aluno_id, '{}'::jsonb, v_missao.criterio)" in fn
    assert fn.count("m.criterio ->> 'metrica' = 'minutos_no_dia'") == 2
    individual = fn[fn.index("FOR v_missao IN") : fn.index("FOR v_missao_guilda IN")]
    assert "AND m.escopo <> 'guilda'" in individual


def test_o_filtro_individual_e_o_do_gatilho_de_eventos() -> None:
    fn = _funcao(_upgrade_sql(), "trg_aluno_atividade_diaria_missao_minutos")
    assert "representativos" not in fn
    assert fn.index("v_perfil_missao := public.fn_perfil_da_missao(v_aluno_id);") < fn.index("FOR v_missao IN")
    for trecho in (
        "m.aprovacao = ANY (ARRAY['nao_requer'::text, 'aprovada'::text])",
        "(m.janela_inicio IS NULL OR m.janela_inicio <= now())",
        "(m.janela_fim    IS NULL OR m.janela_fim    >= now())",
        "SELECT ca.classe_id FROM public.classe_aluno ca WHERE ca.aluno_id = v_aluno_id",
        "OR lower(m.perfil_alvo) = v_perfil_missao)",
        "ma.status = 'concluida'",
    ):
        assert trecho in fn, trecho


def test_conclui_uma_vez_e_paga_so_se_a_linha_mudou() -> None:
    fn = _normal(_funcao(_upgrade_sql(), "trg_aluno_atividade_diaria_missao_minutos"))
    assert (
        "ON CONFLICT (aluno_id, missao_id) DO UPDATE SET status = 'concluida', progresso = 100, "
        "concluida_em = now(), updated_at = now() WHERE public.missao_aluno.status <> 'concluida';"
    ) in fn
    assert "GET DIAGNOSTICS v_mudou = ROW_COUNT;" in fn
    assert "IF v_mudou > 0 AND v_missao.recompensa_tipo IS NOT NULL THEN" in fn
    # O prêmio sai sob o sinal, e o sinal volta a vazio logo depois.
    premio = fn[fn.index("IF v_mudou > 0") :]
    assert (
        premio.index("set_config('app.missao_premiando', 'on', true)")
        < premio.index("INSERT INTO public.eventos_aluno")
        < premio.index("set_config('app.missao_premiando', '', true)")
    )


def test_respeita_o_sinal_e_falha_nao_derruba_o_heartbeat() -> None:
    fn = _funcao(_upgrade_sql(), "trg_aluno_atividade_diaria_missao_minutos")
    assert "IF COALESCE(current_setting('app.missao_premiando', true), '') = 'on' THEN" in fn
    assert fn.index("current_setting('app.missao_premiando'") < fn.index("FOR v_missao IN")
    excecao = fn[fn.index("EXCEPTION WHEN OTHERS THEN") :]
    assert "set_config('app.missao_premiando', '', true)" in excecao
    assert "RAISE WARNING" in excecao


def test_guilda_de_minutos_vai_pela_funcao_da_guilda() -> None:
    fn = _funcao(_upgrade_sql(), "trg_aluno_atividade_diaria_missao_minutos")
    laco = fn[fn.index("FOR v_missao_guilda IN") :]
    assert "m.escopo = 'guilda'" in laco
    assert "gm.left_at IS NULL" in laco
    assert "PERFORM public.fn_missao_guilda_avaliar(v_missao_guilda.missao_id, v_missao_guilda.guilda_id);" in laco


def test_funcao_e_definer_com_search_path_e_revogada() -> None:
    sql = _upgrade_sql()
    fn = _funcao(sql, "trg_aluno_atividade_diaria_missao_minutos")
    assert "SECURITY DEFINER" in fn
    assert "SET search_path TO 'public', 'pg_temp'" in fn
    assert (
        "REVOKE ALL ON FUNCTION public.trg_aluno_atividade_diaria_missao_minutos() FROM PUBLIC, anon, authenticated;"
    ) in sql


# --- downgrade ----------------------------------------------------------------------------


def test_downgrade_tira_o_gatilho_e_devolve_gerador_e_gatilho_de_producao() -> None:
    sql = _downgrade_sql()
    assert "DROP TRIGGER IF EXISTS trg_aluno_atividade_diaria_missao_minutos_ins" in sql
    assert "DROP TRIGGER IF EXISTS trg_aluno_atividade_diaria_missao_minutos_upd" in sql
    assert "DROP FUNCTION IF EXISTS public.trg_aluno_atividade_diaria_missao_minutos();" in sql
    assert _corpo(_M20.gerador_anterior()) in sql
    assert _corpo(_M20.gatilho_anterior()) in sql
    assert "fn_perfil_da_missao(ca.aluno_id)" not in sql
    assert "v_perfil_missao" not in sql
    # Os gatilhos saem antes da função de que dependem, e `fn_perfil_da_missao` só sai depois
    # que gerador e gatilho de eventos voltaram a não usá-la.
    assert sql.index("DROP TRIGGER IF EXISTS trg_aluno_atividade_diaria_missao_minutos_upd") < sql.index(
        "DROP FUNCTION IF EXISTS public.trg_aluno_atividade_diaria_missao_minutos();"
    )
    drop = sql.index("DROP FUNCTION IF EXISTS public.fn_perfil_da_missao(uuid)")
    assert sql.index("CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud") < drop
    assert sql.index("CREATE OR REPLACE FUNCTION public.fn_missao_diaria_gerar") < drop
