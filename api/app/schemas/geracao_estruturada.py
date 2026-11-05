"""Forma do que o modelo devolve nas gerações em lote com schema nativo.

O modelo só escreve o que está aqui: campo que faltar deixa de ser gerado, sem erro nenhum. Sem default
de propósito, porque chave com default fica fora de "required" e o modelo pode omiti-la (#761).

Chave dinâmica fica de fora: em `dict[str, X]` o schema não nomeia nenhuma propriedade, e nada obriga o
modelo a preencher. Por isso `countries` é lista aqui e vira mapa no serviço.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

FormatoDoPlano = Literal["markdown", "cards", "audio", "apresentacao"]


class RefreshPolicyGerada(BaseModel):
    mode: Literal["once", "analysis"]
    trigger_actions: list[str]


class PlanoGerado(BaseModel):
    formato_prioritario: FormatoDoPlano
    formatos: list[FormatoDoPlano]
    nivel: Literal["reforco", "equilibrado", "avancado"]
    tom: Literal["encorajador", "neutro", "desafiador"]
    estilo: str
    justificativa: str
    refresh_policy: RefreshPolicyGerada


class CardGerado(BaseModel):
    frente: str
    verso: str
    icone: str
    dificuldade: Literal["facil", "medio", "dificil"]
    xp: int


class CardsGerados(BaseModel):
    cards: list[CardGerado]


class PaletaDoMapa(BaseModel):
    skyTop: str
    skyBottom: str
    sea: str
    seaDeep: str
    route: str
    routeGlow: str
    countryLocked: str
    countryOpen: str
    countryDone: str
    countryCurrent: str
    borderLocked: str
    borderOpen: str
    borderDone: str
    borderCurrent: str
    marker: str
    markerText: str
    textPrimary: str
    textSecondary: str
    panelBg: str
    panelBorder: str


class PaisDoMapa(BaseModel):
    nodeId: str
    topicId: int
    topicTitle: str
    countryName: str
    capitalName: str
    lore: str
    emblem: str
    biome: str


class TemaDoMapaGerado(BaseModel):
    world_name: str
    world_subtitle: str
    world_description: str
    template_id: str
    palette: PaletaDoMapa
    countries: list[PaisDoMapa]
