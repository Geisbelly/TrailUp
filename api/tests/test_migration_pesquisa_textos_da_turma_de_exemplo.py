"""Estrutura da `20261124_03`: textos que o avaliador lê na turma de demonstração.

Os desafios de exemplo levavam o nome do primeiro conteúdo da trilha ("O que é um algoritmo") e
perguntavam sobre laço; a Economia mostrava "Valor definido na fase 4", "(cumulativo, #136)" e nomes
sem acento. Medido logada como avaliadora em produção, em 24/11.
"""

import importlib.util
from pathlib import Path

from sqlalchemy import text

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo():
    caminho = _VERSOES / "20261124_03_pesquisa_textos_da_turma_de_exemplo.py"
    spec = importlib.util.spec_from_file_location("m20261124_03", caminho)
    assert spec and spec.loader
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_encadeia_na_02() -> None:
    modulo = _modulo()
    assert modulo.revision == "20261124_03"
    assert modulo.down_revision == "20261124_02"


def test_semeadura_so_ganha_a_troca_de_titulo() -> None:
    modulo = _modulo()
    sql = modulo.SEMEAR
    inicio = sql.index("-- O título sai do assunto do desafio")
    fim = sql.index("v_feitos := array_append(v_feitos, 'desafios');")
    assert sql[:inicio].rstrip() + "\n" + sql[fim - 6 :] == modulo.M02.SEMEAR
    assert modulo.TITULO_LOGICA in sql[inicio:fim]
    assert modulo.TITULO_CRUZADINHA in sql[inicio:fim]


def test_titulo_muda_dentro_do_bloco_dos_desafios() -> None:
    sql = _modulo().SEMEAR
    troca = sql.index("UPDATE public.missoes m")
    bloco = sql.rindex("BEGIN", 0, troca)
    assert bloco < sql.index("fn_missao_desafio_gravar") < troca
    assert troca < sql.index("EXCEPTION WHEN OTHERS THEN", troca)


def test_so_renomeia_o_desafio_da_semeadura() -> None:
    modulo = _modulo()
    for sql in (modulo.SEMEAR, modulo.BACKFILL):
        assert modulo.MARCA_LOGICA in sql and modulo.MARCA_CRUZADINHA in sql
        assert "m.desafio IS NOT NULL" in sql
    # A marca tem de existir no desafio que a semeadura grava.
    assert modulo.MARCA_LOGICA in modulo.M02.SEMEAR
    assert modulo.MARCA_CRUZADINHA in modulo.M02.SEMEAR


def test_backfill_nao_derruba_a_api() -> None:
    sql = _modulo().BACKFILL
    troca = sql.index("UPDATE public.missoes m")
    assert sql.rindex("BEGIN", 0, troca) < troca < sql.index("EXCEPTION WHEN OTHERS THEN", troca)
    assert "RAISE WARNING" in sql and "RAISE EXCEPTION" not in sql


def test_descricoes_sem_nota_interna_e_com_acento() -> None:
    modulo = _modulo()
    for antigo, novo in modulo.DESCRICOES.values():
        assert antigo != novo
        assert "fase" not in novo and "#" not in novo
    novos = {tipo: novo for tipo, (_, novo) in modulo.DESCRICOES.items()}
    assert novos["atividade_acertada"] == "Acertou uma questão"
    assert novos["missao_concluida"] == "Concluiu uma missão."


def test_descricao_so_troca_o_texto_esperado() -> None:
    modulo = _modulo()
    sobe, desce = modulo._atualizar(1), modulo._atualizar(0)
    assert "e.descricao = v.antigo" in sobe
    assert "('atividade_acertada', 'Acertou uma questao', 'Acertou uma questão')" in sobe
    assert "('atividade_acertada', 'Acertou uma questão', 'Acertou uma questao')" in desce


def test_sql_sem_bind_acidental() -> None:
    modulo = _modulo()
    for bloco in (modulo.SEMEAR, modulo.BACKFILL, modulo._atualizar(1), modulo._atualizar(0)):
        assert text(bloco).compile().params == {}
