"""`20261103_05`: a diária sai da trilha da turma, com métrica de item e a guarda restaurada.

O comportamento (gerador escolhendo tópico/conteúdo/atividade, gatilho pagando uma vez, guarda) foi
medido num Postgres local descartável; aqui ficam as travas de estrutura que pegam regressão barata.
"""

import importlib.util
import re
import types
from pathlib import Path

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _sql(fn: str = "upgrade") -> str:
    spec = importlib.util.spec_from_file_location("m_20261103_05", VERSOES / "20261103_05_missao_diaria_pela_trilha.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    coletados: list[str] = []
    mod.op = types.SimpleNamespace(execute=lambda sql: coletados.append(str(sql)))
    getattr(mod, fn)()
    return "\n".join(coletados)


def test_cadeia() -> None:
    texto = (VERSOES / "20261103_05_missao_diaria_pela_trilha.py").read_text(encoding="utf-8")
    assert 'revision = "20261103_05"' in texto
    assert 'down_revision = "20261103_04"' in texto


def test_avaliador_ganha_o_ramo_por_ancora_no_corpo_do_banco() -> None:
    sql = _sql()
    assert "pg_get_functiondef" in sql
    # Âncora ausente ou repetida vira erro, não função inalterada dada como consertada.
    assert "ausente ou repetida" in sql
    ramo = sql[sql.index("ELSIF v_metrica = 'item_no_dia'") :]
    # Feito pelo estado OU pelo evento, e uma conclusão do tipo hoje.
    assert "public.conteudo_aluno" in ramo and "'conteudo:' || v_item_id::text" in ramo
    assert "public.atividade_aluno" in ramo and "'atividade:' || v_item_id::text" in ramo
    assert "v_ok := v_feito AND v_hoje" in ramo
    assert "AT TIME ZONE 'UTC' AT TIME ZONE v_fuso" in ramo


def test_guarda_restaura_a_regra_da_guilda_e_mantem_a_ia_editavel() -> None:
    sql = _sql()
    guarda = sql[sql.index("CREATE OR REPLACE FUNCTION public.fn_missoes_guarda") :]
    assert "IF OLD.origem = 'sistema' THEN" in guarda
    assert "v_diaria := OLD.origem = 'sistema' AND OLD.dia IS NOT NULL" in guarda
    assert "Missao de guilda soma o progresso dos membros" in guarda
    assert "'atividades_concluidas'::text" in guarda
    assert "'item_no_dia')" in guarda and "item_no_dia precisa de criterio.item" in guarda


def test_gerador_escolhe_pela_trilha_sem_hash() -> None:
    sql = _sql()
    gerador = sql[sql.index("CREATE OR REPLACE FUNCTION public.fn_missao_diaria_gerar") :]
    gerador = gerador[: gerador.index("$function$;")]
    assert "hashtext" not in gerador
    assert "public.topico_aluno" in gerador and "* 2 < v_alunos" in gerador
    assert "COALESCE(a.tipo, '') <> 'missao'" in gerador
    assert re.search(r"'slot', 1,\s*'titulo', 'Conteúdo do dia'", gerador)
    assert re.search(r"'slot', 2,\s*'titulo', 'Atividade do dia'", gerador)
    assert re.search(r"'slot', 3,\s*'titulo', 'Seu tempo de estudo'", gerador)
    assert "WHERE dia IS NOT NULL" in gerador  # índice parcial: o predicado precisa vir junto


def test_gatilho_paga_uma_vez_e_nao_derruba_o_progresso() -> None:
    sql = _sql()
    gatilho = sql[sql.index("CREATE OR REPLACE FUNCTION public.trg_missao_item_concluido") :]
    assert "WHERE public.missao_aluno.status <> 'concluida'" in gatilho
    assert "GET DIAGNOSTICS v_mudou = ROW_COUNT" in gatilho
    assert "EXCEPTION WHEN OTHERS" in gatilho
    assert "jsonb_build_object('concluiu_agora', v_item)" in gatilho
    for tabela in ("conteudo_aluno", "atividade_aluno"):
        assert f"AFTER INSERT OR UPDATE OF status ON public.{tabela}" in gatilho


def test_downgrade_volta_gerador_e_guarda_anteriores() -> None:
    sql = _sql("downgrade")
    assert "DROP FUNCTION IF EXISTS public.trg_missao_item_concluido()" in sql
    assert "hashtext" in sql  # gerador da _04
    assert "CREATE OR REPLACE FUNCTION public.fn_missoes_guarda" in sql
