"""Estrutura da `20261104_07`: rank do evento por tempo, sem função nova na view (#932)."""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

VERSOES = Path(__file__).resolve().parent.parent / "alembic" / "versions"


def _modulo(nome: str):
    spec = importlib.util.spec_from_file_location(f"t_{nome[:11]}", VERSOES / nome)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M = _modulo("20261104_07_rank_do_evento_por_tempo.py")
M01 = _modulo("20261104_01_rank_do_evento.py")


def test_encadeia_na_head_anterior():
    assert (M.revision, M.down_revision) == ("20261104_07", "20261104_06")


def test_view_nao_ganha_funcao_nova_nem_invoker():
    # Função chamada na view precisa de EXECUTE para o cliente: foi o 42501 de 29/10.
    antiga, nova = M.view_antiga(), M.view_nova()
    assert re.findall(r"public\.\w+\(", nova) == re.findall(r"public\.\w+\(", antiga)
    assert "security_invoker" not in nova


def test_tempo_do_evento_e_so_o_escopo_topic_na_janela():
    cte = M.view_nova().split("tempo_por_rank AS (", 1)[1].split("), elo_config AS (", 1)[0]
    assert "e.scope = 'topic'::text" in cte
    assert "sum(e.active_sec)" in cte and "max(" not in cte  # lote é parcial: soma, nunca o maior
    assert "rj.evento_id IS NOT NULL" in cte
    assert "e.captured_at >= rj.inicio AND (rj.fim IS NULL OR e.captured_at < rj.fim)" in cte
    assert "e.classe_id = rj.classe_id" in cte  # é o que deixa o índice por turma entrar


def test_rank_de_turma_por_tempo_continua_na_matricula():
    nova = M.view_nova()
    assert "WHEN 'tempo'::text THEN CASE WHEN r.evento_id IS NULL\n" in nova
    assert 'THEN COALESCE(ca."tempoGastoMin", 0::numeric)' in nova


def test_check_aceita_tempo_e_mantem_os_tres():
    assert set(M01.CRITERIOS) < set(M.CRITERIOS) and set(M.CRITERIOS) - set(M01.CRITERIOS) == {"tempo"}
    sql = M._check(M.CRITERIOS)
    assert "'tempo'" in sql and "NOT VALID" not in sql
    assert "NOT VALID" in M._check(M01.CRITERIOS, valida=False)
