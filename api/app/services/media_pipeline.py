from __future__ import annotations

import asyncio
import logging
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.core.settings import Settings
from app.services.media_agents import gerar_audio_gemini_tts, gerar_imagem_slide
from app.services.slides_pdf import gerar_pdf_slides
from app.services.storage import SupabaseStorage
from app.services.text_cleanup import (
    clean_extracted_text,
    expand_sections,
    normalize_script,
)

logger = logging.getLogger(__name__)

_FAST_FORMATOS = {"cards"}
_MEDIA_FORMATOS = {"audio", "apresentacao", "markdown"}

_DEFAULT_PROFILE_THEME: dict[str, Any] = {
    "perfil": "Mastermind",
    "cores": {"primaria": "#707C88", "secundaria": "#1D232B", "destaque": "#B5C0CC"},
    "imagem_referencia": "coruja_filter.png",
    "icone_referencia": "coruja",
}

_PROFILE_THEME_MAP: dict[str, dict[str, Any]] = {
    "seeker": {
        "perfil": "Seeker",
        "cores": {"primaria": "#A78C07", "secundaria": "#2A1D0A", "destaque": "#E2C454"},
        "imagem_referencia": "rosa_dos_ventos_filter.png",
        "icone_referencia": "rosa_dos_ventos",
    },
    "survivor": {
        "perfil": "Survivor",
        "cores": {"primaria": "#720101", "secundaria": "#290808", "destaque": "#C96B6B"},
        "imagem_referencia": "cacador_filter.png",
        "icone_referencia": "cacador",
    },
    "daredevil": {
        "perfil": "Daredevil",
        "cores": {"primaria": "#1B6B1B", "secundaria": "#0F2E12", "destaque": "#72C172"},
        "imagem_referencia": "espada_filter.png",
        "icone_referencia": "espada",
    },
    "mastermind": _DEFAULT_PROFILE_THEME,
    "conqueror": {
        "perfil": "Conqueror",
        "cores": {"primaria": "#01808B", "secundaria": "#07292E", "destaque": "#66C7CF"},
        "imagem_referencia": "coroa_filter.png",
        "icone_referencia": "coroa",
    },
    "socializer": {
        "perfil": "Socialiser",
        "cores": {"primaria": "#6D15BE", "secundaria": "#250B3D", "destaque": "#B68AE0"},
        "imagem_referencia": "coracao_filter.png",
        "icone_referencia": "coracao",
    },
    "socialiser": {
        "perfil": "Socialiser",
        "cores": {"primaria": "#6D15BE", "secundaria": "#250B3D", "destaque": "#B68AE0"},
        "imagem_referencia": "coracao_filter.png",
        "icone_referencia": "coracao",
    },
    "achiever": {
        "perfil": "Achiever",
        "cores": {"primaria": "#AD6002", "secundaria": "#3B2207", "destaque": "#E0AE70"},
        "imagem_referencia": "arte_filter.png",
        "icone_referencia": "arte",
    },
}


def _normalize_profile_key(value: Any) -> str:
    normalized = unicodedata.normalize("NFD", str(value or "").strip().lower())
    ascii_text = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", ascii_text)


def _dominant_profile_theme(state: dict[str, Any]) -> dict[str, Any]:
    perfis = state.get("perfil_brainhex")
    if isinstance(perfis, list) and perfis:
        dominant = max(
            (item for item in perfis if isinstance(item, dict)),
            key=lambda item: float(item.get("afinidade") or 0.0),
            default={},
        )
        key = _normalize_profile_key(dominant.get("perfil") or dominant.get("nome"))
        if key:
            return dict(_PROFILE_THEME_MAP.get(key, _DEFAULT_PROFILE_THEME))

    fallback_candidates = [
        state.get("perfil_dominante"),
        (state.get("perfil_editorial") or {}).get("perfil_dominante")
        if isinstance(state.get("perfil_editorial"), dict)
        else None,
        (state.get("tema_visual") or {}).get("perfil")
        if isinstance(state.get("tema_visual"), dict)
        else None,
    ]
    for candidate in fallback_candidates:
        key = _normalize_profile_key(candidate)
        if key in _PROFILE_THEME_MAP:
            return dict(_PROFILE_THEME_MAP[key])
    return dict(_DEFAULT_PROFILE_THEME)


def _merge_tema_visual(existing: Any, enforced_theme: dict[str, Any]) -> dict[str, Any]:
    base = existing if isinstance(existing, dict) else {}
    base_cores = base.get("cores") if isinstance(base.get("cores"), dict) else {}
    enforced_cores = enforced_theme.get("cores") if isinstance(enforced_theme.get("cores"), dict) else {}
    return {
        **base,
        **enforced_theme,
        "cores": {**base_cores, **enforced_cores},
    }


@dataclass(slots=True)
class MediaPipelineContext:
    state: dict[str, Any]
    settings: Settings
    storage: SupabaseStorage
    base_prefix: str
    ref_id: str


class MediaPipeline:
    kind: str = "media"
    extension: str = "bin"
    content_type: str = "application/octet-stream"

    async def input(self, material: dict[str, Any], context: MediaPipelineContext) -> dict[str, Any]:
        return material

    async def normalize(self, material: dict[str, Any], context: MediaPipelineContext) -> dict[str, Any]:
        return material

    async def generate(self, material: dict[str, Any], context: MediaPipelineContext) -> dict[str, Any]:
        return material

    async def render(self, material: dict[str, Any], context: MediaPipelineContext) -> bytes:
        raise NotImplementedError

    async def output(self, rendered: bytes, material: dict[str, Any], context: MediaPipelineContext) -> dict[str, Any]:
        storage_path = f"{context.base_prefix}/{self.kind}/material-{context.ref_id}.{self.extension}"
        arquivo_url = await context.storage.upload(
            path=storage_path,
            data=rendered,
            content_type=self.content_type,
        )
        if not arquivo_url:
            raise RuntimeError(f"upload_failed:{self.kind}")

        metadata = dict(material.get("metadata") or {})
        metadata.update(
            {
                "status": "completed",
                "media_kind": self.kind,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )

        return {
            **material,
            "arquivo_url": arquivo_url,
            "storage_path": storage_path,
            "bucket": "conteudo_aluno",
            "mime_type": self.content_type,
            "metadata": metadata,
        }

    async def run(self, material: dict[str, Any], context: MediaPipelineContext) -> dict[str, Any]:
        incoming = await self.input(material, context)
        normalized = await self.normalize(incoming, context)
        generated = await self.generate(normalized, context)
        rendered = await self.render(generated, context)
        return await self.output(rendered, generated, context)


class MarkdownPipeline(MediaPipeline):
    kind = "markdown"
    extension = "md"
    content_type = "text/markdown"

    async def normalize(self, material: dict[str, Any], context: MediaPipelineContext) -> dict[str, Any]:
        payload = material.get("payload") if isinstance(material.get("payload"), dict) else {}
        texto = str(payload.get("texto") or payload.get("markdown") or "").strip()
        if not texto:
            raise RuntimeError("markdown_empty_content")
        return {**material, "payload": {**payload, "texto": texto}}

    async def render(self, material: dict[str, Any], context: MediaPipelineContext) -> bytes:
        payload = material.get("payload") or {}
        return (payload.get("texto") or "").encode("utf-8")


class SlidesPipeline(MediaPipeline):
    kind = "apresentacao"
    extension = "pdf"
    content_type = "application/pdf"

    async def normalize(self, material: dict[str, Any], context: MediaPipelineContext) -> dict[str, Any]:
        payload = material.get("payload") if isinstance(material.get("payload"), dict) else {}
        titulo = clean_extracted_text(payload.get("titulo"), max_chars=160, preserve_lines=False) or "Apresentação"
        abertura = normalize_script(payload.get("abertura") or payload.get("resumo"), max_chars=420)
        tema_visual = _merge_tema_visual(payload.get("tema_visual"), _dominant_profile_theme(context.state))

        perfil_editorial = context.state.get("perfil_editorial") if isinstance(context.state.get("perfil_editorial"), dict) else {}
        guia_nome = str(perfil_editorial.get("guia_nome") or "")
        if guia_nome:
            tema_visual["guia_nome"] = guia_nome

        cleaned_slides: list[dict[str, Any]] = []
        for slide in (payload.get("slides") or []):
            if not isinstance(slide, dict):
                continue
            slide_titulo = clean_extracted_text(slide.get("titulo") or slide.get("title"), max_chars=120, preserve_lines=False) or "Tópico"
            topics = [str(t).strip() for t in (slide.get("topics") or []) if str(t).strip()]
            cleaned_slide: dict[str, Any] = {
                "titulo": slide_titulo,
                "topics": topics,
                "explanation": str(slide.get("explanation") or "").strip(),
                "visualDescription": str(slide.get("visualDescription") or "").strip(),
                "characterQuote": str(slide.get("characterQuote") or "").strip(),
                "characterAction": str(slide.get("characterAction") or "explaining").strip(),
                "imagePrompt": str(slide.get("imagePrompt") or "").strip(),
                "sourceIds": [str(s) for s in (slide.get("sourceIds") or [])],
            }
            cleaned_slides.append(cleaned_slide)

        if not cleaned_slides:
            cleaned_slides = [
                {
                    "titulo": f"Slide {i + 1}",
                    "topics": [sec],
                    "explanation": "",
                    "visualDescription": "",
                    "characterQuote": "",
                    "characterAction": "explaining",
                    "imagePrompt": "",
                    "sourceIds": [],
                }
                for i, sec in enumerate(
                    expand_sections([abertura], max_items=6, section_max_chars=220, min_chars=8)
                    or ["Contexto inicial", "Conceito central", "Aplicação prática", "Resumo final"]
                )
            ]

        # Gerar imagens por slide usando imagePrompt (ApiBrainHex style)
        slides_with_images: list[dict[str, Any]] = []
        for slide in cleaned_slides:
            image_prompt = slide.get("imagePrompt") or ""
            if image_prompt and context.settings.gemini_api_key:
                try:
                    img_b64 = await gerar_imagem_slide(
                        settings=context.settings,
                        prompt=image_prompt,
                    )
                    if img_b64:
                        slide = {**slide, "imagem_referencia": f"data:image/png;base64,{img_b64}"}
                except Exception:
                    pass
            slides_with_images.append(slide)
        cleaned_slides = slides_with_images

        normalized_payload = {
            "titulo": titulo,
            "abertura": abertura,
            "tema_visual": tema_visual,
            "slides": cleaned_slides,
        }
        return {**material, "payload": normalized_payload}

    async def render(self, material: dict[str, Any], context: MediaPipelineContext) -> bytes:
        payload = material.get("payload") or {}
        return await asyncio.to_thread(
            lambda: gerar_pdf_slides(
                titulo=payload.get("titulo", "Apresentação"),
                slides=payload.get("slides", []),
                tema_visual=payload.get("tema_visual") if isinstance(payload.get("tema_visual"), dict) else None,
            )
        )


class AudioPipeline(MediaPipeline):
    kind = "audio"
    extension = "mp3"
    content_type = "audio/mpeg"

    async def normalize(self, material: dict[str, Any], context: MediaPipelineContext) -> dict[str, Any]:
        payload = material.get("payload") if isinstance(material.get("payload"), dict) else {}
        if payload.get("audio_bytes_b64"):
            return material
        roteiro = normalize_script(payload.get("roteiro") or payload.get("texto"), max_chars=1_600)
        if not roteiro:
            raise RuntimeError("audio_empty_script")
        return {
            **material,
            "payload": {
                **payload,
                "roteiro": roteiro,
                "texto": roteiro,
                "tema_visual": _merge_tema_visual(payload.get("tema_visual"), _dominant_profile_theme(context.state)),
            },
        }

    async def render(self, material: dict[str, Any], context: MediaPipelineContext) -> bytes:
        import base64
        payload = material.get("payload") or {}
        audio_bytes_b64 = payload.get("audio_bytes_b64")
        if audio_bytes_b64:
            return base64.b64decode(audio_bytes_b64)
        roteiro = str(payload.get("roteiro") or "")
        perfil_editorial = context.state.get("perfil_editorial") if isinstance(context.state.get("perfil_editorial"), dict) else {}
        voz = str(perfil_editorial.get("guia_voz") or "Kore")
        texto_narrado = f"Narre com profunda emoção mística e variações de tom: {roteiro[:1500]}"
        rendered = await gerar_audio_gemini_tts(
            settings=context.settings,
            texto=texto_narrado,
            voz=voz,
        )
        if not rendered:
            raise RuntimeError("audio_generation_failed")
        return rendered

    async def run(self, material: dict[str, Any], context: MediaPipelineContext) -> dict[str, Any]:
        incoming = await self.input(material, context)
        normalized = await self.normalize(incoming, context)
        generated = await self.generate(normalized, context)
        rendered = await self.render(generated, context)
        if rendered[:4] == b"RIFF":
            self.extension = "wav"
            self.content_type = "audio/wav"
        else:
            self.extension = "mp3"
            self.content_type = "audio/mpeg"
        return await self.output(rendered, generated, context)


class MultiOutputPipeline:
    _semaphore_by_limit: dict[int, asyncio.Semaphore] = {}
    _semaphore_guard = asyncio.Lock()

    def __init__(self, *, settings: Settings, state: dict[str, Any]) -> None:
        self.settings = settings
        self.state = state
        self.storage = SupabaseStorage(settings)
        self.concurrency = max(1, int(getattr(settings, "personalizacao_media_render_concurrency", 2) or 2))
        timeout_seconds = int(
            getattr(
                settings,
                "media_render_timeout_seconds",
                getattr(settings, "personalizacao_media_render_timeout_sec", 1800),
            )
            or 1800
        )
        self.timeout_sec = max(20, timeout_seconds)
        self.pipelines: dict[str, MediaPipeline] = {
            "apresentacao": SlidesPipeline(),
            "audio": AudioPipeline(),
            "markdown": MarkdownPipeline(),
        }

    @classmethod
    async def _get_semaphore(cls, limit: int) -> asyncio.Semaphore:
        async with cls._semaphore_guard:
            sem = cls._semaphore_by_limit.get(limit)
            if sem is None:
                sem = asyncio.Semaphore(limit)
                cls._semaphore_by_limit[limit] = sem
            return sem

    def split(self, materiais: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        fast = {key: value for key, value in materiais.items() if key in _FAST_FORMATOS}
        media = {key: value for key, value in materiais.items() if key in _MEDIA_FORMATOS}
        return fast, media

    @staticmethod
    def with_status(material: dict[str, Any], *, status: str, error: str | None = None) -> dict[str, Any]:
        metadata = dict(material.get("metadata") or {})
        metadata["status"] = status
        if error:
            metadata["error"] = error
        return {**material, "metadata": metadata}

    def mark_pending(self, media_materiais: dict[str, Any]) -> dict[str, Any]:
        pending: dict[str, Any] = {}
        for kind, material in media_materiais.items():
            if not isinstance(material, dict):
                continue
            pending[kind] = self.with_status(material, status="pending")
        return pending

    def _context(self) -> MediaPipelineContext:
        ref_base = self.state.get("conteudo_boss_foco_id") or self.state.get("payload_topico_id") or "sem-ref"
        ref_id = f"{ref_base}_{str(self.state.get('ciclo_id') or '')[:8]}"
        classe_id = self.state.get("classe_id")
        topico_id = self.state.get("payload_topico_id")
        perfil_key = _normalize_profile_key(self.state.get("perfil_dominante"))
        if not perfil_key:
            perfil_key = _normalize_profile_key((_dominant_profile_theme(self.state) or {}).get("perfil"))
        if not perfil_key:
            perfil_key = "mastermind"
        base_prefix = f"brainhex/{perfil_key}/classe-{classe_id or 'geral'}/topico-{topico_id or 'geral'}"
        return MediaPipelineContext(
            state=self.state,
            settings=self.settings,
            storage=self.storage,
            base_prefix=base_prefix,
            ref_id=ref_id,
        )

    def build_context(self) -> MediaPipelineContext:
        return self._context()

    async def _execute_one(
        self,
        *,
        sem: asyncio.Semaphore,
        kind: str,
        material: dict[str, Any],
        context: MediaPipelineContext,
    ) -> tuple[str, dict[str, Any] | None, str | None]:
        pipeline = self.pipelines.get(kind)
        if pipeline is None:
            return kind, self.with_status(material, status="failed", error="pipeline_not_implemented"), "pipeline_not_implemented"

        async with sem:
            try:
                rendered = await asyncio.wait_for(pipeline.run(material, context), timeout=self.timeout_sec)
                return kind, self.with_status(rendered, status="completed"), None
            except Exception as exc:
                error = str(exc)
                logger.warning("Falha no pipeline de midia %s: %s", kind, error)
                return kind, self.with_status(material, status="failed", error=error), error

    async def render_media(self, media_materiais: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
        if not media_materiais:
            return {}, []

        context = self._context()
        sem = await self._get_semaphore(self.concurrency)
        tasks: list[asyncio.Task[tuple[str, dict[str, Any] | None, str | None]]] = []
        for kind, material in media_materiais.items():
            if not isinstance(material, dict):
                continue
            tasks.append(
                asyncio.create_task(
                    self._execute_one(
                        sem=sem,
                        kind=kind,
                        material=material,
                        context=context,
                    )
                )
            )

        if not tasks:
            return {}, []

        results = await asyncio.gather(*tasks)
        rendered: dict[str, Any] = {}
        errors: list[str] = []
        for kind, material, error in results:
            if material is not None:
                rendered[kind] = material
            if error:
                errors.append(f"{kind}:{error}")
        return rendered, errors



