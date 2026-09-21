"""O e-mail de contato: aberto ao anonimo, com a chave no corpo, e quebrado (#172).

A issue apontava dois problemas de seguranca. Ao mexer, apareceu um terceiro que
os torna quase academicos: **a funcao nunca enviou e-mail nenhum**.

    format('Nome: ...%n...', ...)

`format()` do Postgres so conhece `s`, `I` e `L`. O `n` levanta
`unrecognized format() type specifier "n"` -- conferido nesta base, num bloco
isolado. E o corpo terminava com `exception when others then raise notice`, que
engolia o erro: a funcao retornava normal e o cliente checava `rpcError` sem ver
nada. Todo pedido de exclusao de conta foi descartado em silencio.

E' o pior formato de defeito: o caminho feliz e o caminho quebrado sao
indistinguiveis dos dois lados.

Medido depois da correcao: a chave saiu do corpo, `anon` e `PUBLIC` perderam o
EXECUTE, e o digest do segredo no Vault bate com o do corpo antigo -- prova de
copia fiel sem o valor passar por lugar nenhum.
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
        _offline_alembic_config(output), "20260911_07:20260911_08", sql=True
    )
    return output.getvalue()


def _sql_downgrade() -> str:
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260911_08:20260911_07", sql=True
    )
    return output.getvalue()


# ---------------------------------------------------------------------------
# O defeito que a issue nao viu
# ---------------------------------------------------------------------------


def test_a_montagem_do_texto_deixa_de_usar_interpolacao() -> None:
    """Era onde o especificador invalido vivia. Concatenacao nao tem
    especificador para errar."""
    sql = _sql()

    assert "v_corpo := 'Nome: '" in sql
    assert "chr(10)" in sql


def test_a_funcao_para_de_engolir_erro() -> None:
    """`net.http_post` e assincrono -- enfileira e devolve o id na hora --,
    entao falha de rede nao chegava ali. O que chegava era erro de PROGRAMACAO,
    e engoli-lo foi o que manteve a funcao quebrada sem ninguem notar."""
    sql = _sql()

    assert "a funcao ainda tem captura generica de excecao" in sql


def test_as_assercoes_casam_a_sintaxe_e_nao_a_palavra() -> None:
    """A primeira versao do CONFERE procurava 'exception' e 'format(' soltos, e
    acusou os PROPRIOS COMENTARIOS da funcao que explicam por que essas
    construcoes sairam. A migracao abortou por causa disso."""
    sql = _sql()

    assert "position('when others then' IN lower(v_src))" in sql
    assert "position('exception' IN lower(v_src))" not in sql


# ---------------------------------------------------------------------------
# O que a issue apontava
# ---------------------------------------------------------------------------


def test_anon_e_public_perdem_o_execute() -> None:
    """A chave `anon` viaja no bundle do app e do site. Uma funcao
    SECURITY DEFINER que dispara e-mail com assunto e corpo vindos do parametro,
    sem login e sem limite, e um relay."""
    sql = _sql()

    assert "REVOKE ALL ON FUNCTION public.fn_enviar_contato_sendgrid" in sql
    assert "FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.fn_enviar_contato_sendgrid" in sql


def test_a_funcao_exige_sessao() -> None:
    sql = _sql()

    # Sem colapsar espaco: a declaracao e alinhada em coluna, entao o numero
    # de espacos e detalhe de formatacao e nao faz parte da regra.
    import re

    assert re.search(r"v_aluno\s+uuid\s*:=\s*auth\.uid\(\);", sql)
    assert "IF v_aluno IS NULL THEN" in sql
    assert "'sem sessao'" in sql


def test_a_chave_sai_do_corpo_e_vai_para_o_vault() -> None:
    sql = _sql()

    assert "vault.create_secret(" in sql
    assert "FROM vault.decrypted_secrets WHERE name = 'brevo_api_key'" in sql
    assert "a chave da Brevo continua no corpo da funcao" in sql


def test_a_mudanca_de_segredo_e_verificada_por_digest() -> None:
    """Comparar valores exigiria imprimi-los. O md5 prova que a copia e fiel
    sem a chave passar por log de migracao nenhum."""
    sql = _sql()

    assert "md5(v_chave)" in sql
    assert "md5(decrypted_secret)" in sql
    assert "o segredo gravado no Vault nao confere" in sql


def test_mover_o_segredo_e_idempotente() -> None:
    """Rodar de novo nao pode duplicar o segredo nem falhar por nao achar a
    chave no corpo -- na segunda vez ela ja nao esta la."""
    sql = _sql()

    assert "IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'brevo_api_key')" in sql
    assert "ja esta no Vault, nada a mover" in sql


def test_o_teto_de_abuso_existe_e_vem_de_app_config() -> None:
    sql = _sql()

    assert "contato_envios_por_hora" in sql
    assert "mensagens por hora atingido" in sql
    assert "interval '1 hour'" in sql


def test_a_tabela_de_contagem_nao_e_legivel_pelo_cliente() -> None:
    """RLS ligada sem policy nenhuma nega tudo para anon e authenticated. Quem
    grava e a funcao, que e SECURITY DEFINER."""
    sql = _sql()

    assert "ALTER TABLE public.contato_envios ENABLE ROW LEVEL SECURITY" in sql
    assert "CREATE POLICY" not in sql


def test_o_downgrade_nao_repoe_a_funcao_quebrada() -> None:
    """O corpo antigo nunca enviou e-mail e carregava a credencial. Reverter
    seria reintroduzir as duas coisas."""
    sql = _sql_downgrade()

    assert "CREATE OR REPLACE FUNCTION public.fn_enviar_contato_sendgrid" not in sql
    assert "xkeysib" not in sql


def test_o_downgrade_nao_apaga_o_segredo() -> None:
    """Apaga-lo deixaria a funcao sem credencial nenhuma."""
    sql = _sql_downgrade()

    assert "vault" not in sql.lower() or "delete from vault" not in sql.lower()


def test_o_sql_renderizado_esta_limpo() -> None:
    """Nenhum `%`: o renderizador offline o dobraria, e a funcao nova nem usa
    interpolacao. E nenhum literal que vire bind parameter."""
    import re

    for sql in (_sql(), _sql_downgrade()):
        assert "%" not in sql
        assert not re.findall(r"(?<!:):[A-Za-z_]\w*", sql)
