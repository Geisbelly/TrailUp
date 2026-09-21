"""A alternativa correta nao pode morar numa posicao fixa.

Medido nesta base antes da `20260921_03`, nas 21 questoes de multipla escolha:
14 com a correta na 1a posicao, 7 na 2a, ZERO na 3a ou 4a. Dava para gabaritar
a trilha sem ler um enunciado.

Depois do backfill: 5 / 8 / 3 / 5.

Os testes aqui guardam o que falha em SILENCIO -- a questao continua
renderizando, o aluno continua respondendo, e so o gabarito fica errado.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

MIGRACAO = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "20260921_03_alternativa_certa_sai_da_posicao_fixa.py"
)


def _sql_da_migracao(funcao: str) -> str:
    arvore = ast.parse(MIGRACAO.read_text(encoding="utf-8"))
    alvo = next(
        n for n in arvore.body if isinstance(n, ast.FunctionDef) and n.name == funcao
    )
    return "\n".join(
        no.args[0].value
        for no in ast.walk(alvo)
        if isinstance(no, ast.Call)
        and getattr(no.func, "attr", "") == "execute"
        and no.args
        and isinstance(no.args[0], ast.Constant)
    )


def test_nenhum_bind_acidental_do_sqlalchemy() -> None:
    """`text()` varre a string CRUA: `:palavra` dentro de literal ou de
    COMENTARIO vira bind parameter e derruba a migracao no banco."""
    sql = _sql_da_migracao("upgrade") + _sql_da_migracao("downgrade")
    achados = sorted(set(re.findall(r"(?<!:):[A-Za-z_]\w*", sql)))
    assert achados == [], f"bind acidental: {achados}"


def test_o_gabarito_e_resolvido_ANTES_de_reordenar() -> None:
    """A ordem das duas linhas e a regra inteira.

    O console grava a LETRA da alternativa (`correct.id` em
    `QuestionsManager.tsx`). Essa letra se refere a ordem que o PROFESSOR viu.
    Resolver depois de reordenar faria a letra apontar para a posicao NOVA --
    ou seja, escolheria outra alternativa como gabarito, em silencio, e a
    questao continuaria parecendo perfeita.
    """
    sql = _sql_da_migracao("upgrade")
    resolve = sql.index("fn_questao_gabarito_em_texto(v_alts, NEW.resposta_correta)")
    reordena = sql.index("fn_questao_alternativas_em_ordem(NEW.id, v_alts)")
    assert resolve < reordena, (
        "reordenar antes de resolver faz a letra do professor apontar para "
        "outra alternativa"
    )


def test_verdadeiro_falso_sai_fora_da_reordenacao() -> None:
    """O par Verdadeiro/Falso tem ordem semantica. Reordenar nao reduz vies
    nenhum (a correta ja e uma das duas) e troca o par de lugar."""
    sql = _sql_da_migracao("upgrade")
    assert "'verdadeiro_falso', 'true_false', 'vf'" in sql.replace('"', "'")
    guarda = sql.index("verdadeiro_falso")
    reordena = sql.index("fn_questao_alternativas_em_ordem(NEW.id, v_alts)")
    assert guarda < reordena, "a saida antecipada tem de vir antes de reordenar"


def test_o_espelho_do_gabarito_ouve_todo_update() -> None:
    """`UPDATE OF resposta_correta` dispara pelas colunas que a INSTRUCAO
    lista, nao pelo que um BEFORE trigger alterou.

    Como o gatilho novo reescreve `resposta_correta` num UPDATE que mexeu so
    em `alternativas`, o espelho nao dispararia e `questao_gabarito` ficaria
    com a letra velha -- apontando para a posicao ANTIGA. Silencioso: a tabela
    continua tendo linha, e a linha continua tendo texto.
    """
    sql = _sql_da_migracao("upgrade")
    assert "AFTER INSERT OR UPDATE ON public.questoes" in sql
    assert "AFTER INSERT OR UPDATE OF resposta_correta" not in sql

    # E o downgrade devolve a forma estreita, senao ele nao desfaz nada.
    volta = _sql_da_migracao("downgrade")
    assert "AFTER INSERT OR UPDATE OF resposta_correta" in volta


def test_a_ancora_fica_no_fim() -> None:
    """"Todas as anteriores" e "nenhuma das alternativas" so fazem sentido na
    ultima posicao: embaralha-las quebra a QUESTAO, nao o vies."""
    sql = _sql_da_migracao("upgrade")
    assert "ORDER BY x.ancora, x.chave" in sql
    for palavra in ("todas", "nenhuma"):
        assert palavra in sql, f"ancora {palavra!r} nao esta na regra"


def test_a_ordem_e_derivada_do_CONTEUDO_para_ser_idempotente() -> None:
    """Uma permutacao aplicada sobre a propria saida embaralha de novo: o
    console le a ordem gravada, edita um texto e grava de volta, e a ordem
    mudaria a cada save. Ordenar por chave derivada do conteudo e idempotente.

    Medido: segunda passada do backfill alterou 0 linhas.
    """
    sql = _sql_da_migracao("upgrade")
    assert "md5(p_questao_id::text || '|' || (t.item #>> '{}'))" in sql
    # `random()` ou `gen_random_uuid()` aqui tornariam a ordem instavel.
    assert "random()" not in sql
    assert "gen_random_uuid()" not in sql


def test_a_migracao_encadeia_no_head_anterior() -> None:
    texto = MIGRACAO.read_text(encoding="utf-8")
    assert 'revision = "20260921_03"' in texto
    assert 'down_revision = "20260921_02"' in texto
