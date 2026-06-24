from datetime import datetime

from pydantic import BaseModel, Field


class NotificacaoPayload(BaseModel):
    tipo: str
    titulo: str
    corpo: str
    horario: datetime
    prioridade: int = Field(default=0, ge=0)
    contexto: dict = Field(default_factory=dict)

