from datetime import datetime

from pydantic import BaseModel, Field


class DominioTopico(BaseModel):
    dominio_estimado: float
    tendencia: str
    confianca: float
    atualizado_em: datetime | None = None


class MentalStateRecorrente(BaseModel):
    recorrente: bool = False
    kind: str | None = None
    ocorrencias: int = 0


class MemoriaAluno(BaseModel):
    dominio_por_topico: dict[str, DominioTopico] = Field(default_factory=dict)
    mental_state_recorrente: MentalStateRecorrente = Field(default_factory=MentalStateRecorrente)
