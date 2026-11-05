from pydantic import BaseModel, ConfigDict, Field


class SecaoDoGuia(BaseModel):
    titulo: str
    texto: str
    # Código de DESTINOS_DO_APP ou vazio.
    destino: str = ""


class MentorChatLLMResult(BaseModel):
    # Chave com default fica fora de "required" no schema do modelo, que pode omiti-la (#761).
    model_config = ConfigDict(json_schema_extra={"required": ["reply", "secoes", "destinos", "tutorial"]})

    reply: str
    should_close: bool = False
    hinted_actions: list[str] = Field(default_factory=list)
    # Uma parte por assunto; o app desenha um cartão com botão para cada uma.
    secoes: list[SecaoDoGuia] = Field(default_factory=list)
    destinos: list[str] = Field(default_factory=list)
    # Tutorial do catálogo (TUTORIAIS_DO_APP) ou vazio.
    tutorial: str = ""


class GroundingJudgment(BaseModel):
    viola: bool
    motivo: str = ""
