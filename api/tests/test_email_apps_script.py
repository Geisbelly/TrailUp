"""E-mail pelo Google Apps Script em vez da Brevo (20261101_14).

O que estes testes protegem:

1. **A Brevo saiu dos três envios** e nenhum segredo entra na migração: URL e
   segredo do script vêm do Vault.
2. **O envio é um só** (`fn_email_apps_script`), fechado para cliente; os três
   chamadores passam por ele.
3. **"Aceito" é a regra do Apps Script**, não "2xx": o aviso de conta inativa
   conta o prazo de exclusão a partir dela.
4. **Nada além do provedor mudou nas guardas**: teto por aluno, armadilha,
   limites e grants continuam.
5. **O downgrade volta para a Brevo** e apaga as funções novas.
"""

from __future__ import annotations

import re
from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
ENVIO = "public.fn_email_apps_script(text, text, text, text, text, text)"
# A chamada, não a menção em `to_regprocedure('net.http_post(text, ...)')`.
CHAMADA_HTTP = re.compile(r"net\.http_post\(\s*url\s*:=")


def _render(intervalo: str, *, downgrade: bool = False) -> str:
    output = StringIO()
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = "postgresql://user:password@localhost:5432/trailup"
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(config, intervalo, sql=True)
    return output.getvalue()


def _sql() -> str:
    return _render("20261101_13:20261101_14")


def _funcao(sql: str, nome: str) -> str:
    m = re.search(rf"CREATE OR REPLACE FUNCTION public\.{nome}\(.*?\$function\$;", sql, re.S)
    assert m, f"{nome} nao encontrada"
    return m.group(0)


def test_brevo_saiu_e_nenhum_segredo_entra() -> None:
    sql = _sql()
    assert "brevo" not in sql.lower()
    assert "api-key" not in sql
    assert "name = 'apps_script_email_url'" in sql
    assert "name = 'apps_script_email_segredo'" in sql
    assert "vault.create_secret" not in sql
    # Nenhum endereço de e-mail literal: destino vem de app_config.
    assert not re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}", sql)


def test_os_tres_envios_passam_pelo_apps_script() -> None:
    sql = _sql()
    for nome in ("fn_enviar_contato", "fn_enviar_contato_publico", "retencao_avisos_email"):
        corpo = _funcao(sql, nome)
        assert "public.fn_email_apps_script(" in corpo, nome
        assert not CHAMADA_HTTP.search(corpo), nome
    # Só o envio central fala com a rede.
    assert len(CHAMADA_HTTP.findall(sql)) == 1


def test_envio_central_fechado_para_cliente() -> None:
    sql = _sql()
    assert re.search(
        r"REVOKE ALL ON FUNCTION public\.fn_email_apps_script\(text, text, text, text, text, text\)\s+"
        r"FROM PUBLIC, anon, authenticated",
        sql,
    )
    assert "REVOKE ALL ON FUNCTION public.fn_email_apps_script_erro_config() FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT EXECUTE ON FUNCTION public.fn_email_apps_script(" not in sql
    # A URL do Vault só vale se for de um script do Google.
    assert "'https://script.google.com/'" in sql


def test_aviso_usa_a_regra_do_apps_script() -> None:
    aviso = _funcao(_sql(), "retencao_avisos_email")
    assert "public.fn_email_apps_script_aceito(hr.status_code, hr.headers, hr.content, hr.timed_out)" in aviso
    assert "AND resp.aceito" in aviso
    assert "AND NOT resp.aceito" in aviso
    # A regra antiga (só 2xx) não decide mais.
    assert "resp.status_code BETWEEN 200 AND 299" not in aviso
    # O remetente é a conta do script: a chave antiga não é lida.
    assert "retencao_aviso_remetente" not in aviso


def test_regra_de_aceite() -> None:
    aceito = _funcao(_sql(), "fn_email_apps_script_aceito")
    assert "IMMUTABLE" in aceito
    assert "p_status IN (302, 303)" in aceito
    assert "'https://script.googleusercontent.com/'" in aceito
    assert "p_headers ->> 'Location', p_headers ->> 'location'" in aceito
    assert "p_status BETWEEN 200 AND 299" in aceito
    assert "NOT coalesce(p_timed_out, false)" in aceito


def test_guardas_e_grants_dos_contatos_continuam() -> None:
    sql = _sql()
    contato = _funcao(sql, "fn_enviar_contato")
    assert "IF v_aluno IS NULL THEN" in contato
    assert "contato_envios_por_hora" in contato
    assert contato.index("mensagens por hora atingido") < contato.index("fn_email_apps_script(")
    assert "REVOKE EXECUTE ON FUNCTION public.fn_enviar_contato(text, text, text, text) FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.fn_enviar_contato(text, text, text, text) TO authenticated" in sql

    publico = _funcao(sql, "fn_enviar_contato_publico")
    assert "IF btrim(coalesce(p_armadilha, '')) <> '' THEN\n    RETURN;" in publico
    for limite in ("BETWEEN 2 AND 120", "> 254", "BETWEEN 2 AND 150", "BETWEEN 10 AND 5000"):
        assert limite in publico
    assert "pg_advisory_xact_lock" in publico
    assert publico.index("limite de mensagens por hora") < publico.index("fn_email_apps_script(")
    assert (
        "GRANT EXECUTE ON FUNCTION public.fn_enviar_contato_publico(text, text, text, text, text) TO anon, authenticated"
        in sql
    )


def test_downgrade_volta_para_a_brevo() -> None:
    sql = _render("20261101_14:20261101_13", downgrade=True)
    assert sql.count("https://api.brevo.com/v3/smtp/email") == 3
    assert f"DROP FUNCTION IF EXISTS {ENVIO}" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_email_apps_script_erro_config()" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_email_apps_script_aceito(integer, jsonb, text, boolean)" in sql
