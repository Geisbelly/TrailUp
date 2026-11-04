import json
import logging
from pathlib import Path
from typing import Any, Callable, TypeVar

from pydantic import BaseModel

from app.core.settings import Settings
from app.services import gemini_chaves
from app.services.roteamento_ia import (
    MENSAGEM_IA_INDISPONIVEL,
    IAIndisponivelParaMenor,
    rota_de_menor_ativa,
)

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

# Uma tentativa so por (chave, modelo): quem tenta de novo e a rotacao abaixo.
# O default do ChatGoogleGenerativeAI e 6 tentativas com backoff de 1+2+4+8+16 s
# para 429/5xx, entao cada chave sem cota custava ~34 s antes de a rotacao ver o
# erro (medido em 02/11 contra um Gemini falso). Em producao, ciclos de mesma
# forma saiam em 16, 51, 192 e 238 s, os degraus desses 34 s; com as 4 chaves
# sem cota nos 3 modelos vivos, uma chamada passava de 6 min e a fila desistia
# no teto de 300 s. `1`, nao `0`: `0` volta ao default do SDK do Google.
_GEMINI_MAX_RETRIES = 1

# Chaves, cooldown e classificacao de erro moram em `gemini_chaves`, um pool so
# para a API inteira (ver o docstring de la). GEMINI_API_KEY com varias chaves
# separadas por virgula/ponto-e-virgula: passada INTEIRA como uma chave so, o
# Gemini responde 401 UNAUTHENTICATED (ACCESS_TOKEN_TYPE_UNSUPPORTED).
_parse_gemini_keys = gemini_chaves.parse_lista


def reset_gemini_llm_circuit() -> None:
    gemini_chaves.reset()


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


class StructuredOutputError(Exception):
    """Geracao com schema nativo falhou (rede, provedor indisponivel, ou
    saida que nao bate com o schema) mesmo depois de tentar todos os
    candidatos de chave/modelo."""


T = TypeVar("T", bound=BaseModel)


class MenorSemOpenAIError(StructuredOutputError, IAIndisponivelParaMenor):
    """Rota de menor (#195): a IA e so para adulto confirmado, entao nada sai.
    Quem trata StructuredOutputError cai no fallback local (sem IA); quem nao
    trata vira 503 amigavel (handler no main). O nome ficou da epoca em que a
    rota de menor ia para a OpenAI (#619)."""

    def __init__(self, motivo: str) -> None:
        StructuredOutputError.__init__(self, motivo)
        self.motivo = motivo
        self.mensagem = MENSAGEM_IA_INDISPONIVEL


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
            client = ChatOpenAI(
                model=model, temperature=0, api_key=self.settings.openai_api_key, timeout=self._timeout()
            )
        elif effective_provider == "gemini":
            api_keys = _parse_gemini_keys(str(self.settings.gemini_api_key or ""))
            if not api_keys or ChatGoogleGenerativeAI is None:
                return None
            client = self._new_gemini_client(model, api_keys[0])
        else:
            return None

        self._clients[cache_key] = client
        return client

    def _timeout(self) -> float:
        return float(self.settings.llm_request_timeout_seconds)

    def _new_gemini_client(self, model: str, api_key: str) -> Any:
        return ChatGoogleGenerativeAI(
            model=model,
            temperature=0,
            google_api_key=api_key,
            max_retries=_GEMINI_MAX_RETRIES,
            timeout=self._timeout(),
        )

    def _get_gemini_client(self, model: str, api_key: str) -> Any:
        cache_key = f"gemini:{model}:{api_key}"
        client = self._clients.get(cache_key)
        if client is None:
            client = self._new_gemini_client(model, api_key)
            self._clients[cache_key] = client
        return client

    async def _ainvoke_gemini_with_rotation(
        self,
        *,
        messages: list[Any],
        primary_model: str,
        structured_schema: dict[str, Any] | None = None,
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
        cooldown_sec, cooldown_diario_sec = gemini_chaves.cooldowns_de(self.settings)
        last_exc: Exception | None = None
        for model in candidate_models:
            for _ in range(len(api_keys)):
                key = gemini_chaves.escolher_chave(api_keys, model)
                if key is None:
                    break
                client = self._get_gemini_client(model, key)
                if structured_schema is not None:
                    client = client.with_structured_output(structured_schema)
                try:
                    return await client.ainvoke(messages)
                except Exception as exc:
                    last_exc = exc
                    if gemini_chaves.marcar_falha(
                        key,
                        model,
                        exc,
                        cooldown_sec=cooldown_sec,
                        cooldown_diario_sec=cooldown_diario_sec,
                    ):
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

        if rota_de_menor_ativa():
            # #195: IA so para adulto confirmado. Nada sai; fallback local.
            logger.info("LLM rota de menor: %s sem IA, fallback local", prompt_name)
            return fallback_factory()

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

    async def ainvoke_structured(
        self,
        *,
        prompt_name: str,
        payload: dict[str, Any],
        schema: type[T],
        model: str | None = None,
        provider: str | None = None,
        use_rag: bool = False,
    ) -> T:
        if rota_de_menor_ativa():
            # #195: IA so para adulto confirmado. Vem antes do RAG: a busca
            # tambem chama modelo e leva a pergunta do aluno.
            raise MenorSemOpenAIError(f"{prompt_name}: IA so para maiores de 18 (rota de menor)")
        if use_rag:
            from app.services.openai_rag import OpenAIRagService

            response = await OpenAIRagService(self.settings).invoke_structured(
                prompt_name=prompt_name,
                payload=payload,
                schema=schema,
                model=model,
            )
            return response  # type: ignore[return-value]

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

        json_schema = schema.model_json_schema()

        effective_provider = provider or self.settings.llm_provider
        effective_model = model or self._active_default(provider)

        try:
            if effective_provider == "gemini":
                response = await self._ainvoke_gemini_with_rotation(
                    messages=messages,
                    primary_model=effective_model,
                    structured_schema=json_schema,
                )
            else:
                client = self._get_client(effective_model, provider=provider)
                response = (
                    await client.with_structured_output(json_schema).ainvoke(messages)
                    if client is not None
                    else None
                )
        except Exception as exc:
            raise StructuredOutputError(
                f"Falha ao gerar saida estruturada para {prompt_name}: {exc}"
            ) from exc

        if response is None:
            raise StructuredOutputError(
                f"Nenhum provedor LLM disponivel para {prompt_name}"
            )

        raw = response if isinstance(response, dict) else extract_json(
            getattr(response, "content", response)
        )
        try:
            return schema.model_validate(raw)
        except Exception as exc:
            raise StructuredOutputError(
                f"Saida de {prompt_name} nao bateu com o schema {schema.__name__}: {exc}"
            ) from exc

