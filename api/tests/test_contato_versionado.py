"""O envio de contato tem de existir fora do banco vivo (#172).

A funcao e a tabela `contato_envios` existiam SO em producao: criadas a mao,
nunca revisadas em PR, sem historico. Ambiente novo subia sem o caminho de
solicitacao de exclusao de conta -- e ninguem descobriria antes de um aluno
tentar usar.

O que estes testes protegem:

1. **O corpo e o de producao, nao uma versao "melhorada".** Se alguem
   reescrever o corpo aqui, `alembic upgrade head` passa a MUDAR producao.
   Esta migracao e um registro do que existe; mudanca de comportamento pede
   PR proprio.
2. **O nome antigo sobrevive como repassador.** App Expo ja instalado chama
   `fn_enviar_contato_sendgrid`. Dropar o nome quebraria a solicitacao de
   exclusao de conta de quem nao atualizou -- num fluxo de LGPD.
3. **Nem `PUBLIC` nem `anon` executam.** Era o achado principal da #172: RPC
   que dispara e-mail com assunto e corpo vindos do parametro, sem login, e
   um relay aberto.
4. **Nenhum segredo entra na migracao.** A chave vive no Vault; a migracao le
   de `vault.decrypted_secrets` e nunca escreve o valor.
5. **`contato_envios` nasce com RLS e SEM policy de escrita.** E a ausencia de
   policy -- nao os GRANTs -- que impede o aluno de apagar o proprio contador
   e furar o teto por hora.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]

# sha256 do corpo que esta em producao, conferido ao vivo em 2026-10-07.
SHA_DO_CORPO_EM_PRODUCAO = (
    "11b90cd294bde424a8e7a30bac10e9ede6c80ea449598eb47e6d0d9d1d6405bc"
)


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


def _modulo():
    import importlib.util

    caminho = (
        API_ROOT / "alembic" / "versions" / "20261003_07_contato_versionado.py"
    )
    spec = importlib.util.spec_from_file_location("m_20261003_07", caminho)
    assert spec and spec.loader
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_corpo_e_byte_a_byte_o_de_producao() -> None:
    import hashlib

    corpo = _modulo()._CORPO
    sha = hashlib.sha256(corpo.encode()).hexdigest()
    assert sha == SHA_DO_CORPO_EM_PRODUCAO, (
        "o corpo divergiu do que esta em producao -- assim o upgrade deixa de "
        "ser registro e passa a reescrever a funcao viva"
    )
    assert len(corpo) == 3241


def test_cria_o_nome_novo_e_mantem_o_antigo_como_repassador() -> None:
    sql = _render("20261003_06:20261003_07")
    assert "FUNCTION public.fn_enviar_contato(" in sql
    assert "FUNCTION public.fn_enviar_contato_sendgrid(" in sql
    assert "DROP FUNCTION" not in sql.upper(), (
        "dropar o nome antigo quebra app ja instalado"
    )
    # o repassador chama a implementacao, nao duplica o corpo
    depois = sql.split("fn_enviar_contato_sendgrid(", 1)[1]
    assert "SELECT public.fn_enviar_contato(" in depois


def test_nem_public_nem_anon_executam() -> None:
    sql = _render("20261003_06:20261003_07")
    for assinatura in (
        "public.fn_enviar_contato(text, text, text, text)",
        "public.fn_enviar_contato_sendgrid(text, text, text, text)",
    ):
        assert f"REVOKE EXECUTE ON FUNCTION {assinatura} FROM PUBLIC, anon" in sql
        assert f"GRANT EXECUTE ON FUNCTION {assinatura} TO authenticated" in sql


def test_nenhum_segredo_na_migracao() -> None:
    sql = _render("20261003_06:20261003_07")
    assert "xkeysib-" not in sql, "chave da Brevo nao entra em migracao"
    assert "vault.decrypted_secrets" in sql, "a chave tem de vir do Vault"
    assert "CREATE SECRET" not in sql.upper()
    assert "vault.create_secret" not in sql


def test_contato_envios_nasce_com_rls_e_sem_policy() -> None:
    sql = _render("20261003_06:20261003_07")
    assert "CREATE TABLE IF NOT EXISTS public.contato_envios" in sql
    assert "ALTER TABLE public.contato_envios ENABLE ROW LEVEL SECURITY" in sql
    assert "CREATE POLICY" not in sql.upper(), (
        "policy de DELETE aqui deixaria o aluno zerar o proprio contador"
    )


def test_teto_por_hora_fica_em_app_config() -> None:
    sql = _render("20261003_06:20261003_07")
    assert "contato_envios_por_hora" in sql
    assert "ON CONFLICT (chave) DO NOTHING" in sql, (
        "sem isto a migracao sobrescreve um teto que o time ja ajustou"
    )


def test_downgrade_devolve_a_implementacao_ao_nome_antigo() -> None:
    sql = _render("20261003_07:20261003_06", downgrade=True)
    assert "FUNCTION public.fn_enviar_contato_sendgrid(" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_enviar_contato(" in sql
    # o contador NAO e' apagado no downgrade: apagar reabre o limite de abuso
    assert "DROP TABLE" not in sql.upper()
