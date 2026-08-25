"""Traduz telemetria em sinais por formato, no formato que o motor espera.

``revisar_ordem_material`` pede ``{formato: {skimming, leitura_lenta, acertos,
percentual, active_sec, tempo_min}}``. A telemetria não fala em "formato": fala
em ``material_key`` (``material:content:12:markdown:3``), ``material_tipo`` e
tempo por entrada. Este módulo faz a ponte, e só ela — cálculo puro, sem banco,
para que a regra de atribuição fique testável e auditável.

Duas decisões de atribuição que valem explicar, porque são elas que decidem se
a métrica de efetividade mede algo ou mede o próprio sistema:

**1. Tipos do app viram formatos canônicos.** O mobile tem mais tipos de bloco
(``texto``, ``apresentacao-slides``, ``documento``) do que o motor tem formatos.
Tipo que não corresponde a formato sugerível (vídeo, imagem, embed) é ignorado
em vez de virar um formato inventado.

**2. Desempenho só é atribuído a um formato quando não há ambiguidade.**
``acertos``/``percentual`` vêm do progresso do CONTEÚDO, não do formato: se o
aluno viu markdown e áudio do mesmo conteúdo, não existe dado que diga qual dos
dois produziu o acerto. Espalhar o mesmo número nos dois seria pior do que
omitir — o motor daria bônus de "desempenho alto" ao formato que só estava
aberto. Pior ainda seria creditar o formato de maior tempo ativo: esse é
justamente o que a sugestão colocou em primeiro lugar, e o motor passaria a
confirmar a própria decisão a cada ciclo. Então: conteúdo consumido em um único
formato entrega desempenho; conteúdo consumido em vários entrega só
comportamento (ritmo e tempo), que é per-formato de verdade.
"""

from __future__ import annotations

from typing import Any, Iterable

from app.services.sugestao_material import FORMATOS_CANONICOS

# Tipo de bloco do app -> formato canônico do motor. Só o que é sugerível entra:
# vídeo/imagem/embed não são formatos que a sugestão ordena, e mapeá-los para
# algum vizinho criaria evidência falsa sobre um formato que o aluno não abriu.
_FORMATO_POR_TIPO: dict[str, str] = {
    "markdown": "markdown",
    "texto": "markdown",
    "audio": "audio",
    "apresentacao": "apresentacao",
    "apresentacao-slides": "apresentacao",
    "slides": "apresentacao",
    "cards": "cards",
    "pdf": "pdf",
    "documento": "pdf",
}

_FLAGS_DE_RITMO = ("skimming", "leitura_lenta")


def formato_do_material(
    *, material_tipo: Any = None, material_key: Any = None
) -> str | None:
    """Formato canônico de uma entrada de telemetria de material.

    Prefere ``material_tipo`` (o app o envia explicitamente) e cai para o 3º
    segmento do ``material_key`` (``material:content:12:markdown:3``) quando o
    tipo não veio — lotes antigos não tinham o campo.
    """
    tipo = str(material_tipo or "").strip().lower()
    if tipo in _FORMATO_POR_TIPO:
        return _FORMATO_POR_TIPO[tipo]

    partes = [parte for parte in str(material_key or "").split(":") if parte]
    # material : content : <id> : <tipo> : <bloco>
    if len(partes) >= 4:
        candidato = partes[3].strip().lower()
        if candidato in _FORMATO_POR_TIPO:
            return _FORMATO_POR_TIPO[candidato]
    return None


def _numero(valor: Any) -> float:
    try:
        return float(valor or 0)
    except (TypeError, ValueError):
        return 0.0


def _opcional(valor: Any) -> float | None:
    if valor is None:
        return None
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def _flag_por_material(ritmo_por_material: Iterable[dict[str, Any]]) -> dict[str, str]:
    flags: dict[str, str] = {}
    for entrada in ritmo_por_material or []:
        chave = entrada.get("material_key") or entrada.get("key")
        flag = str(entrada.get("flag") or "")
        if chave and flag in _FLAGS_DE_RITMO:
            flags[str(chave)] = flag
    return flags


def sinais_por_formato(
    *,
    materiais_telemetria: Iterable[dict[str, Any]] = (),
    ritmo_por_material: Iterable[dict[str, Any]] = (),
    progresso_por_conteudo: dict[Any, dict[str, Any]] | None = None,
) -> dict[str, dict[str, Any]]:
    """Monta ``sinais_por_formato`` a partir de um lote de telemetria.

    ``materiais_telemetria`` é ``time_metrics.materials``; ``ritmo_por_material``
    é o ``reading_material_pace`` do pipeline de análise; ``progresso_por_conteudo``
    mapeia ``conteudo_id`` para ``{"acertos", "percentual"}`` (de
    ``personalizacao_item_progresso``).
    """
    flags = _flag_por_material(ritmo_por_material)
    progresso = progresso_por_conteudo or {}

    acumulado: dict[str, dict[str, Any]] = {}
    # conteúdo -> formatos em que ele foi consumido. É o que permite decidir se o
    # desempenho é atribuível.
    formatos_por_conteudo: dict[Any, set[str]] = {}

    for entrada in materiais_telemetria or []:
        formato = formato_do_material(
            material_tipo=entrada.get("material_tipo"),
            material_key=entrada.get("material_key") or entrada.get("key"),
        )
        if formato is None:
            continue

        chave_material = str(entrada.get("material_key") or entrada.get("key") or "")
        active_sec = _numero(entrada.get("active_sec"))
        dwell_sec = _numero(entrada.get("dwell_sec"))
        conteudo_id = entrada.get("conteudo_id")

        alvo = acumulado.setdefault(
            formato,
            {
                "active_sec": 0.0,
                "dwell_sec": 0.0,
                "_ritmo": {},
                "_conteudos": set(),
            },
        )
        alvo["active_sec"] += active_sec
        alvo["dwell_sec"] += dwell_sec

        flag = flags.get(chave_material)
        if flag:
            # Peso por tempo ativo: um material lido devagar por 5 min diz mais
            # sobre o formato do que um aberto por 3 s e marcado como skimming.
            alvo["_ritmo"][flag] = alvo["_ritmo"].get(flag, 0.0) + max(active_sec, 1.0)

        if conteudo_id is not None:
            alvo["_conteudos"].add(conteudo_id)
            formatos_por_conteudo.setdefault(conteudo_id, set()).add(formato)

    resultado: dict[str, dict[str, Any]] = {}
    for formato, dados in acumulado.items():
        ritmo = dados["_ritmo"]
        flag_dominante = max(ritmo, key=ritmo.get) if ritmo else None

        acertos: list[float] = []
        percentuais: list[float] = []
        for conteudo_id in dados["_conteudos"]:
            if len(formatos_por_conteudo.get(conteudo_id) or ()) != 1:
                # Consumido em mais de um formato: desempenho não é atribuível.
                continue
            registro = progresso.get(conteudo_id) or {}
            acerto = _opcional(registro.get("acertos"))
            if acerto is not None:
                acertos.append(acerto)
            percentual = _opcional(registro.get("percentual"))
            if percentual is not None:
                percentuais.append(percentual)

        dwell_sec = dados["dwell_sec"]
        resultado[formato] = {
            "skimming": flag_dominante == "skimming",
            "leitura_lenta": flag_dominante == "leitura_lenta",
            "acertos": round(sum(acertos) / len(acertos), 2) if acertos else None,
            "percentual": (
                round(sum(percentuais) / len(percentuais), 2) if percentuais else None
            ),
            "active_sec": round(dados["active_sec"], 2),
            # O freio de abandono compara tempo NA TELA com progresso: dwell (que
            # inclui o parado) é o certo aqui, ao contrário do WPM, que precisa
            # do active para não confundir pausa com lentidão.
            "tempo_min": round(dwell_sec / 60.0, 2) if dwell_sec > 0 else None,
        }

    # Ordem canônica para o snapshot do log sair estável entre ciclos.
    return {
        formato: resultado[formato]
        for formato in FORMATOS_CANONICOS
        if formato in resultado
    }


def indexar_progresso_por_conteudo(
    itens: Iterable[dict[str, Any]],
) -> dict[int, dict[str, Any]]:
    """Indexa ``personalizacao_item_progresso`` por ``conteudo_id``.

    O progresso é gravado com ``item_key`` (``content:12``), não com a coluna
    ``conteudo_id`` — o mesmo formato que o app usa para montar o
    ``material_key``. Itens de outra natureza (atividade, questão) ficam de
    fora: eles não são material que a sugestão ordena.

    Quando o mesmo conteúdo aparece mais de uma vez, vence o PRIMEIRO — a
    consulta vem ordenada por ``updated_at DESC``, então o primeiro é o registro
    mais recente.
    """
    indexado: dict[int, dict[str, Any]] = {}
    for item in itens or []:
        chave = str(item.get("item_key") or "")
        if not chave.startswith("content:"):
            continue
        partes = chave.split(":")
        if len(partes) < 2:
            continue
        try:
            conteudo_id = int(partes[1])
        except (TypeError, ValueError):
            continue
        if conteudo_id in indexado:
            continue
        indexado[conteudo_id] = {
            "acertos": _opcional(item.get("acertos_percentual")),
            "percentual": _opcional(item.get("percentual_concluido")),
        }
    return indexado
