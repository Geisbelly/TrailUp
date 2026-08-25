from pydantic import BaseModel


class TextoGerado(BaseModel):
    titulo: str
    corpo: str
    emoji: str | None = None

