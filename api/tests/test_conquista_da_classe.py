"""Conquista da turma cadastrada pelo professor (#158).

Dois bloqueios de correcao vinham antes da feature, e os dois estao guardados
aqui.

**O gatilho nao filtrava por turma.** `trg_eventos_aluno_after_iud` avalia o
aluno contra `SELECT c.* FROM conquistas c` -- todas. Enquanto tudo era global
isso estava certo; com conquista de turma, o aluno destravaria a de outra turma.

**A unicidade de `tipo` era global.** Os dois indices unicos ignoram a turma,
entao a conquista do professor colidiria com a global de mesmo tipo e duas
turmas nunca poderiam ter conquistas do mesmo tipo. Descoberto pelo CONFERE da
propria migracao, nao por leitura.

Medido em producao depois da correcao, com o bloco desfeito por excecao: duas
turmas com o MESMO tipo foram aceitas, o aluno destravou a da turma dele e NAO
a da outra, e as 27 globais ficaram intactas.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]


def _offline_alembic_config(output_buffer: StringIO | None = None) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output_buffer)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    return config


def _sql() -> str:
    output = StringIO()
    migrations.command.upgrade(
        _offline_alembic_config(output), "20260911_05:20260911_06", sql=True
    )
    return output.getvalue()


def _sql_downgrade() -> str:
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260911_06:20260911_05", sql=True
    )
    return output.getvalue()


def test_o_filtro_de_classe_entra_com_parenteses() -> None:
    """E' a diferenca entre filtrar e nao filtrar. O predicado de perfil e uma
    DISJUNCAO (`A OR B`); acrescentar `AND C` no fim faz o Postgres ler
    `A OR (B AND C)`, porque `AND` liga mais forte -- e conquista comum de outra
    turma continuaria passando pelo primeiro ramo, calada."""
    sql = _sql()

    assert "AND (" in sql
    assert "c.classe_id IS NULL" in sql
    assert "o filtro entrou sem os parenteses" in sql


def test_o_filtro_le_as_turmas_do_aluno() -> None:
    sql = _sql()

    assert "FROM public.classe_aluno ca" in sql
    assert "WHERE ca.aluno_id = v_aluno_id" in sql


def test_a_substituicao_exige_ancora_unica() -> None:
    """Substituir a primeira de varias ocorrencias deixaria o resto da funcao
    incoerente sem erro nenhum."""
    sql = _sql()

    assert "esperado exatamente 1" in sql


def test_a_sentinela_e_especifica_da_mudanca() -> None:
    """Uma generica -- procurar por `classe_id`, por exemplo -- casaria com
    outra coisa e a migracao nao faria nada, calada. Ja custou caro neste repo."""
    sql = _sql()

    assert "-- FILTRO DE CLASSE (20260911_06)" in sql


def test_a_unicidade_de_tipo_passa_a_ser_por_turma() -> None:
    """Sem isto a feature trava no primeiro cadastro: a conquista do professor
    colide com a global de mesmo tipo."""
    sql = _sql()

    assert "CREATE UNIQUE INDEX conquistas_tipo_comum_uq" in sql
    assert "ON public.conquistas (COALESCE(classe_id, -1), tipo)" in sql
    assert (
        "ON public.conquistas (COALESCE(classe_id, -1), perfil_alvo, tipo)" in sql
    )


def test_o_coalesce_preserva_a_unicidade_das_globais() -> None:
    """`UNIQUE (classe_id, tipo)` cru deixaria duas globais com o mesmo tipo
    passarem: em indice unico, NULL nao colide com NULL. O `-1` devolve as
    globais a um espaco unico."""
    sql = _sql()

    assert "(classe_id, tipo)" not in sql.replace("(COALESCE(classe_id, -1), tipo)", "")


def test_o_professor_nao_cria_conquista_global() -> None:
    """`classe_id IN app_classes_do_professor()` exclui NULL por construcao --
    e o que impede uma medalha de turma virar medalha de todo mundo."""
    sql = _sql()

    assert "CREATE POLICY conquistas_professor_ins" in sql
    assert "WITH CHECK (classe_id IN (SELECT public.app_classes_do_professor()))" in sql


def test_o_update_do_professor_tambem_e_checado_na_saida() -> None:
    """So `USING` deixaria o professor MOVER a conquista dele para uma classe
    que nao e sua."""
    sql = _sql()

    trecho = sql[sql.index("conquistas_professor_upd") :]
    trecho = trecho[: trecho.index("conquistas_professor_del")]
    assert "USING" in trecho
    assert "WITH CHECK" in trecho


def test_a_leitura_deixa_de_ser_aberta() -> None:
    """Era `USING (true)`, certo enquanto tudo era global. Com conquista de
    turma, o aluno veria na biblioteca medalha de turma que nao e dele."""
    sql = _sql()

    assert "classe_id IN (SELECT public.app_minhas_classes())" in sql
    assert "classe_id IN (SELECT public.app_classes_do_professor())" in sql


def test_a_recompensa_tem_teto_e_ele_vem_de_app_config() -> None:
    """`pontos_recompensa` vira evento creditado: o valor vai direto ao razao
    sem passar por `fn_pontos_do_evento`. Um zero a mais no cadastro vale mais
    que o semestre inteiro."""
    sql = _sql()

    assert "conquista_recompensa_maxima" in sql
    assert "passa do teto de" in sql
    assert "recompensa nao pode ser negativa" in sql


def test_o_teto_nao_alcanca_as_globais() -> None:
    """Global e semeada por migracao, por quem desenvolve. O teto existe para o
    que vem de formulario."""
    sql = _sql()

    assert "IF NEW.classe_id IS NULL THEN" in sql


def test_a_conquista_de_turma_nao_sobrevive_a_turma() -> None:
    sql = _sql()

    assert "REFERENCES public.classe(id) ON DELETE CASCADE" in sql


def test_a_sonda_prova_o_isolamento_entre_turmas() -> None:
    """Verificacao de COMPORTAMENTO: cria conquista de outra turma, dispara um
    evento do aluno e confere que ele NAO destravou. Dentro de um bloco com
    EXCEPTION (savepoint), entao nada do que ela inseriu fica."""
    sql = _sql()

    assert "o aluno destravou conquista de turma a qual nao pertence" in sql
    assert "RAISE EXCEPTION USING ERRCODE = 'ZZ001'" in sql
    assert "EXCEPTION WHEN SQLSTATE 'ZZ001' THEN" in sql


def test_a_sonda_usa_tipo_proprio() -> None:
    """Com `tipo = 'simples'` a sonda colidia com a conquista global de id 1 --
    e foi assim que a unicidade global apareceu."""
    sql = _sql()

    assert "'sonda_20260911_06'" in sql


def test_o_downgrade_limpa_antes_de_recriar_o_indice_global() -> None:
    """Duas turmas com o mesmo tipo impediriam recriar o indice unico sem
    turma, e o downgrade falharia no meio."""
    sql = _sql_downgrade()

    limpeza = sql.index("DELETE FROM public.conquistas WHERE classe_id IS NOT NULL")
    indice = sql.index("CREATE UNIQUE INDEX conquistas_tipo_comum_uq")
    assert limpeza < indice


def test_o_downgrade_tira_o_filtro_junto_com_a_coluna() -> None:
    """Sem a coluna, `c.classe_id` nao existe e o gatilho quebraria na proxima
    avaliacao."""
    sql = _sql_downgrade()

    assert "DROP COLUMN IF EXISTS classe_id" in sql
    assert "-- FILTRO DE CLASSE (20260911_06)" in sql


def test_nenhum_literal_vira_bind_parameter() -> None:
    import re

    for sql in (_sql(), _sql_downgrade()):
        assert not re.findall(r"(?<!:):[A-Za-z_]\w*", sql)


def test_o_sql_renderizado_nao_tem_por_cento() -> None:
    assert "%" not in _sql()
    assert "%" not in _sql_downgrade()
