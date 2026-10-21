"""Fase 1 do plano depois da arena: chat e configuração da guilda no Alembic (`20261021_22`).

Fecha o domínio de guildas — com a `_21`, as dez RPCs do recurso passam a nascer de migração.

Como na `_21`, esta migration **não muda comportamento**: o corpo é o texto exato de produção
(`pg_get_functiondef`, 2026-10-20) e o teste trava isso pelo md5 de `prosrc`. O que mais merece
teste aqui é o que distingue estas quatro das seis anteriores — `guilda_chat_listar` é
`LANGUAGE sql` e `STABLE`, e perder o `STABLE` na transcrição a tornaria `VOLATILE` sem nenhum
erro aparecer.
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


_M22 = _modulo("20261021_22_guildas_chat_e_config_no_alembic.py")

# md5 de `prosrc` na produção, 2026-10-20 (somente leitura).
_MD5_PRODUCAO = {
    "guilda_atualizar_config": "457ad296ec99f1b14128b3939557a67c",
    "guilda_chat_enviar": "f3b465e0d84a5a2319a60cc7f4599ebe",
    "guilda_chat_listar": "2822b3229b5e63de6ff3cdcea66071fb",
    "guilda_chat_questao_responder": "3c04e17c195d8563a5e7e07315e572ec",
}

_ASSINATURAS = {
    "guilda_atualizar_config": "public.guilda_atualizar_config(uuid, text, text, text, text, text, text)",
    "guilda_chat_enviar": "public.guilda_chat_enviar(uuid, text, text, jsonb)",
    "guilda_chat_listar": "public.guilda_chat_listar(uuid, integer)",
    "guilda_chat_questao_responder": "public.guilda_chat_questao_responder(uuid, text)",
}


def _prosrc(sql: str, nome: str) -> str:
    m = re.search(
        r"CREATE OR REPLACE FUNCTION public\." + nome + r"\(.*?AS \$function\$(.*?)\$function\$;",
        sql,
        re.S,
    )
    assert m, nome
    return m.group(1)


def _cabecalho(sql: str, nome: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
    return sql[inicio : sql.index("AS $function$", inicio)]


def _md5(texto: str) -> str:
    return hashlib.md5(texto.encode()).hexdigest()


def test_encadeia_depois_da_21() -> None:
    assert _M22.revision == "20261021_22"
    assert _M22.down_revision == "20261021_21"


def test_as_quatro_sao_o_texto_de_producao_byte_a_byte() -> None:
    for nome, esperado in _MD5_PRODUCAO.items():
        assert _md5(_prosrc(_M22.VERSIONADAS, nome)) == esperado, (
            f"{nome} difere do texto de produção. Esta migration é só versionamento: "
            "mudança de comportamento aqui é defeito, não melhoria."
        )


def test_cada_uma_e_definer_com_search_path_fixo() -> None:
    """`SECURITY DEFINER` sem `search_path` fixo é sequestrável por tabela homônima no schema do
    chamador. As quatro vêm da produção com `SET search_path TO 'public', 'pg_temp'`."""
    for nome in _MD5_PRODUCAO:
        cab = _cabecalho(_M22.VERSIONADAS, nome)
        assert "SECURITY DEFINER" in cab, nome
        assert "SET search_path TO 'public', 'pg_temp'" in cab, nome


def test_listar_continua_sql_e_stable() -> None:
    """A única das quatro que não é plpgsql. `STABLE` não é adorno: sem ele a função nasce
    `VOLATILE` (o padrão), deixa de poder ser inlined e muda o plano de quem a chama — e nada
    nesta migration daria erro para avisar."""
    cab = _cabecalho(_M22.VERSIONADAS, "guilda_chat_listar")
    assert "LANGUAGE sql" in cab
    assert "STABLE SECURITY DEFINER" in cab
    # E as outras três seguem plpgsql, para o teste não passar por coincidência.
    for nome in ("guilda_atualizar_config", "guilda_chat_enviar", "guilda_chat_questao_responder"):
        assert "LANGUAGE plpgsql" in _cabecalho(_M22.VERSIONADAS, nome), nome


def test_listar_so_entrega_mensagem_de_quem_e_membro() -> None:
    """Ela lê `guilda_mensagens` e `alunos` como `postgres`, então o `EXISTS` sobre
    `guilda_membros` é a autorização inteira. Está dentro da subconsulta, antes do LIMIT: quem
    não é membro não recebe linha nenhuma — nem as últimas 100."""
    corpo = _prosrc(_M22.VERSIONADAS, "guilda_chat_listar")
    assert "FROM public.guilda_membros gm" in corpo
    assert "gm.aluno_id=auth.uid() AND gm.left_at IS NULL" in corpo
    assert corpo.index("guilda_membros gm") < corpo.index("LIMIT GREATEST(1,LEAST(p_limite,100))")


def test_so_authenticated_e_service_role_executam() -> None:
    """O padrão do Postgres é EXECUTE para PUBLIC. As quatro são SECURITY DEFINER, então aberto
    ao anônimo é bypass de RLS — e na produção `anon` não tem EXECUTE (medido)."""
    sql = _M22.VERSIONADAS
    for nome, assinatura in _ASSINATURAS.items():
        assert f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon;" in sql, nome
        assert f"GRANT EXECUTE ON FUNCTION {assinatura} TO authenticated, service_role;" in sql, nome
        # GRANT antes do REVOKE seria revogado em seguida.
        assert sql.index(f"REVOKE ALL ON FUNCTION {assinatura}") < sql.index(
            f"GRANT EXECUTE ON FUNCTION {assinatura}"
        ), nome


def test_os_defaults_dos_parametros_vao_junto() -> None:
    """Os clientes chamam estas RPCs com menos argumentos do que a assinatura tem (o chat manda
    `p_tipo`/`p_texto`/`p_conteudo` só quando precisa). Sem os DEFAULT, um banco novo rejeitaria
    a chamada com 42883 — e a função existiria, o que torna o erro confuso."""
    cab = _cabecalho(_M22.VERSIONADAS, "guilda_chat_enviar")
    assert "p_tipo text DEFAULT 'text'::text" in cab
    assert "p_texto text DEFAULT ''::text" in cab
    assert "p_conteudo jsonb DEFAULT '{}'::jsonb" in cab
    cab = _cabecalho(_M22.VERSIONADAS, "guilda_chat_listar")
    assert "p_limite integer DEFAULT 100" in cab
    cab = _cabecalho(_M22.VERSIONADAS, "guilda_atualizar_config")
    assert "p_modo_perfil text DEFAULT 'misto'::text" in cab
    # `p_nome` NÃO tem default de propósito: renomear para vazio não é configuração parcial.
    assert "p_nome text," in cab


def test_o_downgrade_nao_remove_nada() -> None:
    """As quatro existiam antes desta migration. Remover derrubaria o chat da guilda na produção
    para desfazer um commit que não mudou comportamento — mesma decisão da `_17` e da `_21`."""
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_22:20261021_21", sql=True)
    sql = output.getvalue()
    assert "DROP FUNCTION" not in sql.upper()
    for nome in _MD5_PRODUCAO:
        assert f"FUNCTION public.{nome}(" not in sql


def test_o_sql_offline_dobra_o_porcento_e_nao_serve_para_aplicar() -> None:
    """Mesma armadilha da `_21`, medida de novo aqui porque duas destas quatro declaram
    `%ROWTYPE` (`guilda_chat_enviar`, `guilda_chat_questao_responder`): `alembic upgrade --sql`
    dobra `%`, o plpgsql aceita `%%ROWTYPE` e a função fica corrompida **sem erro**. Aplicar é
    por `alembic upgrade head`."""
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_21:20261021_22", sql=True)
    renderizado = output.getvalue()
    assert "%%ROWTYPE" in renderizado
    assert "%ROWTYPE" in _M22.VERSIONADAS and "%%ROWTYPE" not in _M22.VERSIONADAS
