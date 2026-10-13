from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class MensagemEscriba(BaseModel):
    papel: Literal["professor", "escriba"]
    texto: str = Field(min_length=1, max_length=2000)


class PerguntaEscriba(BaseModel):
    pergunta: str = Field(min_length=1, max_length=500)
    # None = todas as turmas do professor autenticado.
    classe_id: int | None = None
    # Conversa anterior, só para dar continuidade; nada é gravado no banco.
    historico: list[MensagemEscriba] = Field(default_factory=list, max_length=12)


class EscribaSaida(BaseModel):
    resposta: str


class RespostaEscriba(BaseModel):
    resposta: str
    turmas: list[int]
    gerado_em: datetime
