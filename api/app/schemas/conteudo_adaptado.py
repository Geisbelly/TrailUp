from pydantic import BaseModel, Field


class ConteudoAdaptado(BaseModel):
    topico_id: int
    conteudo_id: int | None = None
    conteudos: list[str] = Field(default_factory=list)
    nivel: str
    exemplos: list[str] = Field(default_factory=list)
    observacoes: list[str] = Field(default_factory=list)
