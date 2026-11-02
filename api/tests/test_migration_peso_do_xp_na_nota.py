"""Estrutura da `20261102_13` (peso do XP na nota final, #143). O comportamento está no e2e."""

from __future__ import annotations

import re

from tests import _f5_banco as f5

M = f5.modulo("20261102_13_peso_do_xp_na_nota.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def _corpo(nome: str) -> str:
    inicio = UP.index(f"FUNCTION public.{nome}(")
    return UP[inicio : UP.index("$fn$;", inicio)]


def test_encadeia_depois_da_20261102_12():
    assert M.revision == "20261102_13"
    assert M.down_revision == "20261102_12"  # KPIs da fila (#817), depois da _11 (#819)


def test_sem_porcentagem():
    # O SQL offline do Alembic dobra `%` e corrompe o plpgsql sem erro.
    assert "%" not in UP
    assert "%" not in DOWN


def test_padrao_zero_nao_muda_nenhuma_nota():
    assert "xp_peso_nota_pct numeric(5,2) NOT NULL DEFAULT 0" in UP
    assert f"CHECK (xp_peso_nota_pct >= 0 AND xp_peso_nota_pct <= {M.PESO_MAXIMO})" in UP
    assert "CHECK (xp_meta_nota > 0)" in UP
    # Sem peso, a função devolve a nota sem ler eventos_aluno.
    corpo = _corpo("fn_nota_final_da_matricula")
    assert corpo.index("IF COALESCE(v_peso, 0) <= 0 THEN RETURN p_nota; END IF;") < corpo.index("fn_xp_da_matricula")


def test_nota_media_nao_muda_de_sentido():
    # A nota com XP é coluna nova; nada aqui reescreve a conta da nota média.
    assert "ADD COLUMN IF NOT EXISTS nota_final numeric" in UP
    assert "trailup_recalcular_nota_classe_aluno" not in UP
    assert 'SET "notaMedia"' not in UP


def test_xp_so_soma_e_sem_nota_nao_vira_nota():
    corpo = _corpo("fn_nota_final")
    assert "WHEN p_nota IS NULL THEN NULL" in corpo
    assert "ELSE GREATEST(\n                  p_nota," in corpo
    # Meta, não o maior XP da turma: a nota de um aluno só depende do XP dele.
    assert "LEAST(GREATEST(COALESCE(p_xp, 0), 0), p_meta) / p_meta" in corpo


def test_xp_e_a_mesma_conta_do_rank_e_do_csv():
    corpo = _corpo("fn_xp_da_matricula")
    assert "GREATEST(COALESCE(sum(ea.valor), 0), 0)" in corpo
    assert "fn_eventos_aluno_resolve_classe_id(ea.tipo, ea.referencia)) = p_classe" in corpo


def test_funcoes_que_escrevem_sao_security_definer_e_fechadas_ao_cliente():
    for nome in (
        "fn_xp_da_matricula",
        "fn_nota_final_da_matricula",
        "fn_recalcular_nota_final",
        "trg_classe_aluno_nota_final",
        "trg_eventos_aluno_nota_final",
        "trg_classe_nota_final",
    ):
        assert "SECURITY DEFINER" in _corpo(nome), nome
        assert "SET search_path TO 'public', 'pg_temp'" in _corpo(nome), nome
    for assinatura in ("fn_xp_da_matricula(uuid, bigint)", "fn_nota_final_da_matricula(uuid, bigint, numeric)",
                       "fn_recalcular_nota_final(uuid, bigint)"):
        assert f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon, authenticated" in UP


def test_gatilho_da_matricula_roda_depois_da_guarda_da_nota():
    # BEFORE na mesma tabela roda em ordem alfabética: a nota final tem de ler a nota já guardada.
    assert "trg_classe_aluno_nota_pelo_banco" < "trg_classe_aluno_z_nota_final"
    assert (
        'BEFORE INSERT OR UPDATE OF "notaMedia", nota_final, aluno_id, classe_id ON public.classe_aluno' in UP
    )


def test_quem_dispara_o_recalculo():
    assert "AFTER INSERT OR DELETE OR UPDATE OF valor, aluno_id, classe_id, tipo, referencia ON public.eventos_aluno" in UP
    assert "AFTER UPDATE OF xp_peso_nota_pct, xp_meta_nota ON public.classe" in UP
    # O evento só custa a conta quando a turma tem peso.
    assert UP.count("c.xp_peso_nota_pct > 0") == 2


def test_csv_ganha_a_nota_final_sem_perder_o_grant():
    assert "DROP FUNCTION IF EXISTS public.professor_notas_da_turma(bigint);\nCREATE FUNCTION" in UP
    assert "  nota_media numeric,\n  nota_final numeric," in UP
    assert "GRANT EXECUTE ON FUNCTION public.professor_notas_da_turma(bigint) TO authenticated, service_role" in UP
    # O downgrade volta ao texto da 20261101_06, sem a coluna.
    assert "nota_final numeric" not in DOWN
    assert "CREATE OR REPLACE FUNCTION public.professor_notas_da_turma(" in DOWN


def test_downgrade_derruba_o_que_o_upgrade_cria():
    for fn in re.findall(r"CREATE OR REPLACE FUNCTION public\.(\w+)\(", UP):
        if fn == "professor_notas_da_turma":
            continue
        assert f"DROP FUNCTION IF EXISTS public.{fn}(" in DOWN
    for gatilho in re.findall(r"CREATE TRIGGER (\w+)", UP):
        assert f"DROP TRIGGER IF EXISTS {gatilho} " in DOWN
    for coluna in ("nota_final", "xp_meta_nota", "xp_peso_nota_pct"):
        assert f"DROP COLUMN IF EXISTS {coluna}" in DOWN
