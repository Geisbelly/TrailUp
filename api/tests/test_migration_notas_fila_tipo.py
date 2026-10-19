from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261018_04:20261018_05", sql=True)
    return output.getvalue()


def test_reconhece_os_apelidos_de_dissertativa_e_o_tipo_em_branco() -> None:
    sql = _upgrade_sql()

    assert "CREATE OR REPLACE FUNCTION public.notas_fila(p_classe_id bigint)" in sql
    # O filtro literal de 20261016_04 deixava fora o que o console chama de dissertação.
    assert "AND a.tipo = 'essay'" not in sql
    for apelido in ("'essay'", "'dissertativa'", "'questao'", "'texto'"):
        assert apelido in sql, f"{apelido} deveria entrar na fila"
    # `saveActivity` grava `tipo: params.tipo || null`: atividade sem formato escolhido fica NULL,
    # e o editor a mostra como "Dissertação". A única atividade em produção hoje é essa.
    # `nullif(btrim(...), '')` põe vazio e só-espaços no mesmo caminho do NULL, como no frontend.
    assert "lower(coalesce(nullif(btrim(a.tipo), ''), 'essay')) IN (" in sql


def test_nao_espelha_o_fallback_do_frontend() -> None:
    """`formatoDaQuestao` cai em dissertação para QUALQUER tipo desconhecido, porque a tela
    precisa desenhar algo. Copiar isso para o SQL mandaria missão e vídeo para a fila de
    correção do professor. A divergência é deliberada — este teste a trava."""
    sql = _upgrade_sql()

    assert "'missao'" not in sql
    assert "'video'" not in sql
    # Lista fechada, não um ELSE que aceita o resto.
    assert "IN ('essay', 'dissertativa', 'questao', 'texto')" in sql


def test_mantem_a_checagem_de_posse_e_a_exposicao() -> None:
    sql = _upgrade_sql()

    posse = sql.index("FROM public.app_classes_do_professor()")
    assert "NOT EXISTS (" in sql[posse - 200 : posse]
    assert posse < sql.index("FROM public.classe_aluno ca")
    assert "USING ERRCODE = '42501'" in sql
    assert "SET search_path = public, pg_temp" in sql
    assert "REVOKE ALL ON FUNCTION public.notas_fila(bigint) FROM PUBLIC, anon;" in sql
    assert "GRANT EXECUTE ON FUNCTION public.notas_fila(bigint) TO authenticated;" in sql


def test_downgrade_volta_ao_filtro_literal() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261018_05:20261018_04", sql=True)
    sql = output.getvalue()

    assert "AND a.tipo = 'essay'" in sql
    assert "nullif(btrim(a.tipo)" not in sql
