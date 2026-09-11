"""Evento creditado nao e' editavel: o que paga congela no UPDATE.

`eventos_aluno_posse_upd` deixa o aluno dar UPDATE nos proprios eventos, e o
gatilho de valor tinha um atalho para tipo creditado -- `RETURN NEW` sem
recalcular. No INSERT o atalho esta certo (presenca vale o que a RPC decidiu).
No UPDATE, entregava a coluna `valor` ao cliente, e e' essa coluna que o rank le.

Medido nesta base, com o bloco desfeito por excecao no fim: `SET valor = 99999`
passava, e `SET tipo = 'participacao_extra', valor = 55555` passava tambem --
`fn_evento_creditado` casa por PREFIXO, entao nem era preciso comecar de um
evento creditado.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]


def _offline_alembic_config(output_buffer: StringIO | None = None) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output_buffer)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    return config


def _sql() -> str:
    output = StringIO()
    migrations.command.upgrade(
        _offline_alembic_config(output), "20260911_03:20260911_04", sql=True
    )
    return output.getvalue()


def _sql_downgrade() -> str:
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260911_04:20260911_03", sql=True
    )
    return output.getvalue()


def test_o_valor_de_creditado_congela_no_update() -> None:
    sql = _sql()

    assert "NEW.valor := OLD.valor;" in sql


def test_o_tipo_congela_antes_do_teste_de_creditado() -> None:
    """A ORDEM e' a correcao. `fn_evento_creditado(NEW.tipo)` escolhe se o valor
    vem de quem concedeu ou do banco; restaurar o tipo DEPOIS desse teste
    deixaria a linha sair com o tipo comum de volta e o valor que o cliente
    mandou, ja retornado pelo atalho."""
    sql = _sql()

    congelamento = sql.index("NEW.tipo := OLD.tipo;")
    teste = sql.index("IF public.fn_evento_creditado(NEW.tipo) THEN")
    assert congelamento < teste


def test_quem_concedeu_e_para_quem_tambem_congelam() -> None:
    """Sem isto o aluno se declara concedido por um professor, ou passa o
    evento para outro aluno."""
    sql = _sql()

    assert "NEW.concedido_por := OLD.concedido_por;" in sql
    assert "NEW.aluno_id := OLD.aluno_id;" in sql


def test_a_classe_continua_congelando() -> None:
    """A `20260910_06` fechou esta coluna; a correcao nao pode desfazer."""
    sql = _sql()

    assert "NEW.classe_id := OLD.classe_id;" in sql


def test_o_insert_continua_pagando_o_valor_de_quem_concede() -> None:
    """A presenca vale o que a RPC decidiu e o premio vale
    `conquistas.pontos_recompensa` -- o congelamento e' so do UPDATE. Sem a
    guarda de `TG_OP`, presenca nasceria com o valor errado."""
    sql = _sql()

    assert "IF TG_OP <> 'INSERT' THEN" in sql


def test_o_resto_continua_com_valor_do_banco() -> None:
    sql = _sql()

    assert "NEW.valor := public.fn_pontos_do_evento(NEW.tipo);" in sql


def test_a_verificacao_e_de_comportamento_e_nao_deixa_rastro() -> None:
    """A sonda grava, ataca e confere -- dentro de um bloco com EXCEPTION, que
    em plpgsql e' um savepoint, e sai por um SQLSTATE proprio. Nada do que ela
    inseriu fica. O resultado atravessa o rollback porque variavel de plpgsql
    nao e' transacional."""
    sql = _sql()

    assert "RAISE EXCEPTION USING ERRCODE = 'ZZ001'" in sql
    assert "EXCEPTION WHEN SQLSTATE 'ZZ001' THEN" in sql
    assert "UPDATE ainda muda o valor de evento creditado" in sql
    assert "trocar o tipo no UPDATE ainda paga" in sql


def test_a_sonda_nao_quebra_em_base_sem_aluno() -> None:
    """`aluno_id` tem FK para `alunos`: sem nenhuma linha la, a sonda nao tem
    como gravar e a migracao nao pode falhar por isso."""
    sql = _sql()

    assert "sem aluno na base, sonda de comportamento nao executada" in sql


def test_o_downgrade_repoe_a_funcao_anterior() -> None:
    sql = _sql_downgrade()

    assert "CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_valor_do_banco()" in sql
    assert "NEW.valor := OLD.valor;" not in sql


def test_o_sql_renderizado_nao_tem_por_cento() -> None:
    """Nenhuma mensagem usa `%` de format: o renderizador offline o dobraria."""
    assert "%" not in _sql()
    assert "%" not in _sql_downgrade()
