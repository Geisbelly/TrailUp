"""`20261120_03`: desafios gerados sozinhos esperam a aprovação do professor (estrutura da migration).

O comportamento é medido no e2e (`test_e2e_desafios_gerados_automaticamente.py`, banco local). Aqui
fica o que tem de valer sem banco: a cadeia, os GRANTs, a tabela sem policy registrada no docstring,
as chaves privadas, as trocas por âncora e os blocos que o `text()` do SQLAlchemy lê sem bind.
"""

from __future__ import annotations

import importlib.util
import re
import types
from pathlib import Path

from sqlalchemy import text

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = "20261120_03_desafios_gerados_automaticamente.py"

FUNCOES_DE_SERVIDOR = (
    "fn_desafios_auto_config()",
    "fn_desafios_auto_candidatos(integer, bigint[])",
    "fn_desafios_auto_reivindicar(integer, integer, bigint[])",
    "fn_desafios_auto_contexto(bigint)",
    "fn_desafios_auto_falhou(bigint, text, integer)",
    "fn_missao_desafio_gravar(bigint, jsonb, jsonb, text[], text, uuid)",
    "fn_missao_desafio_registrar_auto(bigint, jsonb)",
)

CHAVES = (
    "desafios_auto_ligado",
    "desafios_auto_por_passada",
    "desafios_auto_intervalo_seg",
    "desafios_auto_por_dia",
    "desafios_auto_carencia_min",
)


def _modulo(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_auto_{nome[:11]}", VERSOES / nome)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _mod():
    return _modulo(ARQUIVO)


def _comandos(fn: str = "upgrade") -> list[str]:
    mod = _mod()
    coletados: list[str] = []
    mod.op = types.SimpleNamespace(execute=lambda sql: coletados.append(str(sql)))
    getattr(mod, fn)()
    return coletados


def _compacto(sql: str) -> str:
    return re.sub(r"\s+", " ", sql)


def test_revisao_encadeada() -> None:
    mod = _mod()
    assert mod.revision == "20261120_03"
    assert mod.down_revision == "20261120_02"


def test_funcoes_de_servidor_sem_grant_de_cliente() -> None:
    sql = _compacto("\n".join(_comandos()))
    for assinatura in FUNCOES_DE_SERVIDOR:
        assert re.search(
            rf"REVOKE ALL ON FUNCTION public\.{re.escape(assinatura)} FROM PUBLIC, anon, authenticated;", sql
        ), assinatura
        for grant in re.findall(rf"GRANT EXECUTE ON FUNCTION public\.{re.escape(assinatura)} TO ([^;]+);", sql):
            assert "authenticated" not in grant and "anon" not in grant, (assinatura, grant)
        assert f"public.{assinatura.split('(')[0]}(" in sql


def test_regra_da_fonte_num_lugar_so() -> None:
    """Item 3 da revisão: o candidato e o contexto leem a fonte pela mesma função."""
    mod = _mod()
    sql = _compacto("\n".join(_comandos()))
    for assinatura in ("fn_desafios_auto_texto_da_fonte(jsonb)", "fn_desafios_auto_fonte_serve(text, jsonb, text)"):
        assert f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon, authenticated;" in sql
        assert f"GRANT EXECUTE ON FUNCTION public.{assinatura}" not in sql
    assert "public.fn_desafios_auto_fonte_serve(f.visibilidade, f.metadata, f.descricao)" in mod.CANDIDATOS
    assert "public.fn_desafios_auto_texto_da_fonte(f.metadata)" in mod.CONTEXTO
    assert "'texto_extraido'" not in mod.CONTEXTO and "'texto_extraido'" not in mod.CANDIDATOS


def test_reordenar_nao_e_edicao() -> None:
    gatilho = _compacto(_mod().COLUNA_ATUALIZADO_EM)
    assert "(to_jsonb(NEW) - 'atualizado_em' - 'ordem') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'atualizado_em' - 'ordem')" in gatilho


def test_decidir_e_criar_com_grant_authenticated() -> None:
    sql = _compacto("\n".join(_comandos()))
    for assinatura in ("missao_desafio_decidir(uuid, boolean, text)", "missao_desafio_criar(bigint, jsonb, jsonb, text[])"):
        assert f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon;" in sql
        assert f"GRANT EXECUTE ON FUNCTION public.{assinatura} TO authenticated;" in sql
    assert "SECURITY DEFINER SET search_path = public, pg_temp" in sql


def test_toda_funcao_nova_e_definer_com_search_path() -> None:
    sql = _compacto("\n".join(_comandos()))
    for nome in [a.split("(")[0] for a in FUNCOES_DE_SERVIDOR] + ["missao_desafio_decidir", "missao_desafio_criar"]:
        inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
        cabeca = sql[inicio : sql.index("$function$", inicio)]
        assert "SECURITY DEFINER" in cabeca and "SET search_path = public, pg_temp" in cabeca, nome


def test_tabela_sem_policy_dita_no_docstring() -> None:
    mod = _mod()
    doc = _compacto(mod.__doc__ or "")
    assert "desafios_auto_tentativas" in doc
    assert "sem policy" in doc
    sql = "\n".join(_comandos())
    assert "CREATE POLICY" not in sql.split("desafios_auto_tentativas", 1)[1].split("CREATE OR REPLACE FUNCTION", 1)[0]
    assert "ENABLE ROW LEVEL SECURITY" in sql


def test_chaves_privadas() -> None:
    sql = _compacto("\n".join(_comandos()))
    for chave in CHAVES:
        achada = re.search(rf"\('{chave}', '[^']*', '([^']+)', (true|false)\)", sql)
        assert achada, chave
        assert achada.group(2) == "false", chave
        assert achada.group(1).strip(), chave
    assert "ON CONFLICT (chave) DO NOTHING" in sql


def test_missao_ia_pedir_filtra_desafio() -> None:
    mod = _mod()
    antes = mod.M20.PEDIR + mod.CONTEXTO_IA_ANTES
    depois = mod.PEDIR_IA + mod.CONTEXTO_IA
    assert depois.count("desafio IS NULL") == antes.count("desafio IS NULL") + 2
    sql = "\n".join(_comandos())
    assert mod.PEDIR_IA in sql and mod.CONTEXTO_IA in sql


def test_trava_igual_nas_duas_funcoes() -> None:
    mod = _mod()
    trava = "pg_advisory_xact_lock(hashtextextended('missao_desafio:' || p_conteudo_id::text, 0))"
    assert trava in mod.CRIAR
    assert trava in mod.REGISTRAR_AUTO
    # Na RPC do botão, a trava vem depois da posse e antes da gravação.
    criar = mod.CRIAR
    assert criar.index("app_classes_do_professor") < criar.index(trava) < criar.index("fn_missao_desafio_gravar(")


def test_gravar_sai_do_texto_da_rpc() -> None:
    mod = _mod()
    gravar = _compacto(mod.GRAVAR)
    assert "app_classes_do_professor" not in gravar
    assert "auth.uid()" not in gravar
    assert "'ia', p_aprovacao" in gravar
    assert "p_criado_por" in gravar
    assert "PERFORM set_config('app.desafio_gravando', 'on', true);" in gravar
    assert "GRANT" not in gravar


def test_backfill_sem_update() -> None:
    """O backfill não pode passar por UPDATE: os gatilhos de `conteudos` regerariam todas as turmas."""
    mod = _mod()
    coluna = _compacto(mod.COLUNA_ATUALIZADO_EM)
    assert "UPDATE public.conteudos" not in coluna
    assert "USING COALESCE(created_at, now())" in coluna


def test_sem_param_com_dois_pontos() -> None:
    for fn in ("upgrade", "downgrade"):
        for bloco in _comandos(fn):
            assert text(bloco).compile().params == {}, bloco[:200]


def test_downgrade_desfaz() -> None:
    mod = _mod()
    sql = "\n".join(_comandos("downgrade"))
    assert mod.M17_03.RPC in sql
    assert mod.M20.PEDIR in sql
    assert mod.CONTEXTO_IA_ANTES in sql
    assert mod.M23.TIPOS in sql
    for objeto in (
        "DROP TABLE IF EXISTS public.desafios_auto_tentativas",
        "DROP FUNCTION IF EXISTS public.missao_desafio_decidir(uuid, boolean, text)",
        "DROP FUNCTION IF EXISTS public.fn_missao_desafio_gravar(bigint, jsonb, jsonb, text[], text, uuid)",
        "DROP TRIGGER IF EXISTS trg_conteudos_atualizado_em ON public.conteudos",
        "DROP COLUMN IF EXISTS atualizado_em",
        "DELETE FROM public.professor_notificacoes WHERE tipo = 'desafio_para_aprovar'",
    ):
        assert objeto in sql, objeto
    # A RPC do botão volta antes de a função interna sair.
    assert sql.index(mod.M17_03.RPC) < sql.index("DROP FUNCTION IF EXISTS public.fn_missao_desafio_gravar")
