from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class InsightGerado(BaseModel):
    """Um item devolvido pelo modelo. `aluno_ref` e a referencia curta (A1,
    A2...) que o payload deu a cada aluno — o modelo nunca ve nem devolve o
    uuid, entao nao ha como ele inventar um aluno fora da turma."""

    natureza: Literal["sugestao", "observacao"]
    escopo: Literal["turma", "aluno"]
    aluno_ref: str | None = None
    tipo: Literal["pedagogica", "emocional", "engajamento"]
    texto: str
    base: str


class InsightsTurmaSaida(BaseModel):
    insights: list[InsightGerado] = Field(default_factory=list)


StatusDaGeracao = Literal["gerando", "recente", "concluido", "sem_dados", "falhou", "ocioso"]


class InsightsGeracaoResponse(BaseModel):
    """Estado da geracao de insights de uma turma.

    - `gerando`: disparada agora (ou ja rodando); o console acompanha.
    - `recente`: ha um lote de poucos minutos atras; nada foi disparado.
    - `concluido` / `sem_dados` / `falhou`: como terminou a ultima geracao
      que ESTE processo rodou (`itens` = quantos foram gravados).
    - `ocioso`: este processo nao rodou nenhuma (a API pode ter reiniciado);
      o lote gravado, se houver, esta em `intervencoes`.
    """

    status: StatusDaGeracao
    itens: int | None = None
    ultima_geracao_em: datetime | None = None
