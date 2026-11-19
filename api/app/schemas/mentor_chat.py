from pydantic import BaseModel, ConfigDict, Field


class SecaoDoGuia(BaseModel):
    titulo: str
    texto: str
    # Código de DESTINOS_DO_APP ou vazio.
    destino: str = ""


class RegistroDaConversa(BaseModel):
    """O que a pergunta do aluno era, para `chat_guia_registros` (20261118_01). Nunca vai ao aluno.

    Tudo em texto livre e com default: valor fora da lista é corrigido na API
    (`mascaramento_chat.normalizar_registro`), em vez de reprovar a resposta inteira."""

    model_config = ConfigDict(
        json_schema_extra={"required": ["intencao", "assunto", "conceitos", "dificuldade"]}
    )

    # duvida_materia | pedido_resposta | navegacao_app | personalizacao | estrategia_estudo | desabafo | outro
    intencao: str = "outro"
    # O tema em termos da matéria, sem nome nem dado pessoal. Nunca a frase do aluno.
    assunto: str = ""
    conceitos: list[str] = Field(default_factory=list)
    # nenhuma | alguma | travado
    dificuldade: str = "nenhuma"


class MentorChatLLMResult(BaseModel):
    # Chave com default fica fora de "required" no schema do modelo, que pode omiti-la (#761).
    model_config = ConfigDict(
        json_schema_extra={"required": ["reply", "secoes", "destinos", "tutorial", "registro"]}
    )

    reply: str
    should_close: bool = False
    hinted_actions: list[str] = Field(default_factory=list)
    # Uma parte por assunto; o app desenha um cartão com botão para cada uma.
    secoes: list[SecaoDoGuia] = Field(default_factory=list)
    destinos: list[str] = Field(default_factory=list)
    # Tutorial do catálogo (TUTORIAIS_DO_APP) ou vazio.
    tutorial: str = ""
    # Fica no servidor: a rota monta a resposta ao app campo a campo e não o inclui.
    registro: RegistroDaConversa = Field(default_factory=RegistroDaConversa)


class GroundingJudgment(BaseModel):
    viola: bool
    motivo: str = ""
