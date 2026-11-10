"""Estrutura da `20261110_09` (o professor aprova o material personalizado)."""

from __future__ import annotations

import re

from sqlalchemy import text

from tests import _f5_banco as f5

M = f5.modulo("20261110_09_aprovacao_do_personalizado.py")
UP_PARTES = f5.sql_de(M)
DOWN_PARTES = f5.sql_de(M, "downgrade")
UP = "\n".join(UP_PARTES)
DOWN = "\n".join(DOWN_PARTES)


def test_encadeia_depois_da_20261110_08():
    assert M.revision == "20261110_09"
    assert M.down_revision == "20261110_08"


def test_sem_porcentagem():
    # O SQL offline do Alembic dobra `%` e corrompe o plpgsql sem erro.
    assert "%" not in UP
    assert "%" not in DOWN


def test_nenhum_bloco_vira_parametro_do_text():
    # `op.execute` passa por `text()`: `:palavra` vira bind e o SQL quebra só na hora de rodar.
    for bloco in UP_PARTES + DOWN_PARTES:
        assert text(bloco).compile().params == {}


def test_nasce_pendente_daqui_em_diante():
    assert "ALTER COLUMN aprovacao SET DEFAULT 'pendente'" in UP
    assert "CHECK (aprovacao IN ('pendente', 'aprovado', 'recusado'))" in UP
    corpo = UP[UP.index("FUNCTION public.fn_conteudo_personalizado_aprovacao()") :]
    insert = corpo[corpo.index("IF TG_OP = 'INSERT' THEN") : corpo.index("RETURN NEW;")]
    assert "NEW.aprovacao := 'pendente';" in insert
    assert "BEFORE INSERT OR UPDATE ON public.conteudo_personalizado" in corpo


def test_legado_e_decisao_explicita():
    assert isinstance(M.LEGADO_APROVADO, bool)
    esperado = "aprovado" if M.LEGADO_APROVADO else "pendente"
    assert f"ADD COLUMN IF NOT EXISTS aprovacao text NOT NULL DEFAULT '{esperado}'" in UP


def test_mudar_material_volta_para_pendente_mas_controle_do_worker_nao():
    corpo = UP[UP.index("FUNCTION public.fn_conteudo_personalizado_aprovacao()") :]
    assert "fn_personalizacao_sem_controle(NEW.materiais)" in corpo
    assert "fn_personalizacao_sem_controle(NEW.plano)" in corpo
    assert "NEW.source_hash IS DISTINCT FROM OLD.source_hash" in corpo
    assert "NEW.conteudo_versao := OLD.conteudo_versao + 1;" in corpo
    assert "left(e.chave, 1) <> '_'" in UP
    # ai_patch é a adequação leve por aluno, não o material.
    assert "ai_patch" not in corpo[: corpo.index("$fn$;")]


def test_so_o_professor_dono_decide_e_o_carimbo_e_do_banco():
    corpo = UP[UP.index("FUNCTION public.fn_conteudo_personalizado_aprovacao()") :]
    assert "c.professor_id = v_uid" in corpo
    assert "NEW.aprovacao := OLD.aprovacao;" in corpo
    assert "NEW.aprovacao_por := v_uid;" in corpo
    assert "NEW.aprovacao_em := now();" in corpo


def test_rpc_confere_posse_antes_de_ler_e_a_versao_vista():
    corpo = UP[UP.index("FUNCTION public.personalizacao_decidir(") :]
    assert "SECURITY DEFINER" in corpo
    assert "app_classes_do_professor()" in corpo
    assert "NOT IN (SELECT" not in corpo
    posse = corpo.index("Material nao encontrado nas suas turmas.")
    trava = corpo.index("FOR UPDATE")
    versao = corpo.index("cp.conteudo_versao <> (e.item ->> 'versao')::integer")
    assert posse < trava < versao
    assert "ERRCODE = '40001'" in corpo
    assert "REVOKE ALL ON FUNCTION public.personalizacao_decidir(jsonb, text, text) FROM PUBLIC, anon" in UP
    assert "GRANT EXECUTE ON FUNCTION public.personalizacao_decidir(jsonb, text, text) TO authenticated" in UP


def test_rls_restritiva_no_registro_e_nos_cards():
    politicas = re.findall(r"CREATE POLICY (\w+) ON public\.(\w+)\s+AS RESTRICTIVE FOR SELECT TO authenticated", UP)
    assert politicas == [
        ("conteudo_personalizado_aprovado_sel", "conteudo_personalizado"),
        ("cards_personalizados_aprovado_sel", "cards_personalizados"),
    ]
    assert "aprovacao = 'aprovado'\n    OR classe_id IN (SELECT public.app_classes_do_professor())" in UP
    # O helper dos cards lê com a RLS de quem pergunta: como DEFINER, qualquer sessão saberia
    # se há material aprovado em qualquer turma.
    helper = UP[UP.index("FUNCTION public.app_personalizacao_aprovada(") :]
    helper = helper[: helper.index("$fn$;")]
    assert "SECURITY INVOKER" in helper
    assert "SECURITY DEFINER" not in helper
    # As permissivas de sempre não são tocadas: a restritiva compõe com elas e com outras frentes.
    assert "DROP POLICY IF EXISTS aluno_classe_conteudo_personalizado_sel" not in UP
    assert "DROP POLICY IF EXISTS professor_all_conteudo_personalizado" not in UP


def test_progresso_so_conta_material_aprovado():
    novo = M.percurso_novo()
    assert novo.count("cp.aprovacao='aprovado'") == 2
    assert novo in UP
    assert M.PERCURSO_ORIGINAL in DOWN


def test_aviso_de_material_novo_so_com_aprovado():
    assert "AFTER INSERT OR UPDATE OF status, aprovacao ON public.conteudo_personalizado" in UP
    assert "AND NEW.aprovacao = 'aprovado'" in UP
    assert "AND cp.aprovacao = 'aprovado'" in M.aviso_novo()
    assert "AFTER INSERT OR UPDATE OF status ON public.conteudo_personalizado" in DOWN


def test_downgrade_derruba_o_que_o_upgrade_cria():
    for fn in re.findall(r"CREATE OR REPLACE FUNCTION public\.(\w+)\(", UP):
        if fn in {"trailup_progresso_percurso", "notificacoes_novo_material_produzir"}:
            continue  # voltam ao corpo anterior, não somem
        assert f"DROP FUNCTION IF EXISTS public.{fn}(" in DOWN
    for policy in re.findall(r"CREATE POLICY (\w+)", UP):
        assert f"DROP POLICY IF EXISTS {policy}" in DOWN
    assert "DROP TRIGGER IF EXISTS trg_conteudo_personalizado_aprovacao" in DOWN
    for coluna in ("aprovacao", "aprovacao_por", "aprovacao_em", "aprovacao_motivo", "conteudo_versao"):
        assert f"DROP COLUMN IF EXISTS {coluna}" in DOWN
