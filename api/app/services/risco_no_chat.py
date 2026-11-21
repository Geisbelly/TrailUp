"""Barreira de risco do Guia: texto fixo, sem modelo.

Quando o aluno fala em se machucar ou em não querer viver, o CVV e o SAMU saem na resposta
mesmo com o modelo fora do ar, e antes de qualquer atalho ou checagem de IA. É informação de
segurança, não IA. Errar para o lado de avisar à toa custa uma frase; errar para o outro, não.
"""

from __future__ import annotations

from app.services.respostas_do_guia import _normalizar

TEXTO_DO_CVV = (
    "Se você está pensando em se machucar, você não está sozinho. "
    "Ligue para o CVV 188 (ligação gratuita, 24 h, também por chat em cvv.org.br). "
    "Em perigo imediato, ligue para o SAMU 192."
)
assert TEXTO_DO_CVV.endswith("SAMU 192.")

# Frases já sem acento e em minúsculas (ver `_normalizar`). Casam por trecho da frase.
# Lista revisada pela autora antes de ir ao ar: não acrescente nem tire frase sem a revisão dela.
# Ficam de fora, de propósito, usos comuns como "me mata de rir" e "acabar a trilha".
_FRASES_DE_RISCO = (
    "nao quero mais viver",
    "nao quero viver mais",
    "nao quero mais existir",
    "queria nao existir",
    "queria sumir para sempre",
    "vou me matar",
    "quero me matar",
    "vontade de me matar",
    "pensando em me matar",
    "pensei em me matar",
    "vou me machucar",
    "quero me machucar",
    "vontade de me machucar",
    "me machucar de proposito",
    "me cortar de proposito",
    "vou me cortar",
    "quero morrer",
    "vou morrer logo",
    "acabar com a minha vida",
    "acabar com minha vida",
    "tirar a minha vida",
    "tirar minha vida",
    "acabar com tudo",
    "suicidio",
    "me suicidar",
)


def sinal_de_risco(mensagem: str) -> bool:
    texto = f" {_normalizar(mensagem or '')} "
    return any(f" {frase} " in texto for frase in _FRASES_DE_RISCO)


TEXTO_DO_SAMU = "Em perigo imediato, ligue para o SAMU 192."


def garantir_cvv(reply: str) -> str:
    """Acrescenta o texto fixo em parágrafo próprio, se a resposta ainda não indica o CVV.

    O prompt manda o modelo indicar o CVV com as palavras dele: se o 188 já está no texto, não
    repete, e só acrescenta o SAMU quando o 192 falta."""
    texto = _normalizar(reply or "")
    if "188" in texto and "cvv" in texto:
        if "192" in texto:
            return reply
        return f"{reply.rstrip()}\n\n{TEXTO_DO_SAMU}"
    return f"{reply.rstrip()}\n\n{TEXTO_DO_CVV}".lstrip()
