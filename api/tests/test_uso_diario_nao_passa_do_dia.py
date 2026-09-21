"""Tempo de uso do dia nao pode passar de 24 h.

`aluno_atividade_diaria.tempo_uso_seg` e somado pelo `notificacoes_heartbeat`.
Cada BATIDA ja era limitada a 3600s, mas o TOTAL do dia nao: N batidas de ate
uma hora somam alem de 24 h.

Medido em producao, linha 2216 (dia 2026-09-10): `tempo_uso_seg = 98400`
(27.3 h) numa janela real de 44812 s (12.4 h) entre o primeiro e o ultimo
acesso, com `aberturas = 0`. Duas sessoes paralelas por ~12.4 h dao ~24.8 h,
que e a ordem do valor observado -- o mesmo aluno com o app aberto em mais de
um lugar soma nos dois.

O dano nao e cosmetico: `notificacoes_heartbeat` passa o total para
`notificacoes_processar_rotinas(v_aluno, 'tempo_uso', v_total)`, e o gatilho
`tempo_uso` e o que dispara "Hora de uma pausa / Voce ja estudou bastante
hoje". Com o total inflado, o app cobra pausa de quem nao estudou tanto.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = (
    API_ROOT
    / "alembic"
    / "versions"
    / "20260910_13_uso_diario_nao_passa_do_dia.py"
)


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
        _offline_alembic_config(output), "20260910_12:20260910_13", sql=True
    )
    return output.getvalue()


def test_limita_o_total_do_dia_e_nao_so_a_batida() -> None:
    """O limite por batida ja existia. O que faltava era o acumulado."""
    sql = _sql()

    assert (
        "LEAST(aluno_atividade_diaria.tempo_uso_seg + EXCLUDED.tempo_uso_seg, 86400)"
        in sql
    )


def test_limita_tambem_o_insert() -> None:
    """A primeira batida do dia entra pelo VALUES, nao pelo ON CONFLICT."""
    sql = _sql()

    assert "LEAST(v_seg, 86400)" in sql


def test_a_sentinela_de_idempotencia_e_especifica() -> None:
    """Esta e a licao que custou uma aplicacao inteira.

    A primeira versao usou `position('LEAST(' IN v_def) > 0` como guarda de
    idempotencia. A funcao JA tinha um LEAST -- o que limita a batida a 3600s
    -- entao a migracao saiu por essa porta sem tocar em nada, e o CONFERE
    passou trivialmente pela MESMA string generica. O dado voltou a 86520s na
    batida seguinte, e so um check independente pegou.

    Sentinela de idempotencia tem de ser unica da mudanca que ela guarda."""
    sql = _sql()

    assert "position('LEAST(aluno_atividade_diaria.tempo_uso_seg' IN v_def)" in sql
    # A forma generica nao pode voltar como DECISAO. O comentario da migracao
    # cita a string justamente para registrar por que ela nao serve, entao a
    # assercao tem de olhar a linha de `IF`, nao a mencao.
    assert "IF position('LEAST(' IN v_def) > 0 THEN" not in sql


def test_o_confere_tambem_e_especifico() -> None:
    """Mesmo motivo: conferir por 'LEAST(' daria falso positivo."""
    sql = _sql()

    assert "o heartbeat vivo nao contem o limite do TOTAL do dia" in sql
    assert "ainda ha dia com uso impossivel" in sql


def test_substitui_o_corpo_vivo_com_ancora_conferida() -> None:
    """A funcao tambem cria pendencia de notificacao e mexe em
    `aluno_sessoes_app`; recolar texto de migracao anterior reverteria em
    silencio qualquer ajuste nessas partes."""
    sql = _sql()

    assert "pg_get_functiondef(" in sql
    assert "ancora do UPDATE de tempo_uso_seg nao encontrada" in sql
    assert "ancora do VALUES de tempo_uso_seg nao encontrada" in sql
    assert "CREATE OR REPLACE FUNCTION public.notificacoes_heartbeat" not in sql


def test_corrige_o_dado_existente() -> None:
    """Corrigir a funcao sem corrigir a linha deixaria o gatilho de pausa
    recebendo o valor inflado para sempre -- o total do dia nunca decresce."""
    sql = _sql()

    assert "UPDATE public.aluno_atividade_diaria" in sql
    assert "WHERE tempo_uso_seg > 86400" in sql


def test_nao_usa_sinal_de_porcentagem() -> None:
    """O renderer offline do Alembic dobra o caractere."""
    assert "%" not in MIGRACAO.read_text(encoding="utf-8")
    assert "%" not in _sql()
