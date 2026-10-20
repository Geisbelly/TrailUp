"""Fase 6 do plano: leitura da formação de guilda pelo professor (`20261021_17`).

O comportamento foi exercitado num Postgres 17 local com o esqueleto das tabelas e as funções de
produção (`guilda_janela_aberta`, `guilda_configurar_turma`, ver o PR). Estes testes travam o LUGAR
e a FORMA de cada regra no SQL gerado.
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


_M17 = _modulo("20261021_17_guilda_formacao_no_console.py")


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_16:20261021_17", sql=True)
    return output.getvalue()


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_17:20261021_16", sql=True)
    return output.getvalue()


def _sem_comentarios(sql: str) -> str:
    return "\n".join(linha.split("--")[0] for linha in sql.splitlines())


def _corpo() -> str:
    sql = _upgrade_sql()
    inicio = sql.index("CREATE OR REPLACE FUNCTION public.guilda_formacao_da_turma(")
    return _sem_comentarios(sql[inicio : sql.index("$function$;", inicio)])


def test_encadeia_depois_da_16_do_pr_568() -> None:
    assert _M17.revision == "20261021_17"
    assert _M17.down_revision == "20261021_16"


def test_so_o_professor_da_turma_le() -> None:
    corpo = _corpo()
    assert "SECURITY DEFINER" in corpo
    assert "SET search_path = public, pg_temp" in corpo
    assert "STABLE" in corpo
    guarda = corpo[corpo.index("IF auth.uid() IS NULL") : corpo.index("END IF;")]
    assert "app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id" in guarda
    assert "ERRCODE = '42501'" in guarda
    # A guarda vem antes de qualquer leitura.
    assert corpo.index("ERRCODE = '42501'") < corpo.index("FROM public.guilda_config_turma")


def test_janela_e_a_mesma_regra_de_quem_barra_e_o_default_e_10() -> None:
    corpo = _corpo()
    assert "'janela_aberta', public.guilda_janela_aberta(p_classe_id)" in corpo
    assert "'tamanho_maximo', COALESCE(v_cfg.tamanho_maximo, 10)" in corpo
    assert "'configurada', v_configurada" in corpo
    assert "'agora', now()" in corpo


def test_guildas_ativas_com_membros_atuais() -> None:
    corpo = _corpo()
    assert "WHERE g.classe_id = p_classe_id AND g.ativa" in corpo
    assert "m.left_at IS NULL AND m.aluno_id IS NOT NULL" in corpo
    assert "ORDER BY m.joined_at" in corpo
    sem_guilda = corpo[corpo.index("'alunos_sem_guilda'") : corpo.index("'guildas'")]
    assert "JOIN public.guildas g ON g.id = m.guilda_id AND g.ativa" in sem_guilda
    assert "m.left_at IS NULL AND g.classe_id = p_classe_id" in sem_guilda


def test_nao_escreve_nada() -> None:
    corpo = _corpo().upper()
    for verbo in ("INSERT INTO", "UPDATE PUBLIC.", "DELETE FROM"):
        assert verbo not in corpo


def test_permissoes_e_downgrade() -> None:
    sql = _upgrade_sql()
    assert "REVOKE ALL ON FUNCTION public.guilda_formacao_da_turma(bigint) FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.guilda_formacao_da_turma(bigint) TO authenticated" in sql
    assert "DROP FUNCTION IF EXISTS public.guilda_formacao_da_turma(bigint)" in _downgrade_sql()


# md5 de `prosrc` na produção, 2026-10-20 (somente leitura).
_MD5_PRODUCAO = {
    "guilda_configurar_turma": "dbfd958d66fd62c237ebf3a9ec79fc32",
    "guilda_atualizar": "06292645cd4af6fbe6a88cfa92bf9088",
}


def _prosrc(sql: str, nome: str) -> str:
    m = re.search(r"CREATE OR REPLACE FUNCTION public\." + nome + r"\(.*?AS \$function\$(.*?)\$function\$;", sql, re.S)
    assert m, nome
    return m.group(1)


def _md5(texto: str) -> str:
    return hashlib.md5(texto.encode()).hexdigest()


def test_guilda_atualizar_entra_no_alembic_sem_mudanca() -> None:
    sql = _M17.VERSIONADAS
    assert _md5(_prosrc(sql, "guilda_atualizar")) == _MD5_PRODUCAO["guilda_atualizar"]
    assert "REVOKE ALL ON FUNCTION public.guilda_atualizar(uuid, text, text, text) FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.guilda_atualizar(uuid, text, text, text) TO authenticated" in sql
    # guilda_janela_aberta não é redefinida: vive em 20260912_07 e o console não a chama.
    assert "FUNCTION public.guilda_janela_aberta(" not in _upgrade_sql()


def test_configurar_turma_muda_de_proposito_e_o_downgrade_volta_a_producao() -> None:
    # A cópia de produção é a de produção...
    assert (
        _md5(_prosrc(_M17.CONFIGURAR_PRODUCAO, "guilda_configurar_turma")) == _MD5_PRODUCAO["guilda_configurar_turma"]
    )
    # ...a do upgrade difere de propósito (decisão 2)...
    nova = _prosrc(_M17.CONFIGURAR, "guilda_configurar_turma")
    assert _md5(nova) != _MD5_PRODUCAO["guilda_configurar_turma"]
    # ...e, sem o bloco novo, é a de produção: a única mudança é a checagem de tamanho.
    sem_bloco = re.sub(r"DECLARE\n  v_maior integer;\n", "", nova)
    sem_bloco = re.sub(r"  -- Decisão de 2026-10-20.*?  END IF;\n", "", sem_bloco, flags=re.S)
    assert sem_bloco == _prosrc(_M17.CONFIGURAR_PRODUCAO, "guilda_configurar_turma")
    assert _prosrc(_downgrade_sql(), "guilda_configurar_turma") == _prosrc(
        _M17.CONFIGURAR_PRODUCAO, "guilda_configurar_turma"
    )
    up = _upgrade_sql()
    assert (
        "REVOKE ALL ON FUNCTION public.guilda_configurar_turma(bigint, integer, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon"
        in up
    )
    assert (
        "GRANT EXECUTE ON FUNCTION public.guilda_configurar_turma(bigint, integer, timestamp with time zone, timestamp with time zone) TO authenticated"
        in up
    )


def test_tamanho_abaixo_da_maior_guilda_e_recusado() -> None:
    corpo = _sem_comentarios(_prosrc(_M17.CONFIGURAR, "guilda_configurar_turma"))
    # A permissão vem primeiro: quem não é professor não descobre o tamanho das guildas.
    assert corpo.index("guilda_config_invalida") < corpo.index("FOR UPDATE")
    # Trava antes de contar, conta só membro atual de guilda ativa da turma.
    assert corpo.index("FOR UPDATE") < corpo.index("count(*)")
    assert "WHERE classe_id = p_classe_id AND ativa ORDER BY id FOR UPDATE" in corpo
    assert "WHERE g.classe_id = p_classe_id AND g.ativa AND m.left_at IS NULL" in corpo
    assert "IF p_tamanho_maximo < v_maior THEN" in corpo
    assert "RAISE EXCEPTION 'guilda_tamanho_abaixo_dos_membros'" in corpo
    assert "ERRCODE = '22023'" in corpo
    assert "HINT = v_maior::text" in corpo
    # A recusa vem antes de gravar.
    assert corpo.index("guilda_tamanho_abaixo_dos_membros") < corpo.index("INSERT INTO public.guilda_config_turma")


def _corpo_janela() -> str:
    return _sem_comentarios(_prosrc(_upgrade_sql(), "guilda_janela_da_turma"))


def test_janela_do_aluno_so_para_colega_e_sem_membros() -> None:
    corpo = _corpo_janela()
    assert "SECURITY DEFINER" in _M17.JANELA_DO_ALUNO and "STABLE" in _M17.JANELA_DO_ALUNO
    assert "SET search_path = public, pg_temp" in _M17.JANELA_DO_ALUNO
    guarda = corpo[: corpo.index("END IF;")]
    assert "public.guilda_e_colega(auth.uid(), p_classe_id)" in guarda
    assert "ERRCODE = '42501'" in guarda
    assert "'janela_aberta', public.guilda_janela_aberta(p_classe_id)" in corpo
    assert "'tamanho_maximo', COALESCE(v_cfg.tamanho_maximo, 10)" in corpo
    for proibido in ("guilda_membros", "alunos", "INSERT", "UPDATE", "DELETE"):
        assert proibido not in corpo


def test_janela_do_aluno_permissoes_e_downgrade() -> None:
    up = _upgrade_sql()
    assert "REVOKE ALL ON FUNCTION public.guilda_janela_da_turma(bigint) FROM PUBLIC, anon" in up
    assert "GRANT EXECUTE ON FUNCTION public.guilda_janela_da_turma(bigint) TO authenticated" in up
    down = _downgrade_sql()
    assert "DROP FUNCTION IF EXISTS public.guilda_janela_da_turma(bigint)" in down
    for nome in _MD5_PRODUCAO:
        assert f"DROP FUNCTION IF EXISTS public.{nome}" not in down
