"""Efetividade das sugestões de material (fase 3).

Responde, a partir do log de sugestões + do que a telemetria mostrou:

* a sugestão foi **seguida**?
* quando seguida, o desempenho foi **melhor** do que quando ignorada?
* as **revisões** melhoraram o resultado?
* quanto o sistema **muda de opinião** (churn) — muita revisão é sinal de
  limiar mal calibrado, não de personalização fina.

Cálculo puro de propósito: recebe registros já montados e não conversa com o
banco. Quem decide a janela de telemetria de cada decisão é a camada de
consulta — aqui a regra fica testável e o número, auditável.

Regra que atravessa o módulo: **amostra pequena não vira conclusão**. Toda
comparação carrega o ``n`` e um ``confiavel`` explícito; média de duas
observações não é evidência de nada, e apresentar como se fosse é pior do que
não medir.
"""

from __future__ import annotations

from itertools import combinations
from typing import Any, Iterable

MINIMO_AMOSTRA_PADRAO = 5


def aderencia_da_sugestao(
    *,
    ordem_sugerida: Iterable[str],
    ordem_consumida: Iterable[str],
) -> dict[str, Any]:
    """Compara a ordem sugerida com a ordem em que o aluno realmente consumiu.

    Usa concordância entre PARES (o par "texto antes de áudio" foi respeitado?)
    em vez de posição absoluta: o aluno que pula um formato indisponível não
    deve ser contado como se tivesse ignorado a sugestão inteira. Só entram
    pares presentes nas duas listas.
    """
    sugerida = [str(f) for f in ordem_sugerida or []]
    consumida = [str(f) for f in ordem_consumida or []]

    posicao_consumo = {formato: indice for indice, formato in enumerate(consumida)}
    comuns = [formato for formato in sugerida if formato in posicao_consumo]

    concordantes = 0
    comparados = 0
    for anterior, posterior in combinations(comuns, 2):
        comparados += 1
        if posicao_consumo[anterior] < posicao_consumo[posterior]:
            concordantes += 1

    primeiro_sugerido = sugerida[0] if sugerida else None
    primeiro_consumido = consumida[0] if consumida else None

    return {
        "seguiu_inicio": (
            primeiro_sugerido is not None
            and primeiro_consumido is not None
            and primeiro_sugerido == primeiro_consumido
        ),
        # None (e não 0) quando não há par comparável: "não deu para medir" é
        # diferente de "não seguiu nada".
        "aderencia": round(concordantes / comparados, 4) if comparados else None,
        "pares_concordantes": concordantes,
        "pares_comparados": comparados,
        "formatos_comparados": comuns,
    }


def _media(valores: list[float]) -> float | None:
    return round(sum(valores) / len(valores), 4) if valores else None


def comparar_seguiu_versus_ignorou(
    registros: Iterable[dict[str, Any]],
    *,
    minimo_amostra: int = MINIMO_AMOSTRA_PADRAO,
) -> dict[str, Any]:
    """Desempenho de quem seguiu a sugestão contra quem não seguiu.

    Registro esperado: ``{"seguiu": bool | None, "desempenho": float | None}``.
    ``seguiu=None`` (não deu para medir) fica de fora dos dois lados em vez de
    ser contado como "não seguiu" — inventar o grupo de comparação enviesa a
    métrica a favor do sistema.
    """
    seguiu: list[float] = []
    ignorou: list[float] = []

    for registro in registros or []:
        desempenho = registro.get("desempenho")
        if desempenho is None:
            continue
        marcador = registro.get("seguiu")
        if marcador is True:
            seguiu.append(float(desempenho))
        elif marcador is False:
            ignorou.append(float(desempenho))

    media_seguiu = _media(seguiu)
    media_ignorou = _media(ignorou)
    confiavel = len(seguiu) >= minimo_amostra and len(ignorou) >= minimo_amostra

    return {
        "desempenho_seguiu": media_seguiu,
        "desempenho_ignorou": media_ignorou,
        "n_seguiu": len(seguiu),
        "n_ignorou": len(ignorou),
        "minimo_amostra": minimo_amostra,
        "confiavel": confiavel,
        # A diferença só sai quando os DOIS lados têm amostra: um número solto
        # aqui seria lido como conclusão.
        "diferenca": (
            round(media_seguiu - media_ignorou, 4)
            if confiavel and media_seguiu is not None and media_ignorou is not None
            else None
        ),
    }


def efeito_das_revisoes(
    historico: Iterable[dict[str, Any]],
    *,
    minimo_amostra: int = MINIMO_AMOSTRA_PADRAO,
) -> dict[str, Any]:
    """As revisões melhoraram o resultado?

    Compara o desempenho observado DEPOIS de cada revisão com o observado antes
    dela, no mesmo aluno/tópico. Registro esperado:
    ``{"aluno_id", "topico_id", "versao", "acao", "desempenho_posterior"}``.

    Só compara pares consecutivos em que a ação foi ``revisada``: comparar com
    ``mantida`` mediria a passagem do tempo, não o efeito de ter mudado a ordem.
    """
    por_alvo: dict[tuple[Any, Any], list[dict[str, Any]]] = {}
    for registro in historico or []:
        chave = (registro.get("aluno_id"), registro.get("topico_id"))
        por_alvo.setdefault(chave, []).append(registro)

    deltas: list[float] = []
    for registros in por_alvo.values():
        ordenados = sorted(registros, key=lambda r: int(r.get("versao") or 0))
        for anterior, atual in zip(ordenados, ordenados[1:]):
            if atual.get("acao") != "revisada":
                continue
            antes = anterior.get("desempenho_posterior")
            depois = atual.get("desempenho_posterior")
            if antes is None or depois is None:
                continue
            deltas.append(float(depois) - float(antes))

    melhoraram = sum(1 for delta in deltas if delta > 0)

    return {
        "revisoes_comparadas": len(deltas),
        "delta_medio": _media(deltas),
        "revisoes_que_melhoraram": melhoraram,
        "revisoes_que_pioraram": sum(1 for delta in deltas if delta < 0),
        "minimo_amostra": minimo_amostra,
        "confiavel": len(deltas) >= minimo_amostra,
    }


def churn_de_sugestoes(historico: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Quanto o sistema muda de opinião, por aluno/tópico.

    Churn alto não é personalização fina: é limiar de mudança mal calibrado —
    o material fica trocando de lugar sem o aluno perceber por quê.
    """
    revisoes_por_alvo: dict[tuple[Any, Any], int] = {}
    contagem_por_acao: dict[str, int] = {"criada": 0, "revisada": 0, "mantida": 0}

    for registro in historico or []:
        acao = str(registro.get("acao") or "")
        if acao in contagem_por_acao:
            contagem_por_acao[acao] += 1
        if acao == "revisada":
            chave = (registro.get("aluno_id"), registro.get("topico_id"))
            revisoes_por_alvo[chave] = revisoes_por_alvo.get(chave, 0) + 1

    alvos_com_sugestao = {
        (r.get("aluno_id"), r.get("topico_id")) for r in (historico or [])
    }
    total_alvos = len(alvos_com_sugestao)
    total_revisoes = sum(revisoes_por_alvo.values())

    return {
        "por_acao": contagem_por_acao,
        "alvos": total_alvos,
        "alvos_revisados": len(revisoes_por_alvo),
        "revisoes_por_alvo": round(total_revisoes / total_alvos, 4) if total_alvos else None,
        "maior_numero_de_revisoes": max(revisoes_por_alvo.values(), default=0),
    }


def resumo_efetividade(
    historico: Iterable[dict[str, Any]],
    *,
    minimo_amostra: int = MINIMO_AMOSTRA_PADRAO,
) -> dict[str, Any]:
    """Junta as três leituras num resumo só, para a aba Turma do console."""
    registros = list(historico or [])

    aderencias = [
        float(r["aderencia"]) for r in registros if r.get("aderencia") is not None
    ]
    seguiram_inicio = [bool(r.get("seguiu_inicio")) for r in registros if "seguiu_inicio" in r]

    return {
        "total_registros": len(registros),
        "aderencia_media": _media(aderencias),
        "n_aderencia": len(aderencias),
        "taxa_seguiu_inicio": (
            round(sum(1 for s in seguiram_inicio if s) / len(seguiram_inicio), 4)
            if seguiram_inicio
            else None
        ),
        "desempenho": comparar_seguiu_versus_ignorou(registros, minimo_amostra=minimo_amostra),
        "revisoes": efeito_das_revisoes(registros, minimo_amostra=minimo_amostra),
        "churn": churn_de_sugestoes(registros),
    }


def _desempenho_dos_sinais(evidencia: Any) -> float | None:
    """Média de acertos observada num snapshot de evidência.

    Só entram formatos com ``acertos`` atribuível — a ponte de sinais deixa
    ``None`` de propósito quando o conteúdo foi visto em mais de um formato, e
    tratar isso como zero inventaria fracasso.
    """
    sinais = (evidencia or {}).get("sinais") if isinstance(evidencia, dict) else None
    if not isinstance(sinais, dict):
        return None
    valores = [
        float(sinal["acertos"])
        for sinal in sinais.values()
        if isinstance(sinal, dict) and sinal.get("acertos") is not None
    ]
    return round(sum(valores) / len(valores), 4) if valores else None


def _formatos(ordem: Any) -> list[str]:
    if not isinstance(ordem, list):
        return []
    return [
        str(item.get("formato"))
        for item in ordem
        if isinstance(item, dict) and item.get("formato")
    ]


def montar_registros_do_log(
    log: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Transforma o log cru de sugestões nos registros que as métricas esperam.

    É a camada de consulta que o resto do módulo evita de propósito. Tudo aqui
    sai do que já foi gravado — nada é recalculado a partir de telemetria nova,
    que já não existe mais quando o professor abre o console:

    * **aderência** vem de ``ordem_antes`` (a ordem que estava valendo) contra
      ``evidencia.ordem_observada`` (o que o aluno abriu naquele período);
    * **desempenho do período** é a média de acertos dos sinais daquele registro
      — eles descrevem o que aconteceu ENQUANTO aquela ordem valia;
    * **desempenho posterior** é o desempenho do período do registro SEGUINTE, e
      é isso que permite ver se uma revisão melhorou algo. O último registro de
      cada alvo fica sem posterior: ainda não houve período depois dele, e
      preencher com o próprio valor faria toda revisão recente parecer neutra.
    """
    por_alvo: dict[tuple[Any, Any], list[dict[str, Any]]] = {}
    for registro in log or []:
        chave = (registro.get("aluno_id"), registro.get("topico_id"))
        por_alvo.setdefault(chave, []).append(registro)

    resultado: list[dict[str, Any]] = []
    for registros in por_alvo.values():
        ordenados = sorted(registros, key=lambda r: int(r.get("versao") or 0))
        desempenhos = [_desempenho_dos_sinais(r.get("evidencia")) for r in ordenados]

        for indice, registro in enumerate(ordenados):
            evidencia = registro.get("evidencia") if isinstance(registro.get("evidencia"), dict) else {}
            observada = evidencia.get("ordem_observada")
            sugerida = _formatos(registro.get("ordem_antes"))

            aderencia: dict[str, Any] = {"aderencia": None, "seguiu_inicio": None}
            if sugerida and isinstance(observada, list) and observada:
                medida = aderencia_da_sugestao(
                    ordem_sugerida=sugerida,
                    ordem_consumida=[str(formato) for formato in observada],
                )
                aderencia = {
                    "aderencia": medida["aderencia"],
                    "seguiu_inicio": medida["seguiu_inicio"],
                }

            resultado.append(
                {
                    "aluno_id": registro.get("aluno_id"),
                    "classe_id": registro.get("classe_id"),
                    "topico_id": registro.get("topico_id"),
                    "versao": registro.get("versao"),
                    "acao": registro.get("acao"),
                    "criado_em": registro.get("criado_em"),
                    "motivos": registro.get("motivos") or [],
                    "ordem_sugerida": sugerida or _formatos(registro.get("ordem_depois")),
                    "ordem_observada": (
                        [str(formato) for formato in observada]
                        if isinstance(observada, list)
                        else []
                    ),
                    **aderencia,
                    # `seguiu` é o marcador binário da comparação de desempenho;
                    # None quando não deu para medir, para não engordar o grupo
                    # "não seguiu" com casos sem evidência.
                    "seguiu": aderencia["seguiu_inicio"],
                    "desempenho": desempenhos[indice],
                    "desempenho_posterior": (
                        desempenhos[indice + 1] if indice + 1 < len(desempenhos) else None
                    ),
                }
            )

    resultado.sort(
        key=lambda r: (str(r.get("aluno_id")), int(r.get("topico_id") or 0), int(r.get("versao") or 0))
    )
    return resultado
