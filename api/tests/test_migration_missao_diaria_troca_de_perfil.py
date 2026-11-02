"""`20261102_14`: trocar `alunos.perfil_ativo` gera na hora a coorte do dia do perfil novo.

O comportamento foi exercitado num Postgres 17 local com o esqueleto das tabelas, o gerador da
cadeia `20261021_05` → `_20` → `20261030_02` e esta migração (ver o PR). Estes testes travam o
LUGAR e a FORMA de cada regra no SQL gerado, no estilo de
`test_migration_missao_diaria_coorte_e_minutos.py`.
"""

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


_M14 = _modulo("20261102_14_missao_diaria_na_troca_de_perfil.py")
_M20 = _modulo("20261021_20_missao_diaria_coorte_representativa_e_minutos.py")
_M05 = _modulo("20261021_05_missao_diaria_deterministica.py")


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261102_13:20261102_14", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261102_14:20261102_13", sql=True)
    return output.getvalue().replace("%%", "%")


def _normal(texto: str) -> str:
    return re.sub(r"\s+", " ", texto).strip()


def test_encadeia_depois_da_13_sem_bifurcar_a_arvore() -> None:
    assert _M14.revision == "20261102_14"
    assert _M14.down_revision == "20261102_13"
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert len(heads) == 1, f"a árvore bifurcou: {sorted(heads)}"
    assert "20261102_14" in {r.revision for r in script.walk_revisions("base", heads[0])}


# --- gerador ----------------------------------------------------------------------------


def test_o_recorte_procurado_e_o_que_a_20_deixou_e_aparece_uma_vez() -> None:
    """A âncora tem de casar com o corpo que a cadeia de migrações produz. `20261030_02` só trocou
    textos dos moldes, então o recorte da coorte é o de `20261021_20`."""
    assert _M14.FILTRO_ANTES in _M20._COORTE_DEPOIS
    assert _M20.gerador().count(_M14.FILTRO_ANTES) == 1


def test_o_gerador_so_ganha_o_filtro_do_aluno() -> None:
    novo = _M20.gerador().replace(_M14.FILTRO_ANTES, _M14.FILTRO_DEPOIS)
    acrescentado = [linha for linha in novo.splitlines() if linha not in _M20.gerador().splitlines()]
    codigo = [linha.strip() for linha in acrescentado if not linha.strip().startswith("--")]
    assert codigo == ["AND (p_aluno IS NULL OR ca.aluno_id = p_aluno)"]
    # O filtro fica no laço das coortes, antes do GROUP BY, e não toca no hash nem no INSERT.
    laco = novo[novo.index("FOR v_coorte IN") : novo.index("LOOP", novo.index("FOR v_coorte IN"))]
    assert "AND (p_aluno IS NULL OR ca.aluno_id = p_aluno)" in laco
    assert laco.index("p_aluno IS NULL") < laco.index("GROUP BY ca.classe_id, pm.perfil")


def test_o_cabecalho_e_o_da_05_com_um_parametro_a_mais() -> None:
    antigo = _M05.GERADOR
    antigo = antigo[antigo.index("CREATE OR REPLACE FUNCTION") : antigo.index("AS $function$")]
    novo = _M14._CABECALHO.format(parametros=_M14.PARAMETROS_DEPOIS)
    novo = novo[: novo.index("AS %L")]
    esperado = antigo.replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION").replace(
        "(p_dia date DEFAULT NULL)", "(p_dia date DEFAULT NULL, p_aluno uuid DEFAULT NULL)"
    )
    assert _normal(novo) == _normal(esperado)


def test_o_cron_continua_resolvendo_sem_argumento() -> None:
    """O cron chama `fn_missao_diaria_gerar()`. Com os dois parâmetros com DEFAULT e a assinatura
    antiga removida, a chamada sem argumento tem um só candidato."""
    assert "$$SELECT public.fn_missao_diaria_gerar()$$" in _M05.CRON
    assert _M14.PARAMETROS_DEPOIS == "p_dia date DEFAULT NULL, p_aluno uuid DEFAULT NULL"
    sql = _upgrade_sql()
    assert sql.index("DROP FUNCTION public.fn_missao_diaria_gerar(date);") < sql.index("EXECUTE format(")


def test_o_corpo_vem_do_banco_e_recorte_ausente_e_erro() -> None:
    sql = _upgrade_sql()
    assert "SELECT p.prosrc INTO v_corpo" in sql
    assert "to_regprocedure('public.fn_missao_diaria_gerar(date)')" in sql
    assert "RAISE EXCEPTION 'recorte da coorte encontrado % vez(es) em fn_missao_diaria_gerar'" in sql
    assert "IF v_vezes <> 1 THEN" in sql
    # Reaplicar não falha: a assinatura nova já existindo é aceita.
    assert "to_regprocedure('public.fn_missao_diaria_gerar(date, uuid)') IS NOT NULL" in sql


def test_o_gerador_novo_fica_sem_execute_para_o_cliente() -> None:
    sql = _upgrade_sql()
    assert "REVOKE ALL ON FUNCTION public.fn_missao_diaria_gerar(date, uuid) FROM PUBLIC, anon, authenticated;" in sql


# --- gatilho ----------------------------------------------------------------------------


def _funcao_do_gatilho() -> str:
    sql = _upgrade_sql()
    inicio = sql.index("CREATE OR REPLACE FUNCTION public.trg_alunos_missao_diaria_perfil()")
    return sql[inicio : sql.index("$function$;", inicio)]


def test_gatilho_so_na_troca_de_perfil_ativo() -> None:
    sql = _normal(_upgrade_sql())
    assert (
        "CREATE TRIGGER trg_alunos_missao_diaria_perfil AFTER UPDATE OF perfil_ativo ON public.alunos "
        "FOR EACH ROW WHEN (OLD.perfil_ativo IS DISTINCT FROM NEW.perfil_ativo) "
        "EXECUTE FUNCTION public.trg_alunos_missao_diaria_perfil();"
    ) in sql


def test_gatilho_gera_so_as_coortes_do_aluno_e_de_hoje() -> None:
    fn = _funcao_do_gatilho()
    assert "v_novas := public.fn_missao_diaria_gerar(NULL, NEW.id);" in fn
    assert "SECURITY DEFINER" in fn
    assert "SET search_path = public, pg_temp" in fn
    assert (
        "REVOKE ALL ON FUNCTION public.trg_alunos_missao_diaria_perfil() FROM PUBLIC, anon, authenticated;"
        in _upgrade_sql()
    )


def test_enfileirar_so_com_missao_nova_e_em_bloco_proprio() -> None:
    """Falha de missão não pode impedir a troca de perfil, e falha ao enfileirar não pode desfazer
    a missão gerada (a mesma separação dos dois cron de `20261021_07`)."""
    fn = _funcao_do_gatilho()
    gerar = fn.index("fn_missao_diaria_gerar(NULL, NEW.id)")
    primeiro_except = fn.index("EXCEPTION WHEN OTHERS", gerar)
    enfileirar = fn.index("PERFORM public.fn_missao_diaria_enfileirar_texto();")
    segundo_except = fn.index("EXCEPTION WHEN OTHERS", enfileirar)
    assert gerar < primeiro_except < enfileirar < segundo_except
    assert fn.index("IF COALESCE(v_novas, 0) > 0 THEN") < enfileirar
    # Nenhum dos dois blocos relança.
    assert "RAISE;" not in fn
    assert "RAISE EXCEPTION" not in fn


# --- downgrade --------------------------------------------------------------------------


def test_downgrade_tira_o_gatilho_antes_e_volta_a_assinatura_antiga() -> None:
    sql = _downgrade_sql()
    gatilho = sql.index("DROP TRIGGER IF EXISTS trg_alunos_missao_diaria_perfil ON public.alunos;")
    funcao = sql.index("DROP FUNCTION IF EXISTS public.trg_alunos_missao_diaria_perfil();")
    gerador = sql.index("DROP FUNCTION public.fn_missao_diaria_gerar(date, uuid);")
    assert gatilho < funcao < gerador
    assert "CREATE FUNCTION public.fn_missao_diaria_gerar(p_dia date DEFAULT NULL)" in sql
    assert "REVOKE ALL ON FUNCTION public.fn_missao_diaria_gerar(date) FROM PUBLIC, anon, authenticated;" in sql
