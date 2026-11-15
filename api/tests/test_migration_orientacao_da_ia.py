"""Estrutura da `20261115_01` (orientação do professor para a IA, por turma).

O que cada papel lê e escreve foi medido num Postgres descartável com o esqueleto de produção
(`test_e2e_orientacao_da_ia.py`). Aqui fica o que não pode regredir no texto.
"""

from __future__ import annotations

import re

from tests import _f5_banco as f5

M = f5.modulo("20261115_01_orientacao_da_ia_por_turma.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def test_encadeia_depois_do_perfil_observado():
    assert M.revision == "20261115_01"
    assert M.down_revision == "20261111_05"


def test_sem_porcentagem_nem_bind():
    assert "%" not in UP and "%" not in DOWN
    assert not re.search(r"(?<!:):[A-Za-z_]", UP)


def test_uma_linha_por_turma_que_sai_com_ela():
    assert "classe_id     bigint      PRIMARY KEY REFERENCES public.classe(id) ON DELETE CASCADE" in UP
    assert UP.count(f"<= {M.LIMITE})") == 2


def test_rls_ligada_e_policy_no_mesmo_arquivo():
    # Tabela nova nasce fechada (event trigger `ensure_rls`): sem policy, o console leria vazio.
    assert "ENABLE ROW LEVEL SECURITY" in UP
    for verbo, sufixo in (("SELECT", "sel"), ("INSERT", "ins"), ("UPDATE", "upd"), ("DELETE", "del")):
        assert f"CREATE POLICY classe_orientacao_ia_professor_{sufixo} ON public.classe_orientacao_ia\n  FOR {verbo} TO authenticated" in UP


def test_so_o_dono_da_turma_e_nunca_o_aluno():
    assert "REVOKE ALL ON public.classe_orientacao_ia FROM anon;" in UP
    assert UP.count("SELECT public.app_classes_do_professor()") == 5
    assert "app_classes_do_aluno" not in UP
    assert "app_minhas_classes" not in UP


def test_sem_coluna_de_pessoa():
    # Coluna de pessoa obrigaria `retencao_politica` (test_retencao_politica.py).
    corpo = UP[UP.index("CREATE TABLE") : UP.index(");")]
    assert not re.search(r"\b(professor_id|criado_por|user_id|aluno_id|atualizado_por)\b", corpo)


def test_downgrade_desfaz_tudo():
    assert "DROP TABLE IF EXISTS public.classe_orientacao_ia;" in DOWN
    assert "DROP FUNCTION IF EXISTS public.fn_classe_orientacao_ia_tocar();" in DOWN
