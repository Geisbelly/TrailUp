"""Catalogo de arte do combate: preset de boss -> URLs de imagem.

Por que isto existe como tabela em Python, e nao como campo livre do prompt:

`IAEnemyVisualSpec` tem `avatarUrl`, `backgroundUrl`, `frameUrl` e `effectUrl`,
e `IABattlePanel` **renderiza os quatro** (linhas 209, 230, 231 e 277). O prompt
que os alimenta emitia `null` nos quatro desde sempre, entao o painel de batalha
sempre desenhou o inimigo por preset procedural. Faltava conteudo e faltava quem
preenchesse a URL.

Quem preenche e o Python, nunca o modelo. Um LLM que "escolhe uma URL" inventa
caminho que retorna 404, e `Image` do React Native falha calado: o aluno ve um
buraco onde deveria estar o boss. Aqui o modelo recebe um **catalogo fechado** e
qualquer valor fora dele e descartado em `sanear_visual` antes de virar patch.

Base de servico: `settings.arte_base_url` (R2 publico ou CDN). **Nao** use o
Supabase Storage para isto: o projeto esta em overage de egress e Storage e
99,9% dele (ver `docs/superpowers/specs/2026-08-29-r2-gateway-design.md`).
Sem a base configurada, as quatro URLs continuam `None` — que e exatamente o
comportamento de hoje, e nao um meio-termo quebrado.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

# Preset usado quando o perfil do aluno nao cair em nenhum dos sete.
# E o mesmo default de `_PROFILE_PRESETS` em behavioral_personalization.
PRESET_PADRAO = "duelist"

FRAME_PADRAO = "combate/moldura/padrao.png"


@dataclass(frozen=True)
class ArteDeCombate:
    """As chaves relativas de um preset. Chave vazia vira URL `None`."""

    avatar: str
    fundo: str
    moldura: str = FRAME_PADRAO
    efeito: str = ""


# Mapeamento preset -> peca, derivado da pasta de identidade no Drive.
# A coluna "por que" nao e enfeite: cada preset tem um `visual_hook` em
# `_PROFILE_PRESETS`, e a peca foi escolhida contra ele, nao por sorteio.
#
#   sentinel  Survivor    "olhar frio, postura de cacada"        cristal azul profundo
#   duelist   Achiever    "coroa quebrada, postura impecavel"    cristal claro simetrico
#   arena     Conqueror   "energia vulcanica, imponencia"        mascara vulcanica
#   oracle    Mastermind  "estrategista sombrio, calculo cruel"  formacao roxa
#   veil      Seeker      "manto etereo, brilho corrompido"      conjurador teal
#   rift      Daredevil   "energia explosiva, caos"              hidra de fogo
#   parade    Socialiser  "capa cerimonial, presenca dominadora" rei de capa
_ARTE_POR_PRESET: dict[str, ArteDeCombate] = {
    "sentinel": ArteDeCombate(
        avatar="combate/boss/sentinel.png",
        fundo="combate/cenario/nuvem.jpg",
    ),
    "duelist": ArteDeCombate(
        avatar="combate/boss/duelist.png",
        fundo="combate/cenario/nuvem.jpg",
    ),
    "arena": ArteDeCombate(
        avatar="combate/boss/arena.png",
        fundo="combate/cenario/campina-escura.jpg",
    ),
    "oracle": ArteDeCombate(
        avatar="combate/boss/oracle.png",
        fundo="combate/cenario/campina.jpg",
    ),
    "veil": ArteDeCombate(
        avatar="combate/boss/veil.png",
        fundo="combate/cenario/campina.jpg",
    ),
    "rift": ArteDeCombate(
        avatar="combate/boss/rift.png",
        fundo="combate/cenario/campina-escura.jpg",
    ),
    "parade": ArteDeCombate(
        avatar="combate/boss/parade.png",
        fundo="combate/cenario/campina.jpg",
    ),
}

PRESETS_CONHECIDOS: tuple[str, ...] = tuple(sorted(_ARTE_POR_PRESET))


def base_de_arte(settings: Any) -> str | None:
    """Base publica da arte, sem barra final. `None` quando nao configurada."""
    bruto = str(getattr(settings, "arte_base_url", None) or "").strip()
    if not bruto:
        return None
    base = bruto.rstrip("/")
    if not base.startswith("http://") and not base.startswith("https://"):
        return None
    return base


def montar_url(base: str | None, chave: str | None) -> str | None:
    """Junta base + chave relativa, escapando segmento a segmento."""
    if not base:
        return None
    caminho = str(chave or "").strip().lstrip("/")
    if not caminho:
        return None
    segmentos = [quote(parte, safe="") for parte in caminho.split("/") if parte]
    if not segmentos:
        return None
    return f"{base}/{'/'.join(segmentos)}"


def arte_do_preset(preset: str | None) -> ArteDeCombate:
    chave = str(preset or "").strip().lower()
    return _ARTE_POR_PRESET.get(chave) or _ARTE_POR_PRESET[PRESET_PADRAO]


def urls_do_preset(settings: Any, preset: str | None) -> dict[str, str | None]:
    """As quatro URLs de um preset, em snake_case (o shape do modelo Python).

    Todas `None` quando `arte_base_url` nao esta configurada.
    """
    base = base_de_arte(settings)
    arte = arte_do_preset(preset)
    return {
        "avatar_url": montar_url(base, arte.avatar),
        "background_url": montar_url(base, arte.fundo),
        "frame_url": montar_url(base, arte.moldura),
        "effect_url": montar_url(base, arte.efeito),
    }


def urls_permitidas(settings: Any) -> set[str]:
    """Toda URL que o catalogo consegue produzir. Vazio sem base configurada."""
    base = base_de_arte(settings)
    if not base:
        return set()
    permitidas: set[str] = set()
    for arte in _ARTE_POR_PRESET.values():
        for chave in (arte.avatar, arte.fundo, arte.moldura, arte.efeito):
            url = montar_url(base, chave)
            if url:
                permitidas.add(url)
    return permitidas


def catalogo_para_prompt(settings: Any) -> dict[str, Any]:
    """O que vai no payload do LLM: lista fechada, por preset.

    O modelo pode trocar a cena de um preset por outra da lista — o que e util
    quando o conteudo pede outro clima —, mas nao pode inventar caminho.
    """
    base = base_de_arte(settings)
    if not base:
        return {"disponivel": False, "presets": {}, "regra": "emita null nas quatro URLs"}

    presets: dict[str, dict[str, str | None]] = {}
    for nome in PRESETS_CONHECIDOS:
        arte = _ARTE_POR_PRESET[nome]
        presets[nome] = {
            "avatarUrl": montar_url(base, arte.avatar),
            "backgroundUrl": montar_url(base, arte.fundo),
            "frameUrl": montar_url(base, arte.moldura),
            "effectUrl": montar_url(base, arte.efeito),
        }
    return {
        "disponivel": True,
        "presets": presets,
        "regra": (
            "Copie as quatro URLs do preset escolhido. Nunca escreva uma URL que "
            "nao esteja nesta lista: ela e descartada."
        ),
    }


_CAMPOS_DE_URL = ("avatarUrl", "backgroundUrl", "frameUrl", "effectUrl")


def sanear_visual(visual: Any, settings: Any) -> dict[str, Any] | None:
    """Troca por default do preset toda URL fora do catalogo.

    Opera sobre o dict camelCase (a forma do patch serializado). Devolve o dict
    saneado, ou `None` quando a entrada nao e dict — o chamador decide.
    """
    if not isinstance(visual, dict):
        return None

    permitidas = urls_permitidas(settings)
    preset = visual.get("preset")
    padrao = urls_do_preset(settings, preset)
    equivalente = {
        "avatarUrl": padrao["avatar_url"],
        "backgroundUrl": padrao["background_url"],
        "frameUrl": padrao["frame_url"],
        "effectUrl": padrao["effect_url"],
    }

    saneado = dict(visual)
    for campo in _CAMPOS_DE_URL:
        valor = saneado.get(campo)
        if valor is None:
            # Sem base configurada o default tambem e None: nada muda.
            saneado[campo] = equivalente[campo]
            continue
        texto = str(valor).strip()
        if texto in permitidas:
            saneado[campo] = texto
            continue
        saneado[campo] = equivalente[campo]
    return saneado


def _sanear_lista_de_features(features: Any, settings: Any) -> None:
    """Percorre uma lista de features do patch saneando todo `enemy.visual`."""
    if not isinstance(features, list):
        return
    for feature in features:
        if not isinstance(feature, dict):
            continue
        batalha = feature.get("battle")
        if not isinstance(batalha, dict):
            continue
        inimigo = batalha.get("enemy")
        if not isinstance(inimigo, dict):
            continue
        saneado = sanear_visual(inimigo.get("visual"), settings)
        if saneado is not None:
            inimigo["visual"] = saneado
            # O mobile le `visual?.avatarUrl ?? enemy.avatarUrl`: os dois
            # precisam do mesmo tratamento, senao o descartado volta pelo lado.
            inimigo["avatarUrl"] = saneado.get("avatarUrl")
            continue

        # Inimigo sem `visual` ainda tem o avatarUrl de fora, e o mobile o le.
        # Sem este ramo, a URL inventada escapava justamente pelo caminho mais
        # provavel de um modelo que resolveu abreviar o contrato.
        if "avatarUrl" in inimigo:
            avatar = inimigo.get("avatarUrl")
            texto = str(avatar).strip() if avatar is not None else ""
            if texto not in urls_permitidas(settings):
                inimigo["avatarUrl"] = urls_do_preset(settings, None)["avatar_url"]
            else:
                inimigo["avatarUrl"] = texto


def sanear_patch(patch: Any, settings: Any) -> Any:
    """Saneia as URLs de arte de um patch ja serializado (camelCase).

    Roda DEPOIS da validacao do modelo e ANTES de o patch chegar ao app. O
    `items` e um dict de listas; `session` e `topic` sao listas.
    """
    if not isinstance(patch, dict):
        return patch

    for escopo in ("session", "topic"):
        _sanear_lista_de_features(patch.get(escopo), settings)

    itens = patch.get("items")
    if isinstance(itens, dict):
        for features in itens.values():
            _sanear_lista_de_features(features, settings)

    return patch
