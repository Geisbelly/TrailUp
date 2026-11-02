from typing import Literal

from pydantic import BaseModel, Field


class IntervencaoSugestao(BaseModel):
    """O que o modelo escreve. A evidencia (kind, ocorrencias, tipo) nao passa
    por ele: vem da recorrencia detectada em `memoria_aluno`, para o texto nao
    poder inventar o motivo."""

    texto: str = Field(min_length=1, max_length=400)
    acao: Literal["notificacao", "acompanhar"]
    notificacao_titulo: str | None = Field(default=None, max_length=60)
    notificacao_corpo: str | None = Field(default=None, max_length=200)


class IntervencaoPayload(BaseModel):
    tipo: Literal["pedagogica", "engajamento"]
    kind: str
    ocorrencias: int = Field(ge=1)
    janela: int = Field(ge=1)
    texto: str = Field(min_length=1, max_length=400)
    base: str
    acao: Literal["notificacao", "acompanhar"]
    notificacao_titulo: str | None = None
    notificacao_corpo: str | None = None
    origem: Literal["modelo", "regra"]
