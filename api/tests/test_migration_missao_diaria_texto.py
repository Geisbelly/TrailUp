"""Fase 6: estrutura da migração que deixa a LLM reescrever o texto da diária, e só o texto."""

import importlib.util
import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_06:20261021_07", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_07:20261021_06", sql=True)
    return output.getvalue().replace("%%", "%")


def _modulo():
    caminho = VERSOES / "20261021_07_missao_diaria_texto_por_llm.py"
    spec = importlib.util.spec_from_file_location("trailup_teste_20261021_07", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _guarda_nova() -> str:
    sql = _upgrade_sql()
    inicio = sql.index("CREATE OR REPLACE FUNCTION public.fn_missoes_guarda()")
    return sql[inicio : sql.index("REVOKE ALL ON FUNCTION public.fn_missoes_guarda()", inicio)]


def test_nenhuma_regra_da_guarda_anterior_saiu() -> None:
    """A guarda é substituída inteira. Toda linha `NEW.x := OLD.x;` e todo RAISE da 5b tem de
    continuar lá — senão a fase 6 abriria, de quebra, uma coluna que era congelada (ou voltaria
    a recusar as métricas de delta, e o cron das 0h não gravaria nada)."""
    antiga = _modulo().guarda_anterior()
    nova = _guarda_nova()

    congelamentos = re.findall(r"NEW\.\w+\s*:= OLD\.\w+;", antiga)
    assert len(congelamentos) >= 15
    for linha in congelamentos:
        assert re.sub(r"\s+", " ", linha) in re.sub(r"\s+", " ", nova), f"saiu da guarda: {linha}"
    for erro in re.findall(r"RAISE EXCEPTION '[^']+'", antiga):
        assert erro in nova
    assert "IF v_metrica NOT IN ('atividade_especifica', 'minutos_no_dia', 'eventos_no_dia')" in nova


def test_o_caminho_da_llm_libera_so_o_texto() -> None:
    """Critério, recompensa e janela ficam congelados FORA do `IF NOT v_texto_llm`: a LLM
    reescreve o texto, nunca o que a missão mede."""
    nova = _guarda_nova()
    bloco_texto = nova[nova.index("IF NOT v_texto_llm THEN") : nova.index("END IF;", nova.index("IF NOT v_texto_llm THEN"))]

    assert "NEW.titulo          := OLD.titulo;" in bloco_texto
    assert "NEW.descricao       := OLD.descricao;" in bloco_texto
    for coluna in ("criterio", "recompensa_tipo", "janela_inicio", "janela_fim", "escopo"):
        assert f"NEW.{coluna}" not in bloco_texto, f"{coluna} ficaria livre no caminho da LLM"
        assert f"NEW.{coluna}" in nova


def test_o_sinal_nao_vale_para_o_cliente() -> None:
    nova = _guarda_nova()

    assert "current_setting('app.missao_texto_llm', true), '') = 'on'" in nova
    assert "current_user NOT IN ('authenticated', 'anon')" in nova
    assert "OLD.origem = 'sistema'" in nova
    assert "OLD.dia IS NOT NULL" in nova


def test_colunas_texto_nao_nascem_preenchidas_nem_sao_editaveis() -> None:
    nova = _guarda_nova()
    insert = nova[nova.index("IF TG_OP = 'INSERT' THEN") : nova.index("IF TG_OP = 'UPDATE' THEN")]

    for coluna in ("texto_molde", "texto_enriquecido_em", "texto_modelo"):
        assert f"NEW.{coluna}" in insert
        assert f"NEW.{coluna} := OLD.{coluna};" in re.sub(r"\s+", " ", nova)


def test_reescrita_e_uma_vez_e_so_no_dia() -> None:
    sql = _upgrade_sql()
    corpo = sql[sql.index("FUNCTION public.fn_missao_diaria_reescrever_texto") :]

    assert "m.texto_enriquecido_em IS NULL" in corpo
    assert "m.janela_fim > now()" in corpo
    assert "m.origem = 'sistema'" in corpo
    # O molde é o lado direito do SET, que lê a linha antes do UPDATE.
    assert "jsonb_build_object('titulo', m.titulo, 'descricao', m.descricao)" in corpo
    assert "RETURN v_n = 1;" in corpo
    # O sinal é desligado nos dois caminhos de saída.
    assert corpo.count("set_config('app.missao_texto_llm', '', true)") >= 2


def test_reescrita_nao_atinge_o_criterio() -> None:
    sql = _upgrade_sql()
    corpo = sql[sql.index("FUNCTION public.fn_missao_diaria_reescrever_texto") :]
    update = corpo[corpo.index("UPDATE public.missoes") : corpo.index("WHERE m.id")]

    assert "criterio" not in update
    assert "recompensa_tipo" not in update
    assert "janela" not in update


def test_so_o_worker_chama() -> None:
    sql = _upgrade_sql()

    assert (
        "REVOKE ALL ON FUNCTION public.fn_missao_diaria_reescrever_texto(bigint, text, text, text)\n"
        "  FROM PUBLIC, anon, authenticated;"
    ) in sql
    assert "REVOKE ALL ON FUNCTION public.fn_missao_diaria_enfileirar_texto(date) FROM PUBLIC, anon, authenticated;" in sql
    grants = [linha for linha in sql.splitlines() if linha.startswith("GRANT")]
    assert grants == ["GRANT EXECUTE ON FUNCTION public.fn_missao_diaria_reescrever_texto(bigint, text, text, text)"]
    assert "TO service_role;" in sql
    assert "TO authenticated" not in sql and "TO anon" not in sql


def test_enfileirar_e_idempotente_e_tem_teto_do_dia() -> None:
    sql = _upgrade_sql()
    corpo = sql[sql.index("FUNCTION public.fn_missao_diaria_enfileirar_texto") :]

    assert "fn_app_config_int('missao_diaria_llm_max_coortes', 30)" in corpo
    assert "IF v_teto <= 0 THEN" in corpo
    assert "WHERE NOT EXISTS" in corpo
    assert "j.payload ->> 'perfil' = c.perfil" in corpo
    assert "LIMIT v_teto - v_ja" in corpo
    assert "'missao_diaria'" in corpo


def test_cron_proprio_depois_da_geracao() -> None:
    """Num comando só com a geração, uma falha ao enfileirar desfaria a missão do dia."""
    sql = _upgrade_sql()

    assert "cron.schedule('trailup_missao_diaria_texto', '5 3 * * *'" in sql
    assert "cron.unschedule('trailup_missao_diaria_texto')" in sql
    assert "cron.schedule('trailup_missao_diaria'," not in sql


def test_config_nasce_privada() -> None:
    sql = _upgrade_sql()
    bloco = sql[sql.index("INSERT INTO public.app_config") :]
    bloco = bloco[: bloco.index("ON CONFLICT")]

    assert "'missao_diaria_llm_max_coortes'" in bloco
    assert bloco.rstrip().endswith("false)")


def test_downgrade_devolve_a_guarda_da_5b() -> None:
    sql = _downgrade_sql()
    antiga = _modulo().guarda_anterior()

    assert "cron.unschedule('trailup_missao_diaria_texto')" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_missao_diaria_reescrever_texto" in sql
    assert antiga.strip() in sql
    assert "v_texto_llm" not in sql
    # A guarda volta ANTES das colunas saírem: o corpo novo as cita.
    assert sql.index("CREATE OR REPLACE FUNCTION public.fn_missoes_guarda()") < sql.index("DROP COLUMN IF EXISTS texto_molde")
    assert "kind = 'missao_diaria' AND status IN ('pending', 'processing', 'partial')" in sql
