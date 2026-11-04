from __future__ import annotations

from typing import Any

from app.services.tentativas_atividade import decidir_desligar_cronometro

ANALYZE_SPECIALIST_NODES = {
    "agente_emocao",
    "agente_perfil",
    "agente_trilha",
    "agente_conteudo",
    "agente_geracao_midia",
    "agente_notificacao",
    "agente_intervencao",
    "agente_cronometro",
    "agente_ui",
    "agente_texto",
}

PERSONALIZATION_SPECIALIST_NODES = {
    "agente_plano_personalizacao",
    "agente_ai_patch",
    "agente_midias_personalizadas",
}

SPECIALIST_NODES = ANALYZE_SPECIALIST_NODES | PERSONALIZATION_SPECIALIST_NODES

# Turma com a personalização retida pelo estudo (#13): o ciclo só mede (emoção, perfil) e avisa o
# professor (intervenção). Tema de suporte, conteúdo e mídia, trilha, notificação, cronômetro e
# texto agem no aluno, e ficariam fora do baseline e da turma de comparação.
RETIDA_SPECIALIST_NODES = {"agente_emocao", "agente_perfil", "agente_intervencao"}


def _needs_profile_update(state: dict[str, Any], completed: set[str]) -> bool:
    if "agente_perfil" in completed or state.get("perfil_update"):
        return False
    historico = state.get("historico_eventos", [])
    return len(historico) == 0 or len(historico) % 10 == 0 or bool(state.get("eventos_novos"))


def _needs_emotion(state: dict[str, Any], completed: set[str]) -> bool:
    if "agente_emocao" in completed or state.get("emocao_atual"):
        return False
    return bool(state.get("frame_b64")) or bool(state.get("eventos_novos"))


def _needs_ui(state: dict[str, Any], completed: set[str]) -> bool:
    return bool(state.get("emocao_atual")) and "agente_ui" not in completed and not state.get("ui_config")


def _needs_conteudo(state: dict[str, Any], completed: set[str]) -> bool:
    if "agente_conteudo" in completed or state.get("conteudo_adaptado"):
        return False
    desempenho = state.get("desempenho_recente", {})
    return bool(
        state.get("payload_topico_id")
        or desempenho.get("topico_concluido")
        or float(desempenho.get("media_acertos", 100)) < 50
    )


def _needs_trilha(state: dict[str, Any], completed: set[str]) -> bool:
    return bool(state.get("perfil_update")) and "agente_trilha" not in completed and not state.get("trilha_config")


def _needs_materials(state: dict[str, Any], completed: set[str]) -> bool:
    if "agente_geracao_midia" in completed or state.get("materiais_gerados"):
        return False
    return bool(state.get("conteudo_adaptado")) and bool(state.get("gerar_materiais"))


def _needs_notification(state: dict[str, Any], completed: set[str]) -> bool:
    if "agente_notificacao" in completed or state.get("notificacao_payload"):
        return False
    emocao = state.get("emocao_atual") or {}
    tipos = {evento.get("tipo", "").lower() for evento in state.get("eventos_novos", [])}
    return float(emocao.get("valencia", 0)) <= -0.4 or "inatividade" in tipos


def _needs_intervencao(state: dict[str, Any], completed: set[str]) -> bool:
    """Padrao de risco = recorrencia de alerta de estudo em `memoria_aluno` (#64).
    Sem turma nao ha onde gravar: a RLS do professor em `intervencoes` e por turma."""
    if "agente_intervencao" in completed or state.get("intervencao_payload"):
        return False
    if not state.get("classe_id"):
        return False
    memoria = state.get("memoria_aluno") or {}
    return bool((memoria.get("mental_state_recorrente") or {}).get("recorrente"))


def _needs_cronometro(state: dict[str, Any], completed: set[str]) -> bool:
    """A regra do #136 (fase 4) e pura e barata: o roteamento pergunta a ela mesma. Sem turma
    nao ha onde avisar o professor, entao nao desliga."""
    if "agente_cronometro" in completed or state.get("cronometro_payload"):
        return False
    if not state.get("classe_id"):
        return False
    tentativas = (state.get("desempenho_recente") or {}).get("tentativas")
    return decidir_desligar_cronometro(tentativas) is not None


def _needs_texto(state: dict[str, Any], completed: set[str]) -> bool:
    if "agente_texto" in completed or state.get("textos_gerados"):
        return False
    ui_config = state.get("ui_config") or {}
    return bool(ui_config.get("precisa_texto") or state.get("notificacao_payload"))


def compute_supervisor_next(state: dict[str, Any]) -> list[str]:
    completed = set(state.get("completed_nodes", []))
    if "executor" in completed:
        return ["finish"]

    next_nodes: list[str] = []
    if _needs_emotion(state, completed):
        next_nodes.append("agente_emocao")
    if _needs_profile_update(state, completed):
        next_nodes.append("agente_perfil")
    if _needs_ui(state, completed):
        next_nodes.append("agente_ui")
    if _needs_conteudo(state, completed):
        next_nodes.append("agente_conteudo")
    if _needs_materials(state, completed):
        next_nodes.append("agente_geracao_midia")
    if _needs_trilha(state, completed):
        next_nodes.append("agente_trilha")
    if _needs_notification(state, completed):
        next_nodes.append("agente_notificacao")
    if _needs_intervencao(state, completed):
        next_nodes.append("agente_intervencao")
    if _needs_cronometro(state, completed):
        next_nodes.append("agente_cronometro")
    if _needs_texto(state, completed):
        next_nodes.append("agente_texto")
    if state.get("personalizacao_retida"):
        next_nodes = [node for node in next_nodes if node in RETIDA_SPECIALIST_NODES]

    if next_nodes:
        return next_nodes

    has_outputs = any(
        state.get(key)
        for key in [
            "perfil_update",
            "trilha_config",
            "conteudo_adaptado",
            "materiais_gerados",
            "notificacao_payload",
            "intervencao_payload",
            "cronometro_payload",
            "ui_config",
            "textos_gerados",
        ]
    )
    if has_outputs or state.get("review_decision"):
        return ["executor"]

    return ["finish"]


def compute_personalizacao_next(state: dict[str, Any]) -> list[str]:
    completed = set(state.get("completed_nodes", []))
    if "persist_personalizacao" in completed:
        return ["finish"]

    next_nodes: list[str] = []
    if "agente_plano_personalizacao" not in completed and not state.get("plano_personalizacao"):
        next_nodes.append("agente_plano_personalizacao")
    if state.get("plano_personalizacao") and "agente_ai_patch" not in completed and not state.get("ai_patch"):
        next_nodes.append("agente_ai_patch")
    if state.get("plano_personalizacao") and "agente_midias_personalizadas" not in completed and not state.get("materiais_personalizados"):
        next_nodes.append("agente_midias_personalizadas")

    if next_nodes:
        return next_nodes

    if state.get("plano_personalizacao") or state.get("ai_patch") or state.get("materiais_personalizados"):
        return ["persist_personalizacao"]

    return ["finish"]


def build_state_summary(state: dict[str, Any]) -> dict[str, Any]:
    """Resumo do estado que vai ao modelo do supervisor. Sem o UUID do aluno:
    o supervisor so escolhe o proximo no, e dado pseudonimizado continua sendo
    dado pessoal (LGPD, minimizacao)."""
    perfil = state.get("perfil_brainhex", [])
    desempenho = state.get("desempenho_recente", {})
    emocao = state.get("emocao_atual")
    if state.get("workflow_kind") == "personalizar":
        return {
            "workflow_kind": "personalizar",
            "classe_id": state.get("classe_id"),
            "topico_id": state.get("payload_topico_id"),
            "conteudo_foco_id": state.get("conteudo_boss_foco_id"),
            "perfil_dominante": perfil[0] if perfil else None,
            "media_acertos": desempenho.get("media_acertos"),
            "plano_pronto": bool(state.get("plano_personalizacao")),
            "ai_patch_pronto": bool(state.get("ai_patch")),
            "materiais_prontos": bool(state.get("materiais_personalizados")),
        }
    return {
        "classe_id": state.get("classe_id"),
        "gerar_materiais": state.get("gerar_materiais", False),
        "perfil_dominante": perfil[0] if perfil else None,
        "media_acertos": desempenho.get("media_acertos"),
        "percentual_concluido": desempenho.get("percentual_concluido"),
        "emocao_atual": emocao,
        "eventos_novos": state.get("eventos_novos", []),
        "outputs_prontos": {
            "perfil_update": bool(state.get("perfil_update")),
            "trilha_config": bool(state.get("trilha_config")),
            "conteudo_adaptado": bool(state.get("conteudo_adaptado")),
            "materiais_gerados": bool(state.get("materiais_gerados")),
            "notificacao_payload": bool(state.get("notificacao_payload")),
            "intervencao_payload": bool(state.get("intervencao_payload")),
            "cronometro_payload": bool(state.get("cronometro_payload")),
            "ui_config": bool(state.get("ui_config")),
            "textos_gerados": bool(state.get("textos_gerados")),
        },
    }


def route_from_state(state: dict[str, Any]) -> list[str]:
    return state.get("next", ["finish"])
