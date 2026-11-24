"""Resposta de reserva do Guia: o que o aluno recebe quando o modelo não respondeu (24/11).

Antes era um texto fixo sem acento que prometia explicar a personalização, citava o perfil errado
(o `[0]` da lista do `context.py`, Seeker para quem não tem `aluno_perfil`) e servia a qualquer
pergunta, de "o que é lógica?" a "o que é a loja?". O aluno de teste recebeu só isso o dia inteiro,
com a cota do Gemini esgotada.

Agora a reserva é honesta e ligada ao que o aluno está vendo, sem modelo:

1. pedido de resposta de atividade: não entrega, e aponta o conteúdo para reler;
2. pergunta que cita uma tela do app: o texto fixo dela (`respostas_do_guia.tela_citada`);
3. pergunta da matéria: o trecho do conteúdo do tópico que casa com as palavras da pergunta, por
   casamento simples de palavras;
4. sem trecho: diz que o Guia não conseguiu responder agora e sugere reler o conteúdo, pelo nome.

Não cita perfil BrainHex: quem não respondeu não tem por que falar da personalização. Não promete
horário. O trecho sai só dos conteúdos e do material personalizado (nunca de questões nem de cards),
e ainda passa por `gabarito_na_resposta`: o que repetiria uma resposta protegida não é usado.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.services.contexto_chat_materia import gabarito_na_resposta
from app.services.respostas_do_guia import tela_citada

MAX_TRECHO = 280
MIN_RADICAL = 4
# Palavras que não dizem do que a pergunta trata.
_VAZIAS = frozenset(
    """
    a o as os um uma uns umas de do da dos das no na nos nas em por para pra pro com sem sobre ao aos
    e ou mas que se como qual quais quando onde porque por que quem cujo isso isto esse essa este esta
    aquilo ele ela eles elas eu voce voces me mim meu minha te ti seu sua nos nosso nossa lhe
    e eh sao ser foi era sera tem ter ha esta estao estou fica ficam faz fazer pode posso consigo
    nao sim muito pouco mais menos tambem ja ainda so mesmo entao assim aqui ali la
    explica explique explicar entendi entender entendo sei saber significa significado quer dizer
    duvida pergunta ajuda ajudar guia guardiao oi ola bom dia boa tarde noite obrigado obrigada
    """.split()
)
_PEDIDO_DE_RESPOSTA = (
    "qual a resposta",
    "qual e a resposta",
    "me passa a resposta",
    "me da a resposta",
    "me diga a resposta",
    "gabarito",
    "alternativa correta",
    "qual alternativa",
    "resolva",
    "resolve pra mim",
    "faz pra mim",
)
_MARCAS_DE_MARKDOWN = re.compile(r"[#*_`>|~]+|\[([^\]]*)\]\([^)]*\)")
_FRASES = re.compile(r"(?<=[.!?])\s+|\n+")


def _sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))


def _palavras(texto: str) -> list[str]:
    return re.findall(r"[0-9a-z]+", _sem_acento(texto.casefold()))


def pede_resposta(mensagem: str) -> bool:
    normalizada = " ".join(_palavras(mensagem))
    return any(" ".join(_palavras(padrao)) in normalizada for padrao in _PEDIDO_DE_RESPOSTA)


def _radicais(mensagem: str) -> set[str]:
    """O começo de cada palavra que importa: "lógica" casa com "lógicos", "variáveis" com "variável"."""
    radicais = set()
    for palavra in _palavras(mensagem):
        if palavra in _VAZIAS or len(palavra) < MIN_RADICAL:
            continue
        radicais.add(palavra[: max(MIN_RADICAL, min(len(palavra) - 1, 6))])
    return radicais


def _limpar(texto: str) -> str:
    return " ".join(_MARCAS_DE_MARKDOWN.sub(lambda m: m.group(1) or " ", texto).split())


def _cortar(texto: str) -> str:
    if len(texto) <= MAX_TRECHO:
        return texto
    corte = texto[: MAX_TRECHO - 1].rsplit(" ", 1)[0].rstrip(",;:")
    return f"{corte}…"


def _fontes(conteudo_materia: dict[str, Any], titulo_atual: str | None) -> list[tuple[str | None, str]]:
    """(título, texto) de onde um trecho pode sair: o conteúdo aberto primeiro, os outros do tópico e
    o material personalizado. Questões e cards ficam de fora."""
    fontes: list[tuple[str | None, str]] = []
    for item in conteudo_materia.get("conteudos") or []:
        if not isinstance(item, dict):
            continue
        titulo = str(item.get("titulo") or "").strip() or None
        texto = str(item.get("texto") or "")
        if texto.strip():
            fontes.append((titulo, texto))
    if titulo_atual:
        fontes.sort(key=lambda fonte: fonte[0] != titulo_atual)
    personalizado = str(conteudo_materia.get("material_personalizado") or "")
    if personalizado.strip():
        fontes.append((titulo_atual, personalizado))
    return fontes


def trecho_relacionado(
    mensagem: str,
    conteudo_materia: dict[str, Any] | None,
    *,
    titulo_atual: str | None = None,
    gabarito_protegido: list[dict[str, Any]] | None = None,
) -> tuple[str | None, str] | None:
    """(título do conteúdo, trecho) que mais casa com as palavras da pergunta, ou None.

    A frase com mais radicais da pergunta ganha; empate fica com a que aparece antes (o conteúdo
    aberto vem primeiro). Frase que repetiria uma resposta protegida é pulada."""
    radicais = _radicais(mensagem)
    if not radicais or not isinstance(conteudo_materia, dict):
        return None
    melhor: tuple[int, str | None, str] | None = None
    for titulo, texto in _fontes(conteudo_materia, titulo_atual):
        for frase in _FRASES.split(texto):
            limpa = _limpar(frase)
            if len(limpa) < 20:
                continue
            palavras = _palavras(limpa)
            pontos = sum(1 for radical in radicais if any(p.startswith(radical) for p in palavras))
            if pontos == 0 or (melhor is not None and pontos <= melhor[0]):
                continue
            trecho = _cortar(limpa)
            if gabarito_na_resposta(trecho, gabarito_protegido) is not None:
                continue
            melhor = (pontos, titulo, trecho)
    return (melhor[1], melhor[2]) if melhor else None


def _onde_reler(titulo_conteudo: str | None, titulo_topico: str | None) -> str:
    if titulo_conteudo and titulo_topico:
        return f"o conteúdo “{titulo_conteudo}” (tópico “{titulo_topico}”)"
    if titulo_conteudo:
        return f"o conteúdo “{titulo_conteudo}”"
    if titulo_topico:
        return f"o material do tópico “{titulo_topico}”"
    return "o material que você está estudando"


def resposta_de_reserva(
    *,
    mensagem: str,
    titulo_topico: str | None,
    titulo_conteudo: str | None,
    conteudo_materia: dict[str, Any] | None,
    gabarito_protegido: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """O dicionário que `gerar_validado` valida com `MentorChatLLMResult` quando o modelo não respondeu."""
    conteudos = (conteudo_materia or {}).get("conteudos") or []
    primeiro = next(
        (str(c.get("titulo")).strip() for c in conteudos if isinstance(c, dict) and str(c.get("titulo") or "").strip()),
        None,
    )
    conteudo_para_reler = titulo_conteudo or primeiro
    onde = _onde_reler(conteudo_para_reler, titulo_topico)

    if pede_resposta(mensagem):
        return {
            "reply": (
                "Não posso entregar a resposta da atividade, mas posso te ajudar a chegar nela. "
                f"Releia {onde} e tente de novo; se travar num ponto, me conte qual."
            ),
            "should_close": False,
            "hinted_actions": ["revisar_material"],
        }

    tela = tela_citada(mensagem)
    if tela is not None:
        return tela.model_dump(mode="json")

    achado = trecho_relacionado(
        mensagem,
        conteudo_materia,
        titulo_atual=titulo_conteudo,
        gabarito_protegido=gabarito_protegido,
    )
    if achado is not None:
        titulo_do_trecho, trecho = achado
        return {
            "reply": (
                "Não consegui pensar numa resposta agora, então não vou inventar uma. "
                f"Mas {_onde_reler(titulo_do_trecho, titulo_topico)} fala disso: “{trecho}” "
                "Vale reler esse trecho com calma. Se a dúvida continuar, pode me perguntar de novo."
            ),
            "should_close": False,
            "hinted_actions": ["revisar_material"],
        }

    tela = tela_citada(mensagem, generica=True)
    if tela is not None:
        return tela.model_dump(mode="json")

    return {
        "reply": (
            "Não consegui pensar numa resposta para isso agora, então não vou inventar uma. "
            f"Uma sugestão: releia {onde}. Se a dúvida continuar, pode me perguntar de novo."
        ),
        "should_close": False,
        "hinted_actions": ["revisar_material"],
    }
