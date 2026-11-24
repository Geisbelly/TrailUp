"""O site do TrailUp para o Guia do aluno e a Lumi do professor.

Duas fontes:

- `site_trailup.json`: as páginas públicas (início, Sobre, Download, Contato, cartilha da pesquisa,
  Privacidade, Termos), os artigos do Diário e os vídeos. É **cópia gerada** pelo frontend
  (`frontend/src/features/site/siteDosGuias.paridade.test.tsx`), que falha quando o site muda e a
  cópia não;
- `monografia_trailup.md`: o resumo da monografia, escrito à mão. Ele segue os limites do que o
  trabalho afirma (sem efeito medido, sem dado de uso, RAG sem uso em sala).

Mandar tudo a cada pergunta custaria uns 15 mil tokens de cota gratuita. Então o modelo recebe
sempre só o **índice** (título e endereço de cada seção, estático, no começo do payload, onde o
cache vale) e, quando a pergunta casa com alguma seção, os **trechos** dela, escolhidos por
palavra, sem chamada de modelo, perto do fim do payload. O juiz recebe os mesmos trechos: o que ele
não vê, ele reprova como invenção.
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from app.services.llm import PROMPTS_DIR

BASE_PADRAO = "https://trailup.vercel.app"
MAX_TRECHOS = 4
MAX_CARACTERES_POR_TRECHO = 2500
MAX_CARACTERES_DOS_TRECHOS = 6000
# Uma palavra no título vale mais do que muitas no texto: o título diz do que a seção trata.
PESO_TITULO = 3
MAX_CONTAGEM_NO_TEXTO = 3
# Pontos ponderados pela raridade da palavra no site (`_raridade`). Sem palavra rara no título, a
# seção só entra com várias palavras raras no texto: pergunta de matéria ("o que é uma função?") não
# deve puxar a página de Termos. Calibrado nas perguntas de `test_site_trailup.py`.
RARIDADE_MINIMA_NO_TITULO = 1.0
PONTOS_COM_TITULO = 6.0
PONTOS_SEM_TITULO = 12.0
TAMANHO_DO_RADICAL = 6

# Palavras que a pergunta usa para o tipo de seção, e não só para o assunto.
_TIPO: dict[str, str] = {
    "pagina": "site pagina",
    "diario": "diario blog artigo artigos post",
    "video": "video videos assistir",
    "monografia": "monografia tcc",
}
_PALAVRAS_VAZIAS = set(
    """
    como onde para qual quais sobre isso essa esse esta este estou mais quando porque pode posso
    fazer tenho quero preciso voce minha meus minhas muito tambem entao ainda aqui coisa coisas
    trailup dele dela deles delas pelo pela pelos pelas numa num uma umas uns que tem sao seria
    falar fala explica explicar sabe saber diz dizer queria gostaria ajuda ajudar algum alguma
    funciona funcionar funcionam funcionamento existe existem diferenca exemplo exemplos entendi
    entender quanto leva demora clara claro estao estou esta
    """.split()
)

_SIGLAS = {"tcc", "jic", "rag", "sus", "cvv"}


@dataclass(frozen=True)
class SecaoDoSite:
    id: str
    tipo: str
    titulo: str
    url: str
    texto: str
    palavras_do_titulo: frozenset[str]
    palavras_do_tipo: frozenset[str]
    palavras_do_texto: Counter


def _sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def palavras(texto: str) -> list[str]:
    """Radicais das palavras de 4 letras ou mais (e das siglas curtas que importam), sem acento e
    sem as vazias."""
    saida = []
    for p in re.findall(r"[a-z0-9]+", _sem_acento(str(texto or "")).lower()):
        if (len(p) < 4 and p not in _SIGLAS) or p in _PALAVRAS_VAZIAS:
            continue
        if len(p) > 4 and p.endswith("is"):  # perfis, papéis
            p = p[:-2] + "il"
        elif len(p) > 4 and p.endswith("s"):
            p = p[:-1]
        # Radical curto: "conclusão" e "concluiu", "vídeo" e "vídeos" caem juntos.
        saida.append(p[:TAMANHO_DO_RADICAL])
    return saida


@lru_cache(maxsize=1)
def _termos_de_tipo() -> frozenset[str]:
    return frozenset(p for texto in _TIPO.values() for p in palavras(texto))


def _secao(id_: str, tipo: str, titulo: str, url: str, texto: str) -> SecaoDoSite:
    return SecaoDoSite(
        id=id_,
        tipo=tipo,
        titulo=titulo,
        url=url,
        texto=texto,
        palavras_do_titulo=frozenset(palavras(titulo)) - _termos_de_tipo(),
        palavras_do_tipo=frozenset(palavras(_TIPO.get(tipo, ""))),
        palavras_do_texto=Counter(palavras(texto)),
    )


def _secoes_da_monografia(md: str) -> list[SecaoDoSite]:
    partes = re.split(r"\n(?=## )", md)
    secoes = []
    for n, parte in enumerate(partes[1:], start=1):
        titulo = parte[3:].split("\n", 1)[0].strip()
        secoes.append(
            _secao(f"monografia/{n}", "monografia", f"Monografia: {titulo}", "/blog/pesquisa-tcc", parte.strip())
        )
    return secoes


@lru_cache(maxsize=1)
def _site() -> tuple[str, tuple[SecaoDoSite, ...]]:
    dados = json.loads((PROMPTS_DIR / "site_trailup.json").read_text(encoding="utf-8"))
    secoes = [
        _secao(s["id"], s["tipo"], s["titulo"], s["url"], s["texto"])
        for s in dados.get("secoes", [])
    ]
    secoes += _secoes_da_monografia((PROMPTS_DIR / "monografia_trailup.md").read_text(encoding="utf-8"))
    return dados.get("base") or BASE_PADRAO, tuple(secoes)


@lru_cache(maxsize=1)
def indice_do_site() -> dict[str, Any]:
    """O mapa do site: sempre igual, então vai no começo do payload. Uma linha por página."""
    base, secoes = _site()
    paginas: dict[str, list[str]] = {}
    nomes: dict[str, str] = {}
    outros: dict[str, list[str]] = {"diario": [], "video": []}
    for s in secoes:
        if s.tipo == "pagina":
            nome, _, sub = s.titulo.partition(": ")
            nomes.setdefault(s.url, nome)
            if sub:
                paginas.setdefault(s.url, []).append(sub)
            else:
                paginas.setdefault(s.url, [])
        elif s.tipo in outros:
            outros[s.tipo].append(f"{s.titulo.split(': ', 1)[-1]} ({base}{s.url})")
    return {
        "endereco": base,
        "paginas": [
            f"{nomes[url]} ({base}{url})" + (f": {'; '.join(subs)}" if subs else "")
            for url, subs in paginas.items()
        ],
        "diario": outros["diario"],
        "videos": outros["video"],
        "monografia": (
            "Resumo da monografia (ainda não publicada): pergunta, objetivo, método, o que encontrou, "
            f"o que não afirma, o estudo proposto. Quem quiser ler sobre a pesquisa: {base}/blog/pesquisa-tcc"
        ),
    }


@lru_cache(maxsize=1)
def _raridade() -> dict[str, float]:
    """Quanto vale cada palavra: a que aparece em quase toda seção ("perfil", "aluno") pesa pouco."""
    _, secoes = _site()
    contagem: Counter = Counter()
    for s in secoes:
        contagem.update(s.palavras_do_titulo | s.palavras_do_tipo | set(s.palavras_do_texto))
    total = len(secoes)
    return {termo: math.log((total + 1) / (n + 1)) for termo, n in contagem.items()}


def _pontos(secao: SecaoDoSite, termos: set[str]) -> tuple[float, bool]:
    raridade = _raridade()
    no_titulo = False
    pontos = 0.0
    for termo in termos:
        peso = raridade.get(termo, 0.0)
        # "vídeo", "blog", "monografia" dizem o tipo da seção, não o assunto: valem como título
        # para as seções daquele tipo e nada para as outras.
        if termo in _termos_de_tipo():
            if termo in secao.palavras_do_tipo:
                pontos += PESO_TITULO * peso
                no_titulo = True
            continue
        if termo in secao.palavras_do_titulo:
            pontos += PESO_TITULO * peso
            no_titulo = no_titulo or peso >= RARIDADE_MINIMA_NO_TITULO
        pontos += min(secao.palavras_do_texto.get(termo, 0), MAX_CONTAGEM_NO_TEXTO) * peso
    return pontos, no_titulo


def trechos_do_site(pergunta: str) -> list[dict[str, str]]:
    """As seções que a pergunta pede, da mais para a menos relacionada, dentro do orçamento.

    Sem seção que passe do mínimo, lista vazia: a pergunta é da matéria, não do site."""
    termos = set(palavras(pergunta))
    if not termos:
        return []
    base, secoes = _site()
    candidatas = []
    for ordem, secao in enumerate(secoes):
        pontos, no_titulo = _pontos(secao, termos)
        if (no_titulo and pontos >= PONTOS_COM_TITULO) or pontos >= PONTOS_SEM_TITULO:
            candidatas.append((-pontos, ordem, secao))
    candidatas.sort()
    saida: list[dict[str, str]] = []
    usados = 0
    for _, _, secao in candidatas[:MAX_TRECHOS]:
        texto = secao.texto[:MAX_CARACTERES_POR_TRECHO]
        if usados + len(texto) > MAX_CARACTERES_DOS_TRECHOS:
            break
        usados += len(texto)
        saida.append({"titulo": secao.titulo, "endereco": f"{base}{secao.url}", "texto": texto})
    return saida


def trechos_da_conversa(mensagem: str, falas_anteriores: list[str] | None = None) -> list[dict[str, str]]:
    """Os trechos da pergunta atual; sem nenhum, os da pergunta atual junto da anterior.

    "E o vídeo dele?" depois de "o que é o perfil Seeker?" não casa sozinho com nada."""
    trechos = trechos_do_site(mensagem)
    if trechos or not falas_anteriores:
        return trechos
    return trechos_do_site(f"{falas_anteriores[-1]} {mensagem}")
