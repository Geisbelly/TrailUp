"""Impressão digital do conteúdo: o que decide se um material já gerado pode ser reaproveitado.

`source_hash` não serve para isso: ele inclui classe, tópico, conteúdo, id e caminho das fontes, então
dois conteúdos iguais em turmas diferentes nunca têm o mesmo hash. A impressão é o contrário: só o
que entra na geração, sem nenhum identificador.

**Entra:** título, tipo e texto do conteúdo; nome e tamanho dos anexos; título, descrição e enunciado
das atividades do escopo; as fontes (texto, ou o SHA-256 dos bytes quando é arquivo); o arco narrativo
da turma; as versões do pipeline.

**Não entra:**
- nome, descrição e objetivo do tópico: decisão de 04/11, só o conteúdo importa. O preço aceito é o
  material citar o tema do tópico de onde saiu;
- questões e cards do professor: não chegam ao prompt (ver `_build_source_hash`).

**Na dúvida, gera.** Sem o hash de um arquivo a impressão é `None` e o alvo segue o fluxo normal:
reaproveitar errado entrega ao aluno material de outro conteúdo; gerar de novo só gasta cota.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import unicodedata
from collections.abc import Sequence
from typing import Any

logger = logging.getLogger(__name__)

# Valor de `impressao_conteudo` em material ajustado à mão: fica fora de qualquer comparação.
IMPRESSAO_EDITADO = "editado"

# Acima disto o arquivo não é baixado só para comparar, e o conteúdo segue o fluxo normal.
_ARQUIVO_MAX_BYTES_PARA_HASH = 100 * 1024 * 1024
_CHAVE_DO_HASH = "conteudo_sha256"
_CHAVE_DO_CAMINHO = "conteudo_sha256_caminho"

_ESPACOS = re.compile(r"\s+")
_REFERENCIA_DE_ARQUIVO = re.compile(r"^(https?://\S+|[^\s]+/[^\s]+\.[a-z0-9]{2,5})$", re.IGNORECASE)


def normalizar_texto(valor: Any) -> str:
    """Mesmas palavras, mesmo texto: Unicode NFC e espaços colapsados, mais nada.

    Maiúscula e acento continuam contando: são outras palavras.
    """
    return _ESPACOS.sub(" ", unicodedata.normalize("NFC", str(valor or ""))).strip()


def _texto_do_conteudo(conteudo: dict[str, Any]) -> str:
    """Texto escrito pelo professor. Quando o campo é só o caminho do arquivo, quem compara é a fonte.

    Mesmo arquivo enviado duas vezes tem dois caminhos; comparar o caminho veria dois conteúdos.
    """
    texto = normalizar_texto(conteudo.get("conteudo"))
    return "" if _REFERENCIA_DE_ARQUIVO.match(texto) else texto


def _anexos(conteudo: dict[str, Any]) -> list[list[Any]]:
    metadata = conteudo.get("metadata") if isinstance(conteudo.get("metadata"), dict) else {}
    arquivos = metadata.get("files") if isinstance(metadata.get("files"), list) else []
    return [
        [
            normalizar_texto(item.get("name") or item.get("nome")),
            item.get("size") or item.get("tamanho"),
        ]
        for item in arquivos
        if isinstance(item, dict)
    ]


def _fonte(fonte: dict[str, Any]) -> dict[str, Any] | None:
    """Parte de uma fonte na impressão. `None` = arquivo sem hash, não dá para afirmar nada."""
    base = {
        "tipo": normalizar_texto(fonte.get("tipo")),
        "titulo": normalizar_texto(fonte.get("titulo")),
        "mime": normalizar_texto(fonte.get("mime_type")),
    }
    if str(fonte.get("storage_path") or "").strip():
        sha = fonte.get(_CHAVE_DO_HASH)
        return {**base, "sha256": sha} if sha else None
    return {
        **base,
        "url": normalizar_texto(fonte.get("url") or fonte.get("arquivo_url")),
        "texto": normalizar_texto(
            fonte.get("texto_extraido")
            or fonte.get("transcricao")
            or fonte.get("texto_base")
            or fonte.get("descricao")
        ),
    }


def impressao_do_conteudo(
    *,
    conteudos: Sequence[dict[str, Any]],
    atividades: Sequence[dict[str, Any]],
    fontes: Sequence[dict[str, Any]],
    arco_narrativo: str | None,
    versoes: dict[str, Any],
) -> str | None:
    """SHA-256 do que entra na geração. `None` quando algum arquivo não pôde ser comparado."""
    if not conteudos:
        return None
    partes_fontes = [_fonte(fonte) for fonte in fontes]
    if any(parte is None for parte in partes_fontes):
        return None
    material = {
        "versoes": versoes,
        "conteudos": [
            {
                "titulo": normalizar_texto(item.get("titulo")),
                "tipo": normalizar_texto(item.get("tipo")),
                "texto": _texto_do_conteudo(item),
                "anexos": _anexos(item),
            }
            for item in conteudos
        ],
        "atividades": [
            {
                "titulo": normalizar_texto(item.get("titulo")),
                "descricao": normalizar_texto(item.get("descricao")),
                "enunciado": normalizar_texto(item.get("enunciado")),
            }
            for item in atividades
        ],
        "fontes": partes_fontes,
        "arco_narrativo": normalizar_texto(arco_narrativo),
    }
    bruto = json.dumps(material, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(bruto.encode("utf-8")).hexdigest()


def _hash_guardado(fonte: dict[str, Any], caminho: str) -> str | None:
    metadata = fonte.get("metadata") if isinstance(fonte.get("metadata"), dict) else {}
    if metadata.get(_CHAVE_DO_CAMINHO) != caminho:
        return None
    return str(metadata.get(_CHAVE_DO_HASH) or "") or None


async def fontes_com_hash_do_arquivo(
    *,
    fontes: Sequence[dict[str, Any]],
    storage: Any,
    fontes_repo: Any,
) -> list[dict[str, Any]]:
    """Acrescenta o SHA-256 dos bytes de cada fonte com arquivo.

    O texto extraído não basta: dois PDFs com o mesmo texto podem ter figuras diferentes. O hash fica
    em `fontes_personalizacao.metadata`, preso ao caminho, então o arquivo só é baixado uma vez. Fonte
    sem hash sai sem a chave, e `impressao_do_conteudo` devolve `None`.
    """
    resultado: list[dict[str, Any]] = []
    for fonte in fontes:
        caminho = str(fonte.get("storage_path") or "").strip()
        if not caminho:
            resultado.append(dict(fonte))
            continue
        sha = _hash_guardado(fonte, caminho)
        tamanho = fonte.get("tamanho_bytes")
        grande = isinstance(tamanho, int) and tamanho > _ARQUIVO_MAX_BYTES_PARA_HASH
        if sha is None and not grande:
            bucket = str(fonte.get("bucket") or "").strip()
            dados = await storage.download_bytes(bucket=bucket, path=caminho) if bucket else None
            if dados:
                sha = hashlib.sha256(dados).hexdigest()
                await _guardar_hash(fontes_repo, fonte, caminho=caminho, sha=sha)
        resultado.append({**fonte, _CHAVE_DO_HASH: sha} if sha else dict(fonte))
    return resultado


async def _guardar_hash(fontes_repo: Any, fonte: dict[str, Any], *, caminho: str, sha: str) -> None:
    """Falhar aqui só faz baixar de novo depois: nunca derruba a geração."""
    bruto = str(fonte.get("source_id") or "").removeprefix("fonte:")
    if not bruto.isdigit():
        return
    try:
        await fontes_repo.atualizar_enriquecimento(
            fonte_id=int(bruto),
            metadata_patch={_CHAVE_DO_HASH: sha, _CHAVE_DO_CAMINHO: caminho},
        )
    except Exception:
        logger.warning("Falha ao guardar o hash do arquivo: fonte=%s", bruto, exc_info=True)
        await fontes_repo.session.rollback()
