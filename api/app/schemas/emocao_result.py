from pydantic import BaseModel, Field


class EmocaoResult(BaseModel):
    emocao_primaria: str
    valencia: float = Field(ge=-1, le=1)
    confianca: float = Field(ge=0, le=1)
    origem: str

