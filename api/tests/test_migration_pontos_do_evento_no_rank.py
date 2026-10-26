"""A `20261025_01` credita os "Pontos do evento" de `eventos_classe` no rank (#141)."""

import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

# O pai vem do arquivo: se outra migration do dia entrar antes, só o `down_revision` muda.
_ARQUIVO = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "20261025_01_pontos_do_evento_no_rank.py"
PAI = re.search(r'^down_revision = "([^"]+)"', _ARQUIVO.read_text(encoding="utf-8"), re.M).group(1)


def _sql(intervalo: str, downgrade: bool = False) -> str:
    output = StringIO()
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(_offline_alembic_config(output), intervalo, sql=True)
    return output.getvalue().replace("%%", "%")


def _upgrade() -> str:
    return _sql(f"{PAI}:20261025_01")


def _apurar(sql: str) -> str:
    inicio = sql.index("CREATE OR REPLACE FUNCTION public.fn_evento_classe_apurar")
    return sql[inicio : sql.index("$function$;", inicio)]


def test_tipo_do_credito_e_creditado_e_o_aluno_nao_o_grava() -> None:
    sql = _upgrade()
    assert "OR starts_with(lower(p_tipo), 'evento_classe')" in sql
    # os prefixos de antes continuam
    for prefixo in ("presenca", "participacao", "conquista", "nota_professor", "meta_atingida"):
        assert f"starts_with(lower(p_tipo), '{prefixo}')" in sql


def test_credito_idempotente_com_indice_parcial_e_predicado_repetido() -> None:
    sql = _upgrade()
    assert "CREATE UNIQUE INDEX IF NOT EXISTS eventos_aluno_evento_classe_unico" in sql
    assert "WHERE tipo = 'evento_classe_pontos';" in sql
    apurar = _apurar(sql)
    assert (
        "ON CONFLICT (aluno_id, tipo, referencia) WHERE tipo = 'evento_classe_pontos' DO NOTHING" in apurar
    )


def test_so_participante_recebe_e_na_turma_do_evento() -> None:
    apurar = _apurar(_upgrade())
    bloco = apurar[apurar.index("IF v_evento.pontos > 0 THEN") :]
    bloco = bloco[: bloco.index("END IF;")]
    assert "WHERE r.evento_id = p_evento_id AND r.participou" in bloco
    assert "'classe:' || v_evento.classe_id::text || ':evento:' || p_evento_id::text" in bloco
    assert "v_evento.pontos" in bloco
    # o valor vem do evento: o INSERT não deixa o gatilho escolher pelo tipo
    assert "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, concedido_por, motivo)" in bloco


def test_credito_de_evento_nao_entra_na_soma_da_janela() -> None:
    apurar = _apurar(_upgrade())
    janela = apurar[apurar.index("LEFT JOIN public.eventos_aluno ea") : apurar.index("WHERE ca.classe_id")]
    assert "AND ea.tipo <> 'evento_classe_pontos'" in janela


def test_resto_da_apuracao_continua_igual() -> None:
    apurar = _apurar(_upgrade())
    # moedas, medalhas e guilda seguem como na 20261021_06
    assert "ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento' DO NOTHING" in apurar
    assert "-- Medalhas (issue #152" in apurar
    assert "SECURITY DEFINER" in apurar


def test_downgrade_volta_a_apuracao_e_a_lista_de_creditados_de_antes() -> None:
    sql = _sql(f"20261025_01:{PAI}", downgrade=True)
    assert "DROP INDEX IF EXISTS public.eventos_aluno_evento_classe_unico;" in sql
    assert "starts_with(lower(p_tipo), 'evento_classe')" not in sql
    assert "evento_classe_pontos" not in _apurar(sql)
    assert "starts_with(lower(p_tipo), 'meta_atingida')" in sql
