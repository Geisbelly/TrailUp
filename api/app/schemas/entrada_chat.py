"""Limpeza do texto que os chats recebem do cliente (mentor do aluno e Lumi do professor).

O `historico` volta do aparelho a cada pergunta e nada no servidor prova que uma fala "da IA" ali foi
mesmo dita: quem chama a API pode escrevê-la. Isto só tira o que não é texto legível e limita o
tamanho. Que aquelas falas não valem como instrução está nos prompts.
"""

from __future__ import annotations

import unicodedata

# Une emojis compostos; sem ele a família 👨‍👩‍👧 vira três pessoas soltas.
_ZWJ = "‍"
_QUEBRAS = "\n\r\t"


def _legivel(caractere: str) -> bool:
    if caractere in _QUEBRAS or caractere == _ZWJ:
        return True
    # Cc: controle. Cf: invisíveis (largura zero, inversão de direção, tags Unicode), por onde um
    # texto chega ao modelo sem aparecer para quem lê o log.
    return unicodedata.category(caractere) not in ("Cc", "Cf")


def limpar_texto(texto: str, limite: int | None = None) -> str:
    limpo = "".join(c for c in texto if _legivel(c))
    return limpo if limite is None else limpo[:limite]
