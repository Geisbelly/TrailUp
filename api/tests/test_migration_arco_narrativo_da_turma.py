"""Estrutura da `20261102_16` (arco narrativo da turma, #145). O comportamento está no e2e."""

from __future__ import annotations

import re

from tests import _f5_banco as f5

M = f5.modulo("20261102_16_arco_narrativo_da_turma.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def test_encadeia_depois_da_20261102_15():
    assert M.revision == "20261102_16"
    assert M.down_revision == "20261102_15"


def test_sem_porcentagem():
    # O SQL offline do Alembic dobra `%` e corrompe o plpgsql sem erro.
    assert "%" not in UP
    assert "%" not in DOWN


def test_tabela_nasce_com_rls_e_policy_do_professor_no_mesmo_commit():
    assert "ALTER TABLE public.classe_arco_narrativo ENABLE ROW LEVEL SECURITY" in UP
    assert "REVOKE ALL ON public.classe_arco_narrativo FROM PUBLIC, anon" in UP
    politicas = re.findall(r"CREATE POLICY (\w+) ON public\.classe_arco_narrativo\s+FOR (\w+) TO (\w+)", UP)
    assert politicas == [("classe_arco_narrativo_professor_all", "ALL", "authenticated")]
    # Posse pelo helper (evita recursão de RLS), na leitura e na escrita. O aluno não lê.
    assert "USING (classe_id IN (SELECT public.app_classes_do_professor()))" in UP
    assert "WITH CHECK (classe_id IN (SELECT public.app_classes_do_professor()))" in UP
    assert "app_minhas_classes" not in UP
    assert "app_classes_do_aluno" not in UP


def test_teto_do_texto_bate_com_o_do_microservice():
    assert f"CHECK (char_length(btrim(texto)) BETWEEN 1 AND {M.TEXTO_MAXIMO})" in UP
    validador = (f5.AQUI.parents[1] / "microservice" / "src" / "lib" / "validators.ts").read_text(encoding="utf-8")
    assert f"MAX_CLASS_STORY_ARC_CHARS = {M.TEXTO_MAXIMO};" in validador


def test_gatilho_enfileira_class_delta_da_turma_inteira():
    corpo = UP[UP.index("CREATE OR REPLACE FUNCTION public.fn_enqueue_arco_narrativo_job()") :]
    assert "SECURITY DEFINER" in corpo
    assert "SET search_path TO 'public', 'pg_temp'" in corpo
    # Mesmo portão de geração manual do editor de trilha.
    assert "IF v_geracao_auto IS NOT NULL AND NOT v_geracao_auto THEN" in corpo
    # Coalescência só com job pendente, com a linha travada.
    assert "AND j.status = 'pending'" in corpo
    assert "FOR UPDATE;" in corpo
    # O arco vale para o tópico inteiro.
    assert "'conteudo_ids', '[]'::jsonb" in corpo
    # Repete o predicado do índice parcial, e deduplica o conteúdo NULL que o índice não pega.
    assert "WHERE media_kind IS NULL AND aluno_id IS NULL" in corpo
    assert "x.conteudo_id IS NOT DISTINCT FROM e.conteudo_id" in corpo
    # Fila quebrada não derruba o save do professor.
    assert "EXCEPTION\n  WHEN OTHERS THEN" in corpo
    assert "AFTER INSERT OR UPDATE OF texto OR DELETE ON public.classe_arco_narrativo" in UP


def test_cliente_nao_chama_a_funcao_da_fila():
    assert "REVOKE ALL ON FUNCTION public.fn_enqueue_arco_narrativo_job() FROM PUBLIC, anon, authenticated" in UP


def test_downgrade_derruba_o_que_o_upgrade_cria():
    for fn in re.findall(r"CREATE OR REPLACE FUNCTION public\.(\w+)\(", UP):
        assert f"DROP FUNCTION IF EXISTS public.{fn}(" in DOWN
    for gatilho in re.findall(r"CREATE TRIGGER (\w+)", UP):
        assert f"DROP TRIGGER IF EXISTS {gatilho}" in DOWN
    assert "DROP TABLE IF EXISTS public.classe_arco_narrativo" in DOWN
