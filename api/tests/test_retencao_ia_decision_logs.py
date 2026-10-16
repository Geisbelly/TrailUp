"""O texto livre do aluno nao fica para sempre em ia_decision_logs (#195, item 4).

A mensagem que o aluno digita vai inteira para `input_summary`, com as 6
ultimas do historico, mais `prompt_text` e `raw_response`. A tabela e
write-only -- sete arquivos de `api/app` escrevem, NENHUM le -- e nao havia
retencao: nenhum job de `pg_cron` a mencionava.

O que estes testes protegem:

1. **`input_summary` e redigido, nao anulado.** A coluna e NOT NULL (default
   `'{}'`): `SET input_summary = NULL` levanta 23502 e a varredura inteira
   aborta. Descobri isso rodando, nao lendo.
2. **A redacao e idempotente.** Sem o marcador `redigido_em`, cada passada
   reescreveria as mesmas linhas todos os dias.
3. **Duas janelas, nao uma.** Apagar tudo de uma vez joga fora o unico valor
   da tabela (qual estagio decidiu o que). Redacao vem antes do expurgo.
4. **Prazo invertido e recusado.** `expurgar < redigir` apagaria antes de
   redigir -- funciona, e esconde o erro de configuracao.
5. **A funcao nao fica na superficie REST.**
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]


def _render(intervalo: str, *, downgrade: bool = False) -> str:
    output = StringIO()
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(config, intervalo, sql=True)
    return output.getvalue()


def _sem_espacos(texto: str) -> str:
    return " ".join(texto.split())


def test_redige_sem_anular_a_coluna_not_null() -> None:
    sql = _sem_espacos(_render("20261003_08:20261003_09"))
    assert "input_summary = jsonb_build_object('redigido_em', now())" in sql
    assert "input_summary = NULL" not in sql, (
        "input_summary e NOT NULL -- anular levanta 23502 e aborta a varredura"
    )
    # as anulaveis vao a NULL mesmo
    for coluna in ("prompt_text", "raw_response", "parsed_response"):
        assert f"{coluna} = NULL" in sql, coluna


def test_redacao_e_idempotente() -> None:
    sql = _render("20261003_08:20261003_09")
    assert "NOT (input_summary ? 'redigido_em')" in sql, (
        "sem o marcador, toda passada reescreve as mesmas linhas"
    )


def test_duas_janelas_com_a_redacao_antes_do_expurgo() -> None:
    sql = _render("20261003_08:20261003_09")
    assert "ia_logs_redigir_dias" in sql
    assert "ia_logs_expurgar_dias" in sql
    assert sql.index("UPDATE public.ia_decision_logs") < sql.index(
        "DELETE FROM public.ia_decision_logs"
    ), "redigir tem de vir antes de apagar"
    # defaults ficam em app_config para ajuste sem migracao
    assert "ON CONFLICT (chave) DO NOTHING" in sql


def test_recusa_prazo_invertido() -> None:
    sql = _render("20261003_08:20261003_09")
    assert "IF v_expurgar < v_redigir THEN" in sql
    assert "RAISE EXCEPTION" in sql


def test_funcao_fora_da_superficie_rest() -> None:
    sql = _render("20261003_08:20261003_09")
    assert (
        "REVOKE EXECUTE ON FUNCTION public.trailup_retencao_ia_decision_logs()"
        " FROM PUBLIC, anon, authenticated" in sql
    )


def test_indice_do_predicado_da_varredura() -> None:
    sql = _render("20261003_08:20261003_09")
    assert "ia_decision_logs_created_at_idx" in sql, (
        "sem indice em created_at a varredura diaria e seq scan"
    )


def test_agenda_no_pg_cron_com_guarda_de_extensao() -> None:
    sql = _render("20261003_08:20261003_09")
    assert "trailup_retencao_ia_decision_logs" in sql
    assert "FROM pg_extension WHERE extname = 'pg_cron'" in sql, (
        "sem a guarda, a migracao quebra em Postgres sem pg_cron"
    )


def test_downgrade_nao_apaga_os_prazos() -> None:
    sql = _render("20261003_09:20261003_08", downgrade=True)
    assert "DROP FUNCTION IF EXISTS public.trailup_retencao_ia_decision_logs" in sql
    assert "cron.unschedule" in sql
    assert "DELETE FROM public.app_config" not in sql, (
        "apagar os prazos reabriria a retencao infinita"
    )
