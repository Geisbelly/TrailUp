"""Mede a busca do RAG contra o golden set (recall@k, acerto@k, MRR).

Só lê: faz uma `vector_stores.search` por pergunta, com o mesmo filtro de
escopo público que o `file_search` do chat usa, e não gera resposta nenhuma.
Mede a recuperação, não a resposta do modelo.

Regra relevante para uma pergunta = regra cuja fonte DAT está entre as fontes
aceitáveis da pergunta (`rag_corpus.regras_relevantes`). As perguntas
`respondível=não` também têm regra relevante: é a que traz o limite que manda
reconhecer a falta de evidência. Elas entram no total e aparecem separadas.

Uso, a partir de `api/`:
    python -m scripts.rag_avaliar_golden_set --k 3
    python -m scripts.rag_avaliar_golden_set --k 3 --saida ../docs/rag/avaliacao-retrieval-AAAA-MM-DD.md
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from app.core.settings import get_settings
from app.services import rag_corpus
from app.services.openai_rag import OpenAIRagService

_DOCS = Path(__file__).resolve().parents[2] / "docs" / "rag"
_FILTRO_PUBLICO = {"type": "eq", "key": "scope", "value": "publico"}


@dataclass(frozen=True)
class Linha:
    pergunta: rag_corpus.PerguntaGolden
    relevantes: frozenset[str]
    recuperados: tuple[str, ...]
    k: int

    @property
    def recall(self) -> float:
        return rag_corpus.recall_em_k(self.recuperados, set(self.relevantes), self.k)

    @property
    def acerto(self) -> bool:
        return rag_corpus.acerto_em_k(self.recuperados, set(self.relevantes), self.k)

    @property
    def rr(self) -> float:
        return rag_corpus.posto_reciproco(self.recuperados, set(self.relevantes))


def _media(valores: list[float]) -> float:
    return sum(valores) / len(valores) if valores else 0.0


def resumo(linhas: list[Linha]) -> dict[str, float]:
    return {
        "n": float(len(linhas)),
        "recall": _media([x.recall for x in linhas]),
        "acerto": _media([1.0 if x.acerto else 0.0 for x in linhas]),
        "mrr": _media([x.rr for x in linhas]),
    }


def relatorio(linhas: list[Linha], k: int, regras: int) -> str:
    grupos = {
        "Todas": linhas,
        "Respondível = sim": [x for x in linhas if x.pergunta.respondivel],
        "Respondível = não": [x for x in linhas if not x.pergunta.respondivel],
    }
    partes = [
        f"# Avaliação da recuperação do RAG — {date.today().isoformat()}",
        "",
        f"Gerado por `api/scripts/rag_avaliar_golden_set.py`. Corpus: {regras} regras derivadas, "
        f"um arquivo por regra. Busca: `vector_stores.search`, filtro `scope=publico`, top-{k}.",
        "",
        "Mede só a recuperação. Não diz se a resposta do modelo ficou certa.",
        "",
        f"| Grupo | n | recall@{k} | acerto@{k} | MRR |",
        "|---|---|---|---|---|",
    ]
    for nome, grupo in grupos.items():
        r = resumo(grupo)
        partes.append(f"| {nome} | {int(r['n'])} | {r['recall']:.2f} | {r['acerto']:.2f} | {r['mrr']:.2f} |")
    partes += [
        "",
        "| ID | Respondível | Relevantes | Recuperados (ordem) | recall | RR |",
        "|---|---|---|---|---|---|",
    ]
    for x in linhas:
        partes.append(
            f"| {x.pergunta.id} | {'sim' if x.pergunta.respondivel else 'não'} | "
            f"{', '.join(sorted(x.relevantes))} | {', '.join(x.recuperados) or '—'} | "
            f"{x.recall:.2f} | {x.rr:.2f} |"
        )
    return "\n".join(partes) + "\n"


async def executar(k: int, saida: Path | None) -> int:
    regras = rag_corpus.parse_regras_derivadas((_DOCS / "regras-derivadas.md").read_text(encoding="utf-8"))
    perguntas = rag_corpus.parse_golden_set((_DOCS / "golden-set-documentos-v1.md").read_text(encoding="utf-8"))
    servico = OpenAIRagService(get_settings())
    if not servico.is_configured():
        print("RAG não configurado: OPENAI_RAG_ENABLED, OPENAI_RAG_API_KEY e OPENAI_RAG_VECTOR_STORE_ID.")
        return 2
    client = servico._get_client()

    linhas: list[Linha] = []
    for pergunta in perguntas:
        pagina = await client.vector_stores.search(
            vector_store_id=str(servico.vector_store_id),
            query=pergunta.pergunta,
            filters=_FILTRO_PUBLICO,
            max_num_results=k,
        )
        rds = [str((item.attributes or {}).get("rd") or "?") for item in pagina.data]
        linhas.append(
            Linha(
                pergunta=pergunta,
                relevantes=frozenset(rag_corpus.regras_relevantes(pergunta, regras)),
                recuperados=tuple(rag_corpus.sem_repeticao(rds))[:k],
                k=k,
            )
        )

    texto = relatorio(linhas, k, len(regras))
    if saida:
        saida.write_text(texto, encoding="utf-8")
        print(f"Relatório gravado em {saida}")
    print(texto)
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--k", type=int, default=3)
    parser.add_argument("--saida", type=Path)
    args = parser.parse_args()
    if args.k < 1:
        parser.error("--k precisa ser >= 1")
    sys.exit(asyncio.run(executar(args.k, args.saida)))


if __name__ == "__main__":
    main()
