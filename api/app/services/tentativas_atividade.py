"""Tentativas de atividade e cronometro, do lado da IA (#136, fase 4).

A fase 1 pos o relogio no banco: cada tentativa fica em `atividade_tentativas`, com inicio e
entrega pelo relogio do servidor, e `aluno_cronometro` guarda a escolha do aluno ou da IA sobre o
cronometro. Aqui ficam as partes puras que a IA usa:

- `resumir_tentativas`: o resumo que entra em `desempenho_recente.tentativas` no contexto do aluno
  (e, por aluno, no retrato dos insights da turma);
- `decidir_desligar_cronometro`: a regra aprovada em 01/11 (opcao B).

## A regra do cronometro

A IA **so desliga, nunca liga**, e a escolha explicita do aluno vence a dela. Desliga quando 3
das ultimas 5 tentativas cronometradas sairam fora do tempo. Tempo nao mexe na nota (so no bonus
de XP), entao "fora do tempo" repetido nao e castigo: e pressao sem retorno, o que a regra corta.

Havia um primeiro criterio, a recorrencia de ansiedade ou sobrecarga em `memoria_aluno`. Saiu em
02/11: aquela "ansiedade" era regra fixa sobre nota e progresso, e a telemetria nao mede emocao
(DAT-45). O historico agora guarda estado de estudo (`estado_de_estudo.py`), e a pressao de tempo
ja e medida aqui com dado real.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel

# Mesma janela e limiar de `memoria_aluno` (3 dos ultimos 5).
JANELA = 5
LIMIAR = 3


class CronometroDecisao(BaseModel):
    """O que o executor grava em `aluno_cronometro` (origem `ia`) e avisa ao professor."""

    criterio: str  # "fora_do_tempo"
    motivo: str
    ocorrencias: int
    janela: int = JANELA


def _num(valor: Any) -> float | None:
    try:
        return None if valor is None else float(valor)
    except (TypeError, ValueError):
        return None


def _media(valores: list[float]) -> float | None:
    return round(sum(valores) / len(valores), 1) if valores else None


def _quando(valor: Any) -> str:
    return valor.isoformat() if isinstance(valor, datetime) else str(valor or "")


def resumir_tentativas(linhas: list[dict[str, Any]], cronometro: dict[str, Any] | None = None) -> dict[str, Any]:
    """Resumo das tentativas entregues de um aluno numa turma.

    `linhas`: uma por tentativa entregue, com `atividade_id`, `numero`, `respondida_em`,
    `cronometrada`, `no_tempo`, `acertos_percentual` e `tentativas_max` da atividade.
    `cronometro`: `{"ligado": bool, "origem": "perfil" | "aluno" | "ia"}`, o estado de agora.

    Sem tentativa nenhuma, as medias saem `None` (sem dado), nunca zero.
    """
    por_atividade: dict[Any, list[dict[str, Any]]] = {}
    for linha in linhas:
        por_atividade.setdefault(linha.get("atividade_id"), []).append(linha)

    primeiras: list[float] = []
    ultimas: list[float] = []
    esgotadas = 0
    for lista in por_atividade.values():
        lista.sort(key=lambda t: int(t.get("numero") or 0))
        primeira = _num(lista[0].get("acertos_percentual"))
        ultima = _num(lista[-1].get("acertos_percentual"))
        if primeira is not None:
            primeiras.append(primeira)
        if ultima is not None:
            ultimas.append(ultima)
        maximo = lista[0].get("tentativas_max")
        if maximo is not None and len(lista) >= int(maximo):
            esgotadas += 1

    cronometradas = sorted(
        (t for t in linhas if t.get("cronometrada")),
        key=lambda t: _quando(t.get("respondida_em")),
        reverse=True,
    )
    no_tempo = sum(1 for t in cronometradas if t.get("no_tempo"))
    return {
        "respondidas": len(linhas),
        "atividades": len(por_atividade),
        "media_por_atividade": round(len(linhas) / len(por_atividade), 2) if por_atividade else None,
        "atividades_esgotadas": esgotadas,
        "cronometradas": len(cronometradas),
        "no_tempo": no_tempo,
        "no_tempo_pct": round(100 * no_tempo / len(cronometradas), 1) if cronometradas else None,
        # A ultima pode ter vindo depois de ver o gabarito; a primeira e o que o aluno sabia.
        "media_acertos_primeira": _media(primeiras),
        "media_acertos_ultima": _media(ultimas),
        # Da mais recente para a mais antiga, como a janela de `memoria_aluno`.
        "ultimas_cronometradas_no_tempo": [bool(t.get("no_tempo")) for t in cronometradas[:JANELA]],
        "cronometro": dict(cronometro) if cronometro else None,
    }


def decidir_desligar_cronometro(tentativas: dict[str, Any] | None) -> CronometroDecisao | None:
    """`None` = nada a fazer. Pura: quem grava e o executor, que confere de novo a escolha do aluno."""
    cronometro = (tentativas or {}).get("cronometro") or {}
    # Sem saber o estado de agora, nao decide: desligar o que ja esta desligado so geraria aviso falso.
    if not cronometro.get("ligado") or cronometro.get("origem") == "aluno":
        return None

    janela = list((tentativas or {}).get("ultimas_cronometradas_no_tempo") or [])[:JANELA]
    fora = sum(1 for no_tempo in janela if not no_tempo)
    if fora >= LIMIAR:
        return CronometroDecisao(
            criterio="fora_do_tempo",
            motivo=f"{fora} das últimas {len(janela)} tentativas cronometradas fora do tempo",
            ocorrencias=fora,
        )
    return None


def texto_para_o_professor(decisao: CronometroDecisao) -> str:
    return (
        f"O cronômetro das atividades foi desligado para este aluno: {decisao.motivo}. "
        "A nota não muda; ele deixa de ter a contagem e o bônus de tempo. "
        "Ele pode religar no perfil do app."
    )


def resumir_tentativas_da_turma(por_aluno: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Agregado da turma para os insights, a partir dos resumos por aluno (`resumir_tentativas`)."""
    com_tentativa = [r for r in por_aluno.values() if r.get("respondidas")]
    respondidas = sum(r["respondidas"] for r in com_tentativa)
    atividades = sum(r["atividades"] for r in com_tentativa)
    cronometradas = sum(r["cronometradas"] for r in com_tentativa)
    no_tempo = sum(r["no_tempo"] for r in com_tentativa)

    def media_ponderada(chave: str) -> float | None:
        pares = [(r[chave], r["atividades"]) for r in com_tentativa if r.get(chave) is not None]
        peso = sum(p for _, p in pares)
        return round(sum(v * p for v, p in pares) / peso, 1) if peso else None

    return {
        "alunos_com_tentativa": len(com_tentativa),
        "respondidas": respondidas,
        "media_por_atividade": round(respondidas / atividades, 2) if atividades else None,
        "no_tempo_pct": round(100 * no_tempo / cronometradas, 1) if cronometradas else None,
        "alunos_com_atividade_esgotada": sum(1 for r in com_tentativa if r.get("atividades_esgotadas")),
        "media_acertos_primeira": media_ponderada("media_acertos_primeira"),
        "media_acertos_ultima": media_ponderada("media_acertos_ultima"),
    }
