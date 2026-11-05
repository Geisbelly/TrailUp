from typing import Protocol

from app.schemas.emocao_result import EmocaoResult


class EmocaoAdapter(Protocol):
    async def analisar_frame(self, frame_b64: str, metadados: dict) -> EmocaoResult | None:
        ...

