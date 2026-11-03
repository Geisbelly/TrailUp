"""`20261102_26`: perfil BrainHex × formato (PR3, #20).

Os números estão em `test_e2e_metricas_perfil_formato.py` (Postgres local). Aqui fica o que dá
para travar sem banco.
"""

import importlib.util
import re
from pathlib import Path

from alembic.script import ScriptDirectory

from tests.test_migrations import _offline_alembic_config

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo():
    path = VERSOES / "20261102_26_metricas_perfil_formato.py"
    spec = importlib.util.spec_from_file_location("m_20261102_26_teste", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M = _modulo()


def _corpo() -> str:
    return M.RPC[M.RPC.index("FUNCTION public.metricas_perfil_formato(") : M.RPC.index("$fn$;")]


def test_cadeia_e_cabeca_unica() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261102_26").down_revision == "20261102_25"


def test_confere_sessao_e_posse_antes_de_ler() -> None:
    corpo = _corpo()
    assert "SECURITY DEFINER" in corpo
    assert "SET search_path TO 'public', 'pg_temp'" in corpo
    checagem = corpo.index("auth.uid() IS NULL")
    assert checagem < corpo.index("app_classes_do_professor()") < corpo.index("WITH\n")
    assert "REVOKE ALL ON FUNCTION public.metricas_perfil_formato(bigint[], date, date) FROM PUBLIC, anon" in M.RPC
    assert "GRANT EXECUTE ON FUNCTION public.metricas_perfil_formato(bigint[], date, date) TO authenticated" in M.RPC


def test_nenhum_aluno_id_sai_no_resultado() -> None:
    corpo = _corpo()
    saida = corpo[corpo.index("SELECT jsonb_build_object(") :]
    assert not re.search(r"'aluno_id'", saida)


def test_todo_numero_da_celula_passa_pelo_minimo() -> None:
    """Campo novo que saia sem comparar com `v_n_min` vaza o número de uma turma pequena (#864).
    Os únicos fora da regra são as contagens de alunos e o n efetivo, que dizem o tamanho da
    amostra e não o que ela fez."""
    corpo = _corpo()
    saida = corpo[corpo.index("'por_perfil_dominante'") : corpo.index("'definicoes'")]
    # Cada campo vai do nome até o próximo nome: o valor pode começar na linha de baixo.
    partes = re.split(r"'([a-z0-9_]+)',\s", saida)[1:]
    campos = list(zip(partes[0::2], partes[1::2], strict=True))  # com repetição: `alunos` aparece duas vezes
    aninhados = {c for c, v in campos if v.lstrip().startswith(("jsonb_build_object(", "COALESCE(("))}
    soltos = {c for c, v in campos if c not in aninhados and "v_n_min" not in v}
    assert aninhados == {"por_perfil_dominante", "por_afinidade", "formatos", "desempenho"}
    assert soltos == {"perfil", "formato", "alunos", "alunos_com_uso", "n_efetivo"}
    assert {"uso_pct", "fatia_do_tempo_pct", "acerto_primeira_tentativa_pct", "ic95_pct", "prioritario_pct"} <= {c for c, _ in campos}


def test_uso_e_so_material_personalizado_em_tempo_ativo() -> None:
    corpo = _corpo()
    uso = corpo[corpo.index("uso AS (") : corpo.index("prioritario AS (")]
    assert "sum(e.active_sec)" in uso and "dwell_sec" not in uso
    assert "e.scope = 'material'" in uso
    assert "personalization" in uso
    respostas = corpo[corpo.index("respostas AS (") : corpo.index("pares AS (")]
    assert "qa.tentativa = 1" in respostas


def test_sem_porcento_nem_bind_acidental() -> None:
    # O SQL offline do Alembic dobra `%` e `text()` lê `:palavra` como parâmetro.
    for sql in (M.CATALOGO, M.RPC, M.DOWNGRADE):
        assert "%" not in sql
        assert not re.search(r"(?<!:):[A-Za-z_]", sql)


def test_downgrade_remove_o_que_o_upgrade_cria() -> None:
    for objeto in ("metricas_perfil_formato(bigint[], date, date)", "pr3.engajamento_formato", "pr3.acerto_formato"):
        assert objeto in M.DOWNGRADE, objeto
