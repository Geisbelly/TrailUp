"""Estrutura da `20261124_01`: exemplos na turma de demonstração da pesquisa.

O que dá para travar sem banco: a preparação só ganha a chamada da semeadura; cada exemplo roda na
própria subtransação e as claims voltam no fim; nenhum exemplo paga aluno; o critério de cada
missão usa a chave que o avaliador lê; a cruzadinha cabe na grade e as letras cruzadas batem.
"""

import importlib.util
import json
import re
from pathlib import Path

from sqlalchemy import text

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
_ARQUIVO = _VERSOES / "20261124_01_pesquisa_exemplos_na_turma.py"

# Copiado de frontend/src/components/console/missoes/criterio.ts (CHAVE_DO_ALVO), que copia o avaliador.
CHAVE_DO_ALVO = {
    "minutos_totais": "minutos",
    "dias_seguidos": "dias_seguidos",
    "topicos_concluidos": "minimo",
    "atividades_concluidas": "minimo",
    "acertos_percentual": "percentual",
    "trilha_percentual": "percentual",
}


def _modulo():
    spec = importlib.util.spec_from_file_location("m20261124_01", _ARQUIVO)
    assert spec and spec.loader
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _corpo_preparar(sql: str) -> str:
    return sql.split("CREATE OR REPLACE FUNCTION public.pesquisa_preparar_avaliador")[1].split("$function$;")[0]


def test_preparar_so_ganha_a_semeadura() -> None:
    modulo = _modulo()
    antes = _corpo_preparar(modulo.M02.SQL)
    depois = _corpo_preparar(modulo.PREPARAR)
    assert "v_exemplos := public.fn_pesquisa_semear_exemplos(v_nova, p_professor);" in depois
    # Falha nos exemplos não desfaz a conta.
    semeia = depois.index("fn_pesquisa_semear_exemplos")
    assert depois.rindex("  BEGIN\n", 0, semeia) < semeia < depois.index("EXCEPTION WHEN OTHERS THEN", semeia)
    # Semeia depois de gravar o avaliador e de a turma ser do professor novo.
    assert depois.index("INSERT INTO public.pesquisa_avaliador") < depois.index("fn_pesquisa_semear_exemplos")
    assert depois.index("SET professor_id = p_professor") < depois.index("fn_pesquisa_semear_exemplos")
    volta = (
        depois.replace("\n  v_exemplos jsonb;", "")
        .replace(modulo._DEPOIS, modulo._ANTES)
    )
    assert volta == antes


def test_downgrade_volta_a_20261123_02() -> None:
    modulo = _modulo()
    assert _corpo_preparar(modulo.DOWNGRADE_SQL) == _corpo_preparar(modulo.M02.SQL)
    assert "DROP FUNCTION IF EXISTS public.fn_pesquisa_semear_exemplos(bigint, uuid);" in modulo.DOWNGRADE_SQL
    assert "DROP COLUMN IF EXISTS exemplos_em" in modulo.DOWNGRADE_SQL


def test_cada_exemplo_na_propria_subtransacao_e_claims_restauradas() -> None:
    sql = _modulo().SEMEAR
    for exemplo in ("missoes", "desafios", "conquistas", "economia", "fundo", "guildas", "evento"):
        assert f"jsonb_build_object('exemplo', '{exemplo}', 'erro', SQLERRM)" in sql, exemplo
    assert sql.count("BEGIN\n") - 1 == sql.count("EXCEPTION WHEN OTHERS THEN")  # o BEGIN da função não tem
    restaura = sql.index("PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);")
    assert restaura > sql.rindex("EXCEPTION WHEN OTHERS THEN")
    assert "PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);" in sql


def test_nenhum_exemplo_paga_aluno_nem_abre_evento() -> None:
    sql = _modulo().SEMEAR
    assert "eventos_aluno" not in sql
    assert "evento_classe_abrir" not in sql
    assert "'Os três primeiros escolhem o tema da próxima revisão.', false, p_professor" in sql


def test_backfill_nao_derruba_a_api() -> None:
    sql = _modulo().BACKFILL
    semeia = sql.index("fn_pesquisa_semear_exemplos")
    assert sql.rindex("BEGIN", 0, semeia) < semeia < sql.index("EXCEPTION WHEN OTHERS THEN", semeia)
    assert "RAISE WARNING" in sql and "RAISE EXCEPTION" not in sql


def test_cliente_nao_semeia() -> None:
    sql = _modulo().SEMEAR
    assert "REVOKE ALL ON FUNCTION public.fn_pesquisa_semear_exemplos(bigint, uuid) FROM PUBLIC, anon, authenticated;" in sql
    assert "GRANT EXECUTE ON FUNCTION public.fn_pesquisa_semear_exemplos(bigint, uuid) TO service_role;" in sql


def test_criterio_das_missoes_usa_a_chave_que_o_avaliador_le() -> None:
    sql = _modulo().SEMEAR
    trecho = sql[sql.index("INSERT INTO public.missoes") : sql.index("v_feitos := v_feitos || 'missoes';")]
    criterios = [json.loads(c) for c in re.findall(r"'(\{\"metrica\"[^']*)'::jsonb", trecho)]
    assert len(criterios) == 5
    for criterio in criterios:
        chave = CHAVE_DO_ALVO[criterio["metrica"]]
        assert isinstance(criterio.get(chave), int) and criterio[chave] > 0, criterio


def test_cruzadinha_cabe_na_grade_e_as_letras_cruzadas_batem() -> None:
    sql = _modulo().SEMEAR
    palavras = re.findall(
        r"'numero', (\d+), 'direcao', '([hv])', 'linha', (\d+), 'coluna', (\d+), 'tamanho', (\d+)", sql
    )
    respostas = dict(re.findall(r"'(\d+[hv])', '([A-Z]+)'", sql))
    assert 4 <= len(palavras) <= 10 and len(respostas) == len(palavras)
    grade: dict[tuple[int, int], str] = {}
    for numero, direcao, linha, coluna, tamanho in palavras:
        palavra = respostas[f"{numero}{direcao}"]
        assert len(palavra) == int(tamanho)
        for i, letra in enumerate(palavra):
            casa = (int(linha) + (i if direcao == "v" else 0), int(coluna) + (i if direcao == "h" else 0))
            assert 0 <= casa[0] < 7 and 0 <= casa[1] < 7
            assert grade.setdefault(casa, letra) == letra, (casa, letra)


def test_sql_sem_bind_acidental() -> None:
    modulo = _modulo()
    for bloco in (modulo.COLUNA, modulo.SEMEAR, modulo.PREPARAR, modulo.BACKFILL, modulo.DOWNGRADE_SQL):
        assert text(bloco).compile().params == {}
