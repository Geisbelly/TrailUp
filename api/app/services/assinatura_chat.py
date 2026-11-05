"""Assinatura das falas da IA nos chats (mentor do aluno e Lumi do professor).

A conversa não é gravada: o `historico` volta do cliente a cada pergunta. A resposta sai daqui com uma
assinatura presa a quem perguntou, e só uma fala com assinatura válida conta como dita pela IA. Quem
escrever uma fala falsa não tem a chave, e a fala de outra pessoa não confere.

A chave deriva do `supabase_jwt_secret`, então não há variável nova para configurar. Trocar aquele
segredo só invalida as conversas abertas no momento.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from typing import Any, Literal

from app.schemas.entrada_chat import MAX_TEXTO_DO_CHAT, limpar_texto

Canal = Literal["mentor", "lumi"]

_ROTULO_DA_CHAVE = b"trailup-chat-fala-v1"


def assinar(texto: str, *, segredo: str, usuario_id: Any, canal: Canal) -> str:
    chave = hmac.new(segredo.encode(), _ROTULO_DA_CHAVE, hashlib.sha256).digest()
    # A forma é a que o schema entrega depois de limpar: o cliente devolve o texto como recebeu.
    mensagem = "\0".join((canal, str(usuario_id), limpar_texto(texto, MAX_TEXTO_DO_CHAT).strip()))
    assinatura = hmac.new(chave, mensagem.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(assinatura).decode().rstrip("=")


def confere(assinatura: str | None, texto: str, *, segredo: str, usuario_id: Any, canal: Canal) -> bool:
    if not assinatura:
        return False
    esperada = assinar(texto, segredo=segredo, usuario_id=usuario_id, canal=canal)
    return hmac.compare_digest(assinatura.encode(), esperada.encode())


def historico_do_mentor(
    falas: list[Any], *, segredo: str, usuario_id: Any, exigir_assinatura: bool
) -> tuple[list[dict[str, Any]], int]:
    """O que vai ao modelo, e quantas falas vieram sem assinatura.

    Fala com assinatura errada sai sempre. Sem assinatura, depende de `exigir_assinatura`: o app
    instalado ainda não assina, então até a versão mínima ela segue marcada como não verificada.
    """
    saida: list[dict[str, Any]] = []
    sem_assinatura = 0
    for fala in falas:
        if fala.role != "assistant":
            saida.append({"role": fala.role, "content": fala.content})
            continue
        if fala.assinatura is None:
            sem_assinatura += 1
            if not exigir_assinatura:
                saida.append({"role": fala.role, "content": fala.content, "verificada": False})
            continue
        if confere(fala.assinatura, fala.content, segredo=segredo, usuario_id=usuario_id, canal="mentor"):
            saida.append({"role": fala.role, "content": fala.content})
    return saida, sem_assinatura
