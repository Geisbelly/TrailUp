from __future__ import annotations

from typing import Any

from app.schemas.emocao_result import EmocaoResult
from app.services.emotion_vision import LocalVisionEmotionAnalyzer


class LocalVisionEmotionAdapter:
    """Adapts the local image analyzer to the legacy graph-node contract."""

    def __init__(self, *, caminho_modelo: str, caminho_detector: str) -> None:
        self._analyzer = LocalVisionEmotionAnalyzer(
            caminho_modelo=caminho_modelo,
            caminho_detector=caminho_detector,
        )

    async def analisar_frame(
        self,
        frame_b64: str,
        metadados: dict[str, Any],
    ) -> EmocaoResult | None:
        result = await self._analyzer.analyze(
            frames_b64=[frame_b64],
            eventos_novos=[],
            telemetry_payload=None,
            state=metadados,
        )
        if result is None:
            return None
        return EmocaoResult(
            emocao_primaria=result.emocao_primaria,
            valencia=result.valencia,
            confianca=result.confianca,
            origem=result.provider_name,
        )
