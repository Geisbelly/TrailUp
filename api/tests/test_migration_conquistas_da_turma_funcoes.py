from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

ASSINATURA_SALVAR = "conquista_da_turma_salvar(bigint, bigint, text, text, text, text, jsonb, integer)"


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261016_01:20261016_02", sql=True)
    return output.getvalue()


def _corpo(sql: str, nome: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}")
    fim = sql.index("$function$;", sql.index("$function$", inicio + 60))
    return sql[inicio:fim]


def test_posse_da_turma_antes_de_qualquer_leitura_ou_escrita() -> None:
    sql = _upgrade_sql()

    salvar = _corpo(sql, "conquista_da_turma_salvar")
    assert salvar.index("app_classes_do_professor()") < salvar.index("INSERT INTO public.conquistas")
    assert "NOT EXISTS (" in salvar[salvar.index("IF v_professor IS NULL") :][:200]
    assert "USING ERRCODE = '42501'" in salvar

    alternar = _corpo(sql, "conquista_da_turma_alternar")
    assert alternar.index("app_classes_do_professor()") < alternar.index("UPDATE public.conquistas")

    lista = _corpo(sql, "conquistas_da_turma")
    assert lista.index("app_classes_do_professor()") < lista.index("FROM public.conquistas c")


def test_editar_so_mexe_em_linha_desta_turma_nunca_numa_global() -> None:
    salvar = _corpo(_upgrade_sql(), "conquista_da_turma_salvar")
    assert "WHERE id = p_id AND classe_id = p_classe_id" in salvar


def test_escopo_perfil_e_metrica_sao_conferidos() -> None:
    salvar = _corpo(_upgrade_sql(), "conquista_da_turma_salvar")

    assert "p_escopo NOT IN ('comum', 'perfil')" in salvar
    for perfil in ("seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"):
        assert f"'{perfil}'" in salvar
    assert "Conquista geral não tem perfil." in salvar
    assert "fn_conquista_metrica_suportada(p_criterio ->> 'metrica')" in salvar


def test_pontos_e_teto_vem_do_app_config_com_padrao() -> None:
    salvar = _corpo(_upgrade_sql(), "conquista_da_turma_salvar")

    assert "chave = 'conquista_recompensa_maxima'" in salvar
    assert "chave = 'conquistas_por_turma_max'" in salvar
    assert "100\n  );" in salvar and "20\n    );" in salvar
    # criações simultâneas não furam o teto
    assert "pg_advisory_xact_lock" in salvar
    assert "ERRCODE = '54000'" in salvar


def test_desativar_nao_apaga_e_a_lista_conta_quem_ja_ganhou() -> None:
    sql = _upgrade_sql()
    assert "DELETE FROM public.conquistas" not in sql
    assert "ca.concluida IS TRUE" in _corpo(sql, "conquistas_da_turma")


def test_execute_so_para_autenticado_e_downgrade() -> None:
    sql = _upgrade_sql()
    for assinatura in (ASSINATURA_SALVAR, "conquista_da_turma_alternar(bigint, boolean)", "conquistas_da_turma(bigint)"):
        assert f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon" in sql
        assert f"GRANT EXECUTE ON FUNCTION public.{assinatura} TO authenticated" in sql

    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261016_02:20261016_01", sql=True)
    baixa = output.getvalue()
    assert "DROP FUNCTION IF EXISTS public.conquistas_da_turma(bigint)" in baixa
    assert f"DROP FUNCTION IF EXISTS public.{ASSINATURA_SALVAR}" in baixa


def test_nao_reescreve_o_gatilho_de_avaliacao() -> None:
    assert "trg_eventos_aluno_after_iud" not in _upgrade_sql()
