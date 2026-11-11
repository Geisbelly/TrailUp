from typing import Any

from app.core.settings import Settings
from app.schemas.texto_gerado import TextoGerado
from app.services import perfil_vetor
from app.services.llm import JsonLLMService, StructuredOutputError
from app.services.pseudonimizacao import PLACEHOLDER_NOME, restaurar_nome


def _fallback_texto(state: dict[str, Any]) -> dict[str, Any]:
    ui = state.get("ui_config") or {}
    tipo = ui.get("tipo_modal") or "motivacional_push"
    perfis = state.get("perfil_brainhex", [])
    perfil_dom = perfil_vetor.PERFIS_CANONICOS[perfil_vetor.dominante(perfis)]
    emocao = (state.get("emocao_atual") or {}).get("emocao_primaria")

    templates = {
        "suporte": ("Respire e avance", "Vamos quebrar este passo em partes menores para voce retomar com seguranca."),
        "conquista": ("Progresso confirmado", "Seu ritmo esta funcionando. Continue e consolide esta etapa agora."),
        "dica": ("Dica do momento", "Use um exemplo pratico curto antes de seguir para a proxima atividade."),
        "desafio": ("Novo desafio", "Voce esta pronto para subir o nivel e testar essa habilidade agora."),
    }
    titulo, corpo = templates.get(
        tipo,
        ("Mensagem do TrailUp", "Continue no seu ritmo e avance para a proxima etapa."),
    )
    if emocao:
        corpo = f"{corpo} Perfil dominante: {perfil_dom}. Estado atual: {emocao}."
    else:
        corpo = f"{corpo} Perfil dominante: {perfil_dom}."
    return {"titulo": titulo, "corpo": corpo, "emoji": None}


async def agente_texto(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    try:
        texto = await llm.ainvoke_structured(
            prompt_name="texto_personalizado.txt",
            payload={
                "ui_config": state.get("ui_config"),
                "perfil_brainhex": state.get("perfil_brainhex", []),
                "emocao_atual": state.get("emocao_atual"),
                # Nome nao sai do servidor (#195): o modelo escreve o
                # placeholder e a API poe o nome de volta logo abaixo.
                "nome_aluno": PLACEHOLDER_NOME,
                "notificacao_payload": state.get("notificacao_payload"),
            },
            schema=TextoGerado,
        )
    except StructuredOutputError:
        texto = TextoGerado.model_validate(_fallback_texto(state))
    nome = state.get("nome_aluno")
    texto = texto.model_copy(
        update={"titulo": restaurar_nome(texto.titulo, nome), "corpo": restaurar_nome(texto.corpo, nome)}
    )
    return {
        "textos_gerados": [texto.model_dump(mode="json")],
        "completed_nodes": ["agente_texto"],
        "messages": [f"texto gerado: {texto.titulo}"],
    }
