"""Integração do TrailUp com o OpenAI Vector Store.

O serviço mantém a chave apenas no backend. O Vector Store remoto faz parsing,
chunking, embeddings e recuperação; esta camada só monta a ferramenta,
valida a resposta estruturada e encapsula uploads.
"""

from __future__ import annotations

import io
import json
import time
from typing import Any

from openai import AsyncOpenAI
from pydantic import BaseModel

from app.core.settings import Settings
from app.services.llm import StructuredOutputError, extract_json, load_prompt
from app.services.rag_observabilidade import registrar_busca, resumo_da_busca


class OpenAIRagService:
    def __init__(self, settings: Settings, client: AsyncOpenAI | None = None) -> None:
        self.settings = settings
        self._client = client

    @property
    def vector_store_id(self) -> str | None:
        value = str(self.settings.openai_rag_vector_store_id or "").strip()
        return value or None

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            api_key = str(self.settings.openai_api_key or "").strip()
            if not api_key:
                raise OpenAIRagError("OPENAI_API_KEY nao configurada")
            self._client = AsyncOpenAI(api_key=api_key)
        return self._client

    def is_configured(self) -> bool:
        return bool(
            self.settings.openai_rag_enabled
            and str(self.settings.openai_api_key or "").strip()
            and self.vector_store_id
        )

    async def invoke_structured(
        self,
        *,
        prompt_name: str,
        payload: dict[str, Any],
        schema: type[BaseModel],
        model: str | None = None,
    ) -> BaseModel:
        if not self.is_configured():
            raise StructuredOutputError("OpenAI RAG nao esta configurado")

        normalized_payload = dict(payload)
        normalized_payload.setdefault("idioma", "português brasileiro")
        normalized_payload.setdefault("locale", "pt-BR")
        normalized_payload.setdefault("linguagem", "português brasileiro")
        input_text = (
            f"INSTRUÇÕES DO MENTOR:\n{load_prompt(prompt_name)}\n\n"
            "DADOS DA SESSÃO:\n"
            f"{json.dumps(normalized_payload, ensure_ascii=False, default=str)}"
        )

        tool: dict[str, Any] = {
            "type": "file_search",
            "vector_store_ids": [self.vector_store_id],
        }
        if self.top_k is not None:
            tool["max_num_results"] = self.top_k
        modelo = model or self.settings.openai_model_default

        response = None
        inicio = time.perf_counter()
        try:
            try:
                response = await self._get_client().responses.create(
                    model=modelo,
                    input=input_text,
                    tools=[tool],
                    include=["file_search_call.results"],
                    store=False,
                    text={
                        "format": {
                            "type": "json_schema",
                            "name": schema.__name__,
                            "strict": True,
                            "schema": _strict_json_schema(schema.model_json_schema()),
                        }
                    },
                )
            except Exception as exc:
                self._registrar(None, inicio, prompt_name, modelo, exc)
                raise
            self._registrar(response, inicio, prompt_name, modelo, None)
            raw = extract_json(response.output_text)
            return schema.model_validate(raw)
        except Exception as exc:
            raise StructuredOutputError(
                f"Falha no OpenAI RAG para {prompt_name}: {type(exc).__name__}"
            ) from exc

    @property
    def top_k(self) -> int | None:
        return self.settings.openai_rag_top_k

    def _registrar(
        self, response: Any, inicio: float, prompt_name: str, modelo: str, erro: BaseException | None
    ) -> None:
        # Observabilidade nunca derruba a resposta (#67).
        try:
            registrar_busca(
                resumo_da_busca(
                    response,
                    latencia_ms=(time.perf_counter() - inicio) * 1000,
                    prompt_name=prompt_name,
                    model=modelo,
                    top_k=self.top_k,
                    erro=erro,
                )
            )
        except Exception:  # pragma: no cover
            pass

    async def upload_public_file(
        self,
        *,
        filename: str,
        content: bytes,
        mime_type: str,
        attributes: dict[str, str | int | float | bool] | None = None,
    ) -> dict[str, Any]:
        """Envia um arquivo ao corpus público configurado.

        A chamada é deliberadamente explícita: fontes de classe/aluno não
        devem usar este método, pois o Vector Store configurado é compartilhado.
        """
        if not self.is_configured():
            raise OpenAIRagError("OpenAI RAG nao esta configurado")
        _validate_attributes(attributes or {})
        if not content:
            raise OpenAIRagError("Arquivo vazio nao pode ser indexado")

        try:
            client = self._get_client()
            uploaded = await client.files.create(
                file=(filename, io.BytesIO(content), mime_type),
                purpose="assistants",
            )
            attached = await client.vector_stores.files.create_and_poll(
                vector_store_id=self.vector_store_id,
                file_id=uploaded.id,
                attributes=attributes or {},
            )
            return {
                "openai_file_id": uploaded.id,
                "openai_vector_store_file_id": attached.id,
                "status": attached.status,
            }
        except Exception as exc:
            raise OpenAIRagError(
                f"Falha ao enviar arquivo para o OpenAI Vector Store: {type(exc).__name__}"
            ) from exc


class OpenAIRagError(RuntimeError):
    """Erro operacional do serviço remoto, sem detalhes sensíveis."""


def _validate_attributes(attributes: dict[str, str | int | float | bool]) -> None:
    if len(attributes) > 16:
        raise OpenAIRagError("O Vector Store aceita no maximo 16 atributos")
    for key, value in attributes.items():
        if not isinstance(key, str) or not key or len(key) > 64:
            raise OpenAIRagError("Atributo do Vector Store possui chave invalida")
        if not isinstance(value, (str, int, float, bool)):
            raise OpenAIRagError("Atributo do Vector Store possui valor invalido")
        if isinstance(value, str) and len(value) > 512:
            raise OpenAIRagError("Atributo do Vector Store possui valor muito longo")


def _strict_json_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Converte schema Pydantic para o subconjunto estrito da Responses API."""
    normalized = json.loads(json.dumps(schema))

    def visit(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "object" or "properties" in node:
                properties = node.get("properties") or {}
                node["additionalProperties"] = False
                node["required"] = list(properties)
                for property_schema in properties.values():
                    visit(property_schema)
            for key in ("anyOf", "oneOf", "allOf"):
                for variant in node.get(key) or []:
                    visit(variant)
            for definition in (node.get("$defs") or {}).values():
                visit(definition)
        elif isinstance(node, list):
            for item in node:
                visit(item)

    visit(normalized)
    return normalized
