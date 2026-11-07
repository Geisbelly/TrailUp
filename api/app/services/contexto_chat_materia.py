"""Material de estudo que o chat do Guia recebe (06/11).

O chat só respondia sobre personalização porque o modelo quase não via a matéria: cada conteúdo
chegava como os 600 primeiros caracteres de `conteudos.conteudo` — que, num arquivo, é um link ou
caminho —, e o texto do material personalizado (o markdown gerado) nem entrava. O juiz de grounding
reprovava qualquer explicação "fora da base", e a resposta caía no texto de reserva.

Aqui ficam as duas leituras, puras (sem banco), para o mesmo recorte ir ao modelo e ao juiz.
"""

from __future__ import annotations

import re
from typing import Any

LIMITE_POR_CONTEUDO = 1500
LIMITE_MATERIAL_PERSONALIZADO = 4000
MAX_CONTEUDOS = 12

_SO_LINK = re.compile(r"^(https?://|/|[\w.-]+/[\w./-]+\.\w{2,5}$)\S*$", re.IGNORECASE)


def _texto(valor: Any) -> str:
    return valor.strip() if isinstance(valor, str) else ""


def _parece_so_link(texto: str) -> bool:
    return bool(_SO_LINK.match(texto.strip())) and " " not in texto.strip()


def _cortar(texto: str, limite: int) -> str:
    texto = texto.strip()
    return texto if len(texto) <= limite else texto[: limite - 1].rstrip() + "…"


def texto_de_estudo_do_conteudo(conteudo: dict[str, Any], limite: int = LIMITE_POR_CONTEUDO) -> str:
    """O texto que o aluno estuda naquele conteúdo, nesta ordem de preferência:

    1. `conteudo` quando é texto de verdade (não só um link/caminho de arquivo);
    2. o texto extraído do arquivo (`metadata.texto_extraido`, `transcricao`, `transcript`, `text`);
    3. o texto extraído de cada arquivo anexado (`metadata.files[].texto_extraido`).
    """
    bruto = _texto(conteudo.get("conteudo"))
    if bruto and not _parece_so_link(bruto):
        return _cortar(bruto, limite)

    meta = conteudo.get("metadata") if isinstance(conteudo.get("metadata"), dict) else {}
    for chave in ("texto_extraido", "transcricao", "transcript", "text"):
        valor = _texto(meta.get(chave))
        if valor:
            return _cortar(valor, limite)

    arquivos = meta.get("files") if isinstance(meta.get("files"), list) else []
    partes = [_texto(a.get("texto_extraido")) for a in arquivos if isinstance(a, dict)]
    juntos = "\n\n".join(p for p in partes if p)
    return _cortar(juntos, limite) if juntos else ""


def markdown_personalizado(registros: list[dict[str, Any]] | None, limite: int = LIMITE_MATERIAL_PERSONALIZADO) -> str:
    """O markdown gerado para o aluno (`materiais.markdown.payload.markdown`), do registro mais
    recente que tiver um. É o material que ele lê na tela — o chat precisa conhecê-lo."""
    for registro in registros or []:
        materiais = registro.get("materiais") if isinstance(registro, dict) else None
        if not isinstance(materiais, dict):
            continue
        bloco = materiais.get("markdown")
        payload = bloco.get("payload") if isinstance(bloco, dict) else None
        texto = _texto(payload.get("markdown")) if isinstance(payload, dict) else ""
        if texto:
            return _cortar(texto, limite)
    return ""


def montar_conteudo_materia(
    *,
    conteudos: list[dict[str, Any]] | None,
    atividades: list[dict[str, Any]] | None,
    questoes: list[dict[str, Any]] | None,
    registros: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """O mesmo recorte vai ao modelo e ao juiz de grounding: o que o juiz não vê, ele reprova."""
    return {
        "conteudos": [
            {
                "titulo": c.get("titulo"),
                "tipo": c.get("tipo"),
                "texto": texto_de_estudo_do_conteudo(c),
                "ordem": c.get("ordem"),
            }
            for c in (conteudos or [])[:MAX_CONTEUDOS]
            if isinstance(c, dict)
        ],
        "material_personalizado": markdown_personalizado(registros),
        "atividades": [
            {"titulo": a.get("titulo"), "descricao": a.get("descricao"), "tipo": a.get("tipo")}
            for a in (atividades or [])[:12]
            if isinstance(a, dict)
        ],
        "questoes_temas": [
            {"enunciado": q.get("enunciado"), "tipo": q.get("tipo")}
            for q in (questoes or [])[:20]
            if isinstance(q, dict)
        ],
    }
