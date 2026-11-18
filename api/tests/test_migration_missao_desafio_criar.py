"""`20261117_03`: `missao_desafio_criar` grava o desafio por perfil numa transação (estrutura da migration).

O comportamento é medido no e2e (`test_e2e_missao_desafio_criar.py`, banco local). Aqui fica o que tem
de valer mesmo sem banco: a cadeia de âncoras, a assinatura, os GRANTs, o sinal e o downgrade.
"""

from __future__ import annotations

import importlib.util
import re
import types
from pathlib import Path

from sqlalchemy import text

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = "20261117_03_missao_desafio_criar.py"


def _modulo(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_criar_{nome[:11]}", VERSOES / nome)
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


def _sql(fn: str = "upgrade") -> str:
    return "\n".join(_comandos(fn))


def _compacto(sql: str) -> str:
    return re.sub(r"\s+", " ", sql)


def _rpc() -> str:
    return _mod().RPC


def test_assinatura_definer_e_grant() -> None:
    sql = _compacto(_sql())
    assert (
        "CREATE OR REPLACE FUNCTION public.missao_desafio_criar( p_conteudo_id bigint, p_desafio jsonb,"
        " p_resposta jsonb, p_perfis text[])"
    ) in sql
    assert "RETURNS TABLE (missao_id bigint, perfil_alvo text, desafio_grupo uuid)" in sql
    assert "SECURITY DEFINER SET search_path = public, pg_temp" in sql
    assert (
        "REVOKE ALL ON FUNCTION public.missao_desafio_criar(bigint, jsonb, jsonb, text[]) FROM PUBLIC, anon;"
        in sql
    )
    assert "GRANT EXECUTE ON FUNCTION public.missao_desafio_criar(bigint, jsonb, jsonb, text[]) TO authenticated;" in sql


def test_posse_antes_de_ler() -> None:
    rpc = _compacto(_rpc())
    posse = rpc.index("IF NOT EXISTS ( SELECT 1 FROM public.conteudos c JOIN public.topicos t ON t.id = c.topico_id")
    assert "t.classe_id IN (SELECT public.app_classes_do_professor())" in rpc[posse : posse + 300]
    assert "ERRCODE = '42501'" in rpc[posse : posse + 500]
    # Nada lê o conteúdo (nem valida) antes da posse.
    assert rpc.index("SELECT t.classe_id, btrim(c.titulo)") > posse
    assert " NOT IN (SELECT public.app_classes_do_professor())" not in rpc


def test_sinal_ligado_so_em_volta_da_escrita() -> None:
    """Carried da Tarefa 2: o sinal liga antes dos INSERTs, volta a vazio depois e também no EXCEPTION."""
    rpc = _rpc()
    liga = rpc.index("PERFORM set_config('app.desafio_gravando', 'on', true);")
    insere = rpc.index("INSERT INTO public.missoes")
    gabarito = rpc.index("INSERT INTO public.missao_desafio_gabarito")
    desliga = rpc.index("PERFORM set_config('app.desafio_gravando', '', true);")
    excecao = rpc.index("EXCEPTION WHEN OTHERS THEN")
    assert liga < insere < gabarito < desliga < excecao
    depois = _compacto(rpc[excecao:])
    assert depois.startswith("EXCEPTION WHEN OTHERS THEN PERFORM set_config('app.desafio_gravando', '', true); RAISE;")
    assert rpc.count("set_config('app.desafio_gravando', 'on', true)") == 1


def test_recompensa_presa_ao_desafio() -> None:
    sql = _compacto(_sql())
    assert "ADD CONSTRAINT missoes_desafio_recompensa" in sql
    assert "WHEN desafio IS NULL THEN recompensa_tipo NOT IN ('desafio_logica', 'desafio_cruzadinha')" in sql
    assert "ELSE recompensa_tipo = 'desafio_' || (desafio->>'tipo')" in sql


def test_guarda_congela_a_recompensa_do_desafio() -> None:
    mod = _mod()
    t2 = _modulo("20261117_02_desafio_na_missao.py")
    # A âncora existe uma vez no texto que a 20261117_02 deixa.
    for antes, _ in mod.TROCAS_GUARDA:
        assert t2.GUARDA.count(antes) == 1
    g = _compacto(mod.GUARDA)
    bloco = g[g.index("IF OLD.desafio IS NOT NULL THEN") :]
    bloco = bloco[: bloco.index("END IF;")]
    assert "NEW.recompensa_tipo := OLD.recompensa_tipo;" in bloco
    # O resto da guarda é o da 20261117_02.
    assert mod.GUARDA.replace("        NEW.recompensa_tipo := OLD.recompensa_tipo;\n", "", 1) == t2.GUARDA


def test_perfil_unico_no_grupo() -> None:
    sql = _compacto(_sql())
    assert (
        "CREATE UNIQUE INDEX IF NOT EXISTS missoes_desafio_grupo_perfil_uq ON public.missoes (desafio_grupo, perfil_alvo)"
        " WHERE desafio_grupo IS NOT NULL" in sql
    )


def test_desafio_exige_perfil() -> None:
    sql = _compacto(_sql())
    assert "ADD CONSTRAINT missoes_desafio_tem_perfil CHECK (desafio IS NULL OR perfil_alvo IS NOT NULL)" in sql


def test_logica_compara_pela_normalizacao() -> None:
    mod = _mod()
    rpc = _rpc()
    # Uma forma só de comparar: nenhuma cópia solta da normalização na RPC.
    assert "regexp_replace" not in rpc
    assert rpc.count("public.fn_missao_desafio_normalizar(") == 7
    aux = _compacto(mod.AUXILIARES)
    assert "CREATE OR REPLACE FUNCTION public.fn_missao_desafio_normalizar(p_texto text) RETURNS text LANGUAGE sql IMMUTABLE" in aux
    assert "btrim(regexp_replace(lower(translate(p_texto, " in aux
    assert "unaccent" not in mod.AUXILIARES
    # A grade e a lógica usam a mesma tabela de acentos.
    assert aux.count(f"'{mod.ACENTOS_DE}', '{mod.ACENTOS_PARA}'") == 2
    assert len(mod.ACENTOS_DE) == len(mod.ACENTOS_PARA)
    # Não está em índice, então o cliente fica sem EXECUTE.
    assert "REVOKE ALL ON FUNCTION public.fn_missao_desafio_normalizar(text) FROM PUBLIC, anon, authenticated;" in aux
    assert "fn_missao_desafio_normalizar" not in _mod().ESTRUTURA


def test_desafio_fora_do_log_da_ia() -> None:
    mod = _mod()
    t20 = _modulo("20261102_20_missoes_sugeridas_pela_ia.py")
    assert mod.GATILHO_LOG_ANTES in t20.LOG
    assert "WHEN (NEW.desafio IS NULL)" in mod.GATILHO_LOG
    assert "CREATE TRIGGER trg_missoes_ia_log" in mod.GATILHO_LOG
    assert mod.GATILHO_LOG in _sql()
    # A função do log não muda.
    assert "CREATE OR REPLACE FUNCTION public.fn_missoes_ia_log" not in _sql()


def test_tentativa_exige_missao_e_tem_indice() -> None:
    sql = _compacto(_sql())
    assert "ALTER TABLE public.missao_desafio_tentativa ALTER COLUMN missao_id SET NOT NULL" in sql
    assert (
        "CREATE INDEX IF NOT EXISTS missao_desafio_tentativa_missao_idx ON public.missao_desafio_tentativa (missao_id)"
        in sql
    )


def test_missao_nasce_aprovada_da_ia() -> None:
    rpc = _compacto(_rpc())
    assert "'ia', 'aprovada', 'aluno', 'secundaria'" in rpc
    assert "jsonb_build_object('metrica', 'desafio')" in rpc
    assert "'desafio_' || v_tipo" in rpc
    assert "'Desafio de lógica: '" in rpc and "'Cruzadinha: '" in rpc
    assert "left(" in rpc and ", 120)" in rpc


def test_nenhum_bind_escondido() -> None:
    """`text()` lê `:palavra` como parâmetro; nenhum comando da migration pode ter um."""
    for fn in ("upgrade", "downgrade"):
        for comando in _comandos(fn):
            assert text(comando).compile().params == {}, comando[:120]


def test_downgrade_desfaz() -> None:
    mod = _mod()
    sql = _sql("downgrade")
    assert "DROP FUNCTION IF EXISTS public.missao_desafio_criar(bigint, jsonb, jsonb, text[]);" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_missao_desafio_letras(text);" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_missao_desafio_normalizar(text);" in sql
    assert "DROP CONSTRAINT IF EXISTS missoes_desafio_tem_perfil" in sql
    assert mod.GATILHO_LOG_ANTES in sql
    assert "DROP FUNCTION IF EXISTS public.fn_missao_desafio_inteiro(jsonb);" in sql
    assert "DROP CONSTRAINT IF EXISTS missoes_desafio_recompensa" in sql
    assert "DROP INDEX IF EXISTS public.missoes_desafio_grupo_perfil_uq" in sql
    assert "DROP INDEX IF EXISTS public.missao_desafio_tentativa_missao_idx" in sql
    assert "ALTER COLUMN missao_id DROP NOT NULL" in sql
    assert mod.M17_02.GUARDA in sql
