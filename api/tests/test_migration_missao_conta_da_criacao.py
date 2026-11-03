"""`20261103_07`: missão de turma e de aluno conta da criação, não desde sempre."""

import importlib.util
import re
import types
from pathlib import Path

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}", VERSOES / nome)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _mod():
    return _modulo("20261103_07_missao_conta_da_criacao.py")


def _sql(fn: str = "upgrade") -> str:
    mod = _mod()
    coletados: list[str] = []
    mod.op = types.SimpleNamespace(execute=lambda sql: coletados.append(str(sql)))
    getattr(mod, fn)()
    return "\n".join(coletados)


def test_cadeia() -> None:
    mod = _mod()
    assert (mod.revision, mod.down_revision) == ("20261103_07", "20261103_06")


def test_ancora_do_laco_existe_uma_vez_no_gatilho_vivo() -> None:
    # O texto do gatilho como `20261021_20` o deixou; as migrations seguintes so' mexem na
    # notificacao de conquista, longe do laco de missao.
    gatilho = _modulo("20261021_20_missao_diaria_coorte_representativa_e_minutos.py").gatilho()
    assert gatilho.count(_mod()._ANCORA_LACO) == 1


def test_ancora_do_avaliador_existe_uma_vez() -> None:
    fonte = (VERSOES / "20261021_05_missao_diaria_deterministica.py").read_text()
    avaliador = re.search(r"CREATE OR REPLACE FUNCTION public\.fn_avaliar_metrica.*?\$function\$;", fonte, re.S).group(0)
    assert avaliador.count(_mod()._ANCORA_AVALIADOR) == 1


def test_laco_manda_desde_e_conquista_nao() -> None:
    sql = _sql()
    assert "jsonb_build_object('desde', COALESCE(m.janela_inicio, m.criado_em))" in sql
    # So' as seis metricas que o professor e a IA usam; as de delta e as de conquista ficam.
    assert "IF p_criterio ? 'desde' AND v_metrica IN ('minutos_totais', 'dias_seguidos', " in sql
    for de_fora in ("eventos_totais", "minutos_no_dia", "item_no_dia", "atividade_especifica"):
        assert f"'{de_fora}'" not in sql.split("IF p_criterio ? 'desde'")[1].split("THEN")[0]


def test_agregados_recortam_no_tempo_com_a_fonte_do_tempo_ativo() -> None:
    sql = _sql()
    assert "e.scope IN ('content', 'activity')" in sql
    assert "e.captured_at >= p_desde" in sql
    assert "v_desde_utc          timestamp := p_desde AT TIME ZONE 'UTC'" in sql
    assert "REVOKE ALL ON FUNCTION public.fn_agregados_desde(uuid, timestamptz) FROM PUBLIC, anon, authenticated" in sql


def test_downgrade_desfaz_as_duas_trocas_e_derruba_a_funcao() -> None:
    sql = _sql("downgrade")
    assert sql.count("EXECUTE replace(v_def") == 2
    assert "DROP FUNCTION IF EXISTS public.fn_agregados_desde(uuid, timestamptz)" in sql
    # A ordem inverte origem e destino: o laco com `desde` volta a ser o original.
    assert sql.index("trg_eventos_aluno_after_iud") < sql.index("fn_avaliar_metrica")
