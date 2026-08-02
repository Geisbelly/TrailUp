import json
import logging
import re
import time
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

# Cota do free tier do Gemini e por (chave, modelo) — reproduzido em producao:
# GEMINI_API_KEY com varias chaves (separadas por virgula/ponto-e-virgula,
# mesmo formato de content_enrichment.py) sendo passada INTEIRA como uma
# unica chave pro ChatGoogleGenerativeAI, gerando 401 UNAUTHENTICATED
# (ACCESS_TOKEN_TYPE_UNSUPPORTED) mesmo com chaves validas configuradas.
_GEMINI_KEY_QUOTA_COOLDOWN_SEC = 300
_gemini_key_unavailable_until: dict[tuple[str, str], float] = {}
_gemini_key_rotation_index: int = 0


def _parse_gemini_keys(raw: str) -> list[str]:
    seen: set[str] = set()
    keys: list[str] = []
    for part in re.split(r"[,;]", raw or ""):
        key = part.strip()
        if key and key not in seen:
            seen.add(key)
            keys.append(key)
    return keys


def _is_gemini_quota_error(exc: BaseException) -> bool:
    status = str(getattr(exc, "status_code", "") or getattr(exc, "code", "") or "").strip()
    text = str(exc).lower()
    if status in {"429", "RESOURCE_EXHAUSTED"}:
        return True
    return "resource_exhausted" in text or "quota" in text


def _is_gemini_model_unavailable_error(exc: BaseException) -> bool:
    """404/401 de modelo aposentado ou indisponivel pra novos usuarios — ver
    mesma checagem em content_enrichment.py e no microservice."""
    status = str(getattr(exc, "status_code", "") or getattr(exc, "code", "") or "").strip()
    text = str(exc).lower()
    if status in {"404", "401", "NOT_FOUND", "UNAUTHENTICATED"}:
        return True
    return (
        "not_found" in text
        or "unauthenticated" in text
        or "no longer available" in text
    )


def _is_gemini_transient_error(exc: BaseException) -> bool:
    """503 UNAVAILABLE ('high demand') e 5xx em geral sao sobrecarga
    transitoria do servidor do Gemini, nao um problema da conta/chave — ver
    mesma checagem em content_enrichment.py e no microservice."""
    status = str(getattr(exc, "status_code", "") or getattr(exc, "code", "") or "").strip()
    text = str(exc).lower()
    if status in {"500", "502", "503", "504", "UNAVAILABLE"}:
        return True
    return (
        "unavailable" in text
        or "overloaded" in text
        or "high demand" in text
        or "try again later" in text
    )


def _pick_available_gemini_key(api_keys: list[str], model: str) -> str | None:
    """Round-robin entre as chaves que nao estao em cooldown de cota PARA ESSE
    MODELO; None se todas estiverem indisponiveis no momento."""
    global _gemini_key_rotation_index
    now = time.time()
    for offset in range(len(api_keys)):
        index = (_gemini_key_rotation_index + offset) % len(api_keys)
        key = api_keys[index]
        if now >= _gemini_key_unavailable_until.get((key, model), 0.0):
            _gemini_key_rotation_index = index
            return key
    return None


def reset_gemini_llm_circuit() -> None:
    global _gemini_key_unavailable_until, _gemini_key_rotation_index
    _gemini_key_unavailable_until = {}
    _gemini_key_rotation_index = 0


def load_prompt(filename: str) -> str:
    return (PROMPTS_DIR / filename).read_text(encoding="utf-8")


def _coerce_text_content(content: Any) -> str:
    """langchain_google_genai as vezes devolve response.content como uma
    lista de partes (str ou dict com chave "text") em vez de uma string
    simples — reproduzido em producao: content.strip() falhava com
    'list' object has no attribute 'strip'."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(str(item.get("text") or ""))
        return "".join(parts)
    return str(content or "")


def extract_json(content: Any) -> dict[str, Any]:
    normalized = _coerce_text_content(content).strip()
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

    def _gemini_fallback_models(self) -> list[str]:
        return _parse_gemini_keys(str(getattr(self.settings, "gemini_text_fallback_models", "") or ""))

    def _get_client(self, model: str, provider: str | None = None):
        """Mantido pra compatibilidade: OpenAI (chave unica) e Gemini com uma
        unica chave configurada. O caminho Gemini com rotacao de chaves/
        modelos usado por ainvoke_json vive em _ainvoke_gemini_with_rotation."""
        effective_provider = provider or self.settings.llm_provider
        cache_key = f"{effective_provider}:{model}"
        if cache_key in self._clients:
            return self._clients[cache_key]

        if effective_provider == "openai":
            if not self.settings.openai_api_key or ChatOpenAI is None:
                return None
            client = ChatOpenAI(model=model, temperature=0, api_key=self.settings.openai_api_key)
        elif effective_provider == "gemini":
            api_keys = _parse_gemini_keys(str(self.settings.gemini_api_key or ""))
            if not api_keys or ChatGoogleGenerativeAI is None:
                return None
            client = ChatGoogleGenerativeAI(model=model, temperature=0, google_api_key=api_keys[0])
        else:
            return None

        self._clients[cache_key] = client
        return client

    def _get_gemini_client(self, model: str, api_key: str) -> Any:
        cache_key = f"gemini:{model}:{api_key}"
        client = self._clients.get(cache_key)
        if client is None:
            client = ChatGoogleGenerativeAI(model=model, temperature=0, google_api_key=api_key)
            self._clients[cache_key] = client
        return client

    async def _ainvoke_gemini_with_rotation(
        self,
        *,
        messages: list[Any],
        primary_model: str,
    ) -> Any | None:
        """Tenta o modelo principal em todas as chaves configuradas
        (round-robin); se TODAS esgotarem a cota (ou o modelo estiver
        aposentado/indisponivel), passa pro proximo modelo candidato — mesma
        logica de content_enrichment.py e do microservice."""
        api_keys = _parse_gemini_keys(str(self.settings.gemini_api_key or ""))
        if not api_keys or ChatGoogleGenerativeAI is None:
            return None

        candidate_models = [primary_model] + [
            item for item in self._gemini_fallback_models() if item != primary_model
        ]
        last_exc: Exception | None = None
        for model in candidate_models:
            for _ in range(len(api_keys)):
                key = _pick_available_gemini_key(api_keys, model)
                if key is None:
                    break
                client = self._get_gemini_client(model, key)
                try:
                    return await client.ainvoke(messages)
                except Exception as exc:
                    last_exc = exc
                    if (
                        _is_gemini_quota_error(exc)
                        or _is_gemini_model_unavailable_error(exc)
                        or _is_gemini_transient_error(exc)
                    ):
                        _gemini_key_unavailable_until[(key, model)] = time.time() + _GEMINI_KEY_QUOTA_COOLDOWN_SEC
                        continue
                    raise
        if last_exc is not None:
            raise last_exc
        return None

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
            fallback_factory = dict

        normalized_payload = dict(payload)
        normalized_payload.setdefault("idioma", "português brasileiro")
        normalized_payload.setdefault("locale", "pt-BR")
        normalized_payload.setdefault("linguagem", "português brasileiro")
        messages = [
            SystemMessage(content=load_prompt(prompt_name)),
            HumanMessage(
                content=json.dumps(normalized_payload, ensure_ascii=False, default=str)
            ),
        ]

        effective_provider = provider or self.settings.llm_provider
        effective_model = model or self._active_default(provider)

        try:
            if effective_provider == "gemini":
                response = await self._ainvoke_gemini_with_rotation(
                    messages=messages,
                    primary_model=effective_model,
                )
            else:
                client = self._get_client(effective_model, provider=provider)
                response = await client.ainvoke(messages) if client is not None else None
            if response is None:
                return fallback_factory()
            return extract_json(response.content)
        except Exception as exc:  # pragma: no cover
            logger.warning("LLM fallback acionado para %s: %s", prompt_name, exc)
            return fallback_factory()
