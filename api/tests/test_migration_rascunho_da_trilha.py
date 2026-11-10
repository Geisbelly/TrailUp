"""Estrutura da `20261110_08` (rascunho da trilha gerada pela IA)."""

from __future__ import annotations

import re

from tests import _f5_banco as f5

M = f5.modulo("20261110_08_rascunho_da_trilha.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def test_encadeia_depois_da_20261110_07():
    assert M.revision == "20261110_08"
    assert M.down_revision == "20261110_07"


def test_sem_porcentagem():
    # O SQL offline do Alembic dobra `%` e corrompe o plpgsql sem erro.
    assert "%" not in UP
    assert "%" not in DOWN


def test_sem_dois_pontos_que_virem_bind():
    # `text()` lê `:palavra` como parâmetro; só o cast `::` pode aparecer.
    assert not re.search(r"(?<!:):[A-Za-z_]", UP)


def test_uma_linha_por_turma_e_some_com_a_turma():
    assert "CONSTRAINT trilha_rascunho_pkey PRIMARY KEY (classe_id)" in UP
    assert "REFERENCES public.classe(id) ON DELETE CASCADE" in UP


def test_tabela_nasce_com_rls_e_policy_do_professor_no_mesmo_commit():
    assert "ALTER TABLE public.trilha_rascunho ENABLE ROW LEVEL SECURITY" in UP
    assert "REVOKE ALL ON public.trilha_rascunho FROM PUBLIC, anon" in UP
    politicas = re.findall(r"CREATE POLICY (\w+) ON public\.trilha_rascunho\s+FOR (\w+) TO (\w+)", UP)
    assert politicas == [("trilha_rascunho_professor_all", "ALL", "authenticated")]
    # Posse pelo helper (evita recursão de RLS), na leitura e na escrita. O aluno não lê.
    assert "USING (classe_id IN (SELECT public.app_classes_do_professor()))" in UP
    assert "WITH CHECK (classe_id IN (SELECT public.app_classes_do_professor()))" in UP
    assert "app_minhas_classes" not in UP


def test_formato_minimo_e_teto_de_tamanho():
    assert "jsonb_typeof(pedido) = 'object'" in UP
    assert "jsonb_typeof(topicos) = 'array'" in UP
    assert f"octet_length(topicos::text) <= {M.TOPICOS_BYTES_MAXIMO}" in UP
    assert f"octet_length(pedido::text) <= {M.PEDIDO_BYTES_MAXIMO}" in UP


def test_carimbo_e_do_gatilho_e_a_turma_nao_muda():
    corpo = UP[UP.index("CREATE OR REPLACE FUNCTION public.fn_trilha_rascunho_carimbo()") :]
    assert "NEW.updated_at := now();" in corpo
    assert "NEW.atualizado_por := auth.uid();" in corpo
    assert "NEW.classe_id := OLD.classe_id;" in corpo
    assert "BEFORE INSERT OR UPDATE ON public.trilha_rascunho" in corpo


def test_downgrade_derruba_o_que_o_upgrade_cria():
    for fn in re.findall(r"CREATE OR REPLACE FUNCTION public\.(\w+)\(", UP):
        assert f"DROP FUNCTION IF EXISTS public.{fn}(" in DOWN
    for gatilho in re.findall(r"CREATE TRIGGER (\w+)", UP):
        assert f"DROP TRIGGER IF EXISTS {gatilho}" in DOWN
    assert "DROP TABLE IF EXISTS public.trilha_rascunho" in DOWN
