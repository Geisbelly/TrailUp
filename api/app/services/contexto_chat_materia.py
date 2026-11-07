"""Material de estudo que o chat do Guia recebe (06/11).

O chat só respondia sobre personalização porque o modelo quase não via a matéria: cada conteúdo
chegava como os 600 primeiros caracteres de `conteudos.conteudo` — que, num arquivo, é um link ou
caminho —, e o texto do material personalizado (o markdown gerado) nem entrava. O juiz de grounding
reprovava qualquer explicação "fora da base", e a resposta caía no texto de reserva.

Aqui ficam as duas leituras, puras (sem banco), para o mesmo recorte ir ao modelo e ao juiz.
"""

from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

LIMITE_POR_CONTEUDO = 1500
LIMITE_MATERIAL_PERSONALIZADO = 4000
MAX_CONTEUDOS = 12
MAX_QUESTOES = 20
MAX_CARDS = 20
# Abaixo disto a resposta ("3/4", "B", "Verdadeiro") cabe em qualquer explicação: fica com o juiz.
MIN_CARACTERES_GABARITO = 12
# Palavras seguidas de um verso de card ou resposta longa que já contam como cópia.
JANELA_PALAVRAS = 8

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


def _respostas_aceitas(valor: Any) -> list[str]:
    """O gabarito como lista de textos. `resposta_correta` é texto, mas pode guardar uma lista em
    JSON (várias respostas aceitas) — o app lê assim em `getAcceptedAnswers`."""
    if isinstance(valor, list):
        return [r for item in valor for r in _respostas_aceitas(item)]
    if isinstance(valor, dict):
        for chave in ("respostas", "answers", "acceptedAnswers", "alternativas", "value"):
            if chave in valor:
                return _respostas_aceitas(valor[chave])
        return []
    texto = _texto(valor) if isinstance(valor, str) else (str(valor).strip() if valor is not None else "")
    if not texto:
        return []
    if texto[:1] in "[{":
        try:
            return _respostas_aceitas(json.loads(texto))
        except ValueError:
            pass
    return [texto]


def _alternativas(valor: Any) -> list[str]:
    """Só o texto de cada alternativa. Marcas de "correta" ficam de fora: é o guia que lê isto."""
    if isinstance(valor, str) and valor.strip()[:1] == "[":
        try:
            valor = json.loads(valor)
        except ValueError:
            return []
    if not isinstance(valor, list):
        return []
    textos: list[str] = []
    for item in valor[:8]:
        if isinstance(item, dict):
            item = item.get("texto") or item.get("text") or item.get("label") or item.get("valor")
        texto = _texto(item) if isinstance(item, str) else ""
        if texto:
            textos.append(_cortar(texto, 200))
    return textos


def _materiais(registros: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    return [r["materiais"] for r in (registros or []) if isinstance(r, dict) and isinstance(r.get("materiais"), dict)]


def _cards_gerados(registros: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Os cards de frente e verso do material personalizado, do registro mais recente que tiver."""
    for materiais in _materiais(registros):
        bloco = materiais.get("cards")
        payload = bloco.get("payload") if isinstance(bloco, dict) else None
        if isinstance(payload, dict):
            payload = payload.get("cards")
        cards = [c for c in payload if isinstance(c, dict)] if isinstance(payload, list) else []
        if cards:
            return cards[:MAX_CARDS]
    return []


def _questoes_do_quiz_gerado(registros: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """As questões do quiz personalizado (`materiais.quiz.payload.atividades[].questoes[]`)."""
    for materiais in _materiais(registros):
        bloco = materiais.get("quiz")
        payload = bloco.get("payload") if isinstance(bloco, dict) else None
        atividades = payload.get("atividades") if isinstance(payload, dict) else None
        questoes = [
            q
            for a in (atividades if isinstance(atividades, list) else [])
            if isinstance(a, dict)
            for q in (a.get("questoes") if isinstance(a.get("questoes"), list) else [])
            if isinstance(q, dict)
        ]
        if questoes:
            return questoes[:MAX_QUESTOES]
    return []


def _enunciado(questao: dict[str, Any]) -> str:
    return _texto(questao.get("enunciado")) or _texto(questao.get("pergunta"))


def _frente(card: dict[str, Any]) -> str:
    return _texto(card.get("frente")) or _texto(card.get("titulo"))


def _verso(card: dict[str, Any]) -> str:
    return _texto(card.get("verso")) or _texto(card.get("descricao"))


def montar_conteudo_materia(
    *,
    conteudos: list[dict[str, Any]] | None,
    atividades: list[dict[str, Any]] | None,
    questoes: list[dict[str, Any]] | None,
    registros: list[dict[str, Any]] | None,
    cards: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """O que o guia estuda junto com o aluno. O mesmo recorte vai ao juiz de grounding: o que o
    juiz não vê, ele reprova.

    Das questões e dos cards vai só o que o aluno vê ANTES de responder: o enunciado e as
    alternativas (sem dizer qual é a certa), e a frente do card. Com isso o guia sabe o que está
    sendo pedido e pode dar dica, reforçar o conceito e fazer o aluno pensar. A resposta — o
    gabarito e o verso do card — não vem para cá: vai só ao Guardian, em
    `montar_gabarito_protegido`, que é quem barra o vazamento.
    """
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
            {"enunciado": _enunciado(q), "tipo": q.get("tipo"), "alternativas": _alternativas(q.get("alternativas"))}
            for q in [*(questoes or [])[:MAX_QUESTOES], *_questoes_do_quiz_gerado(registros)]
            if isinstance(q, dict) and _enunciado(q)
        ],
        "cards_frente": [
            frente
            for frente in (_frente(c) for c in [*(cards or [])[:MAX_CARDS], *_cards_gerados(registros)] if isinstance(c, dict))
            if frente
        ],
    }


def montar_gabarito_protegido(
    *,
    questoes: list[dict[str, Any]] | None,
    registros: list[dict[str, Any]] | None,
    cards: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """O que o guia NUNCA pode dizer: a resposta de cada questão (do professor e do quiz
    personalizado) e o verso de cada card. Só o Guardian recebe isto — nunca o modelo que
    responde ao aluno, que não teria como vazar o que não leu."""
    itens: list[dict[str, Any]] = []
    for origem, lista in (("questao", (questoes or [])[:MAX_QUESTOES]), ("quiz_personalizado", _questoes_do_quiz_gerado(registros))):
        for q in lista:
            if not isinstance(q, dict):
                continue
            respostas = _respostas_aceitas(q.get("resposta_correta"))
            if respostas:
                itens.append({"origem": origem, "pergunta": _enunciado(q), "respostas": respostas})
    for c in [*(cards or [])[:MAX_CARDS], *_cards_gerados(registros)]:
        if isinstance(c, dict) and _verso(c):
            itens.append({"origem": "card", "pergunta": _frente(c), "respostas": [_verso(c)]})
    return itens


_NAO_ALFANUMERICO = re.compile(r"[^0-9a-z/]+")


def _normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto.casefold())
    sem_acento = "".join(ch for ch in sem_acento if not unicodedata.combining(ch))
    return _NAO_ALFANUMERICO.sub(" ", sem_acento).strip()


def gabarito_na_resposta(texto: str, gabarito: list[dict[str, Any]] | None) -> dict[str, Any] | None:
    """Item do gabarito que a resposta reproduz ao pé da letra, ou None.

    Só pega o que dá para pegar sem julgamento: uma resposta longa (a partir de
    `MIN_CARACTERES_GABARITO`) escrita dentro da fala do guia, ou um trecho de `JANELA_PALAVRAS`
    palavras seguidas copiado de um verso de card ou de uma resposta dissertativa. Resposta
    curta ("3/4", "B", "Verdadeiro") aparece em qualquer explicação de frações e daria alarme
    falso: essa fica com o juiz, que recebe o gabarito e julga se a fala a entrega.
    """
    fala = f" {_normalizar(texto)} "
    if not fala.strip():
        return None
    for item in gabarito or []:
        for resposta in item.get("respostas") or []:
            alvo = _normalizar(str(resposta))
            if len(alvo) >= MIN_CARACTERES_GABARITO and f" {alvo} " in fala:
                return item
            palavras = alvo.split()
            for i in range(0, max(0, len(palavras) - JANELA_PALAVRAS + 1)):
                if f" {' '.join(palavras[i : i + JANELA_PALAVRAS])} " in fala:
                    return item
    return None
