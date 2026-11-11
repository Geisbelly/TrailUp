import math
from typing import Any

from app.core.settings import Settings
from app.schemas.perfil import PerfilScore, PerfilUpdate
from app.services import perfil_vetor
from app.services.llm import JsonLLMService, StructuredOutputError

# Nomes canônicos e alias `socialiser` -> `socializer`: a regra única de `perfil_vetor`.
PERFIS_CANONICOS = perfil_vetor.PERFIS_CANONICOS

# Valor de um perfil que o vetor do aluno não tem (aluno sem linha, ou resposta parcial).
_AFINIDADE_AUSENTE = 10.0


_chave_do_perfil = perfil_vetor.chave_do_perfil


def _vetor_parcial(perfis: list[Any] | None) -> dict[str, float]:
    """Afinidades nas chaves do banco. Nome fora dos 7 é descartado; repetido, o maior vence."""
    vetor: dict[str, float] = {}
    for item in perfis or []:
        if isinstance(item, PerfilScore):
            nome, bruto = item.perfil, item.afinidade
        else:
            nome, bruto = item.get("perfil") or item.get("nome"), item.get("afinidade")
        chave = _chave_do_perfil(nome)
        if chave is None:
            continue
        try:
            valor = max(0.0, float(bruto or 0.0))
        except (TypeError, ValueError):
            valor = 0.0
        vetor[chave] = max(vetor.get(chave, 0.0), valor)
    return vetor


def _vetor_canonico(perfis: list[Any] | None) -> dict[str, float]:
    """Vetor completo do aluno: os 7 perfis, com o default só onde falta linha."""
    vetor = _vetor_parcial(perfis)
    for chave in PERFIS_CANONICOS:
        vetor.setdefault(chave, _AFINIDADE_AUSENTE)
    return vetor


def _em_percentual(vetor: dict[str, float]) -> dict[str, int]:
    """7 inteiros de 1 a 100 somando 100 — o contrato que o cadastro grava em `aluno_perfil`.

    Proporcional (não softmax: os pontos aqui já estão na escala de afinidade). Reserva 1 para
    cada perfil antes de repartir o resto por maior resto, como `afinidadeEmPercentual` no
    cadastro; o desempate do resto é pelo nome, para ser determinístico.
    """
    chaves = sorted(PERFIS_CANONICOS)
    total = sum(vetor.get(k, 0.0) for k in chaves)
    pesos = {k: (vetor.get(k, 0.0) / total if total > 0 else 1 / len(chaves)) for k in chaves}
    livre = 100 - len(chaves)
    exatos = {k: pesos[k] * livre for k in chaves}
    base = {k: 1 + math.floor(exatos[k]) for k in chaves}
    sobra = 100 - sum(base.values())
    por_resto = sorted(chaves, key=lambda k: (-(exatos[k] - math.floor(exatos[k])), k))
    for chave in por_resto[:sobra]:
        base[chave] += 1
    return base


def _perfis_no_contrato(vetor: dict[str, float]) -> list[dict[str, Any]]:
    ordenado = sorted(_em_percentual(vetor).items(), key=lambda item: (-item[1], item[0]))
    return [
        PerfilScore(perfil=PERFIS_CANONICOS[chave], afinidade=valor).model_dump()
        for chave, valor in ordenado
    ]


def _fallback_perfil(state: dict[str, Any]) -> dict[str, Any]:
    existing = _vetor_canonico(state.get("perfil_brainhex", []))

    desempenho = state.get("desempenho_recente", {})
    eventos = {evento.get("tipo", "").lower() for evento in state.get("eventos_novos", [])}

    if float(desempenho.get("media_acertos", 0)) < 50:
        existing["survivor"] += 20
        existing["mastermind"] += 10
    if "atividade_concluida" in eventos:
        existing["achiever"] += 25
        existing["conqueror"] += 10
    if "video_explorado" in eventos or "conteudo_aberto" in eventos:
        existing["seeker"] += 15
    if "inatividade" in eventos:
        existing["survivor"] += 15
    if "forum_interacao" in eventos:
        existing["socializer"] += 15

    perfis = _perfis_no_contrato(existing)
    dominante = perfis[0]["perfil"]
    suggested_mode = {
        "Achiever": "imediato",
        "Conqueror": "imediato",
        "Mastermind": "analitico",
        "Seeker": "exploratorio",
        "Socializer": "exploratorio",
        "Survivor": "imediato",
        "Daredevil": "exploratorio",
    }.get(dominante, "imediato")

    return {
        "perfis": perfis,
        "modo_operacao_sugerido": suggested_mode,
        "modo_resposta": "imediato" if suggested_mode == "imediato" else None,
        "justificativa": f"perfil dominante inferido: {dominante}",
    }


def _no_contrato(perfil_update: PerfilUpdate, state: dict[str, Any]) -> PerfilUpdate:
    """Completa a resposta do modelo com o vetor atual e normaliza para somar 100.

    O modelo pode citar só parte dos perfis e responder em qualquer escala. Gravar isso direto
    deixava o vetor fora do contrato do cadastro, e o limiar de 20% (perfil representativo)
    passava a significar outra coisa.
    """
    vetor = _vetor_canonico(state.get("perfil_brainhex", []))
    vetor.update(_vetor_parcial(perfil_update.perfis))
    perfis = [PerfilScore.model_validate(item) for item in _perfis_no_contrato(vetor)]
    return perfil_update.model_copy(update={"perfis": perfis})


async def agente_perfil(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    try:
        perfil_update = await llm.ainvoke_structured(
            prompt_name="perfil_brainhex.txt",
            payload={
                "perfis_atuais": state.get("perfil_brainhex", []),
                "historico_eventos": state.get("historico_eventos", [])[-20:],
                "eventos_novos": state.get("eventos_novos", []),
                "desempenho": state.get("desempenho_recente", {}),
            },
            schema=PerfilUpdate,
        )
        perfil_update = _no_contrato(perfil_update, state)
    except StructuredOutputError:
        perfil_update = PerfilUpdate.model_validate(_fallback_perfil(state))
    return {
        "perfil_update": perfil_update.model_dump(mode="json"),
        "completed_nodes": ["agente_perfil"],
        "messages": [perfil_update.justificativa or "perfil atualizado"],
    }
