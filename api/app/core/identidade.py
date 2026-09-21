"""Identificador de dono: a fronteira entre "sem dono" e a string 'None'.

A base por perfil e' (classe x topico x conteudo x perfil) e **nao tem dono**:
`aluno_id` e' NULL. Em Python isso e' `None`, e `str(None)` devolve a string
`'None'` -- quatro caracteres que **nao** sao nulos e que atravessam qualquer
guarda escrita como `if x is None`.

Foi exatamente assim que a geracao do personalizado parou. Medido em producao,
268 alvos com a mesma falha:

    asyncpg.exceptions.DataError: invalid input for query argument $1:
    'None' (invalid UUID 'None': length must be between 32..36 characters, got 4)
    [parameters: ('None',)]

A guarda `if aluno_id is None` ja existia no consumidor desde `e4d50ae` e nao
adiantou: quem chamava ja tinha convertido o nulo em texto antes. Guarda de
identidade so vale se o valor **chegar** nulo.

Por isso esta funcao e' o unico conversor autorizado: ela e' o lugar onde a
decisao "isto tem dono?" mora, e ela trata o texto degenerado como ausencia --
nao como identificador. `'None'`, `'null'`, `'undefined'` e vazio nunca foram
UUID de ninguem; aceita-los adia a falha para a borda do banco, longe de onde
o erro foi cometido.
"""

from __future__ import annotations

from typing import Any

# Texto que alguma camada produziu ao serializar uma ausencia. Nenhum deles e'
# UUID valido, entao aceita-los so troca um erro claro por um estouro tardio.
_AUSENCIAS = {"", "none", "null", "undefined", "nan"}


def identificador_de_dono(valor: Any) -> str | None:
    """Devolve o id como texto, ou `None` quando nao ha dono.

    Aceita o que vier de uma linha do banco (UUID, str, None) e devolve sempre
    `str | None` -- nunca a string `'None'`.
    """
    if valor is None:
        return None
    texto = str(valor).strip()
    if texto.lower() in _AUSENCIAS:
        return None
    return texto


def dono_de(linha: Any, chave: str = "aluno_id") -> str | None:
    """`identificador_de_dono` aplicado a uma linha (dict ou mapping).

    Existe para que ninguem precise escrever `str(linha["aluno_id"])` de novo:
    e' esse padrao, e nao um valor especifico, que reintroduz o defeito.
    """
    if linha is None:
        return None
    try:
        return identificador_de_dono(linha.get(chave))
    except AttributeError:
        return identificador_de_dono(linha[chave])
