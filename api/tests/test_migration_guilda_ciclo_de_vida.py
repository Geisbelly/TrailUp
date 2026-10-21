"""Fase 1 do plano depois da arena: o ciclo de vida da guilda entra no Alembic (`20261021_21`).

Esta migration **não muda comportamento nenhum** — ela põe no controle de versão seis funções que
só existiam porque alguém as criou pelo painel. Então o teste aqui é diferente do de uma migration
normal: ele não verifica o que o SQL faz, verifica que o SQL é **idêntico ao de produção**.

A ferramenta é o md5 de `prosrc` lido na produção em 2026-10-20 (somente leitura). Qualquer
diferença — uma vírgula, um espaço — quebra estes testes, que é exatamente o que se quer: aqui
qualquer diff de comportamento é defeito, não melhoria.
"""

import hashlib
import importlib.util
import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M21 = _modulo("20261021_21_guildas_ciclo_de_vida_no_alembic.py")

# md5 de `prosrc` na produção, 2026-10-20 (somente leitura).
_MD5_PRODUCAO = {
    "guilda_convidar": "cbbd06bec089c53e1bf7d11160997967",
    "guilda_aceitar_convite": "dcead5fffe5f10c0aa8146d1bece1d16",
    "guilda_recusar_convite": "37d7f02d427d5f01bcccc26e0c643006",
    "guilda_entrar": "4308c19e8ab7428dac34efd63d9ac83d",
    "guilda_sair": "3af398cc16fde350b79bf2e948aa690a",
    "guilda_dissolver": "7b4ccbbde5055db873632f03415f11a2",
}

# Assinatura de cada uma, como o Postgres a escreve nos GRANT/REVOKE.
_ASSINATURAS = {
    "guilda_convidar": "public.guilda_convidar(uuid, uuid)",
    "guilda_aceitar_convite": "public.guilda_aceitar_convite(uuid)",
    "guilda_recusar_convite": "public.guilda_recusar_convite(uuid)",
    "guilda_entrar": "public.guilda_entrar(uuid)",
    "guilda_sair": "public.guilda_sair(uuid)",
    "guilda_dissolver": "public.guilda_dissolver(uuid)",
}


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_20:20261021_21", sql=True)
    return output.getvalue()


def _prosrc(sql: str, nome: str) -> str:
    m = re.search(
        r"CREATE OR REPLACE FUNCTION public\." + nome + r"\(.*?AS \$function\$(.*?)\$function\$;",
        sql,
        re.S,
    )
    assert m, nome
    return m.group(1)


def _md5(texto: str) -> str:
    return hashlib.md5(texto.encode()).hexdigest()


def test_encadeia_depois_da_20() -> None:
    assert _M21.revision == "20261021_21"
    assert _M21.down_revision == "20261021_20"


def test_as_seis_sao_o_texto_de_producao_byte_a_byte() -> None:
    for nome, esperado in _MD5_PRODUCAO.items():
        assert _md5(_prosrc(_M21.VERSIONADAS, nome)) == esperado, (
            f"{nome} difere do texto de produção. Esta migration é só versionamento: "
            "mudança de comportamento aqui é defeito, não melhoria."
        )


def test_so_authenticated_e_service_role_executam() -> None:
    """O padrão do Postgres é EXECUTE para PUBLIC, e o `ALTER DEFAULT PRIVILEGES` da produção
    concede a `anon` em toda função nova. Sem o REVOKE explícito, função `SECURITY DEFINER`
    nesses domínios nasce executável pelo anônimo — bypass de RLS, não detalhe.

    O GRANT espelha o `proacl` da produção: `authenticated` **e** `service_role`. A primeira
    versão concedia só a `authenticated`, divergindo da produção e das irmãs `_22`/`_23`/`_24`
    sem nenhum motivo escrito — num Postgres sem o default do Supabase, `service_role` ficaria
    sem EXECUTE só nestas seis."""
    sql = _M21.VERSIONADAS
    for nome, assinatura in _ASSINATURAS.items():
        assert f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon;" in sql, nome
        assert f"GRANT EXECUTE ON FUNCTION {assinatura} TO authenticated, service_role;" in sql, nome
        # A ordem importa: GRANT antes do REVOKE seria revogado em seguida.
        assert sql.index(f"REVOKE ALL ON FUNCTION {assinatura}") < sql.index(
            f"GRANT EXECUTE ON FUNCTION {assinatura}"
        ), nome


def test_cada_uma_e_definer_com_search_path_fixo() -> None:
    """`SECURITY DEFINER` sem `search_path` fixo é sequestrável por tabela homônima no schema do
    chamador. As seis vêm da produção com `SET search_path TO 'public', 'pg_temp'`."""
    sql = _M21.VERSIONADAS
    for nome in _MD5_PRODUCAO:
        inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
        cabecalho = sql[inicio : sql.index("AS $function$", inicio)]
        assert "SECURITY DEFINER" in cabecalho, nome
        assert "SET search_path TO 'public', 'pg_temp'" in cabecalho, nome


def test_o_downgrade_nao_remove_nada() -> None:
    """As seis existiam antes desta migration. Remover no downgrade derrubaria o recurso de
    guildas na produção para desfazer um commit que não mudou comportamento — mesma decisão da
    `_17` para `guilda_atualizar`."""
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_21:20261021_20", sql=True)
    sql = output.getvalue()
    assert "DROP FUNCTION" not in sql.upper()
    for nome in _MD5_PRODUCAO:
        assert f"FUNCTION public.{nome}(" not in sql


def test_o_sql_offline_dobra_o_porcento_e_nao_serve_para_aplicar() -> None:
    """Armadilha medida, não hipótese: `alembic upgrade --sql` passa o script por formatação de
    `%`, e `%ROWTYPE` sai `%%ROWTYPE`. O plpgsql aceita e a função fica corrompida **sem erro**.

    Duas das seis declaram `%ROWTYPE` (`guilda_convidar`, `guilda_aceitar_convite`), então este
    teste existe para o próximo que pensar em aplicar a migration pelo SQL renderizado: aplique
    pelo `alembic upgrade head` (ou desfaça o `%%` antes). O md5 dos outros testes é conferido
    contra `VERSIONADAS`, o texto do módulo, justamente por isso."""
    renderizado = _upgrade_sql()
    assert "%%ROWTYPE" in renderizado
    assert "%ROWTYPE" in _M21.VERSIONADAS and "%%ROWTYPE" not in _M21.VERSIONADAS
