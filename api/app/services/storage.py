import base64
import io
import logging
import mimetypes
from typing import Any
from urllib.parse import quote

import httpx

from app.core.settings import Settings

logger = logging.getLogger(__name__)

BUCKET = "conteudo_aluno"

_CONTENT_TYPES: dict[str, str] = {
    "pdf": "application/pdf",
    "documento": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "apresentacao": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "audio": "audio/mpeg",
    "video": "video/mp4",
}

_EXTENSIONS: dict[str, str] = {
    "pdf": "pdf",
    "documento": "docx",
    "apresentacao": "pptx",
    "audio": "mp3",
    "video": "mp4",
}


def _normalize_bucket_and_path(bucket: str | None, path: str | None) -> tuple[str | None, str | None]:
    bucket_name = str(bucket or "").strip().strip("/")
    raw_path = str(path or "").strip().lstrip("/")
    if not bucket_name or not raw_path:
        return None, None
    if raw_path.startswith(f"{bucket_name}/"):
        raw_path = raw_path[len(bucket_name) + 1 :]
    return bucket_name, raw_path


def build_public_storage_url(base_url: str | None, bucket: str | None, path: str | None) -> str | None:
    base = str(base_url or "").strip().rstrip("/")
    bucket_name, raw_path = _normalize_bucket_and_path(bucket, path)
    if not base or not bucket_name or not raw_path:
        return None
    if raw_path.startswith("http://") or raw_path.startswith("https://"):
        return raw_path
    encoded_path = "/".join(quote(segment, safe="") for segment in raw_path.split("/") if segment)
    if not encoded_path:
        return None
    return f"{base}/storage/v1/object/public/{bucket_name}/{encoded_path}"


def _truncate_extracted(text: str | None, limit: int = 4000) -> str | None:
    if not text:
        return None
    normalized = " ".join(str(text).split()).strip()
    if not normalized:
        return None
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit].rstrip()


def _decode_text_bytes_preserve_ptbr(raw: bytes, *, max_bytes: int) -> str | None:
    if not raw:
        return None

    sample = raw[:max_bytes]
    for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            decoded = sample.decode(encoding)
        except UnicodeDecodeError:
            continue
        cleaned = decoded.strip()
        if cleaned:
            return _truncate_extracted(cleaned)

    # Ultimo fallback: evita perder bytes validos quando houver mistura de encodings.
    cleaned = sample.decode("utf-8", errors="replace").strip()
    return _truncate_extracted(cleaned) if cleaned else None


def _extract_text_from_pdf(raw: bytes) -> str | None:
    try:
        from pypdf import PdfReader
    except Exception:
        return None
    try:
        reader = PdfReader(io.BytesIO(raw))
        parts: list[str] = []
        for page in reader.pages[:6]:
            text = page.extract_text() or ""
            if text.strip():
                parts.append(text)
        return _truncate_extracted("\n".join(parts))
    except Exception:
        return None


def _extract_text_from_docx(raw: bytes) -> str | None:
    try:
        from docx import Document
    except Exception:
        return None
    try:
        doc = Document(io.BytesIO(raw))
        parts = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
        return _truncate_extracted("\n".join(parts))
    except Exception:
        return None


def _extract_text_from_pptx(raw: bytes) -> str | None:
    try:
        from app.ingestion.extractors.pptx_extractor import extract as extract_pptx

        parsed = extract_pptx(raw, filename="preview.pptx")
        blocks = parsed.get("blocks") if isinstance(parsed, dict) else []
        texts = [str(getattr(block, "text", "") or "").strip() for block in (blocks or [])]
        merged = "\n".join(text for text in texts if text)
        return _truncate_extracted(merged)
    except Exception:
        return None


class SupabaseStorage:
    def __init__(self, settings: Settings) -> None:
        self._base_url = (settings.supabase_url or "").rstrip("/")
        self._service_key = settings.supabase_service_key
        self._enabled = bool(self._base_url and self._service_key)

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._service_key}",
            "apikey": self._service_key or "",
        }

    def public_url(self, path: str) -> str:
        return build_public_storage_url(self._base_url, BUCKET, path) or f"{self._base_url}/storage/v1/object/public/{BUCKET}/{path}"

    def public_url_for_bucket(self, bucket: str, path: str) -> str:
        return build_public_storage_url(self._base_url, bucket, path) or f"{self._base_url}/storage/v1/object/public/{bucket}/{path}"

    async def download_bytes(self, *, bucket: str, path: str) -> bytes | None:
        bucket_name, normalized_path = _normalize_bucket_and_path(bucket, path)
        if not self._base_url or not bucket_name or not normalized_path:
            return None

        if self._enabled:
            url = f"{self._base_url}/storage/v1/object/{bucket_name}/{normalized_path}"
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.get(url, headers=self._headers())
                    resp.raise_for_status()
                    logger.info(
                        "DEBUG_PERSONALIZACAO.storage_download=%s",
                        {
                            "mode": "authenticated",
                            "bucket": bucket_name,
                            "path": normalized_path,
                            "bytes": len(resp.content or b""),
                        },
                    )
                    return resp.content
            except Exception as exc:
                logger.warning("Supabase download autenticado falhou (%s/%s): %s", bucket_name, normalized_path, exc)

        public_url = build_public_storage_url(self._base_url, bucket_name, normalized_path)
        if not public_url:
            return None
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(public_url)
                resp.raise_for_status()
                logger.info(
                    "DEBUG_PERSONALIZACAO.storage_download=%s",
                    {
                        "mode": "public",
                        "bucket": bucket_name,
                        "path": normalized_path,
                        "bytes": len(resp.content or b""),
                    },
                )
                return resp.content
        except Exception as exc:
            logger.warning("Supabase download publico falhou (%s/%s): %s", bucket_name, normalized_path, exc)
            return None

    async def download_public_bytes(self, url: str) -> bytes | None:
        if not url:
            return None
        if not (url.startswith("http://") or url.startswith("https://")):
            return None
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                return resp.content
        except Exception as exc:
            logger.warning("Download publico falhou (%s): %s", url, exc)
            return None

    async def load_source_preview(
        self,
        *,
        url: str | None = None,
        bucket: str | None = None,
        storage_path: str | None = None,
        mime_type: str | None = None,
        max_bytes: int = 180_000,
        base64_snippet_bytes: int = 12_000,
    ) -> dict[str, Any]:
        raw: bytes | None = None

        if bucket and storage_path:
            raw = await self.download_bytes(bucket=bucket, path=storage_path)
        if raw is None and url:
            raw = await self.download_public_bytes(url)

        if raw is None:
            return {}
        raw_size = len(raw)
        inferred_mime = (
            mime_type
            or (mimetypes.guess_type(url or storage_path or "")[0] if (url or storage_path) else None)
            or "application/octet-stream"
        )

        preview: dict[str, Any] = {
            "arquivo_bytes": raw_size,
            "arquivo_mime": inferred_mime,
        }

        if inferred_mime.startswith("text/") or inferred_mime in {
            "application/json",
            "application/xml",
            "text/markdown",
        }:
            decoded = _decode_text_bytes_preserve_ptbr(raw, max_bytes=max_bytes)
            if decoded:
                preview["texto_extraido"] = decoded
        else:
            extracted: str | None = None
            if inferred_mime == "application/pdf" or (url or storage_path or "").lower().endswith(".pdf"):
                extracted = _extract_text_from_pdf(raw)
            elif inferred_mime in {
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/msword",
            } or (url or storage_path or "").lower().endswith((".docx", ".doc")):
                extracted = _extract_text_from_docx(raw)
            elif inferred_mime in {
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "application/vnd.ms-powerpoint",
            } or (url or storage_path or "").lower().endswith((".pptx", ".ppt")):
                extracted = _extract_text_from_pptx(raw)

            if extracted:
                preview["texto_extraido"] = extracted
            else:
                snippet = raw[:base64_snippet_bytes]
                if snippet:
                    preview["arquivo_base64_snippet"] = base64.b64encode(snippet).decode("ascii")
                    preview["arquivo_snippet_bytes"] = len(snippet)

        return preview

    async def upload(
        self,
        path: str,
        data: bytes,
        content_type: str,
        *,
        bucket: str = BUCKET,
    ) -> str | None:
        if not self._enabled:
            return None
        url = f"{self._base_url}/storage/v1/object/{bucket}/{path}"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    url,
                    content=data,
                    headers={
                        **self._headers(),
                        "Content-Type": content_type,
                        "x-upsert": "true",
                    },
                )
                resp.raise_for_status()
            return self.public_url_for_bucket(bucket, path)
        except Exception as exc:
            logger.warning("Supabase upload falhou (%s): %s", path, exc)
            return None

    async def list_paths(self, *, bucket: str, prefix: str) -> list[str]:
        if not self._enabled or not bucket or not prefix:
            return []
        url = f"{self._base_url}/storage/v1/object/list/{bucket}"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    url,
                    headers={**self._headers(), "Content-Type": "application/json"},
                    json={
                        "prefix": prefix.rstrip("/") + "/",
                        "limit": 1000,
                        "offset": 0,
                        "sortBy": {"column": "name", "order": "asc"},
                    },
                )
                resp.raise_for_status()
            payload = resp.json()
        except Exception as exc:
            logger.warning("Supabase list falhou (%s/%s): %s", bucket, prefix, exc)
            return []

        results: list[str] = []
        for item in payload if isinstance(payload, list) else []:
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            results.append(f"{prefix.rstrip('/')}/{name}")
        return results

    async def delete_paths(self, *, bucket: str, paths: list[str]) -> int:
        if not self._enabled or not bucket or not paths:
            return 0
        url = f"{self._base_url}/storage/v1/object/{bucket}"
        normalized = [path.lstrip("/") for path in paths if str(path).strip()]
        if not normalized:
            return 0
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.request(
                    "DELETE",
                    url,
                    headers={**self._headers(), "Content-Type": "application/json"},
                    json={"prefixes": normalized},
                )
                resp.raise_for_status()
            return len(normalized)
        except Exception as exc:
            logger.warning("Supabase delete falhou (%s): %s", bucket, exc)
            return 0

    async def delete_prefix(self, *, bucket: str, prefix: str) -> int:
        paths = await self.list_paths(bucket=bucket, prefix=prefix)
        if not paths:
            return 0
        return await self.delete_paths(bucket=bucket, paths=paths)

    async def upload_materiais(
        self,
        aluno_id: str,
        ref_id: str,
        materiais: dict[str, Any],
        pdf_bytes: bytes,
        documento_bytes: bytes | None = None,
        apresentacao_bytes: bytes | None = None,
        audio_bytes: bytes | None = None,
        video_bytes: bytes | None = None,
        classe_id: int | None = None,
        topico_id: int | None = None,
    ) -> dict[str, Any]:
        """Upload media/document artifacts to Supabase and return updated materiais."""
        if not self._enabled:
            return materiais

        updated = dict(materiais)
        _ = ref_id
        base_prefix = (
            f"{aluno_id}/classe-{classe_id or 'geral'}/topico-{topico_id or 'geral'}"
        )

        def _with_asset_meta(kind: str, arquivo_url: str | None, storage_path: str, mime_type: str) -> None:
            updated[kind] = dict(materiais[kind])
            updated[kind]["arquivo_url"] = arquivo_url
            updated[kind]["storage_path"] = storage_path
            updated[kind]["bucket"] = BUCKET
            updated[kind]["mime_type"] = mime_type

        if "pdf" in materiais:
            pdf_path = f"{base_prefix}/pdf/material.pdf"
            pdf_url = await self.upload(
                path=pdf_path,
                data=pdf_bytes,
                content_type=_CONTENT_TYPES["pdf"],
            )
            _with_asset_meta("pdf", pdf_url, pdf_path, _CONTENT_TYPES["pdf"])

        if "documento" in materiais and documento_bytes:
            documento_path = f"{base_prefix}/documento/material.docx"
            documento_url = await self.upload(
                path=documento_path,
                data=documento_bytes,
                content_type=_CONTENT_TYPES["documento"],
            )
            _with_asset_meta("documento", documento_url, documento_path, _CONTENT_TYPES["documento"])

        if "apresentacao" in materiais and apresentacao_bytes:
            apresentacao_path = f"{base_prefix}/apresentacao/material.pptx"
            apresentacao_url = await self.upload(
                path=apresentacao_path,
                data=apresentacao_bytes,
                content_type=_CONTENT_TYPES["apresentacao"],
            )
            _with_asset_meta("apresentacao", apresentacao_url, apresentacao_path, _CONTENT_TYPES["apresentacao"])

        if "audio" in materiais and audio_bytes:
            audio_path = f"{base_prefix}/audio/material.mp3"
            audio_url = await self.upload(
                path=audio_path,
                data=audio_bytes,
                content_type=_CONTENT_TYPES["audio"],
            )
            _with_asset_meta("audio", audio_url, audio_path, _CONTENT_TYPES["audio"])

        if "video" in materiais and video_bytes:
            video_path = f"{base_prefix}/video/material.mp4"
            video_url = await self.upload(
                path=video_path,
                data=video_bytes or b"",
                content_type=_CONTENT_TYPES["video"],
            )
            _with_asset_meta("video", video_url, video_path, _CONTENT_TYPES["video"])

        return updated
