from typing import Any

from pydantic import BaseModel, Field


class PropostaDeMissao(BaseModel):
    """Uma missão proposta. `alvo` fica solto de propósito (número, texto, decimal): quem valida é o
    banco (`fn_missao_ia_registrar`), que descarta o que não for inteiro dentro do teto da métrica."""

    titulo: str
    descricao: str
    metrica: str
    alvo: Any
    base: str = ""


class MissoesIaSaida(BaseModel):
    propostas: list[PropostaDeMissao] = Field(default_factory=list)
