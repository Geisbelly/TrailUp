"""Notificação push personalizada por aluno e por perfil BrainHex, com RAG (#66).

Ordem de decisão (decisão de 01/11):
1. **RAG + LLM:** com o Vector Store configurado, o modelo consulta a base de evidências
   (`file_search`, o mesmo caminho do mentor, #165) para escolher tom e horário para o perfil,
   e diz em `evidencia` o que embasou a escolha;
2. **LLM sem RAG:** sem RAG (ou se ele falhar), o mesmo prompt segue só a assinatura editorial do
   perfil;
3. **Regra:** modelo fora do ar, texto pronto no tom do perfil. Nunca fica sem notificação: o motivo
   (emoção negativa, inatividade) é dado, não opinião do modelo.

O horário que sai do modelo passa por uma guarda: nunca no passado, nunca a mais de 24 h e nunca
entre 22h e 7h de Brasília. O que vai ao modelo não identifica o aluno (#195); a rota de menor vale
pelos dois caminhos (o RAG já é OpenAI com `store=False`).
"""

from datetime import UTC, datetime, timedelta, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.core.settings import Settings
from app.schemas.notificacao import NotificacaoPayload
from app.services.llm import JsonLLMService, StructuredOutputError
from app.services.openai_rag import OpenAIRagService
from app.services.personalizacao import _build_profile_editorial_context

BRASILIA = timezone(timedelta(hours=-3))
_SILENCIO_INICIO = 22
_SILENCIO_FIM = 7


class NotificacaoGerada(BaseModel):
    tipo: Literal["suporte", "lembrete", "conquista"]
    titulo: str = Field(min_length=1, max_length=60)
    corpo: str = Field(min_length=1, max_length=200)
    horario: datetime
    prioridade: int = Field(ge=0, le=3)
    evidencia: str | None = Field(default=None, max_length=300)


def _perfil_dominante(state: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    perfis = [p for p in state.get("perfil_brainhex") or [] if isinstance(p, dict)]
    perfis = sorted(perfis, key=lambda p: float(p.get("afinidade") or 0), reverse=True)
    dominante = str((perfis[0].get("perfil") or perfis[0].get("nome")) if perfis else "Mastermind")
    return dominante, perfis


def _contexto_do_perfil(state: dict[str, Any]) -> dict[str, Any]:
    dominante, perfis = _perfil_dominante(state)
    ctx = _build_profile_editorial_context(dominante, perfis)
    chaves = (
        "perfil_dominante", "tom_voz", "ritmo", "abertura_estilo", "convencimento_estilo",
        "fechamento_estilo", "marcadores_linguisticos", "proibicoes_estilo", "guia_nome",
    )
    return {k: ctx.get(k) for k in chaves}


def _motivo(state: dict[str, Any]) -> str:
    emocao = state.get("emocao_atual") or {}
    if float(emocao.get("valencia", 0) or 0) <= -0.4:
        return "emocao_negativa"
    tipos = {str(e.get("tipo", "")).lower() for e in state.get("eventos_novos") or [] if isinstance(e, dict)}
    return "inatividade" if "inatividade" in tipos else "engajamento"


def ajustar_horario(proposto: datetime | None, agora: datetime) -> datetime:
    """Pura. Entre 5 min e 24 h a partir de agora, e fora do silêncio (22h–7h de Brasília)."""
    minimo, maximo = agora + timedelta(minutes=5), agora + timedelta(hours=24)
    if proposto is None or proposto.tzinfo is None:
        horario = minimo
    else:
        horario = min(max(proposto.astimezone(UTC), minimo), maximo)
    local = horario.astimezone(BRASILIA)
    if local.hour >= _SILENCIO_INICIO or local.hour < _SILENCIO_FIM:
        dia = local.date() if local.hour < _SILENCIO_FIM else local.date() + timedelta(days=1)
        local = datetime(dia.year, dia.month, dia.day, _SILENCIO_FIM, 0, tzinfo=BRASILIA)
    return local.astimezone(UTC)


# Regra (último degrau): o texto segue o tom do perfil. Uma linha por perfil e por motivo.
_TEXTOS_DA_REGRA: dict[str, dict[str, tuple[str, str]]] = {
    "Seeker": {
        "suporte": ("Uma pista de cada vez", "Que tal explorar só o próximo trecho? Ele está mais curto e guiado."),
        "lembrete": ("Tem trilha para explorar", "Seu próximo tópico guarda uma descoberta. Dá uma olhada quando puder."),
    },
    "Survivor": {
        "suporte": ("Passo a passo, com segurança", "O próximo passo está mais curto. Faça um item e siga no seu ritmo."),
        "lembrete": ("Seu plano continua de pé", "Um passo pequeno hoje mantém a trilha em dia. Retome do ponto onde parou."),
    },
    "Daredevil": {
        "suporte": ("Respira e volta pro jogo", "Missão curta: um item agora e você já sai do lugar."),
        "lembrete": ("Desafio esperando", "Tem uma missão rápida na sua trilha. Topa resolver hoje?"),
    },
    "Mastermind": {
        "suporte": ("Divida o problema", "Quebre o próximo conceito em partes: o primeiro bloco já está pronto para você."),
        "lembrete": ("O próximo padrão te espera", "Há um conceito novo para encaixar no que você já sabe. Retome quando puder."),
    },
    "Conqueror": {
        "suporte": ("Recupere o ritmo", "Uma etapa curta agora e você volta ao controle da trilha."),
        "lembrete": ("Sua próxima conquista", "Falta pouco para fechar este tópico. Avance mais uma etapa hoje."),
    },
    "Socializer": {
        "suporte": ("Você não está sozinho", "Vamos juntos no próximo passo: ele está mais curto e guiado."),
        "lembrete": ("Sua turma está avançando", "Que tal acompanhar a turma? Seu próximo passo já está pronto."),
    },
    "Achiever": {
        "suporte": ("Um item de cada vez", "Feche só o próximo item da lista. Cada passo conta para a sua meta."),
        "lembrete": ("Mais um passo na meta", "Seu próximo item está pronto. Avance hoje e veja o progresso subir."),
    },
}


def notificacao_da_regra(perfil: str, motivo: str, agora: datetime) -> NotificacaoPayload:
    """Pura. Sem modelo: texto no tom do perfil, horário pela guarda."""
    textos = _TEXTOS_DA_REGRA.get(perfil, _TEXTOS_DA_REGRA["Mastermind"])
    tipo = "suporte" if motivo == "emocao_negativa" else "lembrete"
    titulo, corpo = textos[tipo]
    proposto = agora + (timedelta(minutes=5) if tipo == "suporte" else timedelta(minutes=30))
    return NotificacaoPayload(
        tipo=tipo,
        titulo=titulo,
        corpo=corpo,
        horario=ajustar_horario(proposto, agora),
        prioridade=2 if tipo == "suporte" else 1,
        contexto={"motivo": motivo, "perfil": perfil, "origem": "regra"},
    )


def _payload_do_modelo(state: dict[str, Any], perfil: dict[str, Any], motivo: str, agora: datetime) -> dict[str, Any]:
    emocao = state.get("emocao_atual") or {}
    desempenho = state.get("desempenho_recente") or {}
    return {
        # Minimização (#195): nada que identifique o aluno.
        "perfil": perfil,
        "motivo": motivo,
        "agora": agora.astimezone(BRASILIA).isoformat(),
        "emocao_atual": {k: emocao.get(k) for k in ("emocao_primaria", "valencia") if k in emocao},
        "desempenho_recente": {
            k: desempenho.get(k) for k in ("media_acertos", "percentual_concluido", "topico_concluido") if k in desempenho
        },
        "eventos_novos": [str(e.get("tipo")) for e in state.get("eventos_novos") or [] if isinstance(e, dict)][:10],
    }


async def agente_notificacao(state: dict[str, Any], settings: Settings, agora: datetime | None = None) -> dict[str, Any]:
    agora = agora or datetime.now(UTC)
    perfil = _contexto_do_perfil(state)
    motivo = _motivo(state)
    payload = _payload_do_modelo(state, perfil, motivo, agora)
    llm = JsonLLMService(settings)

    gerada: NotificacaoGerada | None = None
    origem = "regra"
    tentativas = [True, False] if OpenAIRagService(settings).is_configured() else [False]
    for usar_rag in tentativas:
        try:
            gerada = await llm.ainvoke_structured(
                prompt_name="notificacao_personalizada.txt",
                payload=payload,
                schema=NotificacaoGerada,
                use_rag=usar_rag,
            )
            origem = "rag" if usar_rag else "modelo"
            break
        except StructuredOutputError:
            continue

    if gerada is None:
        notificacao = notificacao_da_regra(perfil["perfil_dominante"], motivo, agora)
    else:
        contexto: dict[str, Any] = {"motivo": motivo, "perfil": perfil["perfil_dominante"], "origem": origem}
        if gerada.evidencia:
            contexto["evidencia"] = gerada.evidencia
        notificacao = NotificacaoPayload(
            tipo=gerada.tipo,
            titulo=gerada.titulo.strip(),
            corpo=gerada.corpo.strip(),
            horario=ajustar_horario(gerada.horario, agora),
            prioridade=gerada.prioridade,
            contexto=contexto,
        )

    return {
        "notificacao_payload": notificacao.model_dump(mode="json"),
        "completed_nodes": ["agente_notificacao"],
        "messages": [f"notificacao definida: {notificacao.tipo} ({notificacao.contexto.get('origem')})"],
    }
