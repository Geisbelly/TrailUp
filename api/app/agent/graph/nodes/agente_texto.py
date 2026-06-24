from typing import Any

from app.core.settings import Settings
from app.schemas.texto_gerado import TextoGerado
from app.services.llm import JsonLLMService


def _fallback_texto(state: dict[str, Any]) -> dict[str, Any]:
    ui = state.get("ui_config") or {}
    tipo = ui.get("tipo_modal") or "motivacional_push"
    perfis = state.get("perfil_brainhex", [])
    perfil_dom = max(perfis, key=lambda item: item.get("afinidade", 0))["perfil"] if perfis else "Achiever"
    emocao = (state.get("emocao_atual") or {}).get("emocao_primaria", "concentrado")

    templates = {
        "suporte": ("Respire e avance", "Vamos quebrar este passo em partes menores para voce retomar com seguranca."),
        "conquista": ("Progresso confirmado", "Seu ritmo esta funcionando. Continue e consolide esta etapa agora."),
        "dica": ("Dica do momento", "Use um exemplo pratico curto antes de seguir para a proxima atividade."),
        "desafio": ("Novo desafio", "Voce esta pronto para subir o nivel e testar essa habilidade agora."),
    }
    titulo, corpo = templates.get(tipo, ("Continue", "Seu proximo passo ja esta preparado para voce."))
    corpo = f"{corpo} Perfil dominante: {perfil_dom}. Estado atual: {emocao}."
    return {"titulo": titulo, "corpo": corpo, "emoji": None}


async def agente_texto(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    result = await llm.ainvoke_json(
        prompt_name="texto_personalizado.txt",
        payload={
            "ui_config": state.get("ui_config"),
            "perfil_brainhex": state.get("perfil_brainhex", []),
            "emocao_atual": state.get("emocao_atual"),
            "nome_aluno": state.get("nome_aluno"),
            "notificacao_payload": state.get("notificacao_payload"),
        },
        fallback_factory=lambda: _fallback_texto(state),
    )
    texto = TextoGerado.model_validate(result)
    return {
        "textos_gerados": [texto.model_dump(mode="json")],
        "completed_nodes": ["agente_texto"],
        "messages": [f"texto gerado: {texto.titulo}"],
    }
