"""Ranqueada com Elo (`20261021_18`).

O comportamento foi exercitado num Postgres 17 local com as funções de produção do fechamento
(`fn_desafio_encerrar`, `fn_arena_placar`, `fn_arena_equipes`, `fn_app_config_int`), ver o PR.
Estes testes travam o LUGAR e a FORMA de cada regra no SQL gerado.
"""

import hashlib
import importlib.util
import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"

# md5 de `prosrc` de `fn_desafio_encerrar` na produção, 2026-10-20 (somente leitura).
_MD5_ENCERRAR_PRODUCAO = "650451cb9b44179d841d2899546754ff"
_MD5_ARENA_ENCERRAR_PRODUCAO = "54fad1e49e2a01ca2914dce4a07e5505"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M18 = _modulo("20261021_18_ranqueada_elo.py")


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_17:20261021_18", sql=True)
    return output.getvalue()


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_18:20261021_17", sql=True)
    return output.getvalue()


def _prosrc(sql: str, nome: str) -> str:
    m = re.search(r"FUNCTION public\." + nome + r"\(.*?AS \$function\$(.*?)\$function\$", sql, re.S)
    assert m, nome
    return m.group(1)


def _sem_comentarios(sql: str) -> str:
    return "\n".join(linha.split("--")[0] for linha in sql.splitlines())


def test_encadeia_depois_da_17_do_pr_569() -> None:
    assert _M18.revision == "20261021_18"
    assert _M18.down_revision == "20261021_17"


def test_o_fechamento_de_partida_e_o_de_producao() -> None:
    anterior = _prosrc(_M18.encerrar_anterior(), "fn_desafio_encerrar")
    assert hashlib.md5(anterior.encode()).hexdigest() == _MD5_ENCERRAR_PRODUCAO


def test_o_elo_liga_no_fechamento_compartilhado_e_so_ali() -> None:
    novo = _prosrc(_M18.encerrar_com_elo(), "fn_desafio_encerrar")
    anterior = _prosrc(_M18.encerrar_anterior(), "fn_desafio_encerrar")
    assert novo != anterior
    corpo = _sem_comentarios(novo)
    chamada = "v_elo := public.fn_elo_aplicar(p_desafio_id, v_d.classe_id, v_vencedor);"
    assert corpo.count(chamada) == 1
    guarda = "IF v_d.consequencia = 'ranqueada' AND NOT v_cooperativo AND v_resultado IN ('vitoria', 'empate') THEN"
    assert guarda in corpo
    # Depois de gravar o resultado e pagar os eventos, antes de devolver.
    assert corpo.index("UPDATE public.guilda_desafios") < corpo.index(chamada)
    assert (
        corpo.index("GET DIAGNOSTICS v_pagos")
        < corpo.index(chamada)
        < corpo.index("RETURN jsonb_build_object(\n    'status', 'encerrado', 'novo', true")
    )
    assert "'elo_atualizados', v_elo," in corpo
    # Fora o bloco do Elo, nada muda.
    sem = novo.replace("  v_elo      integer := 0;\n", "").replace("    'elo_atualizados', v_elo,\n", "")
    sem = re.sub(r"  -- Elo \(decisão.*?  END IF;\n\n", "", sem, flags=re.S)
    assert sem == anterior
    # Os caminhos de resposta não mudam: nenhum CREATE deles no upgrade.
    up = _upgrade_sql()
    for nome in ("arena_responder", "guilda_desafio_responder"):
        assert f"FUNCTION public.{nome}(" not in up
    # `arena_encerrar` vem junto no bloco da `_09`, igual à de produção, e segue delegando.
    arena = _prosrc(up, "arena_encerrar")
    assert hashlib.md5(arena.encode()).hexdigest() == _MD5_ARENA_ENCERRAR_PRODUCAO
    assert "RETURN public.fn_desafio_encerrar(p_desafio_id);" in arena


def test_a_conta_do_elo() -> None:
    corpo = _sem_comentarios(_prosrc(_M18.APLICAR, "fn_elo_aplicar"))
    assert "fn_app_config_int('elo_inicial', 1000)" in corpo
    assert "fn_app_config_int('elo_k', 32)" in corpo
    assert "fn_app_config_int('elo_k_provisorio', 40)" in corpo
    assert "fn_app_config_int('elo_partidas_provisorias', 10)" in corpo
    # Quem joga é o mesmo corte dos eventos do desafio.
    assert "pl.estado = 'aceito' AND pl.respondidas > 0 AND pl.equipe IN (1, 2)" in corpo
    # Equipe = média; esperado logístico de base 10 e escala 400.
    assert "avg(e.rating) FILTER (WHERE j.equipe = 1), avg(e.rating) FILTER (WHERE j.equipe = 2)" in corpo
    assert "v_e1 := 1 / (1 + power(10::numeric, (v_r2 - v_r1) / 400));" in corpo
    assert "v_s1 := CASE WHEN p_vencedor IS NULL THEN 0.5 WHEN p_vencedor = 1 THEN 1 ELSE 0 END;" in corpo
    assert "CASE WHEN e.partidas < v_np THEN v_kp ELSE v_k END AS k" in corpo
    assert "round(c.k * (c.s - c.esperado))::integer" in corpo
    # Idempotente: volta cedo e a chave primária segura a corrida.
    assert corpo.index("FROM public.ranqueada_elo_partida WHERE desafio_id = p_desafio_id") < corpo.index(
        "INSERT INTO public.ranqueada_elo "
    )
    assert "ON CONFLICT (desafio_id, aluno_id) DO NOTHING" in corpo
    # Trava em ordem fixa antes de ler o rating.
    assert corpo.index("FOR UPDATE OF e") < corpo.index("avg(e.rating)")
    assert "ORDER BY e.aluno_id" in corpo


def test_ninguem_de_fora_chama_ou_le() -> None:
    sql = _upgrade_sql()
    assert (
        "REVOKE ALL ON FUNCTION public.fn_elo_aplicar(uuid, bigint, smallint) FROM PUBLIC, anon, authenticated" in sql
    )
    assert "GRANT EXECUTE ON FUNCTION public.fn_elo_aplicar" not in sql
    for tabela in ("ranqueada_elo", "ranqueada_elo_partida"):
        assert f"ALTER TABLE public.{tabela} ENABLE ROW LEVEL SECURITY" in sql
        assert f"REVOKE ALL ON public.{tabela} FROM PUBLIC, anon, authenticated" in sql
        assert (
            "CREATE POLICY" not in sql.split(f"CREATE TABLE IF NOT EXISTS public.{tabela}")[1].split("CREATE TABLE")[0]
        )
    assert "PRIMARY KEY (classe_id, aluno_id)" in sql
    assert "PRIMARY KEY (desafio_id, aluno_id)" in sql
    assert "CHECK (rating_depois = rating_antes + delta)" in sql


def test_ranking_elo_na_view() -> None:
    v = _M18.view_com_elo()
    assert "WHEN 'elo'::text THEN COALESCE(elo.rating::numeric, ecfg.inicial)" in v
    assert "LEFT JOIN ranqueada_elo elo ON elo.classe_id = r.classe_id AND elo.aluno_id = ca.aluno_id" in v
    assert "SELECT public.fn_app_config_int('elo_inicial', 1000)::numeric AS inicial" in v
    # Só os três trechos mudam em relação à view da `_16`.
    anterior = _M18.view_anterior()
    assert len(v.splitlines()) - len(anterior.splitlines()) == 6
    up = _upgrade_sql()
    assert "SELECT 'Elo', 'Rating Elo dos desafios ranqueados" in up and "'elo'\n WHERE NOT EXISTS" in up


def test_config_privada_e_downgrade() -> None:
    up = _upgrade_sql()
    for chave, valor in (
        ("elo_inicial", "1000"),
        ("elo_k", "32"),
        ("elo_k_provisorio", "40"),
        ("elo_partidas_provisorias", "10"),
    ):
        assert re.search(rf"\('{chave}', '{valor}', '[^']+', false\)", up), chave
    down = _downgrade_sql()
    # A view e o fechamento voltam antes de as tabelas saírem.
    assert down.index("CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas") < down.index(
        "DROP TABLE IF EXISTS public.ranqueada_elo;"
    )
    assert down.index("CREATE OR REPLACE FUNCTION public.fn_desafio_encerrar") < down.index(
        "DROP FUNCTION IF EXISTS public.fn_elo_aplicar"
    )
    assert "fn_elo_aplicar(" not in _prosrc(down, "fn_desafio_encerrar")
    # Período Elo encerrado sai pela porta de manutenção da guarda, e só nesta transação.
    assert (
        down.index("set_config('app.rank_periodo', 'on', true)")
        < down.index("DELETE FROM public.ranks WHERE tipo_id IN")
        < down.index("set_config('app.rank_periodo', '', true)")
    )
    assert "DELETE FROM public.rank_tipo WHERE criterio = 'elo'" in down
    assert (
        "DELETE FROM public.app_config WHERE chave IN ('elo_inicial', 'elo_k', 'elo_k_provisorio', 'elo_partidas_provisorias')"
        in down
    )
