"""`20261105_22`: diagnóstico antes do tópico, só o banco (#137, fase 1).

O comportamento (pedir, uma vez só, só antes de começar, retido, validar o que o modelo devolve, corrigir pelo
banco, gabarito fora do cliente, `sem_ia` na terceira falha) foi exercitado num Postgres real (PGlite): ver o PR.
Aqui fica o que dá para travar sem banco.
"""

from io import StringIO

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _sql(sentido: str = "upgrade") -> str:
    output = StringIO()
    if sentido == "upgrade":
        migrations.command.upgrade(_offline_alembic_config(output), "20261105_21:20261105_22", sql=True)
    else:
        migrations.command.downgrade(_offline_alembic_config(output), "20261105_22:20261105_21", sql=True)
    return output.getvalue().replace("%%", "%")


def test_a_arvore_continua_com_uma_cabeca_e_vem_depois_da_21() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261105_22").down_revision == "20261105_21"


def test_o_gabarito_mora_sozinho_e_o_cliente_so_le_a_propria_linha() -> None:
    sql = _sql()
    assert "CREATE TABLE IF NOT EXISTS public.diagnostico_topico_gabarito" in sql
    assert "REVOKE ALL ON public.diagnostico_topico_gabarito FROM PUBLIC, anon, authenticated" in sql
    # Nenhum GRANT para cliente na tabela do gabarito; na outra, só SELECT.
    assert "GRANT SELECT ON public.diagnostico_topico_gabarito" not in sql
    assert "GRANT SELECT ON public.diagnostico_topico TO authenticated" in sql
    assert "GRANT INSERT" not in sql and "GRANT UPDATE" not in sql
    assert "USING (aluno_id = auth.uid())" in sql


def test_turma_retida_pelo_estudo_nao_recebe_nem_ve() -> None:
    sql = _sql()
    assert "public.estudo_personalizacao_retida(v_classe)" in sql
    assert "AS RESTRICTIVE FOR SELECT TO authenticated" in sql
    assert "public.app_classes_retidas_do_aluno()" in sql


def test_o_diagnostico_nao_dispara_geracao_e_nao_toca_no_hash() -> None:
    sql = _sql()
    assert "source_hash" not in sql
    assert "personalizacao_jobs" not in sql and "conteudo_personalizado" not in sql


def test_so_antes_de_comecar_e_uma_vez_por_aluno_e_topico() -> None:
    sql = _sql()
    assert "CONSTRAINT diagnostico_topico_unico UNIQUE (aluno_id, topico_id)" in sql
    assert "COALESCE(ta.percentual_concluido, 0) > 0" in sql
    assert "'ja_iniciado'" in sql


def test_a_cota_estourada_vira_sem_ia_na_terceira_falha_e_nada_bloqueia() -> None:
    sql = _sql()
    assert "WHEN d.tentativas >= 3 THEN 'sem_ia'" in sql
    assert "power(2, d.tentativas)::integer" in sql and "LEAST(120," in sql


def test_as_funcoes_do_worker_so_service_role_e_as_do_aluno_so_authenticated() -> None:
    sql = _sql()
    for fn in ("fn_diagnostico_reivindicar(integer, integer, bigint[])", "fn_diagnostico_contexto(uuid)",
               "fn_diagnostico_registrar(uuid, jsonb)", "fn_diagnostico_falhou(uuid, text)"):
        assert f"REVOKE ALL ON FUNCTION public.{fn} FROM PUBLIC, anon, authenticated" in sql
        assert f"GRANT EXECUTE ON FUNCTION public.{fn} TO service_role" in sql
    for fn in ("diagnostico_pedir(bigint)", "diagnostico_responder(uuid, jsonb)", "diagnostico_dispensar(uuid)"):
        assert f"REVOKE ALL ON FUNCTION public.{fn} FROM PUBLIC, anon" in sql
        assert f"GRANT EXECUTE ON FUNCTION public.{fn} TO authenticated" in sql


def test_a_retencao_esta_registrada_e_o_downgrade_remove_tudo() -> None:
    assert "INSERT INTO public.retencao_politica" in _sql()
    down = _sql("downgrade")
    assert down.index("DROP TABLE IF EXISTS public.diagnostico_topico_gabarito") < down.index(
        "DROP TABLE IF EXISTS public.diagnostico_topico;"
    )
    assert "DELETE FROM public.retencao_politica WHERE tabela = 'diagnostico_topico'" in down


def test_o_worker_respeita_a_lista_de_turmas_do_652() -> None:
    sql = _sql()
    assert "p_classe_ids bigint[] DEFAULT NULL" in sql
    assert "(p_classe_ids IS NULL OR d.classe_id = ANY (p_classe_ids))" in sql
