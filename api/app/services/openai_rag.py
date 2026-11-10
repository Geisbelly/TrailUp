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
import re
import time
from typing import Any, Iterable

from openai import AsyncOpenAI
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings
from app.repositories.rag_openai_files import RagOpenAIFilesRepository
from app.services import uso_llm
from app.services.llm import (
    ProvedorIndisponivelError,
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
CORPUS_REGRAS_DERIVADAS = "regras-derivadas"
_FILTRO_CORPUS_PUBLICO = {"type": "eq", "key": "scope", "value": ESCOPO_PUBLICO}
_FILTRO_REGRAS_DERIVADAS = {
    "type": "and",
    "filters": [
        _FILTRO_CORPUS_PUBLICO,
        {"type": "eq", "key": "corpus", "value": CORPUS_REGRAS_DERIVADAS},
    ],
}
_FONTE_DAT = re.compile(r"^DAT-\d{2}$")
_REGRA_DERIVADA = re.compile(r"^RD-(?:0[1-9]|1[0-2])$")


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

    async def buscar_evidencias_pedagogicas(
        self, *, session: AsyncSession, fontes: Iterable[str], limite: int = 8
    ) -> list[dict[str, Any]]:
        """Busca citações curadas sem enviar contexto individual do aluno.
        Texto de tópico, perfil, telemetria, scores e identificadores de aluno nunca
        entram no request. Só metadados conhecidos de regras derivadas são devolvidos.
        """
        fontes_solicitadas = sorted(
            {fonte for fonte in fontes if isinstance(fonte, str) and _FONTE_DAT.fullmatch(fonte)}
        )
        if not fontes_solicitadas or not self.is_configured():
            return []

        catalogo = await RagOpenAIFilesRepository(session).listar_do_corpus(
            vector_store_id=str(self.vector_store_id), corpus=CORPUS_REGRAS_DERIVADAS
        )
        arquivos_permitidos: dict[str, dict[str, Any]] = {}
        for registro in catalogo:
            atributos = registro.get("attributes")
            if isinstance(atributos, str):
                try:
                    atributos = json.loads(atributos)
                except json.JSONDecodeError:
                    continue
            file_id = registro.get("openai_file_id")
            if (
                registro.get("status") == "completed"
                and isinstance(file_id, str)
                and isinstance(atributos, dict)
                and atributos.get("scope") == ESCOPO_PUBLICO
                and atributos.get("corpus") == CORPUS_REGRAS_DERIVADAS
                and isinstance(atributos.get("rd"), str)
                and _REGRA_DERIVADA.fullmatch(atributos["rd"])
            ):
                arquivos_permitidos[file_id] = atributos
        fontes_catalogadas = {
            fonte.strip()
            for atributos in arquivos_permitidos.values()
            for fonte in str(atributos.get("fontes") or "").split(",")
            if _FONTE_DAT.fullmatch(fonte.strip())
        }
        fontes_solicitadas = sorted(set(fontes_solicitadas).intersection(fontes_catalogadas))
        if not fontes_solicitadas:
            return []
        # A consulta leva só códigos DAT, que não têm sentido semântico: com o filtro só do corpus,
        # a ordem saía de outra coisa e a regra pedida podia ficar fora do top-N (medido em
        # produção, 10/11: DAT-34 e DAT-45 trouxeram só a RD-07). O catálogo já diz quais regras
        # citam as fontes pedidas; a busca fica restrita a elas.
        regras_alvo = sorted(
            {
                str(atributos["rd"])
                for atributos in arquivos_permitidos.values()
                if set(fontes_solicitadas).intersection(
                    fonte.strip() for fonte in str(atributos.get("fontes") or "").split(",")
                )
            }
        )
        inicio = time.perf_counter()
        try:
            resposta = await self._get_client().vector_stores.search(
                vector_store_id=str(self.vector_store_id),
                query="Evidências pedagógicas curadas e limitações para "
                + ", ".join(fontes_solicitadas),
                filters={
                    "type": "and",
                    "filters": [
                        *_FILTRO_REGRAS_DERIVADAS["filters"],
                        {"type": "in", "key": "rd", "value": regras_alvo},
                    ],
                },
                max_num_results=max(1, min(max(limite, len(regras_alvo)), 10)),
            )
        except Exception as exc:
            self._registrar_retrieval_direto(
                latencia_ms=(time.perf_counter() - inicio) * 1000,
                limite=limite,
                n_resultados=0,
                erro=exc,
            )
            raise OpenAIRagError(f"Falha no retrieval de evidências: {type(exc).__name__}") from exc

        citacoes: list[dict[str, Any]] = []
        vistos: set[str] = set()
        for resultado in getattr(resposta, "data", None) or []:
            atributos = getattr(resultado, "attributes", None)
            if not isinstance(atributos, dict):
                continue
            file_id = getattr(resultado, "file_id", None)
            atributos_catalogados = arquivos_permitidos.get(file_id)
            if not isinstance(atributos_catalogados, dict) or any(
                atributos.get(chave) != atributos_catalogados.get(chave)
                for chave in ("scope", "corpus", "rd", "fontes", "confianca")
            ):
                continue
            regra_id = atributos.get("rd")
            if (
                atributos.get("scope") != ESCOPO_PUBLICO
                or atributos.get("corpus") != CORPUS_REGRAS_DERIVADAS
                or not isinstance(regra_id, str)
                or not _REGRA_DERIVADA.fullmatch(regra_id)
                or regra_id in vistos
            ):
                continue
            fontes_resultado = atributos.get("fontes")
            if isinstance(fontes_resultado, str):
                fontes_validas = sorted(
                    {
                        fonte.strip()
                        for fonte in fontes_resultado.split(",")
                        if fonte.strip() in fontes_solicitadas
                    }
                )
            elif isinstance(fontes_resultado, list):
                fontes_validas = sorted(
                    {
                        fonte
                        for fonte in fontes_resultado
                        if isinstance(fonte, str)
                        and _FONTE_DAT.fullmatch(fonte)
                        and fonte in fontes_solicitadas
                    }
                )
            else:
                fontes_validas = []
            if not fontes_validas:
                continue
            vistos.add(regra_id)
            confianca = atributos.get("confianca")
            citacoes.append(
                {
                    "regra": regra_id,
                    "fontes": fontes_validas,
                    "confianca": confianca[:120] if isinstance(confianca, str) else "",
                }
            )
        self._registrar_retrieval_direto(
            latencia_ms=(time.perf_counter() - inicio) * 1000,
            limite=limite,
            n_resultados=len(citacoes),
            erro=None,
        )
        return citacoes

    @staticmethod
    def _registrar_retrieval_direto(
        *, latencia_ms: float, limite: int, n_resultados: int, erro: BaseException | None
    ) -> None:
        # Nunca registra a consulta, conteúdo, fontes individuais ou detalhes do erro.
        try:
            registrar_busca(
                {
                    "provider": "openai",
                    "prompt": "sugestao_evidencia",
                    "model": None,
                    "status": "erro" if erro is not None else "ok",
                    "erro": type(erro).__name__ if erro is not None else None,
                    "latencia_ms": round(latencia_ms, 1),
                    "top_k": max(1, min(limite, 10)),
                    "consultas": 1,
                    "n_resultados": n_resultados,
                    "com_resultado": n_resultados > 0,
                    "score_max": None,
                    "score_medio": None,
                    "resultados": [],
                    "fontes_citadas": [],
                }
            )
        except Exception:  # pragma: no cover - observabilidade nunca derruba a sugestão.
            pass

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
                uso_llm.registrar(
                    prompt=prompt_name,
                    provedor="openai",
                    modelo=modelo,
                    tokens_entrada=None,
                    tokens_saida=None,
                    tokens_cache=None,
                    usou_rag=True,
                    fim=uso_llm.fim_da_excecao(exc),
                    latencia_ms=round((time.perf_counter() - inicio) * 1000),
                )
                raise ProvedorIndisponivelError(f"OpenAI RAG sem resposta: {type(exc).__name__}") from exc
            self._registrar(response, inicio, prompt_name, modelo, None)
            uso_llm.registrar_resposta_openai(
                response,
                prompt=prompt_name,
                modelo=modelo,
                usou_rag=True,
                latencia_ms=round((time.perf_counter() - inicio) * 1000),
            )
            if (erro := erro_do_fim(uso_llm.fim_da_resposta_rag(response), prompt_name)) is not None:
                raise erro
            raw = extract_json(response.output_text)
            return schema.model_validate(raw)
        except (ProvedorIndisponivelError, RespostaBloqueadaError, RespostaCortadaError):
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
