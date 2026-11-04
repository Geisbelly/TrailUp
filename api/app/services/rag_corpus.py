"""Corpus v1 do RAG: as regras derivadas e o golden set que mede a busca.

O corpus indexado no Vector Store público é `docs/rag/regras-derivadas.md`,
uma síntese por arquivo. Nenhum dos 47 documentos da avaliação foi aprovado
para indexação integral, e as regras são texto original do projeto, então é o
único conteúdo que pode subir sem problema de licença.

Tudo aqui é puro (sem rede e sem banco) para que o indexador e o avaliador
possam ser testados sem chave. O envio e o catálogo ficam em
`OpenAIRagService.upload_public_file`.

O golden set cita fontes DAT, não regras. A relevância de uma regra para uma
pergunta sai dessa citação: a regra é relevante quando alguma das suas fontes
DAT está entre as fontes aceitáveis da pergunta.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

CORPUS_REGRAS = "regras-derivadas"
MIME_MARKDOWN = "text/markdown"

_CABECALHO_REGRA = re.compile(r"^###\s+(RD-\d{2})\s+[—-]\s+(.+?)\s*$")
_CAMPO_META = re.compile(r"^-\s+`(\w+)`:\s*(.+?)\s*$")
_CAMPO_TEXTO = re.compile(r"^-\s+\*\*(Regra|Limite):\*\*\s*(.+?)\s*$")
_DAT = re.compile(r"\bDAT-\d{2}\b")
_LINHA_GOLDEN = re.compile(r"^\|\s*(GS-\d{2})\s*\|")
_CAMPOS_OBRIGATORIOS = ("construto", "populacao", "tipo_estudo", "confianca", "tipo", "fonte")


class CorpusInvalido(ValueError):
    """O markdown de origem saiu do formato que o parser conhece."""


@dataclass(frozen=True)
class RegraDerivada:
    id: str
    titulo: str
    construto: str
    populacao: str
    tipo_estudo: str
    confianca: str
    tipo: str
    fonte: str
    regra: str
    limite: str

    @property
    def fontes(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys(_DAT.findall(self.fonte)))


@dataclass(frozen=True)
class PerguntaGolden:
    id: str
    pergunta: str
    resposta_esperada: str
    fontes: tuple[str, ...]
    respondivel: bool


def parse_regras_derivadas(markdown: str) -> list[RegraDerivada]:
    regras: list[RegraDerivada] = []
    atual: dict[str, str] | None = None

    def fechar() -> None:
        if atual is None:
            return
        faltando = [c for c in (*_CAMPOS_OBRIGATORIOS, "regra", "limite") if not atual.get(c)]
        if faltando:
            raise CorpusInvalido(f"{atual['id']} sem {', '.join(faltando)}")
        regras.append(RegraDerivada(**atual))

    for linha in markdown.splitlines():
        if linha.startswith("## "):
            fechar()
            atual = None
            continue
        cabecalho = _CABECALHO_REGRA.match(linha)
        if cabecalho:
            fechar()
            atual = {"id": cabecalho.group(1), "titulo": cabecalho.group(2)}
            continue
        if atual is None:
            continue
        meta = _CAMPO_META.match(linha)
        if meta and meta.group(1) in _CAMPOS_OBRIGATORIOS:
            atual[meta.group(1)] = meta.group(2)
            continue
        texto = _CAMPO_TEXTO.match(linha)
        if texto:
            atual[texto.group(1).lower()] = texto.group(2)
    fechar()

    ids = [r.id for r in regras]
    if len(ids) != len(set(ids)):
        raise CorpusInvalido("ID de regra repetido")
    for regra in regras:
        if not regra.fontes:
            raise CorpusInvalido(f"{regra.id} sem fonte DAT")
    return regras


def nome_do_arquivo(regra: RegraDerivada) -> str:
    return f"{regra.id.lower()}.md"


def documento(regra: RegraDerivada) -> str:
    """Texto indexado: a regra com população, fonte e limite junto.

    O limite vai no mesmo arquivo de propósito. Uma busca que trouxesse a
    regra sem ele devolveria a recomendação sem a ressalva que a sustenta.
    """
    return (
        f"# {regra.id} — {regra.titulo}\n\n"
        f"Regra: {regra.regra}\n\n"
        f"Limite: {regra.limite}\n\n"
        f"Construto: {regra.construto}\n"
        f"População estudada: {regra.populacao}\n"
        f"Tipo de estudo: {regra.tipo_estudo}\n"
        f"Confiança: {regra.confianca}\n"
        f"Fonte: {regra.fonte}\n"
    )


def conteudo(regra: RegraDerivada) -> bytes:
    return documento(regra).encode("utf-8")


def hash_do_conteudo(regra: RegraDerivada) -> str:
    """Mesmo hash que `upload_public_file` grava em `source_hash`."""
    return hashlib.sha256(conteudo(regra)).hexdigest()


def atributos(regra: RegraDerivada) -> dict[str, str]:
    # `perfil_brainhex` fica de fora: a seção "Uso no RAG" proíbe o mapeamento.
    return {
        "scope": "publico",
        "corpus": CORPUS_REGRAS,
        "rd": regra.id,
        "tipo": regra.tipo,
        "construto": regra.construto[:512],
        "tipo_estudo": regra.tipo_estudo[:512],
        "confianca": regra.confianca[:512],
        "fontes": ",".join(regra.fontes)[:512],
    }


def parse_golden_set(markdown: str) -> list[PerguntaGolden]:
    perguntas: list[PerguntaGolden] = []
    for linha in markdown.splitlines():
        if not _LINHA_GOLDEN.match(linha):
            continue
        celulas = [c.strip() for c in linha.strip().strip("|").split("|")]
        if len(celulas) != 5:
            raise CorpusInvalido(f"linha do golden set com {len(celulas)} colunas: {celulas[0]}")
        gs_id, pergunta, resposta, fontes, respondivel = celulas
        valor = respondivel.lower()
        if valor not in {"sim", "não", "nao"}:
            raise CorpusInvalido(f"{gs_id} com respondível inválido: {respondivel}")
        perguntas.append(
            PerguntaGolden(
                id=gs_id,
                pergunta=pergunta,
                resposta_esperada=resposta,
                fontes=tuple(dict.fromkeys(_DAT.findall(fontes))),
                respondivel=valor == "sim",
            )
        )
    ids = [p.id for p in perguntas]
    if len(ids) != len(set(ids)):
        raise CorpusInvalido("ID de pergunta repetido")
    return perguntas


def regras_relevantes(pergunta: PerguntaGolden, regras: Iterable[RegraDerivada]) -> set[str]:
    aceitas = set(pergunta.fontes)
    return {r.id for r in regras if aceitas.intersection(r.fontes)}


def recall_em_k(recuperados: Sequence[str], relevantes: set[str], k: int) -> float:
    if not relevantes:
        raise ValueError("recall sem regra relevante não está definido")
    return len(set(recuperados[:k]) & relevantes) / len(relevantes)


def acerto_em_k(recuperados: Sequence[str], relevantes: set[str], k: int) -> bool:
    return bool(set(recuperados[:k]) & relevantes)


def posto_reciproco(recuperados: Sequence[str], relevantes: set[str]) -> float:
    for posicao, rd in enumerate(recuperados, start=1):
        if rd in relevantes:
            return 1.0 / posicao
    return 0.0


def sem_repeticao(recuperados: Iterable[str]) -> list[str]:
    """A busca devolve trechos; vários podem ser da mesma regra."""
    return list(dict.fromkeys(recuperados))


@dataclass(frozen=True)
class PlanoDeIndexacao:
    enviar: tuple[RegraDerivada, ...]
    manter: tuple[str, ...]
    remover: tuple[str, ...]
    """IDs de `rag_openai_files`."""


def planejar_indexacao(regras: Sequence[RegraDerivada], catalogo: Sequence[dict]) -> PlanoDeIndexacao:
    """Compara o corpus atual com o que o catálogo diz estar no Vector Store.

    `catalogo` são as linhas do corpus (`listar_do_corpus`). Fica uma linha
    `completed` por hash atual; as demais saem: versão antiga de uma regra
    editada, envio que falhou, ou cópia repetida do mesmo hash.
    """
    atuais = {hash_do_conteudo(r): r for r in regras}
    mantidos: dict[str, str] = {}
    remover: list[str] = []
    for linha in catalogo:
        h = linha.get("source_hash")
        if h in atuais and linha.get("status") == "completed" and h not in mantidos:
            mantidos[h] = atuais[h].id
        else:
            remover.append(str(linha["id"]))
    enviar = tuple(r for h, r in atuais.items() if h not in mantidos)
    return PlanoDeIndexacao(
        enviar=enviar,
        manter=tuple(sorted(mantidos.values())),
        remover=tuple(remover),
    )
