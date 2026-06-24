import pytest

from app.core.settings import Settings
from app.services.storage import SupabaseStorage, build_public_storage_url


def test_build_public_storage_url_normaliza_prefixo_bucket_e_encoding() -> None:
    url = build_public_storage_url(
        "https://xrebtkmdewolzmpsdwgh.supabase.co",
        "conteudos",
        "conteudos/aluno 1/114/aula final.pptx",
    )

    assert (
        url
        == "https://xrebtkmdewolzmpsdwgh.supabase.co/storage/v1/object/public/conteudos/aluno%201/114/aula%20final.pptx"
    )


@pytest.mark.asyncio
async def test_download_bytes_faz_fallback_para_url_publica_sem_service_key(monkeypatch) -> None:
    calls: list[tuple[str, dict | None]] = []

    class _DummyResponse:
        def __init__(self, content: bytes) -> None:
            self.content = content

        def raise_for_status(self) -> None:
            return None

    class _DummyClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url: str, headers: dict | None = None):
            calls.append((url, headers))
            return _DummyResponse(b"pptx-bytes")

    monkeypatch.setattr("app.services.storage.httpx.AsyncClient", lambda *args, **kwargs: _DummyClient())

    settings = Settings(
        supabase_url="https://xrebtkmdewolzmpsdwgh.supabase.co",
        supabase_service_key=None,
    )
    storage = SupabaseStorage(settings)

    raw = await storage.download_bytes(
        bucket="conteudos",
        path="conteudos/b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx",
    )

    assert raw == b"pptx-bytes"
    assert len(calls) == 1
    assert (
        calls[0][0]
        == "https://xrebtkmdewolzmpsdwgh.supabase.co/storage/v1/object/public/conteudos/b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx"
    )
    assert calls[0][1] is None


@pytest.mark.asyncio
async def test_load_source_preview_preserva_acentos_quando_texto_nao_esta_em_utf8(monkeypatch) -> None:
    settings = Settings(
        supabase_url="https://xrebtkmdewolzmpsdwgh.supabase.co",
        supabase_service_key=None,
    )
    storage = SupabaseStorage(settings)

    texto_original = "Introdução à computação distribuída. Comunicação e ação."
    raw_cp1252 = texto_original.encode("cp1252")

    async def _fake_download_public_bytes(url: str) -> bytes | None:
        del url
        return raw_cp1252

    monkeypatch.setattr(storage, "download_public_bytes", _fake_download_public_bytes)

    preview = await storage.load_source_preview(
        url="https://example.com/fonte.txt",
        mime_type="text/plain",
    )

    assert preview.get("texto_extraido") == texto_original
    assert "Introdução" in str(preview.get("texto_extraido"))
