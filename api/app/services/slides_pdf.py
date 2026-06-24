from __future__ import annotations

import base64
import re
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.pdfgen.canvas import Canvas

# Slide 16:9 em pontos (960 x 540 pt = 13.3" x 7.5" @ 72dpi)
W_PT: float = 960.0
H_PT: float = 540.0


def _hex_to_color(hex_val: str) -> colors.Color:
    clean = re.sub(r"[^0-9a-fA-F]", "", str(hex_val or ""))
    if len(clean) != 6:
        return colors.Color(0.44, 0.49, 0.53)  # cinza padrão
    r, g, b = int(clean[0:2], 16), int(clean[2:4], 16), int(clean[4:6], 16)
    return colors.Color(r / 255, g / 255, b / 255)


_PROFILE_ACCENT: dict[str, str] = {
    "mastermind": "#707c88",
    "seeker":     "#a78c07",
    "survivor":   "#720101",
    "daredevil":  "#1b6b1b",
    "conqueror":  "#01808b",
    "socializer": "#6d15be",
    "achiever":   "#ad6002",
}


def _accent_from_tema(tema: dict[str, Any]) -> colors.Color:
    cores = tema.get("cores") if isinstance(tema.get("cores"), dict) else {}
    hex_val = cores.get("primaria") or cores.get("destaque")
    if hex_val:
        return _hex_to_color(hex_val)
    perfil = str(tema.get("perfil") or "").strip().lower()
    return _hex_to_color(_PROFILE_ACCENT.get(perfil, "#707c88"))


def gerar_pdf_slides(
    *,
    titulo: str,
    slides: list[dict[str, Any]],
    tema_visual: dict[str, Any] | None = None,
) -> bytes:
    tema = tema_visual or {}
    accent = _accent_from_tema(tema)
    bg      = colors.Color(10 / 255,  10 / 255,  15 / 255)
    bg2     = colors.Color(20 / 255,  20 / 255,  30 / 255)
    c_main  = colors.Color(243 / 255, 236 / 255, 218 / 255)
    c_muted = colors.Color(180 / 255, 170 / 255, 150 / 255)

    buf = BytesIO()
    c = Canvas(buf, pagesize=(W_PT, H_PT))
    guia_nome = str(tema.get("guia_nome") or "")
    total = len(slides)

    for i, slide in enumerate(slides):
        slide_titulo = str(slide.get("titulo") or slide.get("title") or f"Slide {i + 1}")
        topics = [str(t) for t in (slide.get("topics") or []) if str(t).strip()]
        explanation = str(slide.get("explanation") or "").strip()
        quote = str(slide.get("characterQuote") or "").strip()
        img_ref = str(slide.get("imagem_referencia") or "").strip()

        # --- Background ---
        c.setFillColor(bg)
        c.rect(0, 0, W_PT, H_PT, fill=1, stroke=0)

        # --- Barra accent esquerda ---
        c.setFillColor(accent)
        c.rect(0, 0, 6, H_PT, fill=1, stroke=0)

        # --- Header ---
        c.setFillColor(bg2)
        c.rect(0, H_PT - 72, W_PT, 72, fill=1, stroke=0)
        c.setStrokeColor(accent)
        c.setLineWidth(1.5)
        c.line(18, H_PT - 72, W_PT - 18, H_PT - 72)

        # --- Título do slide ---
        c.setFillColor(c_main)
        c.setFont("Helvetica-Bold", 22)
        c.drawString(22, H_PT - 46, slide_titulo[:65])

        # --- Label direito ---
        label = f"{guia_nome} • {i + 1}/{total}" if guia_nome else f"{i + 1}/{total}"
        c.setFillColor(accent)
        c.setFont("Helvetica", 10)
        c.drawRightString(W_PT - 18, H_PT - 46, label)

        body_top = H_PT - 90
        col_w = 400
        img_x = 440
        img_w = W_PT - img_x - 18
        img_h = img_w * 0.5625

        # --- Imagem ---
        if img_ref and img_ref.startswith("data:image/"):
            try:
                header, b64data = img_ref.split(",", 1)
                img_bytes = base64.b64decode(b64data)
                from reportlab.lib.utils import ImageReader
                img_reader = ImageReader(BytesIO(img_bytes))
                c.drawImage(
                    img_reader, img_x, body_top - img_h,
                    width=img_w, height=img_h,
                    preserveAspectRatio=True, mask="auto",
                )
            except Exception:
                c.setFillColor(bg2)
                c.roundRect(img_x, body_top - img_h, img_w, img_h, 4, fill=1, stroke=0)
        else:
            c.setFillColor(bg2)
            c.roundRect(img_x, body_top - img_h, img_w, img_h, 4, fill=1, stroke=0)

        # --- Tópicos ---
        y = body_top
        c.setFillColor(accent)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(22, y, "TÓPICOS")
        y -= 16

        c.setFont("Helvetica", 12)
        c.setFillColor(c_main)
        for topic in topics[:5]:
            line = f"• {topic[:70]}"
            c.drawString(22, y, line)
            y -= 15
            if y < 120:
                break

        # --- Explicação ---
        if explanation and y > 120:
            y -= 8
            c.setFillColor(accent)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(22, y, "SÍNTESE")
            y -= 13
            c.setFillColor(c_muted)
            c.setFont("Helvetica-Oblique", 10)
            for part in explanation[:220].split(". ")[:3]:
                if not part.strip() or y < 100:
                    break
                c.drawString(22, y, part.strip()[:75])
                y -= 13

        # --- Quote rodapé ---
        if quote:
            c.setFillColor(bg2)
            c.rect(0, 0, W_PT, 54, fill=1, stroke=0)
            c.setStrokeColor(accent)
            c.setLineWidth(1)
            c.line(18, 54, W_PT - 18, 54)
            c.setFillColor(accent)
            c.setFont("Helvetica-Oblique", 9)
            c.drawString(22, 34, f'"{quote[:110]}"')

        if i < total - 1:
            c.showPage()

    c.save()
    return buf.getvalue()
