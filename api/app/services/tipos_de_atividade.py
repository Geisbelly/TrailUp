"""Tipos de atividade, num lugar so no lado Python.

`atividades.tipo` era `text` puro -- sem CHECK, sem enum, sem constraint
nenhuma. Quem escreve nessa coluna e o console do professor E a geracao
personalizada, e a geracao tira o valor direto do payload do modelo:

    tipo = str(atividade.get("tipo") or "quiz").strip() or "quiz"

Ou seja, o modelo podia gravar `multipla_escolha`, `dissertativa` ou qualquer
coisa. Nao dava erro -- e esse e o problema. O console decide quais campos
mostrar comparando `tipo` com string literal, entao tipo que nao casa nenhum
ramo vira **formulario vazio, sem aviso**, e a atividade fica ineditavel.

Este modulo normaliza antes de gravar. Com ele, o CHECK da `20260911_07` e
seguro: a geracao nunca manda valor fora da lista, entao a constraint protege
contra escrita nova sem derrubar o pipeline.

A lista espelha `frontend/src/lib/tiposDeAtividade.ts`. Sao dois runtimes
diferentes sem pacote compartilhado -- o mesmo arranjo que o repo ja usa para a
cor-assinatura dos perfis BrainHex. Ao acrescentar um tipo, mexa nos dois E na
constraint.
"""

from __future__ import annotations

# Exatamente o que o CHECK de `atividades_tipo_conhecido` aceita.
TIPOS_DE_ATIVIDADE: tuple[str, ...] = (
    "quiz",
    "true_false",
    "fill_blank",
    "essay",
    "missao",
)

TIPO_PADRAO = "quiz"

TIPO_DE_MISSAO = "missao"

# O vocabulario que chega do modelo e de importacao. `questoes.tipo` usa os
# nomes da direita; `atividades.tipo`, os da esquerda.
_APELIDOS: dict[str, str] = {
    "quiz": "quiz",
    "multipla": "quiz",
    "multipla_escolha": "quiz",
    "multiple_choice": "quiz",
    "true_false": "true_false",
    "truefalse": "true_false",
    "verdadeiro_falso": "true_false",
    "vf": "true_false",
    "fill_blank": "fill_blank",
    "fill_in_the_blank": "fill_blank",
    "lacuna": "fill_blank",
    "completar": "fill_blank",
    "essay": "essay",
    "dissertativa": "essay",
    "dissertacao": "essay",
    "texto": "essay",
    "questao": "essay",
    "missao": "missao",
    "mission": "missao",
}


def normalizar_tipo_de_atividade(valor: object) -> str:
    """Devolve sempre um tipo da lista.

    Cair no padrao e' melhor que gravar o que veio: o console sabe editar
    `quiz`, e nao sabe editar `multipla_escolha` -- ele mostraria formulario
    vazio. Perder a nuance do nome custa menos que uma atividade ineditavel.
    """
    bruto = str(valor or "").strip().lower()
    if not bruto:
        return TIPO_PADRAO
    return _APELIDOS.get(bruto, TIPO_PADRAO)


def eh_missao(valor: object) -> bool:
    return normalizar_tipo_de_atividade(valor) == TIPO_DE_MISSAO
