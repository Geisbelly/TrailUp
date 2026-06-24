from __future__ import annotations

import inspect
import os
import tempfile
import textwrap
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def _wrap_text(text: str, width: int = 44) -> list[str]:
    rows = [row.strip() for row in textwrap.wrap(text or "", width=width) if row.strip()]
    return rows if rows else [""]


def _hex_to_rgb(value: str | None, fallback: tuple[int, int, int]) -> tuple[int, int, int]:
    raw = str(value or "").strip().lstrip("#")
    if len(raw) == 3:
        raw = "".join(ch * 2 for ch in raw)
    if len(raw) != 6:
        return fallback
    try:
        return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
    except ValueError:
        return fallback


def _build_slide_image(
    *,
    title: str,
    body: str,
    size: tuple[int, int],
    colors: dict[str, str] | None = None,
) -> np.ndarray:
    width, height = size
    palette = colors if isinstance(colors, dict) else {}
    bg_color = _hex_to_rgb(palette.get("secundaria"), (16, 24, 46))
    border_color = _hex_to_rgb(palette.get("primaria"), (132, 154, 196))
    title_color = _hex_to_rgb(palette.get("destaque"), (240, 247, 255))
    body_color = _hex_to_rgb(palette.get("primaria"), (200, 218, 240))
    image = Image.new("RGB", size, color=bg_color)
    draw = ImageDraw.Draw(image)
    title_font = ImageFont.load_default()
    body_font = ImageFont.load_default()

    draw.rectangle([(40, 40), (width - 40, height - 40)], outline=border_color, width=2)

    y = 80
    for line in _wrap_text(title, width=34)[:3]:
        draw.text((70, y), line, fill=title_color, font=title_font)
        y += 26

    y += 24
    for line in _wrap_text(body, width=48)[:14]:
        draw.text((80, y), line, fill=body_color, font=body_font)
        y += 22

    return np.array(image)


def _clip_with_duration(clip: Any, duration: float) -> Any:
    if hasattr(clip, "with_duration"):
        return clip.with_duration(duration)
    if hasattr(clip, "set_duration"):
        return clip.set_duration(duration)
    return clip


def _clip_with_audio(clip: Any, audio_clip: Any) -> Any:
    if hasattr(clip, "with_audio"):
        return clip.with_audio(audio_clip)
    if hasattr(clip, "set_audio"):
        return clip.set_audio(audio_clip)
    return clip


def _write_video_file(video: Any, output_path: str) -> None:
    write_fn = getattr(video, "write_videofile", None)
    if write_fn is None:
        raise RuntimeError("Objeto de vídeo inválido: write_videofile ausente.")

    # Compatível com MoviePy v1 e v2 (assinaturas diferentes).
    signature = inspect.signature(write_fn)
    supported = set(signature.parameters.keys())

    candidate_kwargs: dict[str, Any] = {
        "fps": 24,
        "codec": "libx264",
        "audio_codec": "aac",
        "logger": None,
    }
    kwargs = {key: value for key, value in candidate_kwargs.items() if key in supported}

    # Compatibilidade defensiva: algumas combinações de versões aceitam kwargs
    # na assinatura, mas rejeitam opções opcionais em camadas internas.
    fallback_attempts = [
        kwargs,
        {k: v for k, v in kwargs.items() if k != "logger"},
        {"fps": 24, "codec": "libx264", "audio_codec": "aac"},
        {"fps": 24, "codec": "libx264"},
        {},
    ]
    last_error: Exception | None = None
    for options in fallback_attempts:
        try:
            supported_options = {k: v for k, v in options.items() if k in supported}
            write_fn(output_path, **supported_options)
            return
        except TypeError as exc:
            last_error = exc
            continue

    if last_error is not None:
        raise last_error


def gerar_video_mp4(
    *,
    roteiro: str,
    cenas: list[str],
    duracao_estimada_seg: int = 75,
    audio_bytes: bytes | None = None,
    tema_visual: dict[str, Any] | None = None,
    size: tuple[int, int] = (1280, 720),
) -> bytes:
    try:
        from moviepy import AudioFileClip, ImageClip, concatenate_videoclips
    except Exception:
        try:
            from moviepy.editor import AudioFileClip, ImageClip, concatenate_videoclips
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("Dependência moviepy indisponível no runtime.") from exc

    cleaned_cenas = [str(item).strip() for item in cenas if str(item).strip()]
    if not cleaned_cenas:
        cleaned_cenas = ["Introdução", "Conceitos centrais", "Aplicação prática", "Resumo final"]

    total_duracao = max(20, min(300, int(duracao_estimada_seg or 75)))
    per_scene = max(3.0, total_duracao / max(1, len(cleaned_cenas)))
    colors = tema_visual.get("cores") if isinstance(tema_visual, dict) and isinstance(tema_visual.get("cores"), dict) else {}

    clips: list[Any] = []
    for index, cena in enumerate(cleaned_cenas, start=1):
        frame = _build_slide_image(
            title=f"Cena {index}",
            body=f"{cena}\n\n{(roteiro or '').strip()[:420]}",
            size=size,
            colors=colors,
        )
        clips.append(_clip_with_duration(ImageClip(frame), per_scene))

    if not clips:
        frame = _build_slide_image(title="Vídeo", body=roteiro or "Conteúdo", size=size, colors=colors)
        clips = [_clip_with_duration(ImageClip(frame), float(total_duracao))]

    video = concatenate_videoclips(clips, method="compose")

    temp_audio_path: str | None = None
    audio_clip: Any | None = None
    if audio_bytes:
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as temp_audio:
                temp_audio.write(audio_bytes)
                temp_audio_path = temp_audio.name
            audio_clip = AudioFileClip(temp_audio_path)
            audio_duration = float(audio_clip.duration or total_duracao)
            video = _clip_with_duration(video, audio_duration)
            video = _clip_with_audio(video, audio_clip)
        except Exception:
            temp_audio_path = temp_audio_path if temp_audio_path and os.path.exists(temp_audio_path) else None

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_video:
        output_path = temp_video.name

    try:
        _write_video_file(video, output_path)
        with open(output_path, "rb") as handler:
            data = handler.read()
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(f"Falha ao gerar MP4: {exc}") from exc
    finally:
        try:
            video.close()
        except Exception:
            pass
        if audio_clip is not None:
            try:
                audio_clip.close()
            except Exception:
                pass
        if temp_audio_path and os.path.exists(temp_audio_path):
            try:
                os.remove(temp_audio_path)
            except Exception:
                pass
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
            except Exception:
                pass

    if not data:
        raise RuntimeError("Vídeo MP4 gerado vazio.")
    return data
