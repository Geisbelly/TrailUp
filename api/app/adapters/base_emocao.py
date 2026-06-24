from collections.abc import Sequence
from typing import Protocol

from app.schemas.common import Evento
from app.schemas.emocao_result import EmocaoResult


class EmocaoAdapter(Protocol):
    async def analisar_frame(self, frame_b64: str, metadados: dict) -> EmocaoResult:
        ...

    async def analisar_comportamento(self, eventos: Sequence[Evento]) -> EmocaoResult:
        ...

