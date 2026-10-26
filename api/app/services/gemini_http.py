"""Chamadas HTTP diretas ao Gemini (generativelanguage.googleapis.com).

A chave vai no header ``x-goog-api-key``, nunca na query string (#195): URL
com ``?key=`` acaba em log de proxy, de cliente HTTP e em mensagem de erro
(``httpx.HTTPStatusError`` inclui a URL inteira).
"""

from __future__ import annotations

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


def gemini_generate_url(model: str) -> str:
    return f"{GEMINI_API_BASE}/{model}:generateContent"


def gemini_headers(api_key: str | None) -> dict[str, str]:
    return {"x-goog-api-key": str(api_key or ""), "Content-Type": "application/json"}


__all__ = ["GEMINI_API_BASE", "gemini_generate_url", "gemini_headers"]
