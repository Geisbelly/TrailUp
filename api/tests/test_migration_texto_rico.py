"""`20261108_03`: a marca de texto rico e a conferência que ela muda (spec A).

Estrutura do SQL offline. O comportamento, com os gatilhos e o papel de verdade, está em
`test_e2e_texto_rico.py`.
"""

import re
from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

REV = "20261108_03"
ANT = "20261108_02"


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), f"{ANT}:{REV}", sql=True)
    return output.getvalue()


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), f"{REV}:{ANT}", sql=True)
    return output.getvalue()


def _funcao(sql: str, nome: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
    delimitador = re.search(r"AS (\$\w*\$)", sql[inicio:]).group(1)
    return sql[inicio : sql.index(f"{delimitador};", inicio)]


def test_marca_nas_tres_tabelas_com_padrao_e_check() -> None:
    sql = _upgrade_sql()
    for tabela in ("questoes", "atividades", "cards"):
        assert (
            f"ALTER TABLE public.{tabela} ADD COLUMN IF NOT EXISTS formato_texto text NOT NULL DEFAULT 'texto'"
            in sql
        )
        assert f"ADD CONSTRAINT {tabela}_formato_texto_check CHECK (formato_texto IN ('texto', 'rico'))" in sql


def test_as_tres_copias_levam_a_marca() -> None:
    sql = _upgrade_sql()
    # duplicar_classe e duplicar_topico copiam atividades, questões e cards; duplicar_atividade,
    # atividades e questões. Todos os INSERT precisam da coluna, e o SELECT tem de trazê-la.
    for tabela, quantos in (("atividades", 3), ("questoes", 3), ("cards", 2)):
        listas = re.findall(rf"INSERT INTO public\.{tabela} \(([^)]*)\)", sql)
        assert len(listas) == quantos, f"{tabela}: {len(listas)} cópias"
        for lista in listas:
            assert "formato_texto" in {c.strip() for c in lista.split(",")}, lista
    assert sql.count("r.metadata, r.formato_texto)") == 2
    assert "v_origem.metadata, v_origem.formato_texto" in sql
    assert sql.count("q.nota_estabelecida, q.formato_texto") == 3
    assert sql.count("k.formato_texto") == 2
    for proibido in ("atividade_aluno", "questao_aluno", "telemetria"):
        assert proibido not in _funcao(sql, "duplicar_classe")


def test_alternativa_rica_e_conferida_pela_posicao() -> None:
    sql = _upgrade_sql()
    confere = _funcao(sql, "fn_questao_confere")
    assert "q.formato_texto" in confere and "v_formato" in confere
    rica = confere.index("v_formato = 'rico'")
    # Antes da comparação por texto normalizado, que empata \ce{CO} com \ce{Co}.
    assert rica < confere.index("v_resp := public.fn_texto_comparavel(p_resposta)")
    assert "public.fn_questao_posicao_rica(v_alts, p_resposta)" in confere
    assert "public.fn_questao_posicao_rica(v_alts, v_gabarito)" in confere
    assert "REVOKE ALL ON FUNCTION public.fn_questao_confere(bigint, text) FROM PUBLIC, anon, authenticated" in sql
    assert "REVOKE ALL ON FUNCTION public.fn_questao_posicao_rica(jsonb, text) FROM PUBLIC, anon, authenticated" in sql


def test_posicao_rica_tenta_texto_exato_antes_de_letra_e_indice() -> None:
    posicao = _funcao(_upgrade_sql(), "fn_questao_posicao_rica")
    exato = posicao.index("btrim(p_alts ->> i) = v_valor")
    letra = posicao.index("'^[a-z]$'")
    indice = posicao.index("'^[0-9]+$'")
    assert exato < letra < indice


def test_lacuna_rica_nao_tira_simbolo_nem_usa_levenshtein() -> None:
    sql = _upgrade_sql()
    comparavel = _funcao(sql, "fn_texto_rico_comparavel")
    assert "lower(" not in comparavel  # \ce{CO} não é \ce{Co}
    confere = _funcao(sql, "fn_questao_confere")
    assert "public.fn_texto_rico_comparavel(x) = public.fn_texto_rico_comparavel(p_resposta)" in confere


def test_gabarito_canonico_tenta_o_texto_exato_antes_do_comparavel() -> None:
    funcao = _funcao(_upgrade_sql(), "fn_questao_gabarito_em_texto")
    exato = funcao.index("IF btrim(p_alts ->> v_i) = v_resp THEN RETURN p_alts ->> v_i;")
    assert exato < funcao.index("v_norm := public.fn_texto_comparavel(v_resp)")
    down = _funcao(_downgrade_sql(), "fn_questao_gabarito_em_texto")
    assert "btrim(p_alts ->> v_i) = v_resp" not in down


def test_downgrade_volta_as_funcoes_e_tira_a_marca() -> None:
    down = _downgrade_sql()
    assert "DROP FUNCTION IF EXISTS public.fn_questao_posicao_rica(jsonb, text)" in down
    assert "DROP FUNCTION IF EXISTS public.fn_texto_rico_comparavel(text)" in down
    for tabela in ("questoes", "atividades", "cards"):
        assert f"ALTER TABLE public.{tabela} DROP COLUMN IF EXISTS formato_texto" in down
    # As funções voltam ao corpo anterior, sem a coluna — e antes de ela sumir.
    assert "formato_texto" not in _funcao(down, "duplicar_classe")
    assert "v_formato" not in _funcao(down, "fn_questao_confere")
    assert down.index("CREATE OR REPLACE FUNCTION public.duplicar_classe(") < down.index(
        "ALTER TABLE public.questoes DROP COLUMN IF EXISTS formato_texto"
    )
