import base64
import logging
from typing import Any

import httpx

from app.adapters.base_boss_image import BossImageAdapter
from app.core.settings import Settings
from app.schemas.ia_patch import IAEnemySpec

logger = logging.getLogger(__name__)


class GeminiBossImageAdapter(BossImageAdapter):
    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.gemini_api_key
        self._model = settings.gemini_model_image

    def _extract_png(self, payload: dict[str, Any]) -> bytes | None:
        candidates = payload.get("candidates") or []
        for candidate in candidates:
            parts = ((candidate.get("content") or {}).get("parts")) or []
            for part in parts:
                inline_data = part.get("inlineData") or part.get("inline_data")
                if not isinstance(inline_data, dict):
                    continue
                mime_type = inline_data.get("mimeType") or inline_data.get("mime_type") or ""
                if mime_type != "image/png":
                    continue
                data = inline_data.get("data")
                if not data:
                    continue
                try:
                    return base64.b64decode(data)
                except Exception:
                    return None
        return None

    async def generate_png(self, enemy: IAEnemySpec) -> bytes | None:
        if not self._api_key:
            return None

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent?key={self._api_key}"
        body = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": (
                                "Generate a single PNG illustration for a sinister mobile learning boss encounter. "
                                f"Style prompt: {enemy.image_prompt}. "
                                f"Archetype: {enemy.archetype}. "
                                f"Boss name: {enemy.name}. "
                                "Villain-first composition, dark fantasy readability, strong silhouette, "
                                "menacing facial expression, clean background, centered subject, no text."
                            )
                        }
                    ]
                }
            ]
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=body)
                response.raise_for_status()
            return self._extract_png(response.json())
        except Exception as exc:  # pragma: no cover
            logger.warning("Gemini boss generation falhou para %s: %s", enemy.id, exc)
            return None
