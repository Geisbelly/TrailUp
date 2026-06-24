import json
import logging
from pathlib import Path
from typing import Any, Callable

from app.core.settings import Settings

try:
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_openai import ChatOpenAI
except ImportError:  # pragma: no cover
    ChatOpenAI = None
    HumanMessage = None
    SystemMessage = None

try:
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError:  # pragma: no cover
    ChatGoogleGenerativeAI = None


logger = logging.getLogger(__name__)
PROMPTS_DIR = Path(__file__).resolve().parents[1] / "agent" / "prompts"


def load_prompt(filename: str) -> str:
    return (PROMPTS_DIR / filename).read_text(encoding="utf-8")


def extract_json(content: str) -> dict[str, Any]:
    normalized = content.strip()
    if normalized.startswith("```"):
        normalized = normalized.split("\n", 1)[-1]
        normalized = normalized.rsplit("```", 1)[0]
    return json.loads(normalized)


class JsonLLMService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._clients: dict[str, Any] = {}

    def _active_default(self, provider: str | None = None) -> str:
        p = provider or self.settings.llm_provider
        return self.settings.gemini_model_default if p == "gemini" else self.settings.openai_model_default

    def _get_client(self, model: str, provider: str | None = None):
        effective_provider = provider or self.settings.llm_provider
        cache_key = f"{effective_provider}:{model}"
        if cache_key in self._clients:
            return self._clients[cache_key]

        if effective_provider == "openai":
            if not self.settings.openai_api_key or ChatOpenAI is None:
                return None
            client = ChatOpenAI(model=model, temperature=0, api_key=self.settings.openai_api_key)
        elif effective_provider == "gemini":
            if not self.settings.gemini_api_key or ChatGoogleGenerativeAI is None:
                return None
            client = ChatGoogleGenerativeAI(model=model, temperature=0, google_api_key=self.settings.gemini_api_key)
        else:
            return None

        self._clients[cache_key] = client
        return client

    async def ainvoke_json(
        self,
        *,
        prompt_name: str,
        payload: dict[str, Any],
        fallback_factory: Callable[[], dict[str, Any]] | None = None,
        model: str | None = None,
        provider: str | None = None,
    ) -> dict[str, Any]:
        if fallback_factory is None:
            fallback_factory = lambda: {}
        client = self._get_client(model or self._active_default(provider), provider=provider)
        if client is None:
            return fallback_factory()

        normalized_payload = dict(payload)
        normalized_payload.setdefault("idioma", "português brasileiro")
        normalized_payload.setdefault("locale", "pt-BR")
        normalized_payload.setdefault("linguagem", "português brasileiro")

        try:
            response = await client.ainvoke(
                [
                    SystemMessage(content=load_prompt(prompt_name)),
                    HumanMessage(
                        content=json.dumps(normalized_payload, ensure_ascii=False, default=str)
                    ),
                ]
            )
            return extract_json(response.content)
        except Exception as exc:  # pragma: no cover
            logger.warning("LLM fallback acionado para %s: %s", prompt_name, exc)
            return fallback_factory()
