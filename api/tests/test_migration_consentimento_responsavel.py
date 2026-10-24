"""Estrutura da `20261024_02` (consentimento do responsavel, #195) pelo SQL offline.

O comportamento das RPCs contra um Postgres de verdade esta em
`test_e2e_consentimento_responsavel.py` (roda com banco local); aqui fica o que da para
provar sem banco: a cadeia, o texto renderizado e o ACL que ele declara.
"""

from __future__ import annotations

import importlib.util
import re
from io import StringIO
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = API_ROOT.parent
ARQUIVO = API_ROOT / "alembic" / "versions" / "20261024_02_consentimento_do_responsavel.py"


def _modulo():
    spec = importlib.util.spec_from_file_location("m_20261024_02", ARQUIVO)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M = _modulo()


def _config(output: StringIO | None = None) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = "postgresql://user:password@localhost:5432/trailup"
    return config


def _render(intervalo: str, *, downgrade: bool = False) -> str:
    output = StringIO()
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(_config(output), intervalo, sql=True)
    return output.getvalue()


def _norm(texto: str) -> str:
    return " ".join(texto.split())


UP = _norm(_render("20261024_01:20261024_02"))
DOWN = _norm(_render("20261024_02:20261024_01", downgrade=True))


def test_encadeada_na_head_anterior_e_e_a_unica_head() -> None:
    assert M.revision == "20261024_02"
    assert M.down_revision == "20261024_01"
    script = ScriptDirectory.from_config(_config())
    heads = script.get_heads()
    assert len(heads) == 1
    # migrations posteriores (ex.: 20261024_03, retencao #195) podem vir depois; 02 tem de estar na cadeia
    assert "20261024_02" in {rev.revision for rev in script.walk_revisions("base", heads[0])}


def test_data_de_nascimento_fora_de_alunos() -> None:
    # `alunos` e legivel pelos colegas de turma; a data do menor nao pode estar la.
    assert "ALTER TABLE public.alunos" not in UP
    assert "CREATE TABLE IF NOT EXISTS public.aluno_nascimento" in UP
    assert "REVOKE ALL ON public.aluno_nascimento FROM PUBLIC, anon, authenticated" in UP
    assert "GRANT SELECT ON public.aluno_nascimento TO authenticated" in UP
    assert "CREATE POLICY aluno_nascimento_aluno_sel ON public.aluno_nascimento FOR SELECT TO authenticated USING (aluno_id = auth.uid())" in UP


def test_consentimento_responsavel_so_cresce() -> None:
    assert "CREATE TABLE IF NOT EXISTS public.consentimento_responsavel" in UP
    assert "CONSTRAINT consentimento_responsavel_metodo CHECK (metodo IN ('aparelho', 'papel'))" in UP
    assert "BEFORE INSERT ON public.consentimento_responsavel" in UP
    assert "EXECUTE FUNCTION public.trg_consentimento_carimbo_do_servidor()" in UP
    for tabela in ("consentimento_responsavel", "consentimento_pesquisa", "aluno_nascimento"):
        assert f"ALTER TABLE public.{tabela} ENABLE ROW LEVEL SECURITY" in UP
        # o cliente nunca tem INSERT/UPDATE/DELETE: so le o proprio, escreve por RPC
        assert not re.search(rf"GRANT [^;]*(INSERT|UPDATE|DELETE)[^;]* ON public\.{tabela} TO authenticated", UP)
        assert not re.search(rf"CREATE POLICY \w+ ON public\.{tabela} FOR (INSERT|UPDATE|DELETE|ALL)", UP)


def test_finalidades_inclui_pesquisa_com_versao_propria() -> None:
    assert M.FINALIDADES == ("camera", "telemetria", "emocional", "mentor", "pesquisa")
    assert "pesquisa_versao text" in UP
    assert f"SELECT '{M.VERSAO_PESQUISA}'::text" in UP
    assert f"SELECT '{M.VERSAO_RESPONSAVEL}'::text" in UP
    assert M.VERSAO_PESQUISA != M.VERSAO_RESPONSAVEL


def test_toda_funcao_definer_tem_search_path_fixo() -> None:
    blocos = re.findall(r"CREATE OR REPLACE FUNCTION (public\.\w+)\(.*?\$function\$", UP)
    assert len(blocos) == len(M.FUNCOES_INTERNAS) + len(M.FUNCOES_DO_CLIENTE) + 2
    for trecho in re.findall(r"CREATE OR REPLACE FUNCTION .*?AS \$function\$", UP):
        assert "SET search_path TO 'public', 'pg_temp'" in trecho, trecho[:80]


def test_acl_das_funcoes() -> None:
    for assinatura in M.FUNCOES_INTERNAS:
        assert f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon, authenticated" in UP
        assert f"GRANT EXECUTE ON FUNCTION {assinatura} TO service_role" in UP
        assert f"GRANT EXECUTE ON FUNCTION {assinatura} TO authenticated" not in UP
    for assinatura in M.FUNCOES_DO_CLIENTE:
        assert f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon" in UP
        assert f"GRANT EXECUTE ON FUNCTION {assinatura} TO authenticated, service_role" in UP


def test_rpcs_do_cliente_partem_da_sessao() -> None:
    for nome in (
        "aluno_minha_finalidade_permitida",
        "aluno_meu_consentimento",
        "aluno_registrar_data_nascimento",
        "responsavel_registrar_no_aparelho",
        "aluno_registrar_consentimento_pesquisa",
        "professor_registrar_termo_papel",
        "professor_termos_da_turma",
    ):
        corpo = re.search(rf"FUNCTION public\.{nome}\(.*?\$function\$(.*?)\$function\$", UP).group(1)
        assert "auth.uid()" in corpo, nome


def test_professor_so_registra_aluno_das_proprias_turmas() -> None:
    corpo = re.search(
        r"FUNCTION public\.professor_registrar_termo_papel\(.*?\$function\$(.*?)\$function\$", UP
    ).group(1)
    assert "c.professor_id = v_uid" in corpo
    assert "aluno fora das suas turmas" in corpo


def test_view_de_pesquisa_so_para_service_role() -> None:
    assert "CREATE OR REPLACE VIEW public.vw_alunos_pesquisa_elegiveis WITH (security_invoker = on)" in UP
    assert "REVOKE ALL ON public.vw_alunos_pesquisa_elegiveis FROM PUBLIC, anon, authenticated" in UP
    assert "GRANT SELECT ON public.vw_alunos_pesquisa_elegiveis TO service_role" in UP


def test_policies_restritivas_na_telemetria() -> None:
    for tabela in M.TABELAS_DE_TELEMETRIA:
        assert (
            f"CREATE POLICY {tabela}_consentimento_ins ON public.{tabela} AS RESTRICTIVE FOR INSERT TO authenticated"
            " WITH CHECK (public.aluno_minha_finalidade_permitida('telemetria'))"
        ) in UP
        assert f"CREATE POLICY {tabela}_consentimento_upd ON public.{tabela} AS RESTRICTIVE FOR UPDATE" in UP


def test_downgrade_mantem_as_tabelas_de_prova() -> None:
    assert "DROP TABLE" not in DOWN
    assert "DROP FUNCTION IF EXISTS public.aluno_modo_restrito(uuid)" in DOWN
    assert "DROP VIEW IF EXISTS public.vw_alunos_pesquisa_elegiveis" in DOWN


def test_render_nao_tem_bind_nem_percent_duplicado() -> None:
    assert "%%" not in UP
    # `:palavra` viraria bind parameter no text() do SQLAlchemy
    assert not re.search(r"(?<![:\w]):[a-z_]+\b", UP.replace("::", "")), "bind acidental"


@pytest.mark.parametrize(
    "arquivo",
    [
        ("mobile", "src", "utils", "consentimentoResponsavel.ts"),
        ("frontend", "src", "components", "console", "turmas", "termosResponsavel.ts"),
    ],
    ids=["mobile", "console-web"],
)
def test_versoes_espelhadas_nos_clientes(arquivo: tuple[str, ...]) -> None:
    # O banco recusa versao diferente da vigente; cliente com string velha
    # nao consegue registrar aceite nenhum.
    ts = REPO_ROOT.joinpath(*arquivo).read_text(encoding="utf-8")
    assert f'"{M.VERSAO_RESPONSAVEL}"' in ts
    assert f'"{M.VERSAO_PESQUISA}"' in ts
