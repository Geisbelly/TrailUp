"""`20261021_24`: as duas últimas RPCs de verdade fora da cadeia entram no Alembic.

O cuidado específico desta migration é **quebra de linha**. As duas funções foram escritas no
painel do Supabase, no Windows, e o `prosrc` guardado tem CRLF. O corpo aqui está normalizado
para LF, então o md5 **não** bate com `md5(prosrc)` — bate com
`md5(replace(prosrc, E'\\r\\n', E'\\n'))`. Travar a constante errada aqui daria a impressão de
drift a cada leitura futura, ou esconderia drift de verdade atrás da diferença de CRLF.
"""

import hashlib
import importlib.util
import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config
from tests.test_rpc_chamada_tem_migracao import FORA_DO_ALEMBIC

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M24 = _modulo("20261021_24_perfil_e_cadastro_do_aluno_no_alembic.py")

# md5 de `replace(prosrc, E'\r\n', E'\n')` na produção, 2026-10-20 (somente leitura) — a versão
# NORMALIZADA, por causa do CRLF. O md5 cru está ao lado só para o teste poder provar que são
# diferentes, e que a diferença é essa.
_MD5_NORMALIZADO = {
    "fn_atualizar_aluno_perfil": "b18b72aedd8903af8f5a215ed3efd932",
    "fn_cadastrar_aluno_com_perfis": "a3880e6a7aad4b2f3346fe51ca9b75a1",
}
_MD5_CRU_COM_CRLF = {
    "fn_atualizar_aluno_perfil": "6100117dfc10ef8b8d5d8a51d51ff521",
    "fn_cadastrar_aluno_com_perfis": "4a14609b512452aa446127b10e83823b",
}

_ASSIN_PERFIL = "public.fn_atualizar_aluno_perfil(text, text, text, text, text, text, modo_resposta_type)"
_ASSIN_CADASTRO = "public.fn_cadastrar_aluno_com_perfis(uuid, text, text, text, text, jsonb)"


def _prosrc(nome: str) -> str:
    m = re.search(
        r"CREATE OR REPLACE FUNCTION public\." + nome + r"\(.*?AS \$function\$(.*?)\$function\$;",
        _M24.VERSIONADAS,
        re.S,
    )
    assert m, nome
    return m.group(1)


def _md5(texto: str) -> str:
    return hashlib.md5(texto.encode()).hexdigest()


def test_encadeia_depois_da_23() -> None:
    assert _M24.revision == "20261021_24"
    assert _M24.down_revision == "20261021_23"


def test_os_corpos_sao_a_producao_normalizada_para_lf() -> None:
    for nome, esperado in _MD5_NORMALIZADO.items():
        assert _md5(_prosrc(nome)) == esperado, (
            f"{nome} difere do texto de produção (normalizado para LF)."
        )


def test_a_unica_diferenca_e_a_quebra_de_linha() -> None:
    """Prova explícita de que o md5 normalizado não é só "outro md5 que eu escolhi": pôr o CRLF
    de volta reproduz o `prosrc` cru da produção, byte a byte."""
    for nome, cru in _MD5_CRU_COM_CRLF.items():
        assert _MD5_NORMALIZADO[nome] != cru
        de_volta = _prosrc(nome).replace("\n", "\r\n")
        assert _md5(de_volta) == cru, (
            f"{nome}: reconvertendo para CRLF o md5 deveria voltar a ser o da produção. "
            "Se falhou, há diferença ALÉM da quebra de linha."
        )


def test_nenhum_cr_vazou_para_o_arquivo() -> None:
    """O repo é LF (e UTF-8 sem BOM). Um `\\r` aqui passaria pelos outros testes e só apareceria
    como diff inteiro de arquivo no commit seguinte."""
    assert "\r" not in _M24.VERSIONADAS


def test_definer_revoga_publico_e_invoker_nao() -> None:
    """A distinção que decide o GRANT: `fn_atualizar_aluno_perfil` é `SECURITY DEFINER`, então
    EXECUTE para o anônimo é bypass de RLS e tem de sair. `fn_cadastrar_aluno_com_perfis` é
    `SECURITY INVOKER` — a RLS do chamador continua valendo, e `anon` precisa dela no signup."""
    sql = _M24.VERSIONADAS
    cabecalho_perfil = sql[sql.index("FUNCTION public.fn_atualizar_aluno_perfil") : sql.index("AS $function$")]
    assert "SECURITY DEFINER" in cabecalho_perfil
    assert f"REVOKE ALL ON FUNCTION {_ASSIN_PERFIL} FROM PUBLIC, anon;" in sql
    assert f"GRANT EXECUTE ON FUNCTION {_ASSIN_PERFIL} TO authenticated, service_role;" in sql

    i = sql.index("FUNCTION public.fn_cadastrar_aluno_com_perfis")
    cabecalho_cadastro = sql[i : sql.index("AS $function$", i)]
    assert "SECURITY DEFINER" not in cabecalho_cadastro, "o cadastro é INVOKER; não o promova"
    assert f"GRANT EXECUTE ON FUNCTION {_ASSIN_CADASTRO} TO anon, authenticated, service_role;" in sql
    # E o PUBLIC dela fica como está: estreitar é decisão de quem sabe que papéis chamam o signup.
    assert f"REVOKE ALL ON FUNCTION {_ASSIN_CADASTRO}" not in sql


def test_search_path_de_cada_uma_vai_verbatim() -> None:
    """`fn_atualizar_aluno_perfil` usa `'public', 'auth'` — sem `pg_temp`, fora do padrão da
    casa. Vai assim de propósito (ver o docstring): mudar mexe na resolução de nome de uma
    função que grava em `alunos`."""
    sql = _M24.VERSIONADAS
    assert "SET search_path TO 'public', 'auth'" in sql
    assert "SET search_path TO 'public', 'pg_temp'" in sql


def test_as_duas_saem_da_divida_registrada() -> None:
    """O que ESTA migration é responsável por mudar: as duas deixam de ser dívida registrada.

    A primeira versão deste teste afirmava `set(FORA_DO_ALEMBIC) == {"fn_auth_email_exists"}` —
    o inventário inteiro. Qualquer dívida nova e legítima registrada amanhã quebraria um teste
    de MIGRATION, com mensagem apontando para a `_24`, que nada tem a ver. O inventário é
    assunto do portão (`test_rpc_chamada_tem_migracao`); aqui só cabe o par que a `_24` pagou."""
    assert "fn_atualizar_aluno_perfil" not in FORA_DO_ALEMBIC
    assert "fn_cadastrar_aluno_com_perfis" not in FORA_DO_ALEMBIC
    # `fn_auth_email_exists` era a última entrada e saiu em `20261021_28` — não por ter sido
    # versionada, mas porque a #329 foi decidida e a função deixou de existir. A lista ficou
    # vazia; quem cobra isso agora é o portão, não este teste de migration.
    assert "fn_auth_email_exists" not in FORA_DO_ALEMBIC


def test_o_downgrade_nao_remove_nada() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_24:20261021_23", sql=True)
    sql = output.getvalue()
    assert "DROP FUNCTION" not in sql.upper()


def test_o_sql_offline_dobra_o_porcento_das_mensagens_de_raise() -> None:
    """Aqui o `%` não está em `%ROWTYPE`, está em mensagem de `RAISE EXCEPTION` — e `%%` sai
    literal no texto do erro que o aluno veria. Aplicar é por `alembic upgrade head`."""
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_23:20261021_24", sql=True)
    renderizado = output.getvalue()
    assert "%%" in renderizado
    assert "%%" not in _M24.VERSIONADAS
