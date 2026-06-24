from pydantic import BaseModel, Field


class TrilhaConfig(BaseModel):
    classe_id: int
    topico_foco: int | None = None
    proximos_topicos: list[int] = Field(default_factory=list)
    ajustes: list[str] = Field(default_factory=list)
    justificativa: str

