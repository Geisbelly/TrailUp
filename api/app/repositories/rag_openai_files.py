"""Catalogo local do que esta no Vector Store da OpenAI (`rag_openai_files`).

So o backend escreve: a tabela tem RLS ligada e nenhuma policy, de proposito
(20261024_01). A exclusao de dados so conhece o arquivo que esta aqui
(`retencao_externa`), entao arquivo enviado sem linha nesta tabela nunca sai
da OpenAI.
"""

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class RagOpenAIFilesRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def buscar_concluido(self, *, vector_store_id: str, source_hash: str) -> dict[str, Any] | None:
        result = await self.session.execute(
            text(
                """
                SELECT openai_file_id, openai_vector_store_file_id, status
                  FROM rag_openai_files
                 WHERE vector_store_id = :vector_store_id
                   AND source_hash = :source_hash
                   AND status = 'completed'
                 ORDER BY created_at DESC
                 LIMIT 1
                """
            ),
            {"vector_store_id": vector_store_id, "source_hash": source_hash},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def registrar(
        self,
        *,
        vector_store_id: str,
        openai_file_id: str,
        openai_vector_store_file_id: str | None,
        scope: str,
        source_hash: str,
        attributes: dict[str, Any],
        status: str,
        fonte_id: int | None = None,
        last_error: str | None = None,
    ) -> None:
        await self.session.execute(
            text(
                """
                INSERT INTO rag_openai_files (
                  fonte_id, vector_store_id, openai_file_id,
                  openai_vector_store_file_id, scope, source_hash,
                  attributes, status, last_error
                ) VALUES (
                  :fonte_id, :vector_store_id, :openai_file_id,
                  :openai_vector_store_file_id, :scope, :source_hash,
                  CAST(:attributes AS JSONB), :status, :last_error
                )
                ON CONFLICT (vector_store_id, openai_file_id) DO UPDATE SET
                  openai_vector_store_file_id = EXCLUDED.openai_vector_store_file_id,
                  status = EXCLUDED.status,
                  last_error = EXCLUDED.last_error,
                  updated_at = now()
                """
            ),
            {
                "fonte_id": fonte_id,
                "vector_store_id": vector_store_id,
                "openai_file_id": openai_file_id,
                "openai_vector_store_file_id": openai_vector_store_file_id,
                "scope": scope,
                "source_hash": source_hash,
                "attributes": json.dumps(attributes, ensure_ascii=False),
                "status": status,
                "last_error": last_error,
            },
        )
        await self.session.commit()

    async def listar_do_corpus(self, *, vector_store_id: str, corpus: str) -> list[dict[str, Any]]:
        """Linhas de um corpus nomeado em `attributes.corpus`, mais recentes primeiro."""
        result = await self.session.execute(
            text(
                """
                SELECT id, openai_file_id, source_hash, status, attributes
                  FROM rag_openai_files
                 WHERE vector_store_id = :vector_store_id
                   AND attributes->>'corpus' = :corpus
                 ORDER BY created_at DESC
                """
            ),
            {"vector_store_id": vector_store_id, "corpus": corpus},
        )
        return [dict(row) for row in result.mappings().all()]

    async def remover(self, ids: list[str]) -> int:
        """Apaga do catálogo; o gatilho `trg_retencao_fila_openai` tira o arquivo da OpenAI.

        Não chame a OpenAI direto daqui: a fila de `retencao_externa` é quem
        tenta de novo quando a remoção falha, e o registro de que o arquivo
        precisa sair só existe se a linha for apagada por este caminho.
        """
        if not ids:
            return 0
        result = await self.session.execute(
            text("DELETE FROM rag_openai_files WHERE id = ANY(CAST(:ids AS uuid[]))"),
            {"ids": [str(i) for i in ids]},
        )
        await self.session.commit()
        return int(result.rowcount or 0)
