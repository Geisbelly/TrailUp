"""Integração do TrailUp com o OpenAI Vector Store.

O serviço mantém a chave apenas no backend. O Vector Store remoto faz parsing,
chunking, embeddings e recuperação; esta camada só monta a ferramenta,
valida a resposta estruturada e encapsula uploads.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import time
from typing import Any

from openai import AsyncOpenAI
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings
from app.repositories.rag_openai_files import RagOpenAIFilesRepository
from app.services import uso_llm
from app.services.llm import (
    RespostaBloqueadaError,
    RespostaCortadaError,
    StructuredOutputError,
    erro_do_fim,
    extract_json,
    load_prompt,
)
from app.services.rag_observabilidade import registrar_busca, resumo_da_busca

logger = logging.getLogger(__name__)

ESCOPO_PUBLICO = "publico"
# O store configurado e compartilhado por todas as turmas (ADR-0002). A busca so
# enxerga o que foi marcado como publico: um arquivo de turma ou de aluno que
# parasse aqui por engano nao seria recuperado para outro aluno.
_FILTRO_CORPUS_PUBLICO = {"type": "eq", "key": "scope", "value": ESCOPO_PUBLICO}


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
            api_key = str(self.settings.openai_rag_api_key or "").strip()
            if not api_key:
                raise OpenAIRagError("OPENAI_RAG_API_KEY nao configurada")
            self._client = AsyncOpenAI(api_key=api_key)
        return self._client

    def is_configured(self) -> bool:
        return bool(
            self.settings.openai_rag_enabled
            and str(self.settings.openai_rag_api_key or "").strip()
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
            "filters": dict(_FILTRO_CORPUS_PUBLICO),
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
            uso_llm.registrar_resposta_rag(response, prompt=prompt_name, modelo=modelo)
            if (erro := erro_do_fim(uso_llm.fim_da_resposta_rag(response), prompt_name)) is not None:
                raise erro
            raw = extract_json(response.output_text)
            return schema.model_validate(raw)
        except (RespostaBloqueadaError, RespostaCortadaError):
            raise
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
        session: AsyncSession,
        filename: str,
        content: bytes,
        mime_type: str,
        attributes: dict[str, str | int | float | bool] | None = None,
        fonte_id: int | None = None,
    ) -> dict[str, Any]:
        """Envia um arquivo ao corpus público configurado e o registra no catálogo.

        A chamada é deliberadamente explícita: fontes de classe/aluno não
        devem usar este método, pois o Vector Store configurado é compartilhado.

        Sem linha em `rag_openai_files` o arquivo fica fora da auditoria e da
        exclusão de dados, então um envio que não consegue registrar é desfeito.
        O mesmo conteúdo já indexado neste store não é reenviado.
        """
        if not self.is_configured():
            raise OpenAIRagError("OpenAI RAG nao esta configurado")
        informado = dict(attributes or {})
        if informado.get("scope", ESCOPO_PUBLICO) != ESCOPO_PUBLICO:
            raise OpenAIRagError("Este Vector Store so aceita arquivos de escopo publico")
        atributos = {**informado, "scope": ESCOPO_PUBLICO}
        _validate_attributes(atributos)
        if not content:
            raise OpenAIRagError("Arquivo vazio nao pode ser indexado")

        vector_store_id = str(self.vector_store_id)
        source_hash = hashlib.sha256(content).hexdigest()
        catalogo = RagOpenAIFilesRepository(session)
        existente = await catalogo.buscar_concluido(vector_store_id=vector_store_id, source_hash=source_hash)
        if existente:
            return {
                "openai_file_id": existente["openai_file_id"],
                "openai_vector_store_file_id": existente["openai_vector_store_file_id"],
                "status": existente["status"],
                "source_hash": source_hash,
                "reaproveitado": True,
            }

        try:
            client = self._get_client()
            uploaded = await client.files.create(
                file=(filename, io.BytesIO(content), mime_type),
                purpose="assistants",
            )
            attached = await client.vector_stores.files.create_and_poll(
                vector_store_id=vector_store_id,
                file_id=uploaded.id,
                attributes=atributos,
            )
        except Exception as exc:
            raise OpenAIRagError(
                f"Falha ao enviar arquivo para o OpenAI Vector Store: {type(exc).__name__}"
            ) from exc

        try:
            await catalogo.registrar(
                vector_store_id=vector_store_id,
                openai_file_id=uploaded.id,
                openai_vector_store_file_id=attached.id,
                scope=ESCOPO_PUBLICO,
                source_hash=source_hash,
                attributes=atributos,
                status=attached.status,
                fonte_id=fonte_id,
                last_error=getattr(getattr(attached, "last_error", None), "code", None),
            )
        except Exception as exc:
            await session.rollback()
            await self._desfazer_envio(vector_store_id, uploaded.id)
            raise OpenAIRagError(
                f"Falha ao registrar arquivo no catalogo do RAG: {type(exc).__name__}"
            ) from exc

        return {
            "openai_file_id": uploaded.id,
            "openai_vector_store_file_id": attached.id,
            "status": attached.status,
            "source_hash": source_hash,
            "reaproveitado": False,
        }

    async def _desfazer_envio(self, vector_store_id: str, file_id: str) -> None:
        client = self._get_client()
        try:
            await client.vector_stores.files.delete(file_id, vector_store_id=vector_store_id)
            await client.files.delete(file_id)
        except Exception as exc:
            # Sem catalogo e sem remocao, so este log diz que o arquivo ficou la.
            logger.error(
                "rag.arquivo_orfao vector_store=%s file=%s erro=%s", vector_store_id, file_id, type(exc).__name__
            )


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
