from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.schemas.trilha_config import TrilhaConfig


@dataclass
class GuardrailViolation:
    regra: str
    mensagem: str


def checar_ordem_sequencial(
    trilha: TrilhaConfig, contexto: dict[str, Any]
) -> GuardrailViolation | None:
    """Substitui 'pre-requisitos' (nao existe grafo explicito no banco hoje):
    nao recomendar avanco pra um topico cuja ordem e posterior a topicos
    ainda incompletos na mesma trilha."""
    topicos = contexto.get("topicos_classe", [])
    progresso = contexto.get("progresso_trilha", {})
    ordem_por_id = {topico["id"]: topico.get("ordem") for topico in topicos}

    if trilha.topico_foco is None:
        return None
    ordem_foco = ordem_por_id.get(trilha.topico_foco)
    if ordem_foco is None:
        return None

    incompletos_antes = [
        topico["id"]
        for topico in topicos
        if topico.get("ordem") is not None
        and topico["ordem"] < ordem_foco
        and float((progresso.get(str(topico["id"])) or {}).get("percentual_concluido", 0)) < 100
    ]
    if incompletos_antes:
        return GuardrailViolation(
            regra="ordem_sequencial",
            mensagem=(
                f"topico_foco {trilha.topico_foco} avanca antes de completar "
                f"os topicos anteriores na ordem da trilha: {incompletos_antes}"
            ),
        )
    return None


def checar_topicos_existem(
    trilha: TrilhaConfig, contexto: dict[str, Any]
) -> GuardrailViolation | None:
    """IDs de topico citados precisam existir de fato na classe — evita
    alucinacao de referencia."""
    topicos = contexto.get("topicos_classe", [])
    ids_validos = {topico["id"] for topico in topicos}

    citados = [trilha.topico_foco] if trilha.topico_foco is not None else []
    citados += trilha.proximos_topicos
    invalidos = [topico_id for topico_id in citados if topico_id not in ids_validos]

    if invalidos:
        return GuardrailViolation(
            regra="topicos_existem",
            mensagem=f"topicos citados nao existem na classe {trilha.classe_id}: {invalidos}",
        )
    return None


def checar_evidencia_dominio(
    trilha: TrilhaConfig, contexto: dict[str, Any]
) -> GuardrailViolation | None:
    """'ajustes' e vocabulario controlado (ver trilha_config.txt) — o unico
    jeito de dispensar reforco e o valor exato 'avancar sem reforco', e isso
    so e aceito com desempenho real que sustente. Mesmo limiar (50) que
    _fallback_trilha/_fallback_perfil ja usam pra 'reforcar fundamentos'."""
    desempenho = contexto.get("desempenho_recente", {})
    media_acertos = float(desempenho.get("media_acertos", 100))

    if "avancar sem reforco" in trilha.ajustes and media_acertos < 50:
        return GuardrailViolation(
            regra="evidencia_dominio",
            mensagem=(
                f"ajuste 'avancar sem reforco' sem evidencia de desempenho "
                f"(media_acertos={media_acertos})"
            ),
        )
    return None
