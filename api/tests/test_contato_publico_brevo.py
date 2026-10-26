"""Contato do site público pelo envio Brevo do app, sem formsubmit (#195).

O que estes testes protegem:

1. **Mesmo provedor e mesma chave do app.** A função nova usa a API da Brevo e
   `brevo_api_key` do Vault, como `fn_enviar_contato`, e nenhum segredo entra
   na migração.
2. **O destino não está no código.** Ele vem de `app_config`
   (`contato_email_destino`, senão `dono_email`); nenhum endereço literal.
3. **Proteção contra abuso:** armadilha (honeypot), limites de tamanho, teto
   por origem e teto global, contagem serializada.
4. **Pouco dado guardado:** o contador tem só o hash da origem e a hora, com
   RLS, sem policy e sem GRANT para cliente, e é limpo a cada 24 h.
5. **`fn_enviar_contato` (com sessão) continua fechada para `anon`.**
"""

from __future__ import annotations

import re
from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
ASSINATURA = "public.fn_enviar_contato_publico(text, text, text, text, text)"


def _render(intervalo: str, *, downgrade: bool = False) -> str:
    output = StringIO()
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = "postgresql://user:password@localhost:5432/trailup"
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(config, intervalo, sql=True)
    return output.getvalue()


def _sql() -> str:
    return _render("20261024_05:20261024_06")


def test_reusa_brevo_e_a_chave_do_vault_sem_segredo() -> None:
    sql = _sql()
    assert "https://api.brevo.com/v3/smtp/email" in sql
    assert "vault.decrypted_secrets WHERE name = 'brevo_api_key'" in sql
    assert "xkeysib-" not in sql
    assert "vault.create_secret" not in sql
    assert "formsubmit" not in sql.lower()


def test_destino_vem_de_app_config_e_nao_ha_email_literal() -> None:
    sql = _sql()
    assert "chave = 'contato_email_destino'" in sql
    assert "chave = 'dono_email'" in sql
    # Nenhum endereço de e-mail literal no SQL da migração.
    assert not re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}", sql)
    # A chave opcional não é semeada: o valor é configuração do ambiente.
    assert "('contato_email_destino'" not in sql


def test_protecoes_contra_abuso() -> None:
    sql = _sql()
    assert "IF btrim(coalesce(p_armadilha, '')) <> '' THEN\n    RETURN;" in sql
    for limite in ("BETWEEN 2 AND 120", "> 254", "BETWEEN 2 AND 150", "BETWEEN 10 AND 5000"):
        assert limite in sql
    assert "contato_publico_por_hora_origem" in sql
    assert "contato_publico_por_hora_total" in sql
    assert "pg_advisory_xact_lock" in sql
    assert "ON CONFLICT (chave) DO NOTHING" in sql
    # a contagem vem antes do envio
    assert sql.index("limite de mensagens por hora") < sql.index("net.http_post(")


def test_contador_guarda_so_hash_e_e_fechado() -> None:
    sql = _sql()
    tabela = sql.split("CREATE TABLE IF NOT EXISTS public.contato_publico_envios (", 1)[1].split(");", 1)[0]
    colunas = {linha.split()[0] for linha in tabela.strip().splitlines()}
    assert colunas == {"id", "origem_hash", "criado_em"}
    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "REVOKE ALL ON TABLE public.contato_publico_envios FROM PUBLIC, anon, authenticated" in sql
    assert "CREATE POLICY" not in sql.upper()
    assert "extensions.digest(v_origem, 'sha256')" in sql
    assert "interval '24 hours'" in sql


def test_grants_da_funcao_publica() -> None:
    sql = _sql()
    assert f"REVOKE ALL ON FUNCTION {ASSINATURA} FROM PUBLIC" in sql
    assert f"GRANT EXECUTE ON FUNCTION {ASSINATURA} TO anon, authenticated" in sql
    assert "SECURITY DEFINER" in sql
    # a função com sessão não é reaberta para anon
    assert "fn_enviar_contato(text" not in sql


def test_downgrade_remove_tudo() -> None:
    sql = _render("20261024_06:20261024_05", downgrade=True)
    assert f"DROP FUNCTION IF EXISTS {ASSINATURA}" in sql
    assert "DROP TABLE IF EXISTS public.contato_publico_envios" in sql
