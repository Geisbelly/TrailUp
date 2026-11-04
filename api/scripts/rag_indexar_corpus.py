"""Indexa as regras derivadas no Vector Store público do RAG.

Sem `--aplicar`, só mostra o plano: o que sobe, o que já está lá e o que sai.
Com `--aplicar`, envia cada regra por `OpenAIRagService.upload_public_file`
(que deduplica por hash e registra em `rag_openai_files`) e apaga do catálogo
as linhas obsoletas — o gatilho `trg_retencao_fila_openai` enfileira a remoção
na OpenAI.

Ordem: sobe primeiro, remove depois. Se o envio falhar no meio, a versão
anterior continua no ar em vez de o corpus ficar vazio.

Uso, a partir de `api/`:
    python -m scripts.rag_indexar_corpus
    python -m scripts.rag_indexar_corpus --aplicar
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from app.core.settings import get_settings
from app.db.session import build_session_factory
from app.repositories.rag_openai_files import RagOpenAIFilesRepository
from app.services import rag_corpus
from app.services.openai_rag import OpenAIRagService

_REGRAS = Path(__file__).resolve().parents[2] / "docs" / "rag" / "regras-derivadas.md"


async def executar(aplicar: bool, origem: Path) -> int:
    regras = rag_corpus.parse_regras_derivadas(origem.read_text(encoding="utf-8"))
    settings = get_settings()
    servico = OpenAIRagService(settings)
    if not servico.is_configured():
        print("RAG não configurado: OPENAI_RAG_ENABLED, OPENAI_RAG_API_KEY e OPENAI_RAG_VECTOR_STORE_ID.")
        return 2

    engine, sessions = build_session_factory(settings)
    try:
        async with sessions() as session:
            catalogo = RagOpenAIFilesRepository(session)
            linhas = await catalogo.listar_do_corpus(
                vector_store_id=str(servico.vector_store_id), corpus=rag_corpus.CORPUS_REGRAS
            )
            plano = rag_corpus.planejar_indexacao(regras, linhas)
            print(f"Regras no arquivo: {len(regras)}")
            print(f"Já indexadas:      {len(plano.manter)} {list(plano.manter)}")
            print(f"A enviar:          {len(plano.enviar)} {[r.id for r in plano.enviar]}")
            print(f"A remover:         {len(plano.remover)} linha(s) do catálogo")
            if not aplicar:
                print("\nNada foi enviado. Rode com --aplicar para executar o plano.")
                return 0

            falhas = 0
            for regra in plano.enviar:
                try:
                    resultado = await servico.upload_public_file(
                        session=session,
                        filename=rag_corpus.nome_do_arquivo(regra),
                        content=rag_corpus.conteudo(regra),
                        mime_type=rag_corpus.MIME_MARKDOWN,
                        attributes=rag_corpus.atributos(regra),
                    )
                except Exception as exc:  # noqa: BLE001 - segue para as outras regras
                    falhas += 1
                    print(f"  {regra.id}: falhou ({type(exc).__name__}: {exc})")
                    continue
                print(f"  {regra.id}: {resultado['status']}")
                if resultado["status"] != "completed":
                    falhas += 1

            if falhas:
                print(f"\n{falhas} envio(s) não concluído(s); nada foi removido.")
                return 1
            removidas = await catalogo.remover(list(plano.remover))
            print(f"\nRemovidas do catálogo: {removidas} (a remoção na OpenAI vai pela fila de retenção).")
            return 0
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--aplicar", action="store_true", help="envia e remove de fato")
    parser.add_argument("--origem", type=Path, default=_REGRAS)
    args = parser.parse_args()
    sys.exit(asyncio.run(executar(args.aplicar, args.origem)))


if __name__ == "__main__":
    main()
