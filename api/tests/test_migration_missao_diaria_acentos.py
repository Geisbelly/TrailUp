"""`20261030_02`: o molde da missão diária e o texto já gravado ganham acento."""

from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261030_01:20261030_02", sql=True)
    return output.getvalue().replace("%%", "%")


def test_gerador_e_reescrito_a_partir_do_que_esta_no_banco() -> None:
    sql = _upgrade_sql()
    assert "pg_get_functiondef" in sql
    assert "Feche um conteúdo" in sql
    assert "Faça '' || v_acoes || '' ações na trilha hoje." in sql
    # Molde que sumiu da função vira erro, não função inalterada dada como consertada.
    assert "molde nao encontrado" in sql


def test_texto_do_sistema_so_muda_pelo_sinal_da_guarda_e_o_sinal_nao_vaza() -> None:
    sql = _upgrade_sql()
    ligar = sql.index("set_config('app.missao_texto_llm', 'on', true)")
    regravar = sql.index("UPDATE public.missoes")
    desligar = sql.index("set_config('app.missao_texto_llm', 'off', true)")
    assert ligar < regravar < desligar
    assert "origem = 'sistema'" in sql and "dia IS NOT NULL" in sql


def test_so_palavras_inteiras_de_uma_lista_fechada() -> None:
    sql = _upgrade_sql()
    corpo = sql[sql.index("pg_temp.acentuar(p_texto text)") :]
    for palavra in ("conteudo", "acoes", "Faca", "concluidas", "determinacao"):
        assert f"'\m{palavra}" in corpo, palavra


def test_nao_toca_criterio_janela_nem_recompensa() -> None:
    sql = _upgrade_sql()
    update = sql[sql.index("UPDATE public.missoes") :]
    for coluna in ("criterio =", "janela_inicio =", "janela_fim =", "recompensa_tipo ="):
        assert coluna not in update
