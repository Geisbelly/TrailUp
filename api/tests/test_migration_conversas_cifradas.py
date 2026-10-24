"""Conversas cifradas em repouso (`20261022_05`, issue #195): o que dá para travar sem banco.

O comportamento (dado cifrado no disco, mesmo JSON nas RPCs, não participante barrado,
downgrade) está em `test_e2e_conversas_cifradas.py`, que precisa de um Postgres local. Aqui
fica o contrato textual: as leitoras só mudam onde decifram, as escritoras não mudam, as
funções novas não ficam expostas a cliente nenhum e a chave só aparece pelo nome.
"""

import hashlib
import importlib.util
import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
_ARQUIVO = "20261022_05_conversas_cifradas_em_repouso.py"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M05 = _modulo(_ARQUIVO)
_M22 = _modulo("20261021_22_guildas_chat_e_config_no_alembic.py")
_M10 = _modulo("20260913_10_chat_colegas_sem_amizade.py")

_UPGRADE = "\n".join(_M05.UPGRADE_SQL)
_DOWNGRADE = "\n".join(_M05.DOWNGRADE_SQL)

# md5 de `prosrc` na produção (somente leitura, 2026-10-20 e conferido de novo em 2026-10-23).
_MD5_PRODUCAO = {
    "guilda_chat_listar": "2822b3229b5e63de6ff3cdcea66071fb",
    "guilda_chat_questao_responder": "3c04e17c195d8563a5e7e07315e572ec",
    "social_chat_listar": "f022a529f461420afa4e7602ee0b102d",
}

_NOVAS = (
    "chat_chave()",
    "chat_cifrar(text, text)",
    "chat_decifrar(bytea, text)",
    "chat_guilda_mensagens_cifrar()",
    "chat_social_mensagens_cifrar()",
)


def _prosrc(sql: str, nome: str) -> str:
    m = re.search(
        r"CREATE OR REPLACE FUNCTION public\." + nome + r"\(.*?AS (\$\w*\$)(.*?)\1",
        sql,
        re.S,
    )
    assert m, nome
    return m.group(2)


def _cabecalho(sql: str, nome: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
    return sql[inicio : sql.index("AS $", inicio)]


def _md5(texto: str) -> str:
    return hashlib.md5(texto.encode()).hexdigest()


def test_encadeia_na_head_atual() -> None:
    assert _M05.revision == "20261022_05"
    assert _M05.down_revision == "20261022_04"


def test_downgrade_devolve_o_texto_de_producao_byte_a_byte() -> None:
    for nome, esperado in _MD5_PRODUCAO.items():
        assert _md5(_prosrc(_DOWNGRADE, nome)) == esperado, nome


def test_a_copia_de_producao_bate_com_as_migrations_de_origem() -> None:
    """Se `20261021_22` ou `20260913_10` mudarem, a cópia aqui fica velha: avisa."""
    for nome in ("guilda_chat_listar", "guilda_chat_questao_responder"):
        assert _prosrc(_DOWNGRADE, nome) == _prosrc(_M22.VERSIONADAS, nome), nome
    original = _M10._function("social_chat_listar", "", _M10.LISTAR)
    assert _prosrc(_DOWNGRADE, "social_chat_listar") == _prosrc(original, "social_chat_listar")


def test_guilda_listar_so_muda_a_subconsulta_que_decifra() -> None:
    """O resto do corpo (JSON de saída, bloqueio de questão, EXISTS de membro ativo, LIMIT) é o
    de produção. A decifra fica DENTRO da subconsulta com LIMIT: no máximo 100 linhas."""
    antes = _prosrc(_M22.VERSIONADAS, "guilda_chat_listar")
    depois = _prosrc(_UPGRADE, "guilda_chat_listar")
    selecao = (
        "SELECT m.id,m.guilda_id,m.autor_id,m.tipo,m.created_at,"
        "public.chat_decifrar(m.texto_cifrado,(SELECT public.chat_chave())) AS texto,"
        "public.chat_decifrar(m.conteudo_cifrado,(SELECT public.chat_chave()))::jsonb AS conteudo"
        " FROM public.guilda_mensagens m WHERE"
    )
    assert depois == antes.replace("SELECT * FROM public.guilda_mensagens m WHERE", selecao)
    assert depois != antes
    assert depois.index("chat_decifrar") < depois.index("LIMIT GREATEST(1,LEAST(p_limite,100))")
    assert "gm.aluno_id=auth.uid() AND gm.left_at IS NULL" in depois


def test_guilda_listar_continua_sql_stable_definer() -> None:
    cab = _cabecalho(_UPGRADE, "guilda_chat_listar")
    assert "LANGUAGE sql" in cab and "STABLE SECURITY DEFINER" in cab
    assert "SET search_path TO 'public', 'pg_temp'" in cab
    assert cab == _cabecalho(_M22.VERSIONADAS, "guilda_chat_listar")


def test_questao_responder_so_ganha_a_linha_que_decifra() -> None:
    antes = _prosrc(_M22.VERSIONADAS, "guilda_chat_questao_responder")
    depois = _prosrc(_UPGRADE, "guilda_chat_questao_responder")
    linha = "  IF FOUND THEN v_m.conteudo := public.chat_decifrar(v_m.conteudo_cifrado, public.chat_chave())::jsonb; END IF;\n"
    assert depois.replace(linha, "") == antes
    assert depois.index("SELECT * INTO v_m") < depois.index(linha) < depois.index("IF NOT FOUND")
    assert _cabecalho(_UPGRADE, "guilda_chat_questao_responder") == _cabecalho(
        _M22.VERSIONADAS, "guilda_chat_questao_responder"
    )


def test_social_listar_so_decifra_o_texto() -> None:
    antes = _prosrc(_M10._function("social_chat_listar", "", _M10.LISTAR), "social_chat_listar")
    depois = _prosrc(_UPGRADE, "social_chat_listar")
    assert depois == antes.replace(
        "'texto',m.texto,", "'texto',public.chat_decifrar(m.texto_cifrado,(SELECT public.chat_chave())),"
    )
    assert depois != antes
    assert "social_chat_fora_da_turma" in depois and "social_chat_bloqueado" in depois


def test_leitoras_mantem_o_acl_de_producao() -> None:
    for assinatura in (
        "public.guilda_chat_listar(uuid, integer)",
        "public.guilda_chat_questao_responder(uuid, text)",
        "public.social_chat_listar(uuid)",
    ):
        for sql in (_UPGRADE, _DOWNGRADE):
            assert f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon;" in sql, assinatura
            assert f"GRANT EXECUTE ON FUNCTION {assinatura} TO authenticated, service_role;" in sql, assinatura


def test_escritoras_nao_sao_reescritas() -> None:
    """Quem grava continua com o corpo de produção: o trigger cifra o INSERT de todas."""
    for nome in ("guilda_chat_enviar", "social_chat_enviar", "guilda_desafio_criar", "arena_desafio_criar"):
        assert f"FUNCTION public.{nome}(" not in _UPGRADE + _DOWNGRADE, nome
    assert "BEFORE INSERT OR UPDATE ON public.guilda_mensagens" in _UPGRADE
    assert "BEFORE INSERT OR UPDATE ON public.social_mensagens" in _UPGRADE


def test_funcoes_novas_nao_ficam_expostas_a_cliente_nenhum() -> None:
    """`ALTER DEFAULT PRIVILEGES` do Supabase dá EXECUTE a anon/authenticated/service_role em
    toda função nova do `public`. A chave e a decifra não podem virar `/rest/v1/rpc/...`."""
    for fn in _NOVAS:
        assert re.search(
            r"REVOKE (ALL|EXECUTE) ON FUNCTION public\."
            + re.escape(fn)
            + r" FROM PUBLIC, anon, authenticated, service_role;",
            _UPGRADE,
        ), fn
        nome = fn.split("(")[0]
        assert not re.search(r"GRANT [^;]*public\." + nome + r"\(", _UPGRADE), fn


def test_so_os_triggers_sao_definer() -> None:
    for nome in ("chat_chave", "chat_cifrar", "chat_decifrar"):
        assert "SECURITY DEFINER" not in _cabecalho(_UPGRADE, nome), nome
    for nome in ("chat_guilda_mensagens_cifrar", "chat_social_mensagens_cifrar"):
        cab = _cabecalho(_UPGRADE, nome)
        assert "SECURITY DEFINER" in cab and "SET search_path TO 'public', 'pg_temp'" in cab, nome


def test_chave_so_pelo_nome_e_nunca_criada() -> None:
    texto = (_VERSOES / _ARQUIVO).read_text(encoding="utf-8")
    assert _M05.CHAVE_VAULT == "chat_mensagens_chave"
    assert "WHERE name = 'chat_mensagens_chave'" in _M05.HELPERS
    assert "segredo chat_mensagens_chave ausente no Vault" in _M05.HELPERS
    for proibido in ("create_secret", "update_secret", "INSERT INTO vault", "gen_random_bytes"):
        assert proibido not in texto, proibido


def test_a_chave_e_conferida_antes_de_mexer_em_tabela() -> None:
    """Sem a chave, o upgrade tem de abortar antes do ALTER: tabela vazia não chamaria
    `chat_chave()` no backfill, e a migration passaria deixando o chat quebrado."""
    assert _UPGRADE.index("DO $do$ BEGIN PERFORM public.chat_chave(); END $do$;") < _UPGRADE.index("ALTER TABLE")
    assert _DOWNGRADE.index("DO $do$ BEGIN PERFORM public.chat_chave(); END $do$;") < _DOWNGRADE.index("ALTER TABLE")


def test_claro_fica_travado_vazio_e_cifra_obrigatoria() -> None:
    assert "CHECK (texto = '' AND conteudo = '{}'::jsonb)" in _UPGRADE
    assert "ADD CONSTRAINT social_mensagens_em_claro_vazio_check CHECK (texto = '')" in _UPGRADE
    assert _UPGRADE.count("SET NOT NULL") == 3
    # A regra 1..500 que sai da CHECK é repetida no trigger, com o mesmo nome de constraint.
    assert "DROP CONSTRAINT social_mensagens_texto_check" in _UPGRADE
    assert "CONSTRAINT = 'social_mensagens_texto_check'" in _UPGRADE
    assert "CHECK (((char_length(btrim(texto)) >= 1) AND (char_length(btrim(texto)) <= 500)))" in _DOWNGRADE


def test_cifra_aes256_sem_derivacao_iterada() -> None:
    assert "extensions.pgp_sym_encrypt(p_texto, p_chave, 'cipher-algo=aes256, s2k-mode=1')" in _UPGRADE
    assert "extensions.pgp_sym_decrypt(p_dado, p_chave)" in _UPGRADE


def test_upgrade_e_downgrade_renderizam_offline() -> None:
    saida = StringIO()
    migrations.command.upgrade(_offline_alembic_config(saida), "20261022_04:20261022_05", sql=True)
    sql = saida.getvalue()
    assert "CREATE TRIGGER guilda_mensagens_cifrar" in sql
    assert "UPDATE alembic_version SET version_num='20261022_05'" in sql
    saida = StringIO()
    migrations.command.downgrade(_offline_alembic_config(saida), "20261022_05:20261022_04", sql=True)
    sql = saida.getvalue()
    assert "DROP FUNCTION public.chat_chave();" in sql
    assert "UPDATE alembic_version SET version_num='20261022_04'" in sql


def test_lock_timeout_antes_de_todo_alter_e_volta_ao_padrao() -> None:
    for comandos in (_M05.UPGRADE_SQL, _M05.DOWNGRADE_SQL):
        sql = "\n".join(comandos)
        assert "SET LOCAL lock_timeout = '5s';" in sql
        primeiro_lock = min(sql.index(x) for x in ("ALTER TABLE", "DROP TRIGGER", "CREATE TRIGGER") if x in sql)
        assert sql.index("SET LOCAL lock_timeout = '5s';") < primeiro_lock
        assert comandos[-2] == "SET LOCAL lock_timeout TO DEFAULT;"


def test_docstring_nao_promete_barrar_o_service_role() -> None:
    """Na produção o `service_role` lê o Vault e executa `pgp_sym_decrypt`: ele decifra."""
    doc = _M05.__doc__
    assert "inclusive `service_role`" not in doc
    assert "o `service_role` lê" in doc and "dump, backup e réplica" in doc
