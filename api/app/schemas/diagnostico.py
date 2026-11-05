from typing import Any

from pydantic import BaseModel, Field


class PerguntaDeDiagnostico(BaseModel):
    """Uma pergunta de múltipla escolha. Os campos ficam soltos de propósito (`correta` pode vir como texto):
    quem valida é o banco (`fn_diagnostico_registrar`), que descarta o que não servir."""

    enunciado: str
    opcoes: list[Any] = Field(default_factory=list)
    correta: Any = None


class DiagnosticoSaida(BaseModel):
    perguntas: list[PerguntaDeDiagnostico] = Field(default_factory=list)
