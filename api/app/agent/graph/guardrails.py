from __future__ import annotations

import inspect
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, TypeVar

from pydantic import BaseModel

from app.schemas.mentor_chat import GroundingJudgment, MentorChatLLMResult
from app.schemas.trilha_config import TrilhaConfig
from app.services.llm import JsonLLMService, StructuredOutputError

T = TypeVar("T", bound=BaseModel)


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
    jeito de dispensar reforco e o valor exato 'avancar sem reforco'. Prefere
    o dominio PERSISTIDO do topico especifico (memoria_aluno, mais preciso)
    quando existe; cai pro media_acertos flat da classe so quando o aluno
    ainda nao tem registro de dominio pro topico."""
    if "avancar sem reforco" not in trilha.ajustes:
        return None

    dominio_por_topico = contexto.get("dominio_por_topico") or {}
    registro_topico = (
        dominio_por_topico.get(str(trilha.topico_foco))
        if trilha.topico_foco is not None
        else None
    )
    if registro_topico is not None:
        dominio_pct = float(registro_topico.get("dominio_estimado", 0)) * 100
        if dominio_pct < 50:
            return GuardrailViolation(
                regra="evidencia_dominio",
                mensagem=(
                    f"ajuste 'avancar sem reforco' sem evidencia de dominio persistido "
                    f"pro topico {trilha.topico_foco} (dominio_estimado={dominio_pct:.0f}%)"
                ),
            )
        return None

    desempenho = contexto.get("desempenho_recente", {})
    media_acertos = float(desempenho.get("media_acertos", 100))
    if media_acertos < 50:
        return GuardrailViolation(
            regra="evidencia_dominio",
            mensagem=(
                f"ajuste 'avancar sem reforco' sem evidencia de desempenho "
                f"(media_acertos={media_acertos})"
            ),
        )
    return None


async def gerar_validado(
    llm: JsonLLMService,
    *,
    prompt_name: str,
    payload: dict[str, Any],
    schema: type[T],
    guardrails: list[Callable[[T, dict[str, Any]], Any]],
    fallback_factory: Callable[[], dict[str, Any]],
    contexto: dict[str, Any] | None = None,
    on_violation: Callable[[GuardrailViolation, str], Awaitable[None]] | None = None,
    max_tentativas: int = 2,
    **ainvoke_kwargs: Any,
) -> T:
    """Gera com schema nativo (Camada 1), roda guardrails de negocio (Camada
    2). Schema invalido OU guardrail violado: 1 retry com o erro anexado ao
    payload como 'correcao'. Falhou de novo: fallback deterministico do
    proprio no, e a ultima violacao e reportada via on_violation (auditoria)."""
    contexto = contexto or {}
    tentativa_payload = dict(payload)
    ultima_violacao: GuardrailViolation | None = None

    for tentativa in range(max_tentativas):
        try:
            resultado = await llm.ainvoke_structured(
                prompt_name=prompt_name,
                payload=tentativa_payload,
                schema=schema,
                **ainvoke_kwargs,
            )
        except StructuredOutputError as exc:
            ultima_violacao = GuardrailViolation(regra="schema", mensagem=str(exc))
            tentativa_payload = {**payload, "correcao": ultima_violacao.mensagem}
            if on_violation is not None:
                fase = "retry" if tentativa < max_tentativas - 1 else "fallback_final"
                await on_violation(ultima_violacao, fase)
            continue

        violacao: GuardrailViolation | None = None
        for checar in guardrails:
            possivel = checar(resultado, contexto)
            if inspect.isawaitable(possivel):
                possivel = await possivel
            if possivel is not None:
                violacao = possivel
                break

        if violacao is None:
            return resultado

        ultima_violacao = violacao
        fase = "retry" if tentativa < max_tentativas - 1 else "fallback_final"
        if on_violation is not None:
            await on_violation(violacao, fase)
        tentativa_payload = {**payload, "correcao": f"{violacao.regra}: {violacao.mensagem}"}

    return schema.model_validate(fallback_factory())


async def checar_grounding_chat(
    resposta: MentorChatLLMResult, contexto: dict[str, Any]
) -> GuardrailViolation | None:
    """Unica regra desta leva que precisa de julgamento sobre texto livre —
    o payload do chat nem contem gabarito pra comparar diretamente
    (buscar_questoes_topico ja filtra isso). Usa uma segunda chamada LLM
    barata como juiz. Falha aberta: se o juiz falhar, nao bloqueia o chat
    (a resposta principal ja passou pelas instrucoes de guardrail no prompt;
    o juiz e uma camada extra de verificacao, nao a unica linha de defesa)."""
    llm: JsonLLMService = contexto["llm"]
    try:
        julgamento = await llm.ainvoke_structured(
            prompt_name="mentor_grounding_check.txt",
            payload={
                "resposta": resposta.reply,
                "conteudo_materia": contexto.get("conteudo_materia", {}),
            },
            schema=GroundingJudgment,
        )
    except StructuredOutputError:
        return None

    if julgamento.viola:
        return GuardrailViolation(regra="grounding_chat", mensagem=julgamento.motivo)
    return None
