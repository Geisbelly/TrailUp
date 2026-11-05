from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.entrada_chat import limpar_texto


class MensagemEscriba(BaseModel):
    papel: Literal["professor", "escriba"]
    texto: str = Field(min_length=1, max_length=2000)
    # Devolvida como veio em `RespostaEscriba`; só vale para as falas da Lumi.
    assinatura: str | None = Field(default=None, max_length=64)

    @field_validator("texto", mode="before")
    @classmethod
    def _texto_limpo(cls, valor: Any) -> Any:
        return limpar_texto(valor) if isinstance(valor, str) else valor


class PerguntaEscriba(BaseModel):
    pergunta: str = Field(min_length=1, max_length=500)
    # None = todas as turmas do professor autenticado.
    classe_id: int | None = None
    # Conversa anterior, só para dar continuidade; nada é gravado no banco.
    historico: list[MensagemEscriba] = Field(default_factory=list, max_length=12)

    @field_validator("pergunta", mode="before")
    @classmethod
    def _pergunta_limpa(cls, valor: Any) -> Any:
        return limpar_texto(valor) if isinstance(valor, str) else valor


class SecaoSaida(BaseModel):
    titulo: str
    texto: str
    # Código da lista fechada (DESTINOS_DO_CONSOLE) ou vazio.
    destino: str = ""


class EscribaSaida(BaseModel):
    # Chave com default fica fora de "required" no schema do modelo, que pode omiti-la (#761).
    model_config = ConfigDict(json_schema_extra={"required": ["resposta", "secoes", "destinos", "tutorial"]})

    resposta: str
    # Partes da resposta, uma por assunto; o console desenha um cartão com botão para cada uma.
    secoes: list[SecaoSaida] = Field(default_factory=list)
    # Partes do console que a resposta manda o professor abrir (ver DESTINOS_DO_CONSOLE).
    destinos: list[str] = Field(default_factory=list)
    # Tutorial guiado do catálogo (TUTORIAIS_DO_CONSOLE) ou vazio.
    tutorial: str = ""


class SecaoDaResposta(BaseModel):
    titulo: str
    texto: str
    destino: str | None = None


class RespostaEscriba(BaseModel):
    # O texto inteiro, em linha: é o que volta como histórico (e o que um console antigo mostra).
    resposta: str
    turmas: list[int]
    gerado_em: datetime
    # Abertura que vem antes das seções; vazia quando a resposta não tem seções.
    introducao: str = ""
    secoes: list[SecaoDaResposta] = Field(default_factory=list)
    # Já filtrados pela lista fechada; o console desenha um botão por destino.
    destinos: list[str] = Field(default_factory=list)
    tutorial: str | None = None
    # Prova de que `resposta` saiu daqui. Fala da Lumi sem ela não volta ao modelo.
    assinatura: str | None = None
