"""A `20261025_03` mantém na guilda os pontos de quem saiu da turma no meio do evento (#153)."""

import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

# O pai vem do arquivo: se outra migration do dia entrar antes, só o `down_revision` muda.
_ARQUIVO = (
    Path(__file__).resolve().parents[1] / "alembic" / "versions" / "20261025_03_guilda_mantem_quem_saiu_da_turma.py"
)
PAI = re.search(r'^down_revision = "([^"]+)"', _ARQUIVO.read_text(encoding="utf-8"), re.M).group(1)


def _sql(intervalo: str, downgrade: bool = False) -> str:
    output = StringIO()
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(_offline_alembic_config(output), intervalo, sql=True)
    return output.getvalue().replace("%%", "%")


def _apurar(sql: str) -> str:
    inicio = sql.index("CREATE OR REPLACE FUNCTION public.fn_evento_classe_apurar")
    return sql[inicio : sql.index("$function$;", inicio)]


def _guilda(apurar: str) -> str:
    bloco = apurar[apurar.index("IF v_evento.modalidade_guilda THEN") :]
    return bloco[: bloco.index("END IF;")]


def test_guilda_soma_quem_saiu_ate_a_saida() -> None:
    guilda = _guilda(_apurar(_sql(f"{PAI}:20261025_03")))
    assert "COALESCE(SUM(COALESCE(r.pontos, saiu.pontos)), 0) AS pontos" in guilda
    assert "LEFT JOIN LATERAL" in guilda
    # só para quem não tem resultado (saiu) e ainda tem conta
    assert "WHERE r.aluno_id IS NULL" in guilda
    assert "AND s.aluno_id IS NOT NULL" in guilda
    # janela cortada na saída
    assert "LEAST(v_evento.fim, (" in guilda
    assert "FROM public.classe_aluno_saidas sa" in guilda
    assert "sa.classe_id = v_evento.classe_id AND sa.aluno_id = s.aluno_id" in guilda
    # mesmos filtros da soma individual
    assert "AND ea.tipo <> 'evento_classe_pontos'" in guilda
    assert "public.fn_eventos_aluno_resolve_classe_id(ea.tipo, ea.referencia) = v_evento.classe_id" in guilda
    # membros continua sendo a cópia congelada inteira
    assert "COUNT(*)::integer AS membros" in guilda
    assert "WHERE s.evento_id = p_evento_id::text" in guilda


def test_resultado_individual_e_premios_nao_mudam() -> None:
    apurar = _apurar(_sql(f"{PAI}:20261025_03"))
    individual = apurar[: apurar.index("IF v_evento.modalidade_guilda THEN")]
    # o resultado individual continua sendo só de quem está matriculado
    assert "FROM public.classe_aluno ca" in individual
    assert "WHERE ca.classe_id = v_evento.classe_id" in individual
    assert "classe_aluno_saidas" not in individual
    assert "ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento' DO NOTHING" in apurar
    assert "ON CONFLICT (aluno_id, tipo, referencia) WHERE tipo = 'evento_classe_pontos' DO NOTHING" in apurar
    assert "-- Medalhas (issue #152" in apurar
    assert "SECURITY DEFINER" in apurar


def test_downgrade_volta_a_soma_da_20261025_01() -> None:
    apurar = _apurar(_sql(f"20261025_03:{PAI}", downgrade=True))
    guilda = _guilda(apurar)
    assert "classe_aluno_saidas" not in guilda
    assert "SELECT s.guilda_id, COALESCE(SUM(r.pontos), 0) AS pontos, COUNT(*)::integer AS membros" in guilda
